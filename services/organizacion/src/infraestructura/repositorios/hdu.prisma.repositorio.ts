import { Injectable } from '@nestjs/common';
import type { Prisma } from '#prisma';

import { ConflictoUnicidad } from '../../dominio/errores/conflicto-unicidad.js';
import type { FiltroAmbitoHdu } from '../../dominio/reglas/ambito.js';
import type {
  DatosNuevaHdu,
  FiltroHdu,
  HduRepositorio,
  ResultadoAsignacionAnalista,
  ResultadoCambioEstado,
  ResultadoReasignacionQe,
  ResumenHduAmbito,
} from '../../dominio/repositorios/hdu.repositorio.js';
import {
  conteoPorEstadoVacio,
  type Actor,
  type ConteoPorEstado,
  type EstadoHdu,
  type EventoAsignacionHdu,
  type EventoEstadoHdu,
  type EventoHistorialHdu,
  type EventoResponsableHdu,
  type Hdu,
  type OpcionesPaginacion,
  type Pagina,
  type UsuarioResumen,
} from '../../dominio/tipos.js';
import { esErrorUnicidad } from '../prisma/errores-prisma.js';
import { INCLUYE_SPRINT_VIGENTE, aHduDominio } from '../prisma/mapeadores.js';
import { PrismaService } from '../prisma/prisma.service.js';

function whereDeAmbito(ambito: FiltroAmbitoHdu): Prisma.HduWhereInput {
  if (ambito.tipo === 'TODAS') return {};
  if (ambito.tipo === 'ANALISTA') return { analistaId: ambito.analistaId };
  if (ambito.tipo === 'CELULAS') return { celulaId: { in: [...ambito.celulaIds] } };
  return { OR: [{ qeResponsableId: ambito.qeResponsableId }, { analistaId: { in: [...ambito.analistasSupervisadosIds] } }] };
}

function whereDeFiltro(filtro: FiltroHdu): Prisma.HduWhereInput {
  const where: Prisma.HduWhereInput = {};
  if (filtro.celulaId !== undefined) where.celulaId = filtro.celulaId;
  if (filtro.sprintId !== undefined) where.historiaSprints = { some: { sprintId: filtro.sprintId, fechaRetiro: null } };
  if (filtro.estado !== undefined) where.estado = filtro.estado;
  return where;
}

async function contarPorEstado(prisma: PrismaService, where: Prisma.HduWhereInput): Promise<ResumenHduAmbito> {
  const [total, agrupado] = await Promise.all([
    prisma.hdu.count({ where }),
    prisma.hdu.groupBy({ by: ['estado'], where, _count: { _all: true } }),
  ]);
  const porEstado: ConteoPorEstado = conteoPorEstadoVacio();
  for (const fila of agrupado) porEstado[fila.estado] = fila._count._all;
  return { total, porEstado };
}

@Injectable()
export class HduPrismaRepositorio implements HduRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: DatosNuevaHdu, actor: Actor): Promise<Hdu> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creada = await tx.hdu.create({
          data: {
            codigo: datos.codigo,
            codigoNormalizado: datos.codigo.toLowerCase(),
            titulo: datos.titulo,
            celulaId: datos.celulaId,
            historiaSprints: { create: { sprintId: datos.sprintId } },
            prioridad: datos.prioridad,
            qeResponsableId: datos.qeResponsableId,
            estado: 'PENDIENTE',
            creadoPorTipo: actor.tipo,
            creadoPorId: actor.id,
            creadoPorNombre: actor.nombre,
          },
          include: INCLUYE_SPRINT_VIGENTE,
        });
        await tx.auditoria.create({
          data: {
            actorTipo: actor.tipo,
            actorId: actor.id,
            actorNombre: actor.nombre,
            entidad: 'HDU',
            entidadId: creada.id,
            accion: 'CREAR_HDU',
            antes: undefined,
            despues: { codigo: creada.codigo, titulo: creada.titulo, celulaId: creada.celulaId, sprintId: datos.sprintId, prioridad: creada.prioridad },
            motivo: null,
          },
        });
        return aHduDominio(creada);
      });
    } catch (error) {
      if (esErrorUnicidad(error, 'historia_usuario_codigo_normalizado_key')) throw new ConflictoUnicidad('codigo');
      throw error;
    }
  }

  async buscarPorId(id: string): Promise<Hdu | null> {
    const fila = await this.prisma.hdu.findUnique({ where: { id }, include: INCLUYE_SPRINT_VIGENTE });
    return fila === null ? null : aHduDominio(fila);
  }

  async buscarPorCodigoNormalizado(codigoNormalizado: string): Promise<Hdu | null> {
    const fila = await this.prisma.hdu.findUnique({ where: { codigoNormalizado }, include: INCLUYE_SPRINT_VIGENTE });
    return fila === null ? null : aHduDominio(fila);
  }

  async buscarPorIds(ids: readonly string[]): Promise<Hdu[]> {
    if (ids.length === 0) return [];
    const filas = await this.prisma.hdu.findMany({ where: { id: { in: [...ids] } }, include: INCLUYE_SPRINT_VIGENTE });
    return filas.map(aHduDominio);
  }

  async listarTodasPorAmbito(ambito: FiltroAmbitoHdu): Promise<Hdu[]> {
    const filas = await this.prisma.hdu.findMany({ where: whereDeAmbito(ambito), include: INCLUYE_SPRINT_VIGENTE, orderBy: { codigo: 'asc' } });
    return filas.map(aHduDominio);
  }

  async listarIdsPorAmbito(ambito: FiltroAmbitoHdu): Promise<string[]> {
    const filas = await this.prisma.hdu.findMany({ where: whereDeAmbito(ambito), select: { id: true }, orderBy: { codigo: 'asc' } });
    return filas.map((fila) => fila.id);
  }

  async contarTodas(): Promise<number> {
    return this.prisma.hdu.count();
  }

  async ultimosCambiosAsignacion(hduIds: readonly string[]): Promise<Map<string, Date>> {
    const mapa = new Map<string, Date>();
    if (hduIds.length === 0) return mapa;
    const [analistas, responsables] = await Promise.all([
      this.prisma.hduHistorialAsignacion.groupBy({ by: ['hduId'], where: { hduId: { in: [...hduIds] } }, _max: { fecha: true } }),
      this.prisma.hduHistorialResponsable.groupBy({ by: ['hduId'], where: { hduId: { in: [...hduIds] } }, _max: { fecha: true } }),
    ]);
    for (const fila of [...analistas, ...responsables]) {
      const fecha = fila._max.fecha;
      if (fecha === null) continue;
      const previa = mapa.get(fila.hduId);
      if (previa === undefined || previa.getTime() < fecha.getTime()) mapa.set(fila.hduId, fecha);
    }
    return mapa;
  }

  async reasignarQeResponsable(input: { hduId: string; qeNuevoId: string; motivo: string; actor: Actor }): Promise<ResultadoReasignacionQe> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id_historia" FROM "historia_usuario" WHERE "id_historia" = ${input.hduId}::uuid FOR UPDATE`;
      const antes = await tx.hdu.findUniqueOrThrow({ where: { id: input.hduId }, include: INCLUYE_SPRINT_VIGENTE });
      if (antes.qeResponsableId === input.qeNuevoId) {
        return { cambio: false, hdu: aHduDominio(antes), qeAnteriorId: antes.qeResponsableId, fecha: antes.estadoActualizadoEn };
      }

      const fecha = new Date();
      const actualizada = await tx.hdu.update({ where: { id: input.hduId }, data: { qeResponsableId: input.qeNuevoId }, include: INCLUYE_SPRINT_VIGENTE });
      await tx.hduHistorialResponsable.create({
        data: {
          hduId: input.hduId,
          qeAnteriorId: antes.qeResponsableId,
          qeNuevoId: input.qeNuevoId,
          motivo: input.motivo,
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          fecha,
        },
      });
      await tx.auditoria.create({
        data: {
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          entidad: 'HDU',
          entidadId: input.hduId,
          accion: 'REASIGNAR_QE_RESPONSABLE',
          antes: { qeResponsableId: antes.qeResponsableId },
          despues: { qeResponsableId: input.qeNuevoId },
          motivo: input.motivo,
        },
      });
      return { cambio: true, hdu: aHduDominio(actualizada), qeAnteriorId: antes.qeResponsableId, fecha };
    });
  }

  async listarPorAmbito(ambito: FiltroAmbitoHdu, filtro: FiltroHdu, paginacion: OpcionesPaginacion): Promise<Pagina<Hdu>> {
    const where: Prisma.HduWhereInput = { AND: [whereDeAmbito(ambito), whereDeFiltro(filtro)] };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.hdu.findMany({
        where,
        include: INCLUYE_SPRINT_VIGENTE,
        orderBy: { creadoEn: 'desc' },
        skip: (paginacion.pagina - 1) * paginacion.tamanoPagina,
        take: paginacion.tamanoPagina,
      }),
      this.prisma.hdu.count({ where }),
    ]);
    return { items: items.map(aHduDominio), total, pagina: paginacion.pagina, tamanoPagina: paginacion.tamanoPagina };
  }

  async asignarAnalista(input: { hduId: string; analistaId: string; motivo: string | null; actor: Actor }): Promise<ResultadoAsignacionAnalista> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.hdu.findUniqueOrThrow({ where: { id: input.hduId }, include: INCLUYE_SPRINT_VIGENTE });
      if (antes.analistaId === input.analistaId) {
        return { cambio: false, hdu: aHduDominio(antes), analistaAnteriorId: antes.analistaId, fecha: antes.estadoActualizadoEn };
      }

      const fecha = new Date();
      const actualizada = await tx.hdu.update({ where: { id: input.hduId }, data: { analistaId: input.analistaId }, include: INCLUYE_SPRINT_VIGENTE });
      await tx.hduHistorialAsignacion.create({
        data: {
          hduId: input.hduId,
          analistaAnteriorId: antes.analistaId,
          analistaNuevoId: input.analistaId,
          motivo: input.motivo,
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          fecha,
        },
      });
      await tx.auditoria.create({
        data: {
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          entidad: 'HDU',
          entidadId: input.hduId,
          accion: antes.analistaId === null ? 'ASIGNAR_ANALISTA' : 'REASIGNAR_ANALISTA',
          antes: { analistaId: antes.analistaId },
          despues: { analistaId: input.analistaId },
          motivo: input.motivo,
        },
      });
      return { cambio: true, hdu: aHduDominio(actualizada), analistaAnteriorId: antes.analistaId, fecha };
    });
  }

  async cambiarEstado(input: { hduId: string; estadoNuevo: EstadoHdu; actor: Actor }): Promise<ResultadoCambioEstado> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.hdu.findUniqueOrThrow({ where: { id: input.hduId } });
      const fecha = new Date();
      const actualizada = await tx.hdu.update({
        where: { id: input.hduId },
        data: { estado: input.estadoNuevo, estadoActualizadoEn: fecha },
        include: INCLUYE_SPRINT_VIGENTE,
      });
      await tx.hduHistorialEstado.create({
        data: {
          hduId: input.hduId,
          estadoAnterior: antes.estado,
          estadoNuevo: input.estadoNuevo,
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          fecha,
        },
      });
      await tx.auditoria.create({
        data: {
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          entidad: 'HDU',
          entidadId: input.hduId,
          accion: 'CAMBIAR_ESTADO_HDU',
          antes: { estado: antes.estado },
          despues: { estado: input.estadoNuevo },
          motivo: null,
        },
      });
      return { hdu: aHduDominio(actualizada), estadoAnterior: antes.estado, fecha };
    });
  }

  async historial(hduId: string): Promise<EventoHistorialHdu[]> {
    const hdu = await this.prisma.hdu.findUniqueOrThrow({ where: { id: hduId } });
    const [estados, asignaciones, responsables] = await Promise.all([
      this.prisma.hduHistorialEstado.findMany({ where: { hduId }, orderBy: { fecha: 'asc' } }),
      this.prisma.hduHistorialAsignacion.findMany({ where: { hduId }, orderBy: { fecha: 'asc' } }),
      this.prisma.hduHistorialResponsable.findMany({ where: { hduId }, orderBy: { fecha: 'asc' } }),
    ]);

    const idsUsuarios = new Set<string>();
    for (const cambio of responsables) {
      idsUsuarios.add(cambio.qeAnteriorId);
      idsUsuarios.add(cambio.qeNuevoId);
    }
    for (const asignacion of asignaciones) {
      if (asignacion.analistaAnteriorId !== null) idsUsuarios.add(asignacion.analistaAnteriorId);
      idsUsuarios.add(asignacion.analistaNuevoId);
    }
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: [...idsUsuarios] } },
      select: { id: true, nombre: true, correo: true },
    });
    const mapaUsuarios = new Map(usuarios.map((usuario) => [usuario.id, usuario]));
    const resumenDe = (id: string): UsuarioResumen => mapaUsuarios.get(id) ?? { id, nombre: '(usuario no disponible)', correo: '' };

    const eventoCreacion: EventoEstadoHdu = {
      tipo: 'ESTADO',
      fecha: hdu.creadoEn,
      actor: { tipo: hdu.creadoPorTipo, id: hdu.creadoPorId, nombre: hdu.creadoPorNombre },
      estadoAnterior: null,
      estadoNuevo: 'PENDIENTE',
    };
    const eventosEstado: EventoEstadoHdu[] = estados.map((fila) => ({
      tipo: 'ESTADO',
      fecha: fila.fecha,
      actor: { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
      estadoAnterior: fila.estadoAnterior,
      estadoNuevo: fila.estadoNuevo,
    }));
    const eventosAsignacion: EventoAsignacionHdu[] = asignaciones.map((fila) => ({
      tipo: 'ASIGNACION',
      fecha: fila.fecha,
      actor: { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
      analistaAnterior: fila.analistaAnteriorId === null ? null : resumenDe(fila.analistaAnteriorId),
      analistaNuevo: resumenDe(fila.analistaNuevoId),
      motivo: fila.motivo,
    }));

    const eventosResponsable: EventoResponsableHdu[] = responsables.map((fila) => ({
      tipo: 'QE_RESPONSABLE',
      fecha: fila.fecha,
      actor: { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
      qeAnterior: resumenDe(fila.qeAnteriorId),
      qeNuevo: resumenDe(fila.qeNuevoId),
      motivo: fila.motivo,
    }));

    return [eventoCreacion, ...eventosEstado, ...eventosAsignacion, ...eventosResponsable].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }

  async resumenAmbitoQe(qeResponsableId: string, analistasSupervisadosIds: readonly string[]): Promise<ResumenHduAmbito> {
    const where: Prisma.HduWhereInput = {
      OR: [{ qeResponsableId }, { analistaId: { in: [...analistasSupervisadosIds] } }],
    };
    return contarPorEstado(this.prisma, where);
  }

  async resumenPorAnalista(analistaId: string): Promise<ResumenHduAmbito> {
    return contarPorEstado(this.prisma, { analistaId });
  }
}
