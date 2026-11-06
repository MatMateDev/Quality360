import type { Consulta } from "@/types/dominio";

/**
 * «Confirmar marcadas (N)» (D203): cuenta solo filas marcadas, completas y **no creadas**. Una HDU creada una a una queda
 * `aplicada` y por la regla `aplicada_marcada` también `marcada`, así que se resta de las nuevas incluidas.
 */
export function conteoParaLote(consulta: Pick<Consulta, "marcadasNuevas" | "marcadasCambio" | "creadas">): { crear: number; actualizar: number; total: number } {
  const crear = Math.max(0, consulta.marcadasNuevas - (consulta.creadas ?? 0));
  const actualizar = consulta.marcadasCambio;
  return { crear, actualizar, total: crear + actualizar };
}
