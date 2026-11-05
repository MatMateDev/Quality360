/**
 * Persistencia de la consulta de Jira (D133-D141): `consulta_jira` y `consulta_item`. Las reglas viven en el dominio;
 * aquí solo se guardan las filas y se garantizan las transacciones. El índice único parcial `consulta_abierta_key`, los
 * disparadores y los CHECK de la migración son la última defensa.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { Prisma, type ConsultaItem as ItemPrisma, type ConsultaJira as ConsultaPrisma } from '#prisma';

import {
  ConsultaRepositorio,
  type DatosCierreConsulta,
  type DatosCierreEjecucion,
  type DatosFilaNueva,
  type DatosInicioEjecucion,
  type DatosTanda,
  type EdicionDeFila,
  type FiltroItems,
} from '../../aplicacion/puertos.js';
import { esAdvertenciaFila, esMotivoFila } from '../../dominio/catalogos.js';
import { ConsultaAbiertaDuplicada } from '../../dominio/consulta/errores.js';
import { ASIGNACION_VACIA, SIN_CONTEOS, type AsignacionFila, type CambiosConsulta, type Consulta, type ConteosFilas, type GrupoConsulta, type ItemConsulta, type OrigenHduConsulta, type OrigenSprint, type Ref } from '../../dominio/consulta/tipos.js';
import { IntegracionEnCurso } from '../../dominio/errores.js';
import type { Ejecucion, FilaDetalle, PrioridadHdu } from '../../dominio/tipos.js';
import { cerrarEnTransaccion, esViolacionDeUnicidad, iniciarEnTransaccion } from './ejecucion.prisma.repositorio.js';
import { aEjecucion } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

type Cliente = Prisma.TransactionClient;

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
  };
}

const ref = (id: string | null, nombre: string | null): Ref | null => (id === null ? null : { id, nombre: nombre ?? '' });

export function aItem(fila: ItemPrisma): ItemConsulta {
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
    avisoSinLider: fila.avisoSinLider,
    marcada: fila.marcada,
    aplicada: fila.aplicada,
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
    historiaId: conHdu ? e.idHistoria : null,
    origenHdu: conHdu ? e.origen : null,
    estadoHdu: conHdu ? e.estado : null,
    qeHduNombre: conHdu ? e.qeResponsable : null,
    cambios: f.grupo === 'CAMBIO' ? json(f.cambios) : Prisma.DbNull,
  };
}

/** Cierra una consulta abierta, la purga y sube `version`. `null` si ya no estaba abierta. */
async function cerrarEnTransaccionConsulta(tx: Cliente, id: string, cierre: DatosCierreConsulta): Promise<Consulta | null> {
  const r = await tx.consultaJira.updateMany({
    where: { id, estado: 'ABIERTA' },
    data: {
      estado: cierre.estado,
      cerradaEn: cierre.en,
      cerradaPorId: cierre.por?.id ?? null,
      cerradaPorNombre: cierre.por?.nombre ?? null,
      descartadas: cierre.descartadas ?? 0,
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
  constructor(private readonly prisma: PrismaService) {
    super();
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
      Array<{ asignadas: number; completas: number; marcadas_nuevas: number; marcadas_cambio: number; aplicadas: number; pendientes: number }>
    >`SELECT
        (count(*) FILTER (WHERE grupo = 'NUEVA' AND (celula_id IS NOT NULL OR qe_id IS NOT NULL OR analista_id IS NOT NULL OR sprint_id IS NOT NULL)))::int AS asignadas,
        (count(*) FILTER (WHERE grupo = 'NUEVA' AND celula_id IS NOT NULL AND qe_id IS NOT NULL AND analista_id IS NOT NULL AND sprint_id IS NOT NULL))::int AS completas,
        (count(*) FILTER (WHERE grupo = 'NUEVA' AND marcada))::int AS marcadas_nuevas,
        (count(*) FILTER (WHERE grupo = 'CAMBIO' AND marcada))::int AS marcadas_cambio,
        (count(*) FILTER (WHERE aplicada))::int AS aplicadas,
        (count(*) FILTER (WHERE marcada AND NOT aplicada))::int AS pendientes
      FROM "integraciones"."consulta_item" WHERE id_consulta = ${id}::uuid`;
    const f = filas[0];
    if (f === undefined) return SIN_CONTEOS;
    return { asignadas: f.asignadas, completas: f.completas, marcadasNuevas: f.marcadas_nuevas, marcadasCambio: f.marcadas_cambio, aplicadas: f.aplicadas, pendientes: f.pendientes };
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

  async listarItems(consultaId: string, filtro: FiltroItems, pagina: number, tamanoPagina: number): Promise<{ items: ItemConsulta[]; total: number }> {
    const where = this.dondeDeItems(consultaId, filtro);
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.consultaItem.count({ where }),
      this.prisma.consultaItem.findMany({ where, orderBy: { posicion: 'asc' }, skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
    ]);
    return { items: filas.map(aItem), total };
  }

  async obtenerItems(consultaId: string, itemIds: readonly string[]): Promise<ItemConsulta[]> {
    const filas = await this.cliente().consultaItem.findMany({ where: { consultaId, id: { in: [...itemIds] } }, orderBy: { posicion: 'asc' } });
    return filas.map(aItem);
  }

  async itemsDeGrupo(consultaId: string, grupo: GrupoConsulta, q?: string): Promise<ItemConsulta[]> {
    const filas = await this.cliente().consultaItem.findMany({ where: this.dondeDeItems(consultaId, { grupo, q }), orderBy: { posicion: 'asc' } });
    return filas.map(aItem);
  }

  async itemsMarcadosPendientes(consultaId: string): Promise<ItemConsulta[]> {
    const filas = await this.cliente().consultaItem.findMany({ where: { consultaId, marcada: true, aplicada: false }, orderBy: { posicion: 'asc' } });
    return filas.map(aItem);
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
            sprint_origen = v.sprint_origen, aviso_sin_lider = v.aviso_sin_lider, marcada = v.marcada, advertencias = v.advertencias,
            asignado_por_id = v.asignado_por_id, asignado_por_nombre = v.asignado_por_nombre, asignado_en = v.asignado_en
          FROM jsonb_to_recordset(${datos}::jsonb) AS v(
            id uuid, celula_id uuid, qe_id uuid, analista_id uuid, sprint_id uuid,
            celula_nombre varchar, qe_nombre varchar, analista_nombre varchar, sprint_nombre varchar,
            sprint_origen varchar, aviso_sin_lider boolean, marcada boolean, advertencias jsonb,
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
      await tx.consultaItem.updateMany({ where: { consultaId, id: { in: [...itemIds] }, aplicada: false }, data: { marcada: false } });
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

  async aplicarLote(consultaId: string, itemIds: readonly string[], ejecucionId: string, detalle: readonly FilaDetalle[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.consultaItem.updateMany({ where: { consultaId, id: { in: [...itemIds] }, marcada: true }, data: { aplicada: true } });
      await tx.consultaJira.update({ where: { id: consultaId }, data: { version: { increment: 1 } } });
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
