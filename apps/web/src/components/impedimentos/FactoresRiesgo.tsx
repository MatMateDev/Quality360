import { formatearFechaCorta } from "@/lib/formato";
import { ETIQUETAS_NIVEL_RIESGO, type CodigoFactorRiesgo, type FactorRiesgo } from "@/types/dominio";

const FRASE_GENERICA: Record<CodigoFactorRiesgo, string> = {
  IMPEDIMENTO_ABIERTO: "Hay impedimentos abiertos o escalados",
  IMPEDIMENTO_ANTIGUO: "Un impedimento lleva varios días abierto",
  IMPEDIMENTO_ESCALADO: "Hay un impedimento escalado",
  SPRINT_VENCIDO: "El sprint terminó y la HDU no está cerrada",
  ATRASO_SPRINT_ALTO: "Se acerca el fin del sprint y el avance es bajo",
  ATRASO_SPRINT_MEDIO: "Se acerca el fin del sprint y el avance es bajo",
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Frase de un factor armada con el `detalle` del servidor (D76); si falta un campo, la frase genérica del código. */
function fraseFactor(f: FactorRiesgo): string {
  const d = f.detalle;
  switch (f.codigo) {
    case "IMPEDIMENTO_ABIERTO":
      if (d.impedimentos === undefined) break;
      return `Hay ${d.impedimentos} ${plural(d.impedimentos, "impedimento abierto o escalado", "impedimentos abiertos o escalados")}`;
    case "IMPEDIMENTO_ANTIGUO":
      if (d.diasAbierto === undefined) break;
      return `Un impedimento lleva ${d.diasAbierto} ${plural(d.diasAbierto, "día", "días")} abierto${d.umbralDias !== undefined ? ` (desde ${d.umbralDias} días se considera alto)` : ""}`;
    case "IMPEDIMENTO_ESCALADO":
      return d.impedimentos !== undefined && d.impedimentos > 1 ? `Hay ${d.impedimentos} impedimentos escalados` : "Hay un impedimento escalado";
    case "SPRINT_VENCIDO":
      if (!d.sprintFin) break;
      return `El sprint terminó el ${formatearFechaCorta(`${d.sprintFin}T12:00:00`)} y la HDU no está cerrada`;
    case "ATRASO_SPRINT_ALTO":
    case "ATRASO_SPRINT_MEDIO":
      if (d.diasRestantes === undefined || d.avance === undefined) break;
      return `${d.diasRestantes === 0 ? "El sprint termina hoy" : `Faltan ${d.diasRestantes} ${plural(d.diasRestantes, "día", "días")} para el fin del sprint`} y el avance es ${d.avance} %${d.umbralAvance !== undefined ? ` (menos de ${d.umbralAvance} %)` : ""}`;
  }
  return FRASE_GENERICA[f.codigo];
}

interface Props {
  factores: FactorRiesgo[];
  noEvaluados: CodigoFactorRiesgo[];
}

/**
 * Factores que explican el nivel sugerido (E4-F04#2). Cada ítem lleva su chip de nivel (palabra), los no evaluados
 * dicen «No disponible» y, sin factores, «Sin factores de riesgo». Los umbrales vienen del servidor (D67).
 */
export function FactoresRiesgo({ factores, noEvaluados }: Props) {
  const atrasoNoEvaluado = noEvaluados.length > 0;
  return (
    <>
      <p>El nivel sugerido es el más alto de estos factores.</p>
      <ul className="lista-factores" data-testid="lista-factores-riesgo">
        {factores.map((f) => (
          <li key={f.codigo} className="factor" data-testid={`factor-${f.codigo}`}>
            <span>{fraseFactor(f)}</span>
            <span className={`semaforo semaforo--${f.nivel.toLowerCase()}`}>{ETIQUETAS_NIVEL_RIESGO[f.nivel]}</span>
          </li>
        ))}
        {atrasoNoEvaluado ? (
          <li className="factor" data-testid="factor-no-evaluado">
            <span>Atraso del sprint: no disponible (no pudimos consultar el avance)</span>
            <span className="semaforo semaforo--no-disponible">No disponible</span>
          </li>
        ) : null}
        {factores.length === 0 && !atrasoNoEvaluado ? (
          <li className="factor" data-testid="factor-sin-factores">
            <span>Sin factores de riesgo: no hay impedimentos abiertos ni atraso en el sprint</span>
            <span className="semaforo semaforo--bajo">Bajo</span>
          </li>
        ) : null}
      </ul>
    </>
  );
}
