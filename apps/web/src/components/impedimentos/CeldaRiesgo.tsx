import type { BloqueRiesgoFila, RiesgoResumen } from "@/types/dominio";
import { SemaforoRiesgo } from "./SemaforoRiesgo";

/** Riesgo vigente de una fila (D66): fuente caída = «No disponible»; sin nivel y fuente en pie = «Sin evaluar». */
export function RiesgoDeResumen({ riesgo }: { riesgo: RiesgoResumen }) {
  return (
    <SemaforoRiesgo
      nivel={riesgo.nivelVigente}
      estado={riesgo.estado === "indisponible" && riesgo.nivelVigente === null ? "indisponible" : "ok"}
      origen={riesgo.origen}
      calculoParcial={riesgo.calculoParcial}
    />
  );
}

/** Columna «Riesgo» del Líder: el bloque entero puede venir `indisponible` si cae el servicio Impedimentos. */
export function RiesgoDeBloque({ bloque }: { bloque: BloqueRiesgoFila | undefined }) {
  if (!bloque) return null;
  if (bloque.estado !== "ok") return <SemaforoRiesgo nivel={null} estado="indisponible" />;
  return <RiesgoDeResumen riesgo={bloque.datos} />;
}
