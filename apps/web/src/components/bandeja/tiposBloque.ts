import type { components } from "@contracts/gateway.v1";

export type BloqueIndisponible = components["schemas"]["BloqueIndisponible"];

/** Contador de bandeja: `ok` con valor o `indisponible` (D34). */
export type ContadorBandeja = components["schemas"]["Contador"];

/** Valor numérico de un contador `ok`, o `undefined` si la fuente está caída. */
export function valorContador(contador: ContadorBandeja): number | undefined {
  return contador.estado === "ok" ? contador.datos.valor : undefined;
}
