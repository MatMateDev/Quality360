import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '#prisma';

import { ENTIDADES_AUDITORIA_USUARIOS } from '../../dominio/reglas/auditoria-usuarios.js';
import type { RecursoExportacion } from '../../dominio/reglas/auditoria-usuarios.js';
import type {
  AuditoriaRepositorio,
  FiltroAuditoria,
  FiltroAuditoriaUsuarios,
  RegistroAuditoriaUsuarioDominio,
} from '../../dominio/repositorios/auditoria.repositorio.js';
import type { Actor, OpcionesPaginacion, Pagina, RegistroAuditoria } from '../../dominio/tipos.js';
import { PrismaService } from '../prisma/prisma.service.js';

type FilaAuditoria = Prisma.AuditoriaGetPayload<Record<string, never>>;

function aRegistro(fila: FilaAuditoria): RegistroAuditoria {
  return {
    id: fila.id,
    fecha: fila.fecha,
    actor: { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
    entidad: fila.entidad,
    entidadId: fila.entidadId,
    accion: fila.accion,
    antes: (fila.antes as Record<string, unknown> | null) ?? null,
    despues: (fila.despues as Record<string, unknown> | null) ?? null,
    motivo: fila.motivo,
  };
}

@Injectable()
export class AuditoriaPrismaRepositorio implements AuditoriaRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroAuditoria, paginacion: OpcionesPaginacion): Promise<Pagina<RegistroAuditoria>> {
    const where: Prisma.AuditoriaWhereInput = {};
    if (filtro.entidad !== undefined) where.entidad = filtro.entidad;
    if (filtro.entidadId !== undefined) where.entidadId = filtro.entidadId;
    if (filtro.desde !== undefined || filtro.hasta !== undefined) {
      where.fecha = {};
      if (filtro.desde !== undefined) where.fecha.gte = filtro.desde;
      if (filtro.hasta !== undefined) where.fecha.lte = filtro.hasta;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditoria.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (paginacion.pagina - 1) * paginacion.tamanoPagina,
        take: paginacion.tamanoPagina,
      }),
      this.prisma.auditoria.count({ where }),
    ]);

    return { items: items.map(aRegistro), total, pagina: paginacion.pagina, tamanoPagina: paginacion.tamanoPagina };
  }

  /** El «usuario afectado» de una entrada de supervisión es el analista: su `entidad_id` es el de la relación. */
  private async whereUsuarios(filtro: FiltroAuditoriaUsuarios): Promise<Prisma.AuditoriaWhereInput> {
    const condiciones: Prisma.AuditoriaWhereInput[] = [{ entidad: { in: [...ENTIDADES_AUDITORIA_USUARIOS] } }];
    if (filtro.operacion !== undefined) condiciones.push({ accion: filtro.operacion });
    if (filtro.actorId !== undefined) condiciones.push({ actorId: filtro.actorId });
    if (filtro.desde !== undefined || filtro.hasta !== undefined) {
      condiciones.push({ fecha: { ...(filtro.desde !== undefined ? { gte: filtro.desde } : {}), ...(filtro.hasta !== undefined ? { lte: filtro.hasta } : {}) } });
    }
    if (filtro.usuarioAfectadoId !== undefined) {
      const supervisiones = await this.prisma.supervision.findMany({ where: { analistaId: filtro.usuarioAfectadoId }, select: { id: true } });
      condiciones.push({
        OR: [
          { entidad: 'USUARIO', entidadId: filtro.usuarioAfectadoId },
          { entidad: 'SUPERVISION', entidadId: { in: supervisiones.map((fila) => fila.id) } },
        ],
      });
    }
    return { AND: condiciones };
  }

  private async conUsuarioAfectado(filas: FilaAuditoria[]): Promise<RegistroAuditoriaUsuarioDominio[]> {
    const idsSupervision = filas.filter((fila) => fila.entidad === 'SUPERVISION').map((fila) => fila.entidadId);
    const supervisiones =
      idsSupervision.length === 0
        ? []
        : await this.prisma.supervision.findMany({ where: { id: { in: idsSupervision } }, select: { id: true, analistaId: true } });
    const analistaPorSupervision = new Map(supervisiones.map((fila) => [fila.id, fila.analistaId]));
    return filas.map((fila) => ({
      ...aRegistro(fila),
      usuarioAfectadoId:
        fila.entidad === 'USUARIO' ? fila.entidadId : fila.entidad === 'SUPERVISION' ? (analistaPorSupervision.get(fila.entidadId) ?? null) : null,
    }));
  }

  async listarUsuarios(filtro: FiltroAuditoriaUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<RegistroAuditoriaUsuarioDominio>> {
    const where = await this.whereUsuarios(filtro);
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.auditoria.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (paginacion.pagina - 1) * paginacion.tamanoPagina,
        take: paginacion.tamanoPagina,
      }),
      this.prisma.auditoria.count({ where }),
    ]);
    return { items: await this.conUsuarioAfectado(filas), total, pagina: paginacion.pagina, tamanoPagina: paginacion.tamanoPagina };
  }

  async contarUsuarios(filtro: FiltroAuditoriaUsuarios): Promise<number> {
    return this.prisma.auditoria.count({ where: await this.whereUsuarios(filtro) });
  }

  async listarUsuariosHasta(filtro: FiltroAuditoriaUsuarios, limite: number): Promise<RegistroAuditoriaUsuarioDominio[]> {
    const filas = await this.prisma.auditoria.findMany({
      where: await this.whereUsuarios(filtro),
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: limite,
    });
    return this.conUsuarioAfectado(filas);
  }

  async registrarExportacion(input: {
    actor: Actor;
    recurso: RecursoExportacion;
    filtros: Record<string, unknown>;
    filas: number;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    await this.prisma.auditoria.create({
      data: {
        actorTipo: input.actor.tipo,
        actorId: input.actor.id,
        actorNombre: input.actor.nombre,
        entidad: 'EXPORTACION',
        entidadId: id,
        accion: 'EXPORTAR',
        antes: undefined,
        despues: { recurso: input.recurso, filtros: input.filtros as Prisma.InputJsonObject, filas: input.filas },
        motivo: null,
      },
    });
    return { id };
  }
}
