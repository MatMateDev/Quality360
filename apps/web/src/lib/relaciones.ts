import type { ErrorRelacionesIncompatibles } from "@/types/dominio";
import { ErrorApi } from "./httpClient";

export type Relaciones = ErrorRelacionesIncompatibles["relaciones"];

/** Extrae las 4 claves estructuradas del 409 `RELACIONES_INCOMPATIBLES` (D43); `null` si el error es otro. */
export function relacionesDe(error: unknown): Relaciones | null {
  if (!(error instanceof ErrorApi) || error.status !== 409 || error.codigo !== "RELACIONES_INCOMPATIBLES") return null;
  const r = (error.cuerpo as Partial<ErrorRelacionesIncompatibles> | undefined)?.relaciones;
  if (!r) return null;
  return {
    analistasVigentes: r.analistasVigentes ?? [],
    supervisorVigente: r.supervisorVigente ?? null,
    hduAbiertas: r.hduAbiertas ?? { total: 0, items: [] },
    celulasVigentes: r.celulasVigentes ?? [],
  };
}
