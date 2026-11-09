/**
 * «Confirmar asignación» de UNA fila (D202, D204, D205, D206, ADR 0018): crea esa HDU con el mismo `asignaciones/validar` y el
 * mismo `hdu/upsert` en modo confirmación que usa el lote (un lote de 1 fila `CREAR`), sin una segunda lógica de creación.
 * No llama a Jira ni lee la configuración. No toma el candado global de D104: su ejecución `HDU` nace cerrada.
 *
 * Orden: consulta abierta y vigente (410/409) → fila `NUEVA` (422) → HDU ya asignada (409) → reintento idempotente (200 o 409)
 * → `revision` (409) → asignación completa (422) → TOMA ATÓMICA (409 `FILA_EN_CURSO`) → validación en Organización (409
 * `ASIGNACIONES_INVALIDAS`) → upsert → una transacción con la fila `aplicada`, `creadas` y la ejecución `HDU`.
 * Cualquier salida distinta de la creación libera la toma; una toma abandonada vence sola a los 30 s.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { estaCompleta, faltantes, type ErrorValidacion } from '../dominio/consulta/asignacion.js';
import { yaAsignadaDe } from '../dominio/consulta/clasificacion.js';
import { asignacionParaUpsert, detalleDeConfirmacion } from '../dominio/consulta/confirmacion.js';
import { AsignacionesInvalidas, ConsultaNoEncontrada, FilaEnCurso, FilaModificada, FilaRechazadaUnica, HduYaAsignada } from '../dominio/consulta/errores.js';
import { SIN_CONTEOS, type CampoAsignacion, type Consulta, type ItemConsulta, type YaAsignada } from '../dominio/consulta/tipos.js';
import { Presupuesto } from '../dominio/ejecucion.js';
import { OrganizacionNoDisponible } from '../dominio/errores.js';
import type { Ejecucion, FilaDetalle } from '../dominio/tipos.js';
import { ConsultaAplicacion } from './consulta.servicio.js';
import {
  ConsultaRepositorio,
  ProveedorOrganizacion,
  Reloj,
  type AsignacionAValidar,
  type FilaUpsertConfirmacion,
  type ResultadoConfirmacionFilaRepo,
  type ResultadoFilaUpsert,
  type Solicitante,
} from './puertos.js';
import { vistaEjecucion } from './vistas.js';
import { urlDeIssue, vistaConsulta, vistaItem } from './vistas-consulta.js';

interface Contexto {
  readonly solicitante: Solicitante;
  readonly consulta: Consulta;
  readonly entrada: { readonly revision: number };
  readonly presupuesto: Presupuesto;
  readonly iniciadaEn: Date;
}

@Injectable()
export class ConfirmacionFilaAplicacion {
  private readonly registro = new Logger(ConfirmacionFilaAplicacion.name);

  constructor(
    private readonly consulta: ConsultaAplicacion,
    private readonly consultas: ConsultaRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /** 404 de la consulta o de la fila (de otra consulta o inexistente). Con la consulta cerrada ya no hay filas: no se mira. */
  async verificarFila(consultaId: string, itemId: string): Promise<void> {
    const c = await this.consulta.existente(consultaId);
    if (c.estado === 'ABIERTA' && (await this.consultas.obtenerItems(c.id, [itemId])).length === 0) throw new ConsultaNoEncontrada();
  }

  /** `POST /consultas/{id}/items/{itemId}/confirmaciones`. */
  async confirmar(solicitante: Solicitante, consultaId: string, itemId: string, entrada: { revision: number }) {
    const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
    const c = await this.consulta.abierta(consultaId);
    const contexto: Contexto = { solicitante, consulta: c, entrada, presupuesto, iniciadaEn: this.reloj.ahora() };
    const fila = await this.leerFila(c, itemId);

    const previo = await this.decidirPrevio(contexto, fila);
    if (previo !== null) return previo;

    if (!(await this.consultas.tomarFila(c.id, fila.id, entrada.revision))) {
      // Perdió la carrera: la fila cambió, la terminó otra petición o la tiene otra petición ahora mismo.
      const actual = await this.buscarFila(c, itemId);
      if (actual === null) throw await this.consulta.errorActual(c.id, 'CONSULTA_NO_ABIERTA');
      const despues = await this.decidirPrevio(contexto, actual);
      if (despues !== null) return despues;
      throw new FilaEnCurso();
    }
    try {
      return await this.crear(contexto, fila);
    } catch (error) {
      await this.consultas.liberarFila(c.id, fila.id).catch(() => undefined);
      throw error;
    }
  }

  // ------------------------------------------------------------------ validaciones previas a la toma
  private async buscarFila(c: Consulta, itemId: string): Promise<ItemConsulta | null> {
    const [fila] = await this.consultas.obtenerItems(c.id, [itemId]);
    return fila ?? null;
  }

  private async leerFila(c: Consulta, itemId: string): Promise<ItemConsulta> {
    const fila = await this.buscarFila(c, itemId);
    if (fila === null) throw new ConsultaNoEncontrada();
    return fila;
  }

  /**
   * Las validaciones que no tocan a Jira ni a Organización. Devuelve la respuesta 200 si es un reintento idempotente, `null`
   * si se puede seguir, o lanza el error que corresponde.
   */
  private async decidirPrevio(ctx: Contexto, fila: ItemConsulta) {
    const rechazo = (motivo: 'FILA_NO_ASIGNABLE' | 'ASIGNACION_INCOMPLETA', pendientes?: CampoAsignacion[]) =>
      new FilaRechazadaUnica({ itemId: fila.id, codigo: fila.codigo, campo: null, motivo, ...(pendientes === undefined ? {} : { faltantes: pendientes }) });

    if (fila.grupo !== 'NUEVA') throw rechazo('FILA_NO_ASIGNABLE');
    if (fila.yaAsignada !== null) throw new HduYaAsignada(fila.yaAsignada, vistaItem(fila, ctx.consulta.sitioHost));
    if (fila.aplicada) return this.reintento(ctx, fila);
    if (fila.revision !== ctx.entrada.revision) throw new FilaModificada(vistaItem(fila, ctx.consulta.sitioHost));
    if (!estaCompleta(fila.asignacion)) throw rechazo('ASIGNACION_INCOMPLETA', faltantes(fila.asignacion));
    return null;
  }

  /**
   * La fila ya está `aplicada`: si la aplicó este mismo Administrador es un reintento y se devuelve lo mismo (200
   * `repetida`); si la aplicó otra persona, la HDU ya es de alguien más (409).
   */
  private async reintento(ctx: Contexto, fila: ItemConsulta) {
    const limite = (): number => ctx.presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);
    const actor = await this.organizacion.perfil(ctx.solicitante.contexto, limite());
    const [existente] = await this.organizacion.estadoCodigos([fila.codigo as string], ctx.solicitante.contexto, limite());
    if (fila.aplicacion !== null && fila.aplicacion.por.id !== actor.id) {
      const ya: YaAsignada =
        existente === null || existente === undefined
          ? { idHistoria: fila.idHistoria as string, qe: fila.aplicacion.por.nombre, analista: null }
          : yaAsignadaDe(existente);
      throw new HduYaAsignada(ya, vistaItem(fila, ctx.consulta.sitioHost));
    }
    const idHistoria = (fila.idHistoria ?? existente?.idHistoria) as string;
    let ejecucion = await this.consultas.ejecucionDeHdu(ctx.consulta.id, idHistoria);
    if (ejecucion === null) {
      // La fila quedó aplicada pero la ejecución nunca se registró: se registra ahora, sin duplicar la HDU.
      const guardado = await this.registrar(ctx, fila, idHistoria, { id: actor.id, nombre: actor.nombre });
      ejecucion = guardado.ejecucion;
    }
    return this.respuesta(ctx, { repetida: true, fila, idHistoria, titulo: existente?.titulo ?? fila.titulo, estado: existente?.estado ?? 'PENDIENTE', ejecucion });
  }

  // ------------------------------------------------------------------ con la fila tomada
  private async crear(ctx: Contexto, fila: ItemConsulta) {
    const { solicitante, consulta: c, presupuesto } = ctx;
    const limite = (): number => presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);
    const asignacion = asignacionParaUpsert(fila);
    if (asignacion === null) throw new Error('Una fila NUEVA sin asignación completa llegó a crearse');
    const actor = await this.organizacion.perfil(solicitante.contexto, limite());

    // La asignación pudo dejar de ser válida desde que se armó (analista desactivado, cambio de equipo, QE inactivo).
    const pedido: AsignacionAValidar = { ref: 'v0', celulaId: asignacion.celulaId, qeResponsableId: asignacion.qeResponsableId, analistaId: asignacion.analistaId, sprintId: asignacion.sprintId };
    const [validada] = await this.organizacion.validarAsignaciones([pedido], solicitante.contexto, limite());
    const invalida = validada?.errores[0];
    if (invalida !== undefined) return this.rechazarAsignacion(ctx, fila, invalida.campo, invalida.codigo);

    const filaUpsert: FilaUpsertConfirmacion = {
      fila: fila.posicion,
      codigo: fila.codigo as string,
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      prioridad: fila.prioridad,
      claveExterna: fila.codigo,
      urlExterna: fila.codigo === null ? null : urlDeIssue(c.sitioHost, fila.codigo),
      operacion: 'CREAR',
      asignacion,
    };
    const respuesta = await this.organizacion.upsert({ origen: 'JIRA', consultaId: c.id, filas: [filaUpsert] }, solicitante.contexto, limite());
    const r = respuesta.filas.find((x) => x.fila === fila.posicion);
    if (r === undefined) throw new OrganizacionNoDisponible('El upsert no devolvió la fila confirmada');

    if (r.resultado === 'CREADA' && r.idHistoria !== null) {
      const guardado = await this.registrar(ctx, fila, r.idHistoria, { id: actor.id, nombre: actor.nombre });
      return this.respuesta(ctx, { repetida: false, fila, idHistoria: r.idHistoria, titulo: fila.titulo, estado: 'PENDIENTE', ejecucion: guardado.ejecucion, guardado });
    }
    if (r.resultado === 'OMITIDA' && r.motivo === 'HDU_CREADA_DESPUES') return this.yaCreada(ctx, fila, r, actor);
    if (r.resultado === 'ERROR' && r.motivo === 'ASIGNACION_INVALIDA' && r.errorAsignacion !== undefined) {
      return this.rechazarAsignacion(ctx, fila, r.errorAsignacion.campo, r.errorAsignacion.codigo);
    }
    // Cualquier otra cosa no es una creación: no se inventa un éxito. La toma se libera y el reintento es idempotente.
    this.registro.error(`El upsert de una fila no la creó · ${r.resultado} ${r.motivo ?? ''}`);
    throw new OrganizacionNoDisponible('El upsert no creó la fila confirmada');
  }

  /** Organización dice que la HDU ya existe: si la creó esta consulta y este actor es un reintento; si no, ya es de alguien. */
  private async yaCreada(ctx: Contexto, fila: ItemConsulta, r: ResultadoFilaUpsert, actor: { id: string; nombre: string }) {
    const limite = (): number => ctx.presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs);
    let existente = r.existente;
    if (existente === undefined) {
      // Una Organización anterior no informa `existente`: se lee con el estado de los códigos. No se adivina quién la creó.
      const [leida] = await this.organizacion.estadoCodigos([fila.codigo as string], ctx.solicitante.contexto, limite());
      if (leida === null || leida === undefined) throw new OrganizacionNoDisponible('La HDU creada después no existe');
      existente = { idHistoria: leida.idHistoria, qe: yaAsignadaDe(leida).qe, analista: yaAsignadaDe(leida).analista, creadaPorEstaConsulta: false, creadaPorActor: false };
    }
    if (existente.creadaPorEstaConsulta && existente.creadaPorActor) {
      const guardado = await this.registrar(ctx, fila, existente.idHistoria, actor);
      return this.respuesta(ctx, { repetida: true, fila, idHistoria: existente.idHistoria, titulo: fila.titulo, estado: 'PENDIENTE', ejecucion: guardado.ejecucion, guardado });
    }
    const ya: YaAsignada = { idHistoria: existente.idHistoria, qe: existente.qe, analista: existente.analista };
    const actualizada = await this.consultas.registrarYaAsignada(ctx.consulta.id, fila.id, ya);
    if (actualizada === null) throw await this.consulta.errorActual(ctx.consulta.id, 'CONSULTA_NO_ABIERTA');
    throw new HduYaAsignada(ya, vistaItem(actualizada, ctx.consulta.sitioHost));
  }

  /** Un campo dejó de ser válido: se limpia, la fila se desmarca, se libera la toma y se informa (409, nada se escribió). */
  private async rechazarAsignacion(ctx: Contexto, fila: ItemConsulta, campo: CampoAsignacion, motivo: ErrorValidacion['codigo']): Promise<never> {
    const { version } = await this.consultas.limpiarAsignacion({ consultaId: ctx.consulta.id, itemId: fila.id, limpiar: [campo] });
    if (version === null) throw await this.consulta.errorActual(ctx.consulta.id, 'CONSULTA_NO_ABIERTA');
    throw new AsignacionesInvalidas([{ itemId: fila.id, codigo: fila.codigo, campo, motivo }], version);
  }

  // ------------------------------------------------------------------ escritura y respuesta
  private registrar(ctx: Contexto, fila: ItemConsulta, idHistoria: string, actor: { id: string; nombre: string }) {
    const detalle: FilaDetalle = detalleDeConfirmacion(
      { item: fila, operacion: 'CREAR' },
      { resultado: 'CREADA', motivo: null, idHistoria, advertencias: [], cambios: null },
    );
    return this.consultas.confirmarFila({
      consultaId: ctx.consulta.id,
      itemId: fila.id,
      idHistoria,
      actor: { id: actor.id, nombre: actor.nombre, rol: ctx.solicitante.rol },
      iniciadaEn: ctx.iniciadaEn,
      terminadaEn: this.reloj.ahora(),
      duracionMs: Math.max(1, ctx.presupuesto.transcurridoMs()),
      proyecto: ctx.consulta.proyecto,
      sitioHost: ctx.consulta.sitioHost,
      detalle,
    });
  }

  private async respuesta(
    ctx: Contexto,
    d: {
      repetida: boolean;
      fila: ItemConsulta;
      idHistoria: string;
      titulo: string | null;
      estado: string;
      ejecucion: Ejecucion;
      guardado?: ResultadoConfirmacionFilaRepo;
    },
  ) {
    let consulta: Consulta;
    let actual: ItemConsulta | null;
    if (d.guardado !== undefined) {
      consulta = d.guardado.consulta;
      actual = d.guardado.item;
    } else {
      consulta = await this.consulta.existente(ctx.consulta.id);
      actual = (await this.consultas.obtenerItems(consulta.id, [d.fila.id]))[0] ?? null;
    }
    const item = actual ?? aplicadaComoFallback(d.fila, d.idHistoria);
    const conteos = consulta.estado === 'ABIERTA' ? await this.consultas.conteos(consulta.id) : SIN_CONTEOS;
    return {
      resultado: 'CREADA' as const,
      repetida: d.repetida,
      hdu: { id: d.idHistoria, codigo: d.fila.codigo as string, titulo: d.titulo ?? '', estado: d.estado },
      item: vistaItem(item, consulta.sitioHost),
      ejecucion: vistaEjecucion(d.ejecucion),
      consulta: vistaConsulta(consulta, conteos),
    };
  }
}

/** Si la consulta se cerró (y se purgó) mientras se confirmaba, la fila ya no existe: se devuelve como quedó al crearse. */
function aplicadaComoFallback(fila: ItemConsulta, idHistoria: string): ItemConsulta {
  return { ...fila, aplicada: true, marcada: true, aplicando: false, idHistoria, yaAsignada: null, revision: fila.revision + 1 };
}
