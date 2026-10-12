/** Traduce filas de Prisma a los tipos del dominio. Vive solo en infraestructura. */
import type { Hdu as HduPrisma, Usuario as UsuarioPrisma } from '#prisma';

import { ROLES, type Actor, type Hdu, type Rol, type Usuario } from '../../dominio/tipos.js';

/** El rol vive en la tabla `rol` (modelo de datos); toda lectura de usuario lo incluye. */
export const INCLUYE_ROL = { rol: { select: { nombre: true } } } as const;

/** El sprint de una HU vive en `historia_sprint`; el vigente es el que no tiene fecha de retiro. */
export const INCLUYE_SPRINT_VIGENTE = {
  historiaSprints: { where: { fechaRetiro: null, sprintId: { not: null } }, select: { sprintId: true }, take: 1 },
} as const;

export type UsuarioConRol = UsuarioPrisma & { rol: { nombre: string } };
export type HduConSprint = HduPrisma & { historiaSprints: Array<{ sprintId: string | null }> };

export function aRol(nombre: string): Rol {
  if (!(ROLES as readonly string[]).includes(nombre)) throw new Error(`Rol desconocido en la tabla rol: ${nombre}`);
  return nombre as Rol;
}

export function aUsuarioDominio(fila: UsuarioConRol): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    rol: aRol(fila.rol.nombre),
    activo: fila.activo,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

export function aHduDominio(fila: HduConSprint): Hdu {
  const sprintId = fila.historiaSprints[0]?.sprintId;
  if (sprintId === undefined || sprintId === null) throw new Error(`La HU ${fila.id} no tiene sprint vigente`);
  const creadoPor: Actor = { tipo: fila.creadoPorTipo, id: fila.creadoPorId, nombre: fila.creadoPorNombre };
  return {
    id: fila.id,
    codigo: fila.codigo,
    titulo: fila.titulo,
    celulaId: fila.celulaId,
    sprintId,
    prioridad: fila.prioridad,
    qeResponsableId: fila.qeResponsableId,
    analistaId: fila.analistaId,
    estado: fila.estado,
    estadoActualizadoEn: fila.estadoActualizadoEn,
    creadoPor,
    creadoEn: fila.creadoEn,
  };
}
