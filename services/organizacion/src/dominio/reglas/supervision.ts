/**
 * Reglas de supervisión (informe pp. 6-7, D9; backlog E1-B09):
 * - El supervisor debe ser QE activo y el supervisado Analista QA activo.
 * - Máximo un QE vigente por analista: asignar uno nuevo cierra el vigente.
 * - El motivo es obligatorio solo si el analista ya tenía un QE vigente
 *   DISTINTO del nuevo (si es el mismo, no hay cambio y no se pide motivo).
 */
import type { Rol, Supervision } from '../tipos.js';

export interface RolActivo {
  readonly rol: Rol;
  readonly activo: boolean;
}

/** El supervisor debe ser QE y el supervisado Analista QA, ambos activos. */
export function esAsignacionDeRolesValida(qe: RolActivo, analista: RolActivo): boolean {
  return qe.rol === 'QE' && qe.activo && analista.rol === 'ANALISTA_QA' && analista.activo;
}

export interface DecisionCambioSupervision {
  /** `false` si el QE indicado ya era el vigente: no se toca nada. */
  readonly cambio: boolean;
  /** Solo verdadero cuando hay cambio y ya existía un QE vigente distinto. */
  readonly requiereMotivo: boolean;
}

/** Decide si asignar `nuevoQeId` implica cambio y si ese cambio exige motivo. */
export function decidirCambioSupervision(
  vigente: Pick<Supervision, 'qeId'> | null,
  nuevoQeId: string,
): DecisionCambioSupervision {
  if (vigente === null) return { cambio: true, requiereMotivo: false };
  if (vigente.qeId === nuevoQeId) return { cambio: false, requiereMotivo: false };
  return { cambio: true, requiereMotivo: true };
}

/** `true` si el motivo dado es utilizable (no vacío tras recortar espacios). */
export function esMotivoValido(motivo: string | null | undefined): motivo is string {
  return typeof motivo === 'string' && motivo.trim().length >= 3;
}
