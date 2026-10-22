import { Injectable } from '@nestjs/common';
import type { Prisma } from '#prisma';

import { ConflictoUnicidad } from '../../dominio/errores/conflicto-unicidad.js';
import {
  MAXIMO_HDU_ABIERTAS_DETALLE,
  relacionesVacias,
  type DecisionCambioRol,
  type RelacionesUsuario,
} from '../../dominio/reglas/rol-celulas.js';
import type {
  CambiosUsuario,
  DatosNuevoUsuario,
  FiltroUsuarios,
  InstantaneaCambioRol,
  ResultadoCambioRol,
  ResumenUsuariosAdmin,
  UsuarioRepositorio,
} from '../../dominio/repositorios/usuario.repositorio.js';
import type { Actor, OpcionesPaginacion, Pagina, Rol, Usuario, UsuarioResumen } from '../../dominio/tipos.js';
import { ROLES } from '../../dominio/tipos.js';
import { esErrorUnicidad } from '../prisma/errores-prisma.js';
import { INCLUYE_ROL, aRol, aUsuarioDominio } from '../prisma/mapeadores.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reemplazarCelulasEnTransaccion } from './celula-lider.prisma.repositorio.js';

type Tx = Prisma.TransactionClient;

/** Relaciones de trabajo abiertas del usuario, según su rol actual (D31, D40, D43). Lee dentro de la transacción. */
async function leerRelaciones(tx: Tx, id: string, rol: Rol): Promise<RelacionesUsuario> {
  const relaciones = relacionesVacias();
  let analistasVigentes = relaciones.analistasVigentes;
  let supervisorVigente = relaciones.supervisorVigente;
  let hduAbiertas = relaciones.hduAbiertas;
  let celulasVigentes = relaciones.celulasVigentes;

  if (rol === 'QE') {
    const supervisiones = await tx.supervision.findMany({ where: { qeId: id, hasta: null }, include: { analista: true } });
    analistasVigentes = supervisiones
      .map((fila) => ({ id: fila.analista.id, nombre: fila.analista.nombre, correo: fila.analista.correo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  if (rol === 'ANALISTA_QA') {
    const vigente = await tx.supervision.findFirst({ where: { analistaId: id, hasta: null }, include: { qe: true } });
    supervisorVigente = vigente === null ? null : { id: vigente.qe.id, nombre: vigente.qe.nombre, correo: vigente.qe.correo };
  }
  if (rol === 'QE' || rol === 'ANALISTA_QA') {
    const where: Prisma.HduWhereInput = { estado: { not: 'CERRADA' }, ...(rol === 'QE' ? { qeResponsableId: id } : { analistaId: id }) };
    const [total, items] = await Promise.all([
      tx.hdu.count({ where }),
      tx.hdu.findMany({
        where,
        select: { id: true, codigo: true, titulo: true, estado: true },
        orderBy: { codigo: 'asc' },
        take: MAXIMO_HDU_ABIERTAS_DETALLE,
      }),
    ]);
    hduAbiertas = { total, items };
  }
  if (rol === 'LIDER_QA') {
    const filas = await tx.celulaLider.findMany({
      where: { usuarioId: id, hasta: null },
      include: { celula: { select: { id: true, nombre: true } } },
      orderBy: { celula: { nombre: 'asc' } },
    });
    celulasVigentes = filas.map((fila) => ({ id: fila.celula.id, nombre: fila.celula.nombre }));
  }
  return { analistasVigentes, supervisorVigente, hduAbiertas, celulasVigentes };
}

function accionActivacion(activoNuevo: boolean): 'ACTIVAR_USUARIO' | 'DESACTIVAR_USUARIO' {
  return activoNuevo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO';
}

@Injectable()
export class UsuarioPrismaRepositorio implements UsuarioRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { id }, include: INCLUYE_ROL });
    return fila === null ? null : aUsuarioDominio(fila);
  }

  async buscarPorCorreo(correo: string): Promise<Usuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { correo: correo.toLowerCase() }, include: INCLUYE_ROL });
    return fila === null ? null : aUsuarioDominio(fila);
  }

  async listar(filtro: FiltroUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<Usuario>> {
    const where: Prisma.UsuarioWhereInput = {};
    if (filtro.rol !== undefined) where.rol = { nombre: filtro.rol };
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
        include: INCLUYE_ROL,
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
      where: { rol: { nombre: 'ANALISTA_QA' }, activo: true },
      select: { id: true, nombre: true, correo: true },
      orderBy: { nombre: 'asc' },
    });
    return filas;
  }

  async contarAdministradoresActivos(): Promise<number> {
    return this.prisma.usuario.count({ where: { rol: { nombre: 'ADMINISTRADOR' }, activo: true } });
  }

  async crear(datos: DatosNuevoUsuario, actor: Actor): Promise<Usuario> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creado = await tx.usuario.create({
          data: { id: datos.id, nombre: datos.nombre, correo: datos.correo, rol: { connect: { nombre: datos.rol } }, activo: datos.activo },
          include: INCLUYE_ROL,
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
            despues: { nombre: creado.nombre, correo: creado.correo, rol: creado.rol.nombre, activo: creado.activo },
            motivo: null,
          },
        });
        if (datos.rol === 'LIDER_QA' && datos.celulaIds !== undefined && datos.celulaIds.length > 0) {
          await reemplazarCelulasEnTransaccion(tx, creado.id, datos.celulaIds, actor);
        }
        return aUsuarioDominio(creado);
      });
    } catch (error) {
      if (esErrorUnicidad(error, 'usuario_email_key')) throw new ConflictoUnicidad('correo');
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

        const actualizado = await tx.usuario.update({ where: { id }, data, include: INCLUYE_ROL });

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
      if (esErrorUnicidad(error, 'usuario_email_key')) throw new ConflictoUnicidad('correo');
      throw error;
    }
  }

  async contarActivosPorRol(): Promise<Record<Rol, number>> {
    const filas = await this.prisma.rol.findMany({
      select: { nombre: true, _count: { select: { usuarios: { where: { activo: true } } } } },
    });
    const porRol = Object.fromEntries(ROLES.map((rol) => [rol, 0])) as Record<Rol, number>;
    for (const fila of filas) porRol[aRol(fila.nombre)] = fila._count.usuarios;
    return porRol;
  }

  async cambiarRolAtomico(input: {
    id: string;
    rolNuevo: Rol;
    celulaIds: readonly string[] | undefined;
    actor: Actor;
    decidir: (instantanea: InstantaneaCambioRol) => DecisionCambioRol;
  }): Promise<ResultadoCambioRol> {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del usuario: dos cambios simultáneos se serializan (D42).
      await tx.$queryRaw`SELECT "id_usuario" FROM "usuario" WHERE "id_usuario" = ${input.id}::uuid FOR UPDATE`;
      const fila = await tx.usuario.findUniqueOrThrow({ where: { id: input.id }, include: INCLUYE_ROL });
      const usuario = aUsuarioDominio(fila);

      const decision = input.decidir({
        usuario,
        administradoresActivos: await tx.usuario.count({ where: { rol: { nombre: 'ADMINISTRADOR' }, activo: true } }),
        relaciones: await leerRelaciones(tx, input.id, usuario.rol),
      });
      if (decision.tipo === 'ULTIMO_ADMINISTRADOR' || decision.tipo === 'RELACIONES_INCOMPATIBLES') {
        return { tipo: 'RECHAZADO', decision } as const;
      }

      const cambiaRol = decision.tipo === 'CAMBIAR';
      let resultado = usuario;
      if (cambiaRol) {
        const actualizado = await tx.usuario.update({
          where: { id: input.id },
          data: { rol: { connect: { nombre: input.rolNuevo } } },
          include: INCLUYE_ROL,
        });
        await tx.auditoria.create({
          data: {
            actorTipo: input.actor.tipo,
            actorId: input.actor.id,
            actorNombre: input.actor.nombre,
            entidad: 'USUARIO',
            entidadId: input.id,
            accion: 'CAMBIAR_ROL',
            antes: { rol: fila.rol.nombre },
            despues: { rol: actualizado.rol.nombre },
            motivo: null,
          },
        });
        resultado = aUsuarioDominio(actualizado);
      }

      let celulasCambiaron = false;
      if (input.rolNuevo === 'LIDER_QA' && input.celulaIds !== undefined) {
        const celulas = await reemplazarCelulasEnTransaccion(tx, input.id, input.celulaIds, input.actor);
        celulasCambiaron = celulas.cambio;
      }
      return cambiaRol || celulasCambiaron ? ({ tipo: 'APLICADO', usuario: resultado } as const) : ({ tipo: 'SIN_CAMBIO', usuario: resultado } as const);
    });
  }

  async resumenAdmin(): Promise<ResumenUsuariosAdmin> {
    const [total, activos, agrupado] = await Promise.all([
      this.prisma.usuario.count(),
      this.prisma.usuario.count({ where: { activo: true } }),
      this.prisma.rol.findMany({ select: { nombre: true, _count: { select: { usuarios: true } } } }),
    ]);

    const porRol = Object.fromEntries(ROLES.map((rol) => [rol, 0])) as Record<Rol, number>;
    for (const fila of agrupado) porRol[aRol(fila.nombre)] = fila._count.usuarios;

    return { total, activos, inactivos: total - activos, porRol };
  }
}
