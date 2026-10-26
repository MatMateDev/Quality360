import {
  ETIQUETAS_NIVEL_RIESGO,
  GLIFO_NIVEL_RIESGO,
  type NivelRiesgo,
  type OrigenRiesgo,
} from "@/types/dominio";

interface Props {
  /** `null` con `estado: ok` = «Sin evaluar» (HDU cerrada sin nivel fijado). */
  nivel: NivelRiesgo | null;
  /** `indisponible` = fuente caída: «No disponible», nunca «Bajo» (D68). */
  estado?: "ok" | "indisponible";
  origen?: OrigenRiesgo | null;
  /** Nivel calculado sin el avance del checklist (D68): se agrega la etiqueta «Cálculo parcial». */
  calculoParcial?: boolean;
  /** `pildora` para tablas y bandejas; `lamparas` para el panel del detalle. */
  variante?: "pildora" | "lamparas";
}

const CLASE: Record<NivelRiesgo, string> = { ALTO: "alto", MEDIO: "medio", BAJO: "bajo" };
const LAMPARA: Array<[NivelRiesgo, string]> = [
  ["ALTO", "roja"],
  ["MEDIO", "amarilla"],
  ["BAJO", "verde"],
];

/**
 * Semáforo de riesgo (diseño E4 §3): siempre forma + palabra + color (triángulo «Alto», rombo «Medio», círculo
 * «Bajo»); las lámparas del panel son decorativas (`aria-hidden`) y su posición repite el significado.
 */
export function SemaforoRiesgo({ nivel, estado = "ok", origen = null, calculoParcial = false, variante = "pildora" }: Props) {
  const indisponible = estado === "indisponible";
  const clave = indisponible ? "no-disponible" : nivel ? CLASE[nivel] : "sin-evaluar";
  const texto = indisponible ? "No disponible" : nivel ? ETIQUETAS_NIVEL_RIESGO[nivel] : "Sin evaluar";
  const glifo = indisponible ? "⛔" : nivel ? GLIFO_NIVEL_RIESGO[nivel] : "○";
  const dataNivel = indisponible ? "NO_DISPONIBLE" : (nivel ?? "SIN_EVALUAR");
  const testId = indisponible ? "estado-indisponible-riesgo" : "semaforo-riesgo";

  if (variante === "lamparas") {
    return (
      <div className="semaforo-lamparas" data-testid={testId} data-nivel={dataNivel} data-origen={origen ?? undefined}>
        <span className="semaforo-lamparas__luces" aria-hidden="true">
          {LAMPARA.map(([n, color]) => (
            <span key={n} className={`semaforo-lampara semaforo-lampara--${color}${!indisponible && nivel === n ? " semaforo-lampara--encendida" : ""}`} />
          ))}
        </span>
        <span className={`semaforo-lamparas__texto semaforo-lamparas__texto--${clave === "no-disponible" ? "sin-evaluar" : clave}`}>
          <span aria-hidden="true">{glifo} </span>
          {texto}
          {calculoParcial && !indisponible ? <span className="semaforo__parcial"> · Cálculo parcial</span> : null}
        </span>
      </div>
    );
  }

  return (
    <span className={`semaforo semaforo--${clave}`} data-testid={testId} data-nivel={dataNivel} data-origen={origen ?? undefined}>
      <span aria-hidden="true">{glifo}</span>
      <span>{texto}</span>
      {calculoParcial && !indisponible ? <span className="semaforo__parcial">Cálculo parcial</span> : null}
    </span>
  );
}
