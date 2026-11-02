/**
 * Reglas comunes del alta de una HDU (E2-B01 y el upsert de E5, D100). Las comparten `POST /v1/hdu` y la
 * integración con Jira y archivos para que ninguno duplique ni se salte una regla. Sin dependencias de Nest
 * ni Prisma.
 */
import type { Rol } from '../tipos.js';

/** Código de una HDU: letras, números, punto, guion y guion bajo; hasta 40 caracteres (E2-B01, D97). */
export const PATRON_CODIGO_HDU = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const LARGO_MAXIMO_CODIGO_HDU = 40;
export const LARGO_MAXIMO_TITULO_HDU = 200;
export const LARGO_MAXIMO_DESCRIPCION_HDU = 1000;

/** La unicidad del código no distingue mayúsculas ni espacios en los extremos (D97). */
export function normalizarCodigoHdu(codigo: string): string {
  return codigo.trim().toLowerCase();
}

export function codigoHduValido(codigo: string): boolean {
  return codigo.length >= 1 && codigo.length <= LARGO_MAXIMO_CODIGO_HDU && PATRON_CODIGO_HDU.test(codigo);
}

/** El QE responsable debe tener rol QE y estar activo (E2-B01, `QE_INVALIDO`). */
export function esQeResponsableValido(usuario: { rol: Rol; activo: boolean } | null): boolean {
  return usuario !== null && usuario.rol === 'QE' && usuario.activo;
}

/** El sprint vigente de una HDU nueva debe ser de su misma célula cuando la HDU llega por integración (D120). */
export function sprintEsDeCelula(sprint: { celulaId: string } | null, celulaId: string): boolean {
  return sprint !== null && sprint.celulaId === celulaId;
}
