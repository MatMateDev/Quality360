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
  type Hdu,
  type OpcionesPaginacion,
  type Pagina,
  type UsuarioResumen,
} from '../../dominio/tipos.js';
import { esErrorUnicidad } from '../prisma/errores-prisma.js';
import { aHduDominio } from '../prisma/mapeadores.js';
import { PrismaService } from '../prisma/prisma.service.js';

function whereDeAmbito(ambito: FiltroAmbitoHdu): Prisma.HduWhereInput {
  if (ambito.tipo === 'TODAS') return {};
  if (ambito.tipo === 'ANALISTA') return { analistaId: ambito.analistaId };
  return { OR: [{ qeResponsableId: ambito.qeResponsableId }, { analistaId: { in: [...ambito.analistasSupervisadosIds] } }] };
}

function whereDeFiltro(filtro: FiltroHdu): Prisma.HduWhereInput {
  const where: Prisma.HduWhereInput = {};
  if (filtro.celulaId !== undefined) where.celulaId = filtro.celulaId;
  if (filtro.sprintId !== undefined) where.sprintId = filtro.sprintId;
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
            sprintId: datos.sprintId,
            prioridad: datos.prioridad,
            qeResponsableId: datos.qeResponsableId,
            estado: 'PENDIENTE',
            creadoPorTipo: actor.tipo,
            creadoPorId: actor.id,
            creadoPorNombre: actor.nombre,
          },
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
            despues: { codigo: creada.codigo, titulo: creada.titulo, celulaId: creada.celulaId, sprintId: creada.sprintId, prioridad: creada.prioridad },
            motivo: null,
          },
        });
        return aHduDominio(creada);
      });
    } catch (error) {
      if (esErrorUnicidad(error, 'hdu_codigo_normalizado_key')) throw new ConflictoUnicidad('codigo');
      throw error;
    }
  }

  async buscarPorId(id: string): Promise<Hdu | null> {
    const fila = await this.prisma.hdu.findUnique({ where: { id } });
    return fila === null ? null : aHduDominio(fila);
  }

  async buscarPorCodigoNormalizado(codigoNormalizado: string): Promise<Hdu | null> {
    const fila = await this.prisma.hdu.findUnique({ where: { codigoNormalizado } });
    return fila === null ? null : aHduDominio(fila);
  }

  async listarPorAmbito(ambito: FiltroAmbitoHdu, filtro: FiltroHdu, paginacion: OpcionesPaginacion): Promise<Pagina<Hdu>> {
    const where: Prisma.HduWhereInput = { AND: [whereDeAmbito(ambito), whereDeFiltro(filtro)] };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.hdu.findMany({
        where,
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
      const antes = await tx.hdu.findUniqueOrThrow({ where: { id: input.hduId } });
      if (antes.analistaId === input.analistaId) {
        return { cambio: false, hdu: aHduDominio(antes), analistaAnteriorId: antes.analistaId, fecha: antes.estadoActualizadoEn };
      }

      const fecha = new Date();
      const actualizada = await tx.hdu.update({ where: { id: input.hduId }, data: { analistaId: input.analistaId } });
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
    const [estados, asignaciones] = await Promise.all([
      this.prisma.hduHistorialEstado.findMany({ where: { hduId }, orderBy: { fecha: 'asc' } }),
      this.prisma.hduHistorialAsignacion.findMany({ where: { hduId }, orderBy: { fecha: 'asc' } }),
    ]);

    const idsUsuarios = new Set<string>();
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

    return [eventoCreacion, ...eventosEstado, ...eventosAsignacion].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
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
