import { Injectable } from '@nestjs/common';
import { Prisma } from '#prisma';

import {
  EjecucionRepositorio,
  type DatosCierreEjecucion,
  type DatosInicioEjecucion,
  type FiltroDetalle,
  type FiltroEjecuciones,
} from '../../aplicacion/puertos.js';
import { contadoresDeDetalle } from '../../dominio/ejecucion.js';
import { IntegracionEnCurso } from '../../dominio/errores.js';
import type { Ejecucion, FilaDetalle, Pagina } from '../../dominio/tipos.js';
import { aEjecucion, aFilaDetalle } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

type Cliente = Prisma.TransactionClient;

/** El índice único parcial `ejecucion_en_curso_key` no lo conoce Prisma: llega como P2002 o como 23505 crudo. */
function esViolacionDeUnicidad(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return true;
    const codigoPg = (error.meta as { code?: unknown } | undefined)?.code;
    return error.code === 'P2010' && codigoPg === '23505';
  }
  return false;
}

/** Cierra como `INTERRUMPIDA` una ejecución abierta; los contadores salen del detalle ya insertado (D114). */
async function cerrarComoInterrumpida(tx: Cliente, id: string, iniciadaEn: Date, terminadaEn: Date, duracionMs?: number): Promise<void> {
  const filas = await tx.detalleEjecucion.findMany({ where: { ejecucionId: id }, select: { resultado: true, advertencias: true } });
  const contadores = contadoresDeDetalle(
    filas.map((fila) => ({
      resultado: fila.resultado as FilaDetalle['resultado'],
      advertencias: Array.isArray(fila.advertencias) ? (fila.advertencias as FilaDetalle['advertencias']) : [],
    })),
  );
  await tx.ejecucionIntegracion.update({
    where: { id },
    data: {
      resultado: 'INTERRUMPIDA',
      terminadaEn,
      duracionMs: duracionMs ?? Math.max(0, terminadaEn.getTime() - iniciadaEn.getTime()),
      ...contadores,
    },
  });
}

function json(valor: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return valor === null || valor === undefined ? Prisma.DbNull : (valor as Prisma.InputJsonValue);
}

@Injectable()
export class EjecucionPrismaRepositorio extends EjecucionRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async iniciar(datos: DatosInicioEjecucion, enCursoMaxMs: number): Promise<Ejecucion> {
    try {
      const creada = await this.prisma.$transaction(async (tx) => {
        const limite = new Date(datos.iniciadaEn.getTime() - enCursoMaxMs);
        const abandonadas = await tx.ejecucionIntegracion.findMany({ where: { terminadaEn: null, iniciadaEn: { lt: limite } }, select: { id: true, iniciadaEn: true } });
        for (const abandonada of abandonadas) await cerrarComoInterrumpida(tx, abandonada.id, abandonada.iniciadaEn, datos.iniciadaEn);
        return tx.ejecucionIntegracion.create({
          data: {
            origen: datos.origen,
            estricto: datos.estricto,
            vincularExistentes: datos.vincularExistentes,
            actorId: datos.actor.id,
            actorNombre: datos.actor.nombre,
            actorRol: datos.actor.rol,
            iniciadaEn: datos.iniciadaEn,
            resultado: 'EN_CURSO',
            proyectoClave: datos.proyecto,
            sitioHost: datos.sitioHost,
            archivoNombre: datos.archivo?.nombre ?? null,
            archivoTamano: datos.archivo?.tamano ?? null,
            archivoHuella: datos.archivo?.huella ?? null,
          },
        });
      });
      return aEjecucion(creada);
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new IntegracionEnCurso();
      throw error;
    }
  }

  async agregarDetalle(ejecucionId: string, filas: readonly FilaDetalle[]): Promise<void> {
    if (filas.length === 0) return;
    await this.prisma.detalleEjecucion.createMany({
      data: filas.map((fila) => ({
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
      })),
    });
  }

  async cerrar(ejecucionId: string, cierre: DatosCierreEjecucion): Promise<Ejecucion> {
    const cerrada = await this.prisma.ejecucionIntegracion.update({
      where: { id: ejecucionId },
      data: {
        resultado: cierre.resultado,
        terminadaEn: cierre.terminadaEn,
        duracionMs: cierre.duracionMs,
        leidas: cierre.leidas,
        creadas: cierre.creadas,
        actualizadas: cierre.actualizadas,
        omitidas: cierre.omitidas,
        conError: cierre.conError,
        conAdvertencias: cierre.conAdvertencias,
        reintentos429: cierre.eventos.length,
        codigoError: cierre.codigoError,
        mensajeError: cierre.mensajeError,
        hayMas: cierre.hayMas,
        continuarDesde: cierre.continuarDesde,
        eventos: cierre.eventos.map((evento) => ({ tipo: evento.tipo, espera_ms: evento.esperaMs, fecha: evento.fecha.toISOString() })),
      },
    });
    return aEjecucion(cerrada);
  }

  async interrumpir(ejecucionId: string, terminadaEn: Date, duracionMs: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const abierta = await tx.ejecucionIntegracion.findFirst({ where: { id: ejecucionId, terminadaEn: null }, select: { iniciadaEn: true } });
      if (abierta !== null) await cerrarComoInterrumpida(tx, ejecucionId, abierta.iniciadaEn, terminadaEn, duracionMs);
    });
  }

  async obtener(id: string): Promise<Ejecucion | null> {
    const fila = await this.prisma.ejecucionIntegracion.findUnique({ where: { id } });
    return fila === null ? null : aEjecucion(fila);
  }

  async listar(filtro: FiltroEjecuciones, pagina: number, tamanoPagina: number): Promise<Pagina<Ejecucion>> {
    const iniciadaEn: Prisma.DateTimeFilter = {};
    if (filtro.desde !== undefined) iniciadaEn.gte = filtro.desde;
    if (filtro.hastaExcluyente !== undefined) iniciadaEn.lt = filtro.hastaExcluyente;
    const where: Prisma.EjecucionIntegracionWhereInput = {
      ...(filtro.origen === undefined ? {} : { origen: filtro.origen }),
      ...(filtro.resultado === undefined ? {} : { resultado: filtro.resultado }),
      ...(Object.keys(iniciadaEn).length === 0 ? {} : { iniciadaEn }),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.ejecucionIntegracion.count({ where }),
      this.prisma.ejecucionIntegracion.findMany({ where, orderBy: [{ iniciadaEn: filtro.orden }, { id: filtro.orden }], skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
    ]);
    return { items: filas.map(aEjecucion), total, pagina, tamanoPagina };
  }

  async listarDetalle(
    ejecucionId: string,
    filtro: FiltroDetalle,
    pagina: number,
    tamanoPagina: number,
  ): Promise<{ items: FilaDetalle[]; total: number; ocultas: number }> {
    const base: Prisma.DetalleEjecucionWhereInput = { ejecucionId, ...(filtro.resultado === undefined ? {} : { resultado: filtro.resultado }) };
    // Un QE ve las filas de HDU de su ámbito y las filas con error (D106); el resto se cuenta como oculto.
    const visible: Prisma.DetalleEjecucionWhereInput =
      filtro.ambitoHduIds === null ? base : { AND: [base, { OR: [{ resultado: 'ERROR' }, { historiaId: { in: [...filtro.ambitoHduIds] } }] }] };
    const [totalBase, total, filas] = await this.prisma.$transaction([
      this.prisma.detalleEjecucion.count({ where: base }),
      this.prisma.detalleEjecucion.count({ where: visible }),
      this.prisma.detalleEjecucion.findMany({ where: visible, orderBy: { fila: 'asc' }, skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
    ]);
    return { items: filas.map(aFilaDetalle), total, ocultas: totalBase - total };
  }

  async estado(): Promise<{ ultima: Ejecucion | null; ultimaCompletada: Ejecucion | null; ultimaJira: Ejecucion | null; enCurso: Ejecucion | null }> {
    const [ultima, completada, jira, enCurso] = await this.prisma.$transaction([
      this.prisma.ejecucionIntegracion.findFirst({ orderBy: [{ iniciadaEn: 'desc' }, { id: 'desc' }] }),
      this.prisma.ejecucionIntegracion.findFirst({ where: { resultado: { in: ['EXITOSA', 'CON_ERRORES'] } }, orderBy: [{ iniciadaEn: 'desc' }, { id: 'desc' }] }),
      this.prisma.ejecucionIntegracion.findFirst({ where: { origen: 'JIRA' }, orderBy: [{ iniciadaEn: 'desc' }, { id: 'desc' }] }),
      this.prisma.ejecucionIntegracion.findFirst({ where: { terminadaEn: null }, orderBy: { iniciadaEn: 'desc' } }),
    ]);
    return {
      ultima: ultima === null ? null : aEjecucion(ultima),
      ultimaCompletada: completada === null ? null : aEjecucion(completada),
      ultimaJira: jira === null ? null : aEjecucion(jira),
      enCurso: enCurso === null ? null : aEjecucion(enCurso),
    };
  }
}
