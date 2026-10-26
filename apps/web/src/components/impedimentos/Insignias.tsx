import { ETIQUETAS_ESTADO_IMPEDIMENTO, GLIFO_ESTADO_IMPEDIMENTO, type EstadoImpedimento } from "@/types/dominio";

const CLASE_ESTADO: Record<EstadoImpedimento, string> = {
  ABIERTO: "badge-imp-abierto",
  ESCALADO: "badge-imp-escalado",
  RESUELTO: "badge-imp-resuelto",
};

/** `○ Abierto`, `⇧ Escalado`, `✓ Resuelto`: glifo (forma), palabra y color (diseño E4 §2.1). */
export function InsigniaEstadoImpedimento({ estado, id }: { estado: EstadoImpedimento; id?: string }) {
  return (
    <span className={`badge ${CLASE_ESTADO[estado]}`} data-testid={id ? `estado-impedimento-${id}` : undefined} data-estado={estado}>
      <span aria-hidden="true">{GLIFO_ESTADO_IMPEDIMENTO[estado]} </span>
      {ETIQUETAS_ESTADO_IMPEDIMENTO[estado]}
    </span>
  );
}

/** `⊘ Bloqueada` (con « · N» si se informa el número de abiertos). El bloqueo es información, no un estado de la HDU (D59). */
export function InsigniaBloqueo({ abiertos, testId, suave = false }: { abiertos?: number; testId?: string; suave?: boolean }) {
  return (
    <span className={`badge badge-bloqueada${suave ? " badge-bloqueada--suave" : ""}`} data-testid={testId}>
      <span aria-hidden="true">⊘ </span>
      {suave ? "Con impedimento abierto" : "Bloqueada"}
      {abiertos !== undefined ? ` · ${abiertos}` : ""}
    </span>
  );
}

/** «Nuevo» (menos de 24 h, D72): la palabra va visible y se explica a los lectores de pantalla. */
export function InsigniaNuevo() {
  return (
    <span className="badge badge-nuevo" data-testid="insignia-nuevo">
      Nuevo<span className="sr-only"> (registrado hace menos de 24 horas)</span>
    </span>
  );
}

/** Días abiertos: «6 d» visible y «6 días abiertos» para lectores de pantalla; resuelto: «Resuelto en 3 d». */
export function DiasAbierto({ dias, resuelto = false }: { dias: number; resuelto?: boolean }) {
  const unidad = dias === 1 ? "día" : "días";
  return (
    <span>
      <span aria-hidden="true">{resuelto ? `Resuelto en ${dias} d` : `${dias} d`}</span>
      <span className="sr-only">{resuelto ? `Resuelto en ${dias} ${unidad}` : `${dias} ${unidad} abierto`}</span>
    </span>
  );
}
