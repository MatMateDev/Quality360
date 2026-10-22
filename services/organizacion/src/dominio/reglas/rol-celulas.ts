/**
 * Reglas del cambio de rol y de las células de un Líder QA (D30, D31, D40, D42, D43).
 * Funciones puras: no leen base de datos ni red.
 */
import type { CatalogoRef, HduReferencia, Rol, UsuarioResumen } from '../tipos.js';

/** Máximo de HDU abiertas que el 409 detalla (D43); `total` las cuenta todas. */
export const MAXIMO_HDU_ABIERTAS_DETALLE = 20;

/** Relaciones de trabajo de un usuario, tal como las informa el 409 `RELACIONES_INCOMPATIBLES` (D43). */
export interface RelacionesUsuario {
  readonly analistasVigentes: UsuarioResumen[];
  readonly supervisorVigente: UsuarioResumen | null;
  readonly hduAbiertas: { readonly total: number; readonly items: HduReferencia[] };
  readonly celulasVigentes: CatalogoRef[];
}

export function relacionesVacias(): RelacionesUsuario {
  return { analistasVigentes: [], supervisorVigente: null, hduAbiertas: { total: 0, items: [] }, celulasVigentes: [] };
}

/** ¿Alguna relación abierta impide cambiar el rol? (D31, D40) */
export function tieneRelacionesIncompatibles(relaciones: RelacionesUsuario): boolean {
  return (
    relaciones.analistasVigentes.length > 0 ||
    relaciones.supervisorVigente !== null ||
    relaciones.hduAbiertas.total > 0 ||
    relaciones.celulasVigentes.length > 0
  );
}

/**
 * `celulaIds` no vacío solo se acepta con `rol: LIDER_QA` (D42); si no, 400
 * `VALIDACION` con `{campo: celulaIds, codigo: NO_PERMITIDO}`.
 */
export function celulaIdsCompatiblesConRol(rolNuevo: Rol, celulaIds: readonly string[] | undefined): boolean {
  return celulaIds === undefined || celulaIds.length === 0 || rolNuevo === 'LIDER_QA';
}

export interface DiferenciaCelulas {
  /** Células que se abren (no estaban vigentes). */
  readonly abrir: string[];
  /** Células vigentes que se cierran con `fecha_hasta = now()` (se conservan en el historial). */
  readonly cerrar: string[];
  /** Las que siguen vigentes: no se tocan. */
  readonly mantener: string[];
}

/** Diferencia entre las células vigentes y el conjunto pedido (E7-B01-T07). */
export function diferenciaCelulas(vigentes: readonly string[], pedidas: readonly string[]): DiferenciaCelulas {
  const conjuntoPedido = new Set(pedidas);
  const conjuntoVigente = new Set(vigentes);
  return {
    abrir: [...conjuntoPedido].filter((id) => !conjuntoVigente.has(id)),
    cerrar: [...conjuntoVigente].filter((id) => !conjuntoPedido.has(id)),
    mantener: [...conjuntoPedido].filter((id) => conjuntoVigente.has(id)),
  };
}

export function hayCambioDeCelulas(diferencia: DiferenciaCelulas): boolean {
  return diferencia.abrir.length > 0 || diferencia.cerrar.length > 0;
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
 * catálogo (400) y la existencia de las células (422) ya se resolvieron antes.
 */
export function decidirCambioRol(entrada: EntradaCambioRol): DecisionCambioRol {
  if (entrada.rolActual === entrada.rolNuevo) return { tipo: 'SIN_CAMBIO' };
  if (entrada.rolActual === 'ADMINISTRADOR' && entrada.administradoresActivos <= 1) return { tipo: 'ULTIMO_ADMINISTRADOR' };
  if (tieneRelacionesIncompatibles(entrada.relaciones)) {
    return { tipo: 'RELACIONES_INCOMPATIBLES', relaciones: entrada.relaciones };
  }
  return { tipo: 'CAMBIAR' };
}
