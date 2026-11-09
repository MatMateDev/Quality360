/**
 * Persistencia de la consulta de Jira (D133-D141): `consulta_jira` y `consulta_item`. Las reglas viven en el dominio;
 * aquí solo se guardan las filas y se garantizan las transacciones. El índice único parcial `consulta_abierta_key`, los
 * disparadores y los CHECK de la migración son la última defensa.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma, type ConsultaItem as ItemPrisma, type ConsultaJira as ConsultaPrisma } from '#prisma';

import {
  ConsultaRepositorio,
  type DatosCierreConsulta,
  type DatosCierreEjecucion,
  type DatosConfirmacionFila,
  type DatosFilaNueva,
  type DatosInicioEjecucion,
  type DatosTanda,
  type EdicionDeFila,
  type FiltroItems,
  type LimpiezaDeFila,
  type ResultadoConfirmacionFilaRepo,
} from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionIntegraciones } from '../../configuracion.js';
import { esAdvertenciaFila, esMotivoFila } from '../../dominio/catalogos.js';
import { yaAsignadaDe } from '../../dominio/consulta/clasificacion.js';
import { ConsultaAbiertaDuplicada } from '../../dominio/consulta/errores.js';
import { ASIGNACION_VACIA, SIN_CONTEOS, type AsignacionFila, type CambiosConsulta, type CampoAsignacion, type Consulta, type ConteosFilas, type GrupoConsulta, type ItemConsulta, type OrigenHduConsulta, type OrigenSprint, type Ref, type YaAsignada } from '../../dominio/consulta/tipos.js';
import { IntegracionEnCurso } from '../../dominio/errores.js';
import type { Ejecucion, FilaDetalle, PrioridadHdu } from '../../dominio/tipos.js';
import { cerrarEnTransaccion, esViolacionDeUnicidad, iniciarEnTransaccion } from './ejecucion.prisma.repositorio.js';
import { aEjecucion } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

type Cliente = Prisma.TransactionClient;

/** La fila sin su `detalle` (hasta 40 KB): ni el listado ni la edición lo leen; solo `GET …/items/{itemId}` (D200). */
type FilaSinDetalle = Omit<ItemPrisma, 'detalle'>;
const SIN_DETALLE = { detalle: true } as const;

/** Duración de la toma de una fila cuando el repositorio se arma sin configuración (D202). */
const TOMA_FILA_MS_DEFECTO = 30_000;

/** Transacción que tiene bloqueadas las filas de una edición; `guardarEdiciones` escribe dentro de ella. */
const bloqueoActual = new AsyncLocalStorage<Cliente>();

const OPCIONES_TRANSACCION = { maxWait: 5000, timeout: 20_000 } as const;

// ------------------------------------------------------------------ traducción
export function aConsulta(fila: ConsultaPrisma): Consulta {
  return {
    id: fila.id,
    estado: fila.estado as Consulta['estado'],
    version: fila.version,
    creadaPor: { id: fila.creadaPorId, nombre: fila.creadaPorNombre },
    creadaEn: fila.creadaEn,
    venceEn: fila.venceEn,
    cerradaEn: fila.cerradaEn,
    cerradaPor: fila.cerradaPorId === null ? null : { id: fila.cerradaPorId, nombre: fila.cerradaPorNombre ?? '' },
    proyecto: fila.proyectoClave,
    sitioHost: fila.sitioHost,
    hayMas: fila.hayMas,
    continuarDesde: fila.continuarDesde,
    sugerencia: {
      celula: fila.sugerenciaCelulaId === null || fila.sugerenciaCelulaNombre === null ? null : { id: fila.sugerenciaCelulaId, nombre: fila.sugerenciaCelulaNombre },
      qe: fila.sugerenciaQeId === null || fila.sugerenciaQeNombre === null ? null : { id: fila.sugerenciaQeId, nombre: fila.sugerenciaQeNombre },
      sprintRespaldo: fila.sprintRespaldoId === null || fila.sprintRespaldoNombre === null ? null : { id: fila.sprintRespaldoId, nombre: fila.sprintRespaldoNombre },
    },
    leidas: fila.totalFilas,
    nuevas: fila.nuevas,
    cambiaron: fila.cambiaron,
    sinCambios: fila.sinCambios,
    conError: fila.conError,
    conAdvertencias: fila.conAdvertencias,
    descartadas: fila.descartadas,
    creadas: fila.creadas,
  };
}

const ref = (id: string | null, nombre: string | null): Ref | null => (id === null ? null : { id, nombre: nombre ?? '' });

/** `{idHistoria, qe, analista}` guardado; lo que no tenga esa forma se descarta (la fila vale igual). */
function aYaAsignada(valor: unknown): YaAsignada | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const v = valor as { idHistoria?: unknown; qe?: unknown; analista?: unknown };
  if (typeof v.idHistoria !== 'string' || typeof v.qe !== 'string') return null;
  return { idHistoria: v.idHistoria, qe: v.qe, analista: typeof v.analista === 'string' ? v.analista : null };
}

export function aItem(fila: FilaSinDetalle, tomaFilaMs: number = TOMA_FILA_MS_DEFECTO, ahora: Date = new Date()): ItemConsulta {
  const asignacion: AsignacionFila =
    fila.grupo !== 'NUEVA'
      ? ASIGNACION_VACIA
      : {
          celula: ref(fila.celulaId, fila.celulaNombre),
          qe: ref(fila.qeId, fila.qeNombre),
          analista: ref(fila.analistaId, fila.analistaNombre),
          sprint: ref(fila.sprintId, fila.sprintNombre),
          sprintOrigen: (fila.sprintOrigen as OrigenSprint | null) ?? null,
        };
  const referencia = fila.referencia as { estado?: unknown; responsable?: unknown } | null;
  return {
    id: fila.id,
    posicion: fila.posicion,
    revision: fila.revision,
    grupo: fila.grupo as GrupoConsulta,
    codigo: fila.codigo,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    prioridad: (fila.prioridad as PrioridadHdu | null) ?? null,
    sprintJira: fila.sprintJira,
    referencia: referencia === null ? null : { estado: typeof referencia.estado === 'string' ? referencia.estado : null, responsable: typeof referencia.responsable === 'string' ? referencia.responsable : null },
    advertencias: Array.isArray(fila.advertencias) ? fila.advertencias.filter(esAdvertenciaFila) : [],
    motivo: esMotivoFila(fila.motivo) ? fila.motivo : null,
    idHistoria: fila.historiaId,
    origenHdu: (fila.origenHdu as OrigenHduConsulta | null) ?? null,
    estadoHdu: fila.estadoHdu,
    qeHduNombre: fila.qeHduNombre,
    cambios: (fila.cambios as CambiosConsulta | null) ?? null,
    asignacion,
    analistaAuto: fila.analistaAuto,
    avisoSinLider: fila.avisoSinLider,
    marcada: fila.marcada,
    aplicada: fila.aplicada,
    aplicando: !fila.aplicada && fila.aplicandoDesde !== null && ahora.getTime() - fila.aplicandoDesde.getTime() < tomaFilaMs,
    aplicacion:
      fila.alcanceAplicacion === null || fila.aplicadoPorId === null || fila.aplicadoEn === null
        ? null
        : { alcance: fila.alcanceAplicacion === 'HDU' ? 'HDU' : 'LOTE', por: { id: fila.aplicadoPorId, nombre: fila.aplicadoPorNombre ?? '' }, en: fila.aplicadoEn },
    yaAsignada: aYaAsignada(fila.yaAsignada),
    asignadoPor: fila.asignadoPorId === null ? null : { id: fila.asignadoPorId, nombre: fila.asignadoPorNombre ?? '' },
    asignadoEn: fila.asignadoEn,
  };
}

function json(valor: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return valor === null || valor === undefined ? Prisma.DbNull : (valor as Prisma.InputJsonValue);
}

function datosDeFila(consultaId: string, f: DatosFilaNueva): Prisma.ConsultaItemCreateManyInput {
  const e = f.existente;
  const conHdu = e !== null && (f.grupo === 'CAMBIO' || f.grupo === 'SIN_CAMBIOS');
  return {
    consultaId,
    posicion: f.posicion,
    grupo: f.grupo,
    codigo: f.codigo === null || f.codigo === '' ? null : f.codigo.slice(0, 60),
    titulo: f.titulo,
    descripcion: f.descripcion,
    prioridad: f.prioridad,
    sprintJira: f.sprintJira,
    referencia: json(f.referencia),
    advertencias: f.advertencias,
    motivo: f.motivo,
    // D204: toda fila cuya HDU exista guarda su id y la instantánea `yaAsignada` (hoy solo `CAMBIO` y `SIN_CAMBIOS` la tienen).
    historiaId: e === null ? null : e.idHistoria,
    origenHdu: conHdu ? e.origen : null,
    estadoHdu: conHdu ? e.estado : null,
    qeHduNombre: conHdu ? e.qeResponsable : null,
    yaAsignada: e === null ? Prisma.DbNull : (yaAsignadaDe(e) as unknown as Prisma.InputJsonValue),
    cambios: f.grupo === 'CAMBIO' ? json(f.cambios) : Prisma.DbNull,
    // El detalle (D198) con la hora de la tanda; `null` si no hay (filas de una Organización o un Jira que no lo dan).
    detalle: f.detalle === undefined || f.detalle === null || f.detalle.valor === null ? Prisma.DbNull : ({ ...(f.detalle.valor as object), leidaEn: f.detalle.leidaEn.toISOString() } as Prisma.InputJsonValue),
  };
}

/** Cierra una consulta abierta, la purga y sube `version`. `null` si ya no estaba abierta. */
async function cerrarEnTransaccionConsulta(tx: Cliente, id: string, cierre: DatosCierreConsulta): Promise<Consulta | null> {
  // D205: al «Terminar revisión» (DESCARTADA) `descartadas` cuenta las filas sin confirmar que se pierden; lo ya creado se conserva.
  const descartadas =
    cierre.descartadas ?? (cierre.estado === 'DESCARTADA' ? await tx.consultaItem.count({ where: { consultaId: id, aplicada: false } }) : 0);
  const r = await tx.consultaJira.updateMany({
    where: { id, estado: 'ABIERTA' },
    data: {
      estado: cierre.estado,
      cerradaEn: cierre.en,
      cerradaPorId: cierre.por?.id ?? null,
      cerradaPorNombre: cierre.por?.nombre ?? null,
      descartadas,
      version: { increment: 1 },
    },
  });
  if (r.count === 0) return null;
  // La purga: `consulta_item` es la única tabla con DELETE (D133).
  await tx.consultaItem.deleteMany({ where: { consultaId: id } });
  return aConsulta(await tx.consultaJira.findUniqueOrThrow({ where: { id } }));
}

@Injectable()
export class ConsultaPrismaRepositorio extends ConsultaRepositorio {
  private readonly tomaFilaMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CONFIGURACION) configuracion?: ConfiguracionIntegraciones,
  ) {
    super();
    this.tomaFilaMs = configuracion?.tomaFilaMs ?? TOMA_FILA_MS_DEFECTO;
  }

  private item(fila: FilaSinDetalle): ItemConsulta {
    return aItem(fila, this.tomaFilaMs);
  }

  /**
   * Dentro de `conFilasBloqueadas` toda operación usa la transacción que tiene las filas bloqueadas: en la nube el pool
   * es de una sola conexión (`connection_limit=1`) y una segunda conexión esperaría a la del bloqueo.
   */
  private cliente(): Cliente | PrismaService {
    return bloqueoActual.getStore() ?? this.prisma;
  }

  private transaccion<T>(fn: (tx: Cliente) => Promise<T>): Promise<T> {
    const bloqueada = bloqueoActual.getStore();
    return bloqueada === undefined ? this.prisma.$transaction(fn, OPCIONES_TRANSACCION) : fn(bloqueada);
  }

  async obtenerAbierta(): Promise<Consulta | null> {
    const fila = await this.cliente().consultaJira.findFirst({ where: { estado: 'ABIERTA' } });
    return fila === null ? null : aConsulta(fila);
  }

  async obtener(id: string): Promise<Consulta | null> {
    const fila = await this.cliente().consultaJira.findUnique({ where: { id } });
    return fila === null ? null : aConsulta(fila);
  }

  async ultimaCerrada(): Promise<Consulta | null> {
    const fila = await this.prisma.consultaJira.findFirst({ where: { estado: { not: 'ABIERTA' } }, orderBy: [{ cerradaEn: 'desc' }, { creadaEn: 'desc' }] });
    return fila === null ? null : aConsulta(fila);
  }

  async conteos(id: string): Promise<ConteosFilas> {
    const filas = await this.prisma.$queryRaw<
      Array<{ asignadas: number; completas: number; marcadas_nuevas: number; marcadas_cambio: number; aplicadas: number; pendientes: number; ya_asignadas: number }>
    >`SELECT
        (count(*) FILTER (WHERE grupo = 'NUEVA' AND (celula_id IS NOT NULL OR qe_id IS NOT NULL OR analista_id IS NOT NULL OR sprint_id IS NOT NULL)))::int AS asignadas,
        (count(*) FILTER (WHERE grupo = 'NUEVA' AND celula_id IS NOT NULL AND qe_id IS NOT NULL AND analista_id IS NOT NULL AND sprint_id IS NOT NULL))::int AS completas,
        (count(*) FILTER (WHERE grupo = 'NUEVA' AND marcada))::int AS marcadas_nuevas,
        (count(*) FILTER (WHERE grupo = 'CAMBIO' AND marcada))::int AS marcadas_cambio,
        (count(*) FILTER (WHERE aplicada))::int AS aplicadas,
        (count(*) FILTER (WHERE marcada AND NOT aplicada))::int AS pendientes,
        (count(*) FILTER (WHERE ya_asignada IS NOT NULL))::int AS ya_asignadas
      FROM "integraciones"."consulta_item" WHERE id_consulta = ${id}::uuid`;
    const f = filas[0];
    if (f === undefined) return SIN_CONTEOS;
    return { asignadas: f.asignadas, completas: f.completas, marcadasNuevas: f.marcadas_nuevas, marcadasCambio: f.marcadas_cambio, aplicadas: f.aplicadas, pendientes: f.pendientes, yaAsignadas: f.ya_asignadas };
  }

  async codigosGuardados(id: string): Promise<Set<string>> {
    const filas = await this.cliente().consultaItem.findMany({ where: { consultaId: id, codigo: { not: null } }, select: { codigo: true } });
    return new Set(filas.map((f) => (f.codigo as string).trim().toUpperCase()));
  }

  async guardarTanda(datos: DatosTanda): Promise<Consulta> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (datos.reemplaza !== null) await cerrarEnTransaccionConsulta(tx, datos.reemplaza.id, { estado: 'REEMPLAZADA', en: datos.reemplaza.en, por: datos.reemplaza.por });
        const conAdvertencias = datos.filas.filter((f) => f.advertencias.length > 0).length;
        const por = (grupo: GrupoConsulta): number => datos.filas.filter((f) => f.grupo === grupo).length;
        const sumas = { totalFilas: datos.filas.length, nuevas: por('NUEVA'), cambiaron: por('CAMBIO'), sinCambios: por('SIN_CAMBIOS'), conError: por('CON_ERROR'), conAdvertencias };

        let consultaId = datos.consultaId;
        if (consultaId === null) {
          const n = datos.nueva;
          if (n === null) throw new Error('La tanda de una consulta nueva trae sus datos');
          const creada = await tx.consultaJira.create({
            data: {
              estado: 'ABIERTA',
              creadaPorId: n.creadaPor.id,
              creadaPorNombre: n.creadaPor.nombre,
              creadaEn: n.creadaEn,
              venceEn: datos.venceEn,
              proyectoClave: n.proyecto,
              sitioHost: n.sitioHost,
              hayMas: datos.hayMas,
              continuarDesde: datos.continuarDesde,
              sugerenciaCelulaId: n.sugerencia.celulaId,
              sugerenciaCelulaNombre: n.sugerencia.celulaNombre,
              sugerenciaQeId: n.sugerencia.qeId,
              sugerenciaQeNombre: n.sugerencia.qeNombre,
              sprintRespaldoId: n.sugerencia.sprintRespaldoId,
              sprintRespaldoNombre: n.sugerencia.sprintRespaldoNombre,
              ...sumas,
            },
          });
          consultaId = creada.id;
        } else {
          await tx.consultaJira.update({
            where: { id: consultaId },
            data: {
              venceEn: datos.venceEn,
              hayMas: datos.hayMas,
              continuarDesde: datos.continuarDesde,
              version: { increment: 1 },
              totalFilas: { increment: sumas.totalFilas },
              nuevas: { increment: sumas.nuevas },
              cambiaron: { increment: sumas.cambiaron },
              sinCambios: { increment: sumas.sinCambios },
              conError: { increment: sumas.conError },
              conAdvertencias: { increment: sumas.conAdvertencias },
            },
          });
        }
        if (datos.filas.length > 0) await tx.consultaItem.createMany({ data: datos.filas.map((f) => datosDeFila(consultaId as string, f)) });
        await cerrarEnTransaccion(tx, datos.ejecucionId, { ...datos.cierre, consultaId });
        return aConsulta(await tx.consultaJira.findUniqueOrThrow({ where: { id: consultaId } }));
      }, OPCIONES_TRANSACCION);
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new ConsultaAbiertaDuplicada();
      throw error;
    }
  }

  cerrar(id: string, cierre: DatosCierreConsulta): Promise<Consulta | null> {
    return this.transaccion((tx) => cerrarEnTransaccionConsulta(tx, id, cierre));
  }

  async listarItems(consultaId: string, filtro: FiltroItems, pagina: number, tamanoPagina: number): Promise<{ items: ItemConsulta[]; total: number; yaAsignadas: number }> {
    const where = this.dondeDeItems(consultaId, filtro);
    const [total, yaAsignadas, filas] = await this.prisma.$transaction([
      this.prisma.consultaItem.count({ where }),
      this.prisma.consultaItem.count({ where: { ...where, yaAsignada: { not: Prisma.DbNull } } }),
      this.prisma.consultaItem.findMany({ where, omit: SIN_DETALLE, orderBy: { posicion: 'asc' }, skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
    ]);
    return { items: filas.map((f) => this.item(f)), total, yaAsignadas };
  }

  async obtenerItems(consultaId: string, itemIds: readonly string[]): Promise<ItemConsulta[]> {
    const filas = await this.cliente().consultaItem.findMany({ where: { consultaId, id: { in: [...itemIds] } }, omit: SIN_DETALLE, orderBy: { posicion: 'asc' } });
    return filas.map((f) => this.item(f));
  }

  async itemsDeGrupo(consultaId: string, grupo: GrupoConsulta, q?: string): Promise<ItemConsulta[]> {
    const filas = await this.cliente().consultaItem.findMany({ where: this.dondeDeItems(consultaId, { grupo, q }), omit: SIN_DETALLE, orderBy: { posicion: 'asc' } });
    return filas.map((f) => this.item(f));
  }

  async itemsMarcadosPendientes(consultaId: string): Promise<ItemConsulta[]> {
    const filas = await this.cliente().consultaItem.findMany({ where: { consultaId, marcada: true, aplicada: false }, omit: SIN_DETALLE, orderBy: { posicion: 'asc' } });
    // Las filas con una toma vigente las está confirmando otra petición: el lote las omite sin contarlas (D203).
    return filas.map((f) => this.item(f)).filter((i) => !i.aplicando);
  }

  async obtenerItemConDetalle(consultaId: string, itemId: string): Promise<{ item: ItemConsulta; detalle: unknown; leidaEn: Date | null } | null> {
    const fila = await this.cliente().consultaItem.findFirst({ where: { consultaId, id: itemId } });
    if (fila === null) return null;
    const { detalle, ...resto } = fila;
    const objeto = typeof detalle === 'object' && detalle !== null && !Array.isArray(detalle) ? (detalle as Record<string, unknown>) : null;
    if (objeto === null) return { item: this.item(resto), detalle: null, leidaEn: null };
    // `leidaEn` viaja dentro del JSON guardado pero no es parte de `DetalleHdu`.
    const { leidaEn, ...sinLeidaEn } = objeto;
    const fecha = typeof leidaEn === 'string' && !Number.isNaN(Date.parse(leidaEn)) ? new Date(leidaEn) : null;
    return { item: this.item(resto), detalle: sinLeidaEn, leidaEn: fecha };
  }

  /** `q` es texto literal: se escapan `\`, `%` y `_` (Prisma no lo hace en `contains`); nunca se arma SQL con él. */
  private dondeDeItems(consultaId: string, filtro: FiltroItems): Prisma.ConsultaItemWhereInput {
    const q = filtro.q?.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    return {
      consultaId,
      grupo: filtro.grupo,
      ...(q === undefined || q === '' ? {} : { OR: [{ codigo: { contains: q, mode: 'insensitive' } }, { titulo: { contains: q, mode: 'insensitive' } }] }),
    };
  }

  async conFilasBloqueadas<T>(consultaId: string, itemIds: readonly string[], accion: () => Promise<T>): Promise<T> {
    const ids = [...new Set(itemIds)].sort();
    return this.prisma.$transaction(async (tx) => {
      if (ids.length > 0) {
        await tx.$queryRaw`SELECT id_item FROM "integraciones"."consulta_item" WHERE id_consulta = ${consultaId}::uuid AND id_item = ANY(${ids}::uuid[])
          ORDER BY id_item FOR UPDATE`;
      }
      return bloqueoActual.run(tx, accion);
    }, OPCIONES_TRANSACCION);
  }

  async guardarEdiciones(consultaId: string, ediciones: readonly EdicionDeFila[], ahora: Date): Promise<number | null> {
    const guardar = async (tx: Cliente): Promise<number | null> => {
      const filas = await tx.$queryRaw<Array<{ version: number }>>`UPDATE "integraciones"."consulta_jira" SET version = version + 1
        WHERE id_consulta = ${consultaId}::uuid AND estado = 'ABIERTA' AND vence_en > ${ahora} RETURNING version`;
      const version = filas[0]?.version;
      if (version === undefined) return null;
      if (ediciones.length > 0) {
        // Una sola sentencia para todas las filas: con 230 filas la latencia de la base no se multiplica.
        const datos = JSON.stringify(
          ediciones.map((e) => ({
            id: e.itemId,
            celula_id: e.asignacion.celula?.id ?? null,
            qe_id: e.asignacion.qe?.id ?? null,
            analista_id: e.asignacion.analista?.id ?? null,
            sprint_id: e.asignacion.sprint?.id ?? null,
            celula_nombre: e.asignacion.celula?.nombre ?? null,
            qe_nombre: e.asignacion.qe?.nombre ?? null,
            analista_nombre: e.asignacion.analista?.nombre ?? null,
            sprint_nombre: e.asignacion.sprint?.nombre ?? null,
            sprint_origen: e.asignacion.sprintOrigen,
            analista_auto: e.analistaAuto,
            aviso_sin_lider: e.avisoSinLider,
            marcada: e.marcada,
            advertencias: e.advertencias,
            asignado_por_id: e.asignadoPor?.id ?? null,
            asignado_por_nombre: e.asignadoPor?.nombre ?? null,
            asignado_en: e.asignadoEn?.toISOString() ?? null,
          })),
        );
        await tx.$executeRaw`UPDATE "integraciones"."consulta_item" AS t SET
            celula_id = v.celula_id, qe_id = v.qe_id, analista_id = v.analista_id, sprint_id = v.sprint_id,
            celula_nombre = v.celula_nombre, qe_nombre = v.qe_nombre, analista_nombre = v.analista_nombre, sprint_nombre = v.sprint_nombre,
            sprint_origen = v.sprint_origen, analista_auto = v.analista_auto, aviso_sin_lider = v.aviso_sin_lider, marcada = v.marcada, advertencias = v.advertencias,
            asignado_por_id = v.asignado_por_id, asignado_por_nombre = v.asignado_por_nombre, asignado_en = v.asignado_en,
            revision = t.revision + 1
          FROM jsonb_to_recordset(${datos}::jsonb) AS v(
            id uuid, celula_id uuid, qe_id uuid, analista_id uuid, sprint_id uuid,
            celula_nombre varchar, qe_nombre varchar, analista_nombre varchar, sprint_nombre varchar,
            sprint_origen varchar, analista_auto boolean, aviso_sin_lider boolean, marcada boolean, advertencias jsonb,
            asignado_por_id uuid, asignado_por_nombre varchar, asignado_en timestamptz)
          WHERE t.id_item = v.id AND t.id_consulta = ${consultaId}::uuid`;
      }
      return version;
    };
    return this.transaccion(guardar);
  }

  async desmarcar(consultaId: string, itemIds: readonly string[]): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.consultaJira.updateMany({ where: { id: consultaId, estado: 'ABIERTA' }, data: { version: { increment: 1 } } });
      if (r.count === 0) return null;
      await tx.consultaItem.updateMany({ where: { consultaId, id: { in: [...itemIds] }, aplicada: false, marcada: true }, data: { marcada: false, revision: { increment: 1 } } });
      return (await tx.consultaJira.findUniqueOrThrow({ where: { id: consultaId }, select: { version: true } })).version;
    }, OPCIONES_TRANSACCION);
  }

  async iniciarConfirmacion(
    consultaId: string,
    version: number,
    datos: DatosInicioEjecucion,
    enCursoMaxMs: number,
  ): Promise<{ tipo: 'OK'; ejecucion: Ejecucion } | { tipo: 'NO_ENCONTRADA' } | { tipo: 'CERRADA' | 'MODIFICADA'; consulta: Consulta }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id_consulta FROM "integraciones"."consulta_jira" WHERE id_consulta = ${consultaId}::uuid FOR UPDATE`;
        const fila = await tx.consultaJira.findUnique({ where: { id: consultaId } });
        if (fila === null) return { tipo: 'NO_ENCONTRADA' as const };
        const consulta = aConsulta(fila);
        if (consulta.estado !== 'ABIERTA' || consulta.venceEn.getTime() <= datos.iniciadaEn.getTime()) return { tipo: 'CERRADA' as const, consulta };
        if (consulta.version !== version) return { tipo: 'MODIFICADA' as const, consulta };
        const creada = await iniciarEnTransaccion(tx, { ...datos, fase: 'CONFIRMACION', consultaId }, enCursoMaxMs);
        return { tipo: 'OK' as const, ejecucion: aEjecucion(creada) };
      }, OPCIONES_TRANSACCION);
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new IntegracionEnCurso();
      throw error;
    }
  }

  async aplicarLote(
    consultaId: string,
    itemIds: readonly string[],
    ejecucionId: string,
    detalle: readonly FilaDetalle[],
    aplicacion: { readonly por: { id: string; nombre: string }; readonly en: Date; readonly historias: ReadonlyMap<string, string> },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const comun = {
        aplicada: true,
        aplicandoDesde: null,
        alcanceAplicacion: 'LOTE',
        aplicadoPorId: aplicacion.por.id,
        aplicadoPorNombre: aplicacion.por.nombre,
        aplicadoEn: aplicacion.en,
        revision: { increment: 1 },
      } as const;
      for (const itemId of itemIds) {
        const historiaId = aplicacion.historias.get(itemId);
        // Una fila `NUEVA` creada guarda su `id_historia` (item_hdu_ck lo permite porque queda `aplicada`).
        await tx.consultaItem.updateMany({ where: { consultaId, id: itemId, marcada: true, aplicada: false }, data: { ...comun, ...(historiaId === undefined ? {} : { historiaId }) } });
      }
      const creadas = detalle.filter((fila) => fila.resultado === 'CREADA').length;
      await tx.consultaJira.update({ where: { id: consultaId }, data: { version: { increment: 1 }, creadas: { increment: creadas } } });
      if (detalle.length > 0) {
        await tx.detalleEjecucion.createMany({
          data: detalle.map((fila) => ({
            ejecucionId,
            fila: fila.fila,
            codigo: fila.codigo,
            titulo: fila.titulo,
            historiaId: fila.idHistoria,
            resultado: fila.resultado,
            motivo: fila.motivo,
            mensaje: fila.mensaje,
            advertencias: fila.advertencias,
            cambios: json(fila.cambios),
            referencia: json(fila.referencia),
            asignacion: json(fila.asignacion),
          })),
        });
      }
    }, OPCIONES_TRANSACCION);
  }

  // ------------------------------------------------------------------ confirmación de una fila (D202)
  async tomarFila(consultaId: string, itemId: string, revision: number): Promise<boolean> {
    // Un solo UPDATE condicional: la base decide quién toma la fila. `now()` y la comparación son de la base, no del reloj del servicio.
    const filas = await this.cliente().$queryRaw<Array<{ id_item: string }>>`UPDATE "integraciones"."consulta_item"
      SET aplicando_desde = now()
      WHERE id_item = ${itemId}::uuid AND id_consulta = ${consultaId}::uuid AND revision = ${revision} AND NOT aplicada
        AND (aplicando_desde IS NULL OR aplicando_desde < now() - make_interval(secs => ${this.tomaFilaMs / 1000}::double precision))
      RETURNING id_item`;
    return filas.length === 1;
  }

  async liberarFila(consultaId: string, itemId: string): Promise<void> {
    await this.cliente().$executeRaw`UPDATE "integraciones"."consulta_item" SET aplicando_desde = NULL
      WHERE id_item = ${itemId}::uuid AND id_consulta = ${consultaId}::uuid AND NOT aplicada AND aplicando_desde IS NOT NULL`;
  }

  async tomarFilas(consultaId: string, itemIds: readonly string[]): Promise<string[]> {
    if (itemIds.length === 0) return [];
    const filas = await this.cliente().$queryRaw<Array<{ id_item: string }>>`UPDATE "integraciones"."consulta_item"
      SET aplicando_desde = now()
      WHERE id_consulta = ${consultaId}::uuid AND id_item = ANY(${[...itemIds]}::uuid[]) AND marcada AND NOT aplicada
        AND (aplicando_desde IS NULL OR aplicando_desde < now() - make_interval(secs => ${this.tomaFilaMs / 1000}::double precision))
      RETURNING id_item`;
    return filas.map((f) => f.id_item);
  }

  async liberarFilas(consultaId: string, itemIds: readonly string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await this.cliente().$executeRaw`UPDATE "integraciones"."consulta_item" SET aplicando_desde = NULL
      WHERE id_consulta = ${consultaId}::uuid AND id_item = ANY(${[...itemIds]}::uuid[]) AND NOT aplicada AND aplicando_desde IS NOT NULL`;
  }

  async registrarYaAsignada(consultaId: string, itemId: string, ya: YaAsignada): Promise<ItemConsulta | null> {
    return this.transaccion(async (tx) => {
      const cons = await tx.consultaJira.updateMany({ where: { id: consultaId, estado: 'ABIERTA' }, data: { version: { increment: 1 } } });
      if (cons.count === 0) return null;
      await tx.consultaItem.updateMany({
        where: { consultaId, id: itemId, aplicada: false },
        data: { yaAsignada: ya as unknown as Prisma.InputJsonValue, historiaId: ya.idHistoria, marcada: false, aplicandoDesde: null, revision: { increment: 1 } },
      });
      const fila = await tx.consultaItem.findFirst({ where: { consultaId, id: itemId }, omit: SIN_DETALLE });
      return fila === null ? null : this.item(fila);
    });
  }

  async limpiarAsignacion(datos: LimpiezaDeFila): Promise<{ item: ItemConsulta | null; version: number | null }> {
    return this.transaccion(async (tx) => {
      const cons = await tx.consultaJira.updateMany({ where: { id: datos.consultaId, estado: 'ABIERTA' }, data: { version: { increment: 1 } } });
      if (cons.count === 0) return { item: null, version: null };
      const limpia = new Set<CampoAsignacion>(datos.limpiar);
      // Un QE o una célula que se vacía arrastra a lo que depende de él (el analista es del equipo del QE; el sprint, de la célula).
      if (limpia.has('qeId')) limpia.add('analistaId');
      if (limpia.has('celulaId')) limpia.add('sprintId');
      const data: Prisma.ConsultaItemUpdateManyMutationInput & Prisma.ConsultaItemUncheckedUpdateManyInput = {
        marcada: false,
        aplicandoDesde: null,
        revision: { increment: 1 },
        ...(limpia.has('celulaId') ? { celulaId: null, celulaNombre: null, avisoSinLider: false } : {}),
        ...(limpia.has('qeId') ? { qeId: null, qeNombre: null } : {}),
        ...(limpia.has('analistaId') ? { analistaId: null, analistaNombre: null, analistaAuto: false } : {}),
        ...(limpia.has('sprintId') ? { sprintId: null, sprintNombre: null, sprintOrigen: null } : {}),
      };
      await tx.consultaItem.updateMany({ where: { consultaId: datos.consultaId, id: datos.itemId, aplicada: false }, data });
      const fila = await tx.consultaItem.findFirst({ where: { consultaId: datos.consultaId, id: datos.itemId }, omit: SIN_DETALLE });
      const consulta = await tx.consultaJira.findUniqueOrThrow({ where: { id: datos.consultaId }, select: { version: true } });
      return { item: fila === null ? null : this.item(fila), version: consulta.version };
    });
  }

  async confirmarFila(datos: DatosConfirmacionFila): Promise<ResultadoConfirmacionFilaRepo> {
    // Todo con el cliente `tx` de ESTA transacción: el pool es de una sola conexión (`connection_limit=1`) y cualquier otra
    // consulta quedaría esperando a la conexión que esta retiene.
    return this.transaccion(async (tx) => {
      // Idempotencia por (consulta, HDU): si la ejecución de esa HDU ya existe (falla parcial anterior), se reutiliza.
      const previa = await tx.detalleEjecucion.findFirst({
        where: { historiaId: datos.idHistoria, ejecucion: { consultaId: datos.consultaId } },
        select: { ejecucionId: true },
        orderBy: { ejecucionId: 'asc' },
      });
      let ejecucionPrisma = previa === null ? null : await tx.ejecucionIntegracion.findUnique({ where: { id: previa.ejecucionId } });
      if (ejecucionPrisma === null) {
        ejecucionPrisma = await tx.ejecucionIntegracion.create({
          data: {
            origen: 'JIRA',
            fase: 'CONFIRMACION',
            alcance: 'HDU',
            consultaId: datos.consultaId,
            estricto: false,
            vincularExistentes: false,
            actorId: datos.actor.id,
            actorNombre: datos.actor.nombre,
            actorRol: datos.actor.rol,
            iniciadaEn: datos.iniciadaEn,
            terminadaEn: datos.terminadaEn,
            duracionMs: datos.duracionMs,
            // Nace cerrada (D202 a): nunca ocupa `ejecucion_en_curso_key`.
            resultado: 'EXITOSA',
            leidas: 1,
            creadas: 1,
            conAdvertencias: datos.detalle.advertencias.length > 0 ? 1 : 0,
            proyectoClave: datos.proyecto,
            sitioHost: datos.sitioHost,
            hayMas: false,
            eventos: [],
          },
        });
        const f = datos.detalle;
        await tx.detalleEjecucion.create({
          data: {
            ejecucionId: ejecucionPrisma.id,
            fila: f.fila,
            codigo: f.codigo,
            titulo: f.titulo,
            historiaId: f.idHistoria,
            resultado: f.resultado,
            motivo: f.motivo,
            mensaje: f.mensaje,
            advertencias: f.advertencias,
            cambios: json(f.cambios),
            referencia: json(f.referencia),
            asignacion: json(f.asignacion),
          },
        });
      }
      // La fila y la consulta solo se tocan si siguen ahí: si «Terminar revisión» la purgó mientras tanto, la HDU se conserva y
      // solo queda la ejecución (D205).
      const marcada = await tx.consultaItem.updateMany({
        where: { consultaId: datos.consultaId, id: datos.itemId, aplicada: false },
        data: {
          aplicada: true,
          marcada: true,
          aplicandoDesde: null,
          historiaId: datos.idHistoria,
          alcanceAplicacion: 'HDU',
          aplicadoPorId: datos.actor.id,
          aplicadoPorNombre: datos.actor.nombre,
          aplicadoEn: datos.terminadaEn,
          yaAsignada: Prisma.DbNull,
          revision: { increment: 1 },
        },
      });
      if (marcada.count > 0) {
        await tx.consultaJira.updateMany({ where: { id: datos.consultaId, estado: 'ABIERTA' }, data: { version: { increment: 1 }, creadas: { increment: 1 } } });
      }
      const fila = await tx.consultaItem.findFirst({ where: { consultaId: datos.consultaId, id: datos.itemId }, omit: SIN_DETALLE });
      const consulta = aConsulta(await tx.consultaJira.findUniqueOrThrow({ where: { id: datos.consultaId } }));
      return { item: fila === null ? null : this.item(fila), consulta, ejecucion: aEjecucion(ejecucionPrisma) };
    });
  }

  async ejecucionDeHdu(consultaId: string, idHistoria: string): Promise<Ejecucion | null> {
    const detalle = await this.cliente().detalleEjecucion.findFirst({
      where: { historiaId: idHistoria, ejecucion: { consultaId } },
      include: { ejecucion: true },
      orderBy: { ejecucionId: 'asc' },
    });
    return detalle === null ? null : aEjecucion(detalle.ejecucion);
  }

  async cerrarConfirmacion(
    consultaId: string,
    ejecucionId: string,
    cierre: DatosCierreEjecucion,
    cierreConsulta: DatosCierreConsulta | null,
  ): Promise<{ consulta: Consulta; ejecucion: Ejecucion }> {
    return this.prisma.$transaction(async (tx) => {
      const ejecucion = aEjecucion(await cerrarEnTransaccion(tx, ejecucionId, cierre));
      if (cierreConsulta !== null) {
        const descartadas = await tx.consultaItem.count({ where: { consultaId, marcada: false } });
        const cerrada = await cerrarEnTransaccionConsulta(tx, consultaId, { ...cierreConsulta, descartadas });
        if (cerrada !== null) return { consulta: cerrada, ejecucion };
      }
      return { consulta: aConsulta(await tx.consultaJira.findUniqueOrThrow({ where: { id: consultaId } })), ejecucion };
    }, OPCIONES_TRANSACCION);
  }
}
