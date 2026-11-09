/**
 * Organización por HTTP con el token del usuario propagado (D100, D126). Este servicio nunca lee el esquema
 * `organizacion`: solo estos cuatro puntos de entrada. Si Organización no responde o responde algo ilegible se lanza
 * `OrganizacionNoDisponible`; el motivo va al registro (sin cabeceras ni cuerpos) y nunca a la respuesta.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA, ExcepcionQ360, accesoDenegado, noAutenticado } from '@quality360/auth-nest';

import { trocear } from '../../aplicacion/lotes.js';
import type { ErrorValidacion, ValidacionAsignacion } from '../../dominio/consulta/asignacion.js';
import type { HduExistente } from '../../dominio/consulta/clasificacion.js';
import {
  ProveedorOrganizacion,
  type AmbitoHdu,
  type AsignacionAValidar,
  type AsignacionValidadaConRef,
  type SolicitudConfirmacionUpsert,
  type ContextoSolicitud,
  type HduExistenteUpsert,
  type DestinoHdu,
  type DestinoResuelto,
  type ResultadoFilaUpsert,
  type ResultadoUpsert,
  type SolicitudUpsert,
} from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionIntegraciones } from '../../configuracion.js';
import { OrganizacionNoDisponible } from '../../dominio/errores.js';
import { esAdvertenciaFila, esMotivoFila, esResultadoFila } from '../../dominio/catalogos.js';

type Json = Record<string, unknown>;

function ilegible(que: string): never {
  throw new OrganizacionNoDisponible(`Organización devolvió ${que} ilegible`);
}

function objeto(valor: unknown, que: string): Json {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Json) : ilegible(que);
}

function texto(valor: unknown, que: string): string {
  return typeof valor === 'string' ? valor : ilegible(que);
}

function referencia(valor: unknown, que: string): { id: string; nombre: string } | null {
  if (valor === null || valor === undefined) return null;
  const datos = objeto(valor, que);
  return { id: texto(datos.id, que), nombre: texto(datos.nombre, que) };
}

function filaDeUpsert(valor: unknown): ResultadoFilaUpsert {
  const d = objeto(valor, 'una fila del upsert');
  if (!esResultadoFila(d.resultado) || typeof d.fila !== 'number' || typeof d.codigo !== 'string') return ilegible('una fila del upsert');
  if (d.motivo !== null && d.motivo !== undefined && !esMotivoFila(d.motivo)) return ilegible('un motivo del upsert');
  const advertencias = Array.isArray(d.advertencias) ? d.advertencias.filter(esAdvertenciaFila) : [];
  const cambios = d.cambios === null || d.cambios === undefined ? null : (objeto(d.cambios, 'los cambios del upsert') as ResultadoFilaUpsert['cambios']);
  return {
    fila: d.fila,
    codigo: d.codigo,
    resultado: d.resultado,
    motivo: (d.motivo as ResultadoFilaUpsert['motivo']) ?? null,
    idHistoria: typeof d.idHistoria === 'string' ? d.idHistoria : null,
    advertencias,
    cambios,
    ...(d.existente === undefined || d.existente === null ? {} : { existente: existenteDeUpsert(d.existente) }),
    ...(d.errorAsignacion === undefined || d.errorAsignacion === null ? {} : { errorAsignacion: errorDeAsignacion(d.errorAsignacion) }),
  };
}

/** `HduExistenteUpsert` (D202, D204): una respuesta con otra forma es ilegible, nunca se adivina quién creó la HDU. */
function existenteDeUpsert(valor: unknown): HduExistenteUpsert {
  const d = objeto(valor, 'la HDU existente del upsert');
  if (typeof d.creadaPorEstaConsulta !== 'boolean' || typeof d.creadaPorActor !== 'boolean') return ilegible('la HDU existente del upsert');
  return {
    idHistoria: texto(d.idHistoria, 'la HDU existente del upsert'),
    qe: texto(d.qe, 'la HDU existente del upsert'),
    analista: typeof d.analista === 'string' ? d.analista : null,
    creadaPorEstaConsulta: d.creadaPorEstaConsulta,
    creadaPorActor: d.creadaPorActor,
  };
}

const LOTE_LECTURA = 100;
const CAMPO_DE_ORGANIZACION = { celulaId: 'celulaId', qeResponsableId: 'qeId', analistaId: 'analistaId', sprintId: 'sprintId' } as const;
const CODIGOS_ERROR_ASIGNACION = ['QE_INVALIDO', 'ANALISTA_INVALIDO', 'ANALISTA_FUERA_DE_EQUIPO', 'CATALOGO_INVALIDO'] as const;

function errorDeAsignacion(valor: unknown): ErrorValidacion {
  const d = objeto(valor, 'un error de asignación');
  const campo = CAMPO_DE_ORGANIZACION[d.campo as keyof typeof CAMPO_DE_ORGANIZACION];
  const codigo = (CODIGOS_ERROR_ASIGNACION as readonly unknown[]).includes(d.codigo) ? (d.codigo as ErrorValidacion['codigo']) : undefined;
  if (campo === undefined || codigo === undefined) return ilegible('un error de asignación');
  return { campo, codigo };
}

function estadoDeCodigo(valor: unknown): HduExistente | null {
  const d = objeto(valor, 'un estado de código');
  if (typeof d.existe !== 'boolean') return ilegible('un estado de código');
  if (!d.existe) return null;
  const origen = d.origen;
  if (origen !== 'MANUAL' && origen !== 'JIRA' && origen !== 'CSV' && origen !== 'JSON') return ilegible('un origen de HDU');
  const prioridad = d.prioridad;
  if (prioridad !== 'BAJA' && prioridad !== 'MEDIA' && prioridad !== 'ALTA' && prioridad !== 'CRITICA') return ilegible('una prioridad de HDU');
  return {
    idHistoria: texto(d.idHistoria, 'un estado de código'),
    estado: texto(d.estado, 'un estado de código'),
    origen,
    titulo: texto(d.titulo, 'un estado de código'),
    descripcion: typeof d.descripcion === 'string' ? d.descripcion : null,
    prioridad,
    qeResponsable: typeof d.qeResponsable === 'string' ? d.qeResponsable : null,
    // Opcional en el contrato: una Organización anterior (despliegue escalonado) no lo envía y se trata como «sin Analista».
    analista: typeof d.analista === 'string' ? d.analista : null,
  };
}

function validacionDeAsignacion(valor: unknown): AsignacionValidadaConRef {
  const d = objeto(valor, 'una asignación validada');
  if (!Array.isArray(d.errores) || typeof d.ref !== 'string' || typeof d.celulaSinLiderActivo !== 'boolean') return ilegible('una asignación validada');
  let sprintPropuesto: ValidacionAsignacion['sprintPropuesto'] = null;
  if (d.sprintPropuesto !== null && d.sprintPropuesto !== undefined) {
    const p = objeto(d.sprintPropuesto, 'un sprint propuesto');
    if (p.origen !== null && p.origen !== 'JIRA' && p.origen !== 'RESPALDO') return ilegible('un sprint propuesto');
    sprintPropuesto = { sprint: referencia(p.sprint, 'un sprint propuesto'), origen: p.origen, sprintJiraNoEncontrado: p.sprintJiraNoEncontrado === true };
  }
  return {
    ref: d.ref,
    errores: d.errores.map(errorDeAsignacion),
    celula: referencia(d.celula, 'la célula validada'),
    qe: referencia(d.qeResponsable, 'el QE validado'),
    analista: referencia(d.analista, 'el analista validado'),
    sprint: referencia(d.sprint, 'el sprint validado'),
    sprintPropuesto,
    celulaSinLiderActivo: d.celulaSinLiderActivo,
    // D201. Una Organización anterior no los envía: sin propuesta, el analista queda vacío (nunca un error).
    analistasActivos: typeof d.analistasActivos === 'number' && Number.isInteger(d.analistasActivos) && d.analistasActivos >= 0 ? d.analistasActivos : null,
    analistaPropuesto: referencia(d.analistaPropuesto, 'el analista propuesto'),
  };
}

@Injectable()
export class OrganizacionCliente extends ProveedorOrganizacion {
  private readonly registro = new Logger(OrganizacionCliente.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones) {
    super();
  }

  async perfil(contexto: ContextoSolicitud, limiteMs: number): Promise<{ id: string; nombre: string }> {
    const cuerpo = objeto(await this.llamar('GET', '/v1/me', contexto, limiteMs), 'un perfil');
    return { id: texto(cuerpo.id, 'un perfil'), nombre: texto(cuerpo.nombre, 'un perfil') };
  }

  async destino(destino: DestinoHdu, contexto: ContextoSolicitud, limiteMs: number): Promise<DestinoResuelto> {
    const cuerpo = objeto(await this.llamar('POST', '/v1/interno/integraciones/destino', contexto, limiteMs, destino), 'un destino');
    if (!Array.isArray(cuerpo.errores)) return ilegible('un destino');
    return {
      celula: referencia(cuerpo.celula, 'la célula del destino'),
      qeResponsable: referencia(cuerpo.qeResponsable, 'el QE del destino'),
      sprintRespaldo: referencia(cuerpo.sprintRespaldo, 'el sprint del destino'),
      errores: cuerpo.errores.map((e) => {
        const d = objeto(e, 'un error de destino');
        return { campo: texto(d.campo, 'un error de destino'), codigo: texto(d.codigo, 'un error de destino'), mensaje: texto(d.mensaje, 'un error de destino') };
      }),
    };
  }

  async estadoCodigos(codigos: readonly string[], contexto: ContextoSolicitud, limiteMs: number): Promise<Array<HduExistente | null>> {
    const resultado: Array<HduExistente | null> = [];
    for (const lote of trocear(codigos, LOTE_LECTURA)) {
      const cuerpo = objeto(await this.llamar('POST', '/v1/interno/integraciones/hdu/estado-codigos', contexto, limiteMs, { codigos: lote }), 'un estado de códigos');
      if (!Array.isArray(cuerpo.items) || cuerpo.items.length !== lote.length) return ilegible('un estado de códigos con otra cantidad de elementos');
      resultado.push(...cuerpo.items.map(estadoDeCodigo));
    }
    return resultado;
  }

  async validarAsignaciones(asignaciones: readonly AsignacionAValidar[], contexto: ContextoSolicitud, limiteMs: number): Promise<AsignacionValidadaConRef[]> {
    const resultado: AsignacionValidadaConRef[] = [];
    for (const lote of trocear(asignaciones, LOTE_LECTURA)) {
      const cuerpo = objeto(await this.llamar('POST', '/v1/interno/integraciones/asignaciones/validar', contexto, limiteMs, { asignaciones: lote }), 'una validación de asignaciones');
      if (!Array.isArray(cuerpo.resultados) || cuerpo.resultados.length !== lote.length) return ilegible('una validación con otra cantidad de elementos');
      resultado.push(...cuerpo.resultados.map(validacionDeAsignacion));
    }
    return resultado;
  }

  async upsert(solicitud: SolicitudUpsert | SolicitudConfirmacionUpsert, contexto: ContextoSolicitud, limiteMs: number): Promise<ResultadoUpsert> {
    const cuerpo = objeto(await this.llamar('POST', '/v1/interno/integraciones/hdu/upsert', contexto, limiteMs, solicitud), 'un resultado de upsert');
    if (typeof cuerpo.simulado !== 'boolean' || !Array.isArray(cuerpo.filas)) return ilegible('un resultado de upsert');
    const filas = cuerpo.filas.map(filaDeUpsert);
    if (filas.length !== solicitud.filas.length) return ilegible('un resultado de upsert con otra cantidad de filas');
    return { simulado: cuerpo.simulado, filas };
  }

  async ambito(contexto: ContextoSolicitud, limiteMs: number): Promise<AmbitoHdu> {
    const cuerpo = objeto(await this.llamar('GET', '/v1/interno/hdu/ambito', contexto, limiteMs), 'un ámbito');
    if (typeof cuerpo.todas !== 'boolean' || !Array.isArray(cuerpo.hduIds)) return ilegible('un ámbito');
    return { todas: cuerpo.todas, hduIds: cuerpo.hduIds.filter((id): id is string => typeof id === 'string') };
  }

  private async llamar(metodo: 'GET' | 'POST', ruta: string, contexto: ContextoSolicitud, limiteMs: number, cuerpo?: unknown): Promise<unknown> {
    if (this.configuracion.organizacionUrl === null) throw new OrganizacionNoDisponible('ORGANIZACION_URL no configurada');
    const url = new URL(ruta, this.configuracion.organizacionUrl);
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: metodo,
        headers: {
          authorization: `Bearer ${contexto.token}`,
          accept: 'application/json',
          [CABECERA_TRAZA]: contexto.traceId,
          ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        redirect: 'error',
        signal: AbortSignal.timeout(Math.max(1, Math.min(limiteMs, this.configuracion.tiempoLimiteOrganizacionMs))),
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.name : 'desconocido';
      this.registro.error(`Organización no respondió ${metodo} ${ruta} · traceId=${contexto.traceId} · ${detalle}`);
      throw new OrganizacionNoDisponible(`Organización no respondió ${ruta}`);
    }
    if (respuesta.status === 401) throw noAutenticado(`Organización rechazó el token en ${ruta}`);
    if (respuesta.status === 403) throw accesoDenegado(`Organización negó ${ruta}`);
    if (!respuesta.ok) {
      this.registro.error(`Organización respondió ${respuesta.status} en ${metodo} ${ruta} · traceId=${contexto.traceId}`);
      throw new OrganizacionNoDisponible(`Organización respondió ${respuesta.status} en ${ruta}`);
    }
    try {
      return await respuesta.json();
    } catch (error) {
      if (error instanceof ExcepcionQ360) throw error;
      throw new OrganizacionNoDisponible(`Organización devolvió un cuerpo ilegible en ${ruta}`);
    }
  }
}
