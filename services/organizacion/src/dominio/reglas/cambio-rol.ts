/**
 * Reglas del cambio de rol (D31, D40, D43). Funciones puras: no leen base de
 * datos ni red. Las células del Líder QA se retiraron con el rol (D208).
 */
import type { HduReferencia, Rol, UsuarioResumen } from '../tipos.js';

/** Máximo de HDU abiertas que el 409 detalla (D43); `total` las cuenta todas. */
export const MAXIMO_HDU_ABIERTAS_DETALLE = 20;

/** Relaciones de trabajo de un usuario, tal como las informa el 409 `RELACIONES_INCOMPATIBLES` (D43). */
export interface RelacionesUsuario {
  readonly analistasVigentes: UsuarioResumen[];
  readonly supervisorVigente: UsuarioResumen | null;
  readonly hduAbiertas: { readonly total: number; readonly items: HduReferencia[] };
}

export function relacionesVacias(): RelacionesUsuario {
  return { analistasVigentes: [], supervisorVigente: null, hduAbiertas: { total: 0, items: [] } };
}

/** ¿Alguna relación abierta impide cambiar el rol? (D31, D40) */
export function tieneRelacionesIncompatibles(relaciones: RelacionesUsuario): boolean {
  return relaciones.analistasVigentes.length > 0 || relaciones.supervisorVigente !== null || relaciones.hduAbiertas.total > 0;
}

export interface EntradaCambioRol {
  readonly rolActual: Rol;
  readonly rolNuevo: Rol;
  readonly administradoresActivos: number;
  readonly relaciones: RelacionesUsuario;
}

export type DecisionCambioRol =
  | { readonly tipo: 'SIN_CAMBIO' }
  | { readonly tipo: 'ULTIMO_ADMINISTRADOR' }
  | { readonly tipo: 'RELACIONES_INCOMPATIBLES'; readonly relaciones: RelacionesUsuario }
  | { readonly tipo: 'CAMBIAR' };

/**
 * Orden de validación de D43, a partir del paso «último administrador»: el
 * catálogo (400) ya se resolvió en el controlador.
 */
export function decidirCambioRol(entrada: EntradaCambioRol): DecisionCambioRol {
  if (entrada.rolActual === entrada.rolNuevo) return { tipo: 'SIN_CAMBIO' };
  if (entrada.rolActual === 'ADMINISTRADOR' && entrada.administradoresActivos <= 1) return { tipo: 'ULTIMO_ADMINISTRADOR' };
  if (tieneRelacionesIncompatibles(entrada.relaciones)) {
    return { tipo: 'RELACIONES_INCOMPATIBLES', relaciones: entrada.relaciones };
  }
  return { tipo: 'CAMBIAR' };
}
