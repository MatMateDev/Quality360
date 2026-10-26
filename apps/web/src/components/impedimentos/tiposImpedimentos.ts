import { ETIQUETAS_ROL as ROLES, type CandidatosResponsable } from "@/types/dominio";
import { ErrorApi } from "@/lib/httpClient";

export const ETIQUETAS_ROL = ROLES;

/** Candidato del selector de responsable: persona de Quality360 con su rol. */
export type PersonaRolCandidata = CandidatosResponsable["items"][number];

/** El API devuelve el detalle de validación por campo; este helper lo lee sin suponer que exista. */
export function detalleDeCampo(error: unknown, campo: string): string | undefined {
  if (!(error instanceof ErrorApi)) return undefined;
  return error.detalles?.find((d) => d.campo === campo)?.mensaje;
}

/** Mensaje común a todas las acciones de escritura cuando el servidor no responde (diseño E4 §8.2). */
export const MENSAJE_ERROR_ACCION = "No fue posible guardar. Intenta nuevamente.";
export const MENSAJE_SIN_PERMISO = "Ya no tienes permiso para esta acción";
export const MENSAJE_HDU_CERRADA = "La HDU ya está cerrada y no admite cambios.";
export const MENSAJE_TRANSICION = "El impedimento ya cambió de estado. Se actualizó la lista";
