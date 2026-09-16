import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuditoriaRepositorio, FiltroAuditoria } from '../../dominio/repositorios/auditoria.repositorio.js';
import type { OpcionesPaginacion, Pagina, RegistroAuditoria } from '../../dominio/tipos.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

    return {
      items: items.map((fila) => ({
        id: fila.id,
        fecha: fila.fecha,
        actor: { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
        entidad: fila.entidad,
        entidadId: fila.entidadId,
        accion: fila.accion,
        antes: (fila.antes as Record<string, unknown> | null) ?? null,
        despues: (fila.despues as Record<string, unknown> | null) ?? null,
        motivo: fila.motivo,
      })),
      total,
      pagina: paginacion.pagina,
      tamanoPagina: paginacion.tamanoPagina,
    };
  }
}
