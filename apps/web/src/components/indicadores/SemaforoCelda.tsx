import type { SemaforoCelula } from "@/types/dominio";

export type ClaveSemaforo = "ROJO" | "AMARILLO" | "VERDE" | "SIN_HDU" | "NO_DISPONIBLE";

/** Clave visual de una célula: la fuente caída o el cálculo no concluyente nunca se muestra verde (D169). */
export function claveSemaforo(celula: Pick<SemaforoCelula, "estado" | "color">): ClaveSemaforo {
  if (celula.estado === "SIN_HDU") return "SIN_HDU";
  if (celula.estado === "indisponible" || celula.color === null) return "NO_DISPONIBLE";
  return celula.color;
}

const TEXTO: Record<ClaveSemaforo, string> = { ROJO: "Rojo", AMARILLO: "Amarillo", VERDE: "Verde", SIN_HDU: "Sin HDU", NO_DISPONIBLE: "No disponible" };
const GLIFO: Record<ClaveSemaforo, string> = { ROJO: "▲", AMARILLO: "◆", VERDE: "●", SIN_HDU: "○", NO_DISPONIBLE: "⛔" };
const CLASE: Record<ClaveSemaforo, string> = { ROJO: "rojo", AMARILLO: "amarillo", VERDE: "verde", SIN_HDU: "gris", NO_DISPONIBLE: "gris" };
const LAMPARAS = ["rojo", "amarillo", "verde"] as const;

export function claseColor(clave: ClaveSemaforo): string {
  return CLASE[clave];
}

/**
 * Semáforo de célula (E6 §4.1): posición de la lámpara (decorativa), glifo y palabra, nunca solo color. Los textos
 * y pares de color son los del semáforo de riesgo de E4.
 */
export function SemaforoCelda({ clave, alMenos = false }: { clave: ClaveSemaforo; alMenos?: boolean }) {
  return (
    <div className={`semaforo-celda semaforo-celda--${CLASE[clave]}`} data-testid="semaforo-celda">
      <span className="semaforo-celda__lamparas" aria-hidden="true">
        {LAMPARAS.map((l) => (
          <span key={l} className={`semaforo-celda__lampara semaforo-celda__lampara--${l}${CLASE[clave] === l ? " encendida" : ""}`} />
        ))}
      </span>
      <span>
        <span aria-hidden="true">{GLIFO[clave]} </span>
        {TEXTO[clave]}
        {clave === "NO_DISPONIBLE" && alMenos ? " · al menos Amarillo" : ""}
      </span>
    </div>
  );
}
