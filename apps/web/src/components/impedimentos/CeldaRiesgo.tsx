import type { RiesgoResumen } from "@/types/dominio";
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

