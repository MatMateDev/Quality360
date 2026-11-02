/**
 * Organización por HTTP con el token del usuario propagado (D100, D126). Este servicio nunca lee el esquema
 * `organizacion`: solo estos cuatro puntos de entrada. Si Organización no responde o responde algo ilegible se lanza
 * `OrganizacionNoDisponible`; el motivo va al registro (sin cabeceras ni cuerpos) y nunca a la respuesta.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA, ExcepcionQ360, accesoDenegado, noAutenticado } from '@quality360/auth-nest';

import {
  ProveedorOrganizacion,
  type AmbitoHdu,
  type ContextoSolicitud,
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

  async upsert(solicitud: SolicitudUpsert, contexto: ContextoSolicitud, limiteMs: number): Promise<ResultadoUpsert> {
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
