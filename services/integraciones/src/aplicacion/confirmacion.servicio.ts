/**
 * Confirmación de una consulta (D140, D141): escribe en Organización las filas marcadas, por lotes de 25. No llama a Jira
 * ni lee la configuración: usa el proyecto y el host guardados en la consulta. Orden: 1) consulta abierta y vigente,
 * 2) `version` vista, 3) hay filas marcadas, 4) pre-validación de TODAS las asignaciones (409 sin escribir y sin ejecución),
 * 5) se bloquea la consulta y se inserta la ejecución `CONFIRMACION` (una sola a la vez), 6) lotes al upsert en modo
 * confirmación; por lote, las filas quedan `aplicada` y se guarda su detalle, 7) al aplicar la última, `CONFIRMADA`,
 * purga y `descartadas`. El presupuesto (D114) y las fallas de Organización la dejan `INCOMPLETA` y repetible.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { mensajeDeError } from '../dominio/catalogos.js';
import { rechazoDeValidacion, type ValidacionAsignacion } from '../dominio/consulta/asignacion.js';
import { detalleDeConfirmacion, detalleDeErrorInterno, pasosPendientes, planDeLotes, asignacionParaUpsert, type PasoDeConfirmacion } from '../dominio/consulta/confirmacion.js';
import { AsignacionesInvalidas, ConsultaNoEncontrada, ErrorDeConsulta, SinSeleccion, type FilaRechazadaDto } from '../dominio/consulta/errores.js';
import { SIN_CONTEOS } from '../dominio/consulta/tipos.js';
import { Presupuesto, resultadoFinal, sumarFila } from '../dominio/ejecucion.js';
import type { CodigoErrorIntegracion, FilaDetalle } from '../dominio/tipos.js';
import { contadoresVacios } from '../dominio/tipos.js';
import { ConsultaAplicacion } from './consulta.servicio.js';
import { ConsultaRepositorio, EjecucionRepositorio, ProveedorOrganizacion, Reloj, type AsignacionAValidar, type FilaUpsertConfirmacion, type Solicitante } from './puertos.js';
import { vistaEjecucion } from './vistas.js';
import { urlDeIssue, vistaConsulta } from './vistas-consulta.js';

@Injectable()
export class ConfirmacionAplicacion {
  private readonly registro = new Logger(ConfirmacionAplicacion.name);

  constructor(
    private readonly consulta: ConsultaAplicacion,
    private readonly consultas: ConsultaRepositorio,
    private readonly ejecuciones: EjecucionRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /** `POST /consultas/{id}/confirmaciones`. */
  async confirmar(solicitante: Solicitante, id: string, entrada: { version: number }) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const limite = (): number => presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);

    const c = await this.consulta.abierta(id);
    if (c.version !== entrada.version) throw new ErrorDeConsulta('CONSULTA_MODIFICADA', c);
    const pasos = pasosPendientes(await this.consultas.itemsMarcadosPendientes(c.id));
    if (pasos.length === 0) throw new SinSeleccion();

    // Pre-validación de todas las asignaciones antes de escribir una sola HDU.
    await this.prevalidar(solicitante, c.id, pasos, limite);

    const actor = await this.organizacion.perfil(solicitante.contexto, limite());
    const inicio = await this.consultas.iniciarConfirmacion(
      c.id,
      entrada.version,
      {
        origen: 'JIRA',
        estricto: false,
        vincularExistentes: false,
        actor: { id: actor.id, nombre: actor.nombre, rol: solicitante.rol },
        proyecto: c.proyecto,
        sitioHost: c.sitioHost,
        archivo: null,
        iniciadaEn: this.reloj.ahora(),
      },
      this.configuracion.enCursoMaxMs,
    );
    if (inicio.tipo === 'NO_ENCONTRADA') throw new ConsultaNoEncontrada();
    if (inicio.tipo === 'CERRADA') throw await this.consulta.errorActual(c.id, 'CONSULTA_NO_ABIERTA');
    if (inicio.tipo !== 'OK') throw new ErrorDeConsulta('CONSULTA_MODIFICADA', inicio.consulta);

    const ejecucionId = inicio.ejecucion.id;
    try {
      return await this.escribir(solicitante, c.id, c.sitioHost, ejecucionId, pasos, presupuesto, actor);
    } catch (error) {
      this.registro.error(`La confirmación ${ejecucionId} falló: ${error instanceof Error ? error.name : 'desconocido'}`);
      await this.ejecuciones.interrumpir(ejecucionId, this.reloj.ahora(), presupuesto.transcurridoMs()).catch(() => undefined);
      throw error;
    }
  }

  /** Si alguna asignación dejó de ser válida: desmarca esas filas, sube la versión y responde 409 sin escribir nada. */
  private async prevalidar(solicitante: Solicitante, consultaId: string, pasos: readonly PasoDeConfirmacion[], limite: () => number): Promise<void> {
    const nuevas = pasos.filter((p) => p.operacion === 'CREAR');
    const pedidos = new Map<string, AsignacionAValidar>();
    const refDe = new Map<string, string>();
    for (const { item } of nuevas) {
      const a = asignacionParaUpsert(item);
      const contenido = a === null ? {} : { celulaId: a.celulaId, qeResponsableId: a.qeResponsableId, analistaId: a.analistaId, sprintId: a.sprintId };
      const clave = JSON.stringify(contenido);
      if (!pedidos.has(clave)) pedidos.set(clave, { ...contenido, ref: `v${pedidos.size}` });
      refDe.set(item.id, (pedidos.get(clave) as AsignacionAValidar).ref);
    }
    if (pedidos.size === 0) return;
    const validaciones = new Map<string, ValidacionAsignacion & { ref: string }>();
    for (const v of await this.organizacion.validarAsignaciones([...pedidos.values()], solicitante.contexto, limite())) validaciones.set(v.ref, v);

    const invalidas: FilaRechazadaDto[] = [];
    for (const { item } of nuevas) {
      const v = validaciones.get(refDe.get(item.id) as string);
      const rechazo = v === undefined ? null : rechazoDeValidacion(v.errores);
      if (rechazo !== null) invalidas.push({ itemId: item.id, codigo: item.codigo, campo: rechazo.campo, motivo: rechazo.motivo });
    }
    if (invalidas.length === 0) return;
    const version = await this.consultas.desmarcar(consultaId, invalidas.map((f) => f.itemId));
    if (version === null) throw await this.consulta.errorActual(consultaId, 'CONSULTA_NO_ABIERTA');
    throw new AsignacionesInvalidas(invalidas, version);
  }

  private async escribir(
    solicitante: Solicitante,
    consultaId: string,
    sitioHost: string,
    ejecucionId: string,
    pasos: readonly PasoDeConfirmacion[],
    presupuesto: Presupuesto,
    actor: { id: string; nombre: string },
  ) {
    const contadores = contadoresVacios();
    let interrupcion: CodigoErrorIntegracion | null = null;

    for (const lote of planDeLotes(pasos)) {
      if (!presupuesto.alcanza()) {
        interrupcion = 'PRESUPUESTO_DE_TIEMPO';
        break;
      }
      let detalle: FilaDetalle[];
      try {
        detalle = await this.enviarLote(solicitante, sitioHost, consultaId, lote, presupuesto);
      } catch (error) {
        this.registro.error(`Organización no pudo recibir un lote · ${error instanceof Error ? error.name : 'desconocido'}`);
        interrupcion = 'ORGANIZACION_NO_DISPONIBLE';
        break;
      }
      await this.consultas.aplicarLote(consultaId, lote.map((p) => p.item.id), ejecucionId, detalle);
      for (const fila of detalle) sumarFila(contadores, fila);
    }

    const resultado = resultadoFinal({ leidas: contadores.leidas, conError: contadores.conError, interrupcion, hayMas: false });
    const terminadaEn = this.reloj.ahora();
    const { consulta, ejecucion } = await this.consultas.cerrarConfirmacion(
      consultaId,
      ejecucionId,
      {
        ...contadores,
        resultado,
        terminadaEn,
        duracionMs: Math.max(1, presupuesto.transcurridoMs()),
        codigoError: interrupcion,
        mensajeError: interrupcion === null ? null : mensajeDeError(interrupcion),
        eventos: [],
        hayMas: false,
        continuarDesde: null,
      },
      interrupcion === null ? { estado: 'CONFIRMADA', en: terminadaEn, por: actor } : null,
    );
    const conteos = consulta.estado === 'ABIERTA' ? await this.consultas.conteos(consulta.id) : SIN_CONTEOS;
    return { ejecucion: vistaEjecucion(ejecucion), consulta: vistaConsulta(consulta, conteos) };
  }

  /** Un lote al upsert en modo confirmación; devuelve el detalle de todas sus filas, en orden. */
  private async enviarLote(solicitante: Solicitante, sitioHost: string, consultaId: string, lote: readonly PasoDeConfirmacion[], presupuesto: Presupuesto): Promise<FilaDetalle[]> {
    const filas: FilaUpsertConfirmacion[] = lote.map(({ item, operacion }) => ({
      fila: item.posicion,
      codigo: item.codigo as string,
      titulo: item.titulo,
      descripcion: item.descripcion,
      prioridad: item.prioridad,
      claveExterna: item.codigo,
      urlExterna: item.codigo === null ? null : urlDeIssue(sitioHost, item.codigo),
      operacion,
      ...(operacion === 'CREAR' ? { asignacion: this.asignacionDe(item) } : {}),
    }));
    const respuesta = await this.organizacion.upsert(
      { origen: 'JIRA', consultaId, filas },
      solicitante.contexto,
      presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs),
    );
    const porFila = new Map(respuesta.filas.map((r) => [r.fila, r]));
    return lote.map((paso) => {
      const r = porFila.get(paso.item.posicion);
      return r === undefined ? detalleDeErrorInterno(paso) : detalleDeConfirmacion(paso, r);
    });
  }

  private asignacionDe(item: PasoDeConfirmacion['item']) {
    const a = asignacionParaUpsert(item);
    if (a === null) throw new Error('Una fila NUEVA marcada sin asignación completa');
    return { celulaId: a.celulaId, qeResponsableId: a.qeResponsableId, analistaId: a.analistaId, sprintId: a.sprintId };
  }
}
