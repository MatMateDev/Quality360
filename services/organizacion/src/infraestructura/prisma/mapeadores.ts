/** Traduce filas de Prisma a los tipos del dominio. Vive solo en infraestructura. */
import type { Hdu as HduPrisma, Usuario as UsuarioPrisma } from '#prisma';

import { ROLES, type Actor, type Hdu, type HduRegistrada, type OrigenHdu, type Rol, type Usuario } from '../../dominio/tipos.js';

/** El rol vive en la tabla `rol` (modelo de datos); toda lectura de usuario lo incluye. */
export const INCLUYE_ROL = { rol: { select: { nombre: true } } } as const;

/** El sprint de una HU vive en `historia_sprint`; el vigente es el que no tiene fecha de retiro. */
export const INCLUYE_SPRINT_VIGENTE = {
  historiaSprints: { where: { fechaRetiro: null, sprintId: { not: null } }, select: { sprintId: true }, take: 1 },
} as const;

/**
 * HU con sprint vigente. El contrato exige `HduResumen.sprint` no nulo (comun.v1.yaml), así que una HU sin sprint
 * vigente (dato inconsistente, p. ej. restos de una prueba fallida) no se puede representar: los listados la
 * excluyen y la reportan en el registro en lugar de responder 500 a todos.
 */
export const CON_SPRINT_VIGENTE = { historiaSprints: { some: { fechaRetiro: null, sprintId: { not: null } } } } as const;

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

export function tieneSprintVigente(fila: HduConSprint): boolean {
  const sprintId = fila.historiaSprints[0]?.sprintId;
  return sprintId !== undefined && sprintId !== null;
}

/**
 * Mapea una lista de HU y descarta las que no tienen sprint vigente, avisando sus códigos. Red de seguridad: las
 * consultas ya filtran con `CON_SPRINT_VIGENTE`, pero una carrera (sprint retirado entre lecturas) no debe dar 500.
 */
export function aHdusDominio(filas: readonly HduConSprint[], avisar: (mensaje: string) => void): Hdu[] {
  const validas: Hdu[] = [];
  const descartadas: string[] = [];
  for (const fila of filas) {
    if (tieneSprintVigente(fila)) validas.push(aHduDominio(fila));
    else descartadas.push(`${fila.codigo} (${fila.id})`);
  }
  if (descartadas.length > 0) avisar(`HU sin sprint vigente excluidas del listado: ${descartadas.join(', ')}`);
  return validas;
}

/** Lanza si la HU no tiene sprint vigente: quien llama debe haberla filtrado antes (`CON_SPRINT_VIGENTE`). */
export function aHduDominio(fila: HduConSprint): Hdu {
  const registrada = aHduRegistrada(fila);
  const { sprintId } = registrada;
  if (sprintId === null) throw new Error(`La HU ${fila.id} no tiene sprint vigente`);
  return { ...registrada, sprintId };
}

/** No lanza: para las búsquedas por código, donde importa que el código existe aunque falte el sprint. */
export function aHduRegistrada(fila: HduConSprint): HduRegistrada {
  const creadoPor: Actor = { tipo: fila.creadoPorTipo, id: fila.creadoPorId, nombre: fila.creadoPorNombre };
  return {
    id: fila.id,
    codigo: fila.codigo,
    titulo: fila.titulo,
    celulaId: fila.celulaId,
    sprintId: fila.historiaSprints[0]?.sprintId ?? null,
    prioridad: fila.prioridad,
    qeResponsableId: fila.qeResponsableId,
    analistaId: fila.analistaId,
    estado: fila.estado,
    estadoActualizadoEn: fila.estadoActualizadoEn,
    creadoPor,
    creadoEn: fila.creadoEn,
    descripcion: fila.descripcion,
    origen: fila.origen as OrigenHdu,
    claveExterna: fila.claveExterna,
    urlExterna: fila.urlExterna,
  };
}
