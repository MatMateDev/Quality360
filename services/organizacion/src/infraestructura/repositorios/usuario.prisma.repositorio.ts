import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ConflictoUnicidad } from '../../dominio/errores/conflicto-unicidad.js';
import type {
  CambiosUsuario,
  DatosNuevoUsuario,
  FiltroUsuarios,
  ResumenUsuariosAdmin,
  UsuarioRepositorio,
} from '../../dominio/repositorios/usuario.repositorio.js';
import type { Actor, OpcionesPaginacion, Pagina, Rol, Usuario, UsuarioResumen } from '../../dominio/tipos.js';
import { ROLES } from '../../dominio/tipos.js';
import { esErrorUnicidad } from '../prisma/errores-prisma.js';
import { aUsuarioDominio } from '../prisma/mapeadores.js';
import { PrismaService } from '../prisma/prisma.service.js';

function accionActivacion(activoNuevo: boolean): 'ACTIVAR_USUARIO' | 'DESACTIVAR_USUARIO' {
  return activoNuevo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO';
}

@Injectable()
export class UsuarioPrismaRepositorio implements UsuarioRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { id } });
    return fila === null ? null : aUsuarioDominio(fila);
  }

  async buscarPorCorreo(correo: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { correo: correo.toLowerCase() } });
    return fila === null ? null : aUsuarioDominio(fila);
  }

  async listar(filtro: FiltroUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<Usuario>> {
    const where: Prisma.UsuarioWhereInput = {};
    if (filtro.rol !== undefined) where.rol = filtro.rol;
    if (filtro.activo !== undefined) where.activo = filtro.activo;
    if (filtro.q !== undefined && filtro.q.trim().length > 0) {
      const q = filtro.q.trim();
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { correo: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (paginacion.pagina - 1) * paginacion.tamanoPagina,
        take: paginacion.tamanoPagina,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return { items: items.map(aUsuarioDominio), total, pagina: paginacion.pagina, tamanoPagina: paginacion.tamanoPagina };
  }

  async listarResumenPorIds(ids: readonly string[]): Promise<UsuarioResumen[]> {
    if (ids.length === 0) return [];
    const filas = await this.prisma.usuario.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nombre: true, correo: true },
      orderBy: { nombre: 'asc' },
    });
    return filas;
  }

  async listarAnalistasActivos(): Promise<UsuarioResumen[]> {
    const filas = await this.prisma.usuario.findMany({
      where: { rol: 'ANALISTA_QA', activo: true },
      select: { id: true, nombre: true, correo: true },
      orderBy: { nombre: 'asc' },
    });
    return filas;
  }

  async contarAdministradoresActivos(): Promise<number> {
    return this.prisma.usuario.count({ where: { rol: 'ADMINISTRADOR', activo: true } });
  }

  async crear(datos: DatosNuevoUsuario, actor: Actor): Promise<Usuario> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creado = await tx.usuario.create({
          data: { id: datos.id, nombre: datos.nombre, correo: datos.correo, rol: datos.rol, activo: datos.activo },
        });
        await tx.auditoria.create({
          data: {
            actorTipo: actor.tipo,
            actorId: actor.id,
            actorNombre: actor.nombre,
            entidad: 'USUARIO',
            entidadId: creado.id,
            accion: 'CREAR_USUARIO',
            antes: undefined,
            despues: { nombre: creado.nombre, correo: creado.correo, rol: creado.rol, activo: creado.activo },
            motivo: null,
          },
        });
        return aUsuarioDominio(creado);
      });
    } catch (error) {
      if (esErrorUnicidad(error, 'usuario_correo_key')) throw new ConflictoUnicidad('correo');
      throw error;
    }
  }

  async actualizar(id: string, cambios: CambiosUsuario, actor: Actor): Promise<Usuario> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const antes = await tx.usuario.findUniqueOrThrow({ where: { id } });
        const data: Prisma.UsuarioUpdateInput = {};
        if (cambios.nombre !== undefined) data.nombre = cambios.nombre;
        if (cambios.correo !== undefined) data.correo = cambios.correo;
        if (cambios.activo !== undefined) data.activo = cambios.activo;

        const actualizado = await tx.usuario.update({ where: { id }, data });

        const accion = cambios.activo !== undefined && cambios.activo !== antes.activo
          ? accionActivacion(cambios.activo)
          : 'ACTUALIZAR_USUARIO';

        await tx.auditoria.create({
          data: {
            actorTipo: actor.tipo,
            actorId: actor.id,
            actorNombre: actor.nombre,
            entidad: 'USUARIO',
            entidadId: id,
            accion,
            antes: { nombre: antes.nombre, correo: antes.correo, activo: antes.activo },
            despues: { nombre: actualizado.nombre, correo: actualizado.correo, activo: actualizado.activo },
            motivo: null,
          },
        });

        return aUsuarioDominio(actualizado);
      });
    } catch (error) {
      if (esErrorUnicidad(error, 'usuario_correo_key')) throw new ConflictoUnicidad('correo');
      throw error;
    }
  }

  async cambiarRol(id: string, rol: Rol, actor: Actor): Promise<Usuario> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.usuario.findUniqueOrThrow({ where: { id } });
      const actualizado = await tx.usuario.update({ where: { id }, data: { rol } });
      await tx.auditoria.create({
        data: {
          actorTipo: actor.tipo,
          actorId: actor.id,
          actorNombre: actor.nombre,
          entidad: 'USUARIO',
          entidadId: id,
          accion: 'CAMBIAR_ROL',
          antes: { rol: antes.rol },
          despues: { rol: actualizado.rol },
          motivo: null,
        },
      });
      return aUsuarioDominio(actualizado);
    });
  }

  async resumenAdmin(): Promise<ResumenUsuariosAdmin> {
    const [total, activos, agrupado] = await Promise.all([
      this.prisma.usuario.count(),
      this.prisma.usuario.count({ where: { activo: true } }),
      this.prisma.usuario.groupBy({ by: ['rol'], _count: { _all: true } }),
    ]);

    const porRol = Object.fromEntries(ROLES.map((rol) => [rol, 0])) as Record<Rol, number>;
    for (const fila of agrupado) porRol[fila.rol] = fila._count._all;

    return { total, activos, inactivos: total - activos, porRol };
  }
}
