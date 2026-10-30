/**
 * Matriz de permisos por relación con la HDU (D57, D89, tabla 3.6 del backlog E4).
 * La relación la resuelve Organización; aquí solo se decide qué permite cada una.
 */
import type { EstadoHdu, RelacionHdu } from './tipos.js';

export interface PermisosImpedimentos {
  readonly puedeRegistrar: boolean;
  readonly puedeGestionar: boolean;
  readonly puedeVerRiesgo: boolean;
  readonly puedeFijarRiesgo: boolean;
}

/** Registran el Analista asignado y el QE responsable. */
export function puedeRegistrarPorRelacion(relacion: RelacionHdu): boolean {
  return relacion === 'ANALISTA_ASIGNADO' || relacion === 'QE_RESPONSABLE';
}

/** Gestionan (resolver, escalar, reabrir, seguimiento) y fijan el riesgo solo el QE responsable. */
export function puedeGestionarPorRelacion(relacion: RelacionHdu): boolean {
  return relacion === 'QE_RESPONSABLE';
}

/** El riesgo lo ve todo el que ve la HDU salvo el Analista QA (D73). */
export function puedeVerRiesgoPorRelacion(relacion: RelacionHdu): boolean {
  return relacion !== 'ANALISTA_ASIGNADO';
}

/** Permisos efectivos: una HDU cerrada no admite registrar, gestionar ni fijar riesgo (D60). */
export function permisosDe(relacion: RelacionHdu, estadoHdu: EstadoHdu): PermisosImpedimentos {
  const abierta = estadoHdu !== 'CERRADA';
  return {
    puedeRegistrar: abierta && puedeRegistrarPorRelacion(relacion),
    puedeGestionar: abierta && puedeGestionarPorRelacion(relacion),
    puedeVerRiesgo: puedeVerRiesgoPorRelacion(relacion),
    puedeFijarRiesgo: abierta && puedeGestionarPorRelacion(relacion),
  };
}
