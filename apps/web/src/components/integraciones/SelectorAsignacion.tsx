import type { ReactNode } from "react";

export interface OpcionAsignacion {
  valor: string;
  etiqueta: string;
}

interface Props {
  id: string;
  /** Texto visible de la etiqueta («Célula»). */
  etiqueta: string;
  /** Nombre accesible que empieza con el texto visible («Célula de QTY-1», WCAG 2.5.3). */
  nombreAccesible?: string;
  valor: string;
  opciones: OpcionAsignacion[];
  /** Primera opción, que no es un valor («Elige…», «No cambiar»). */
  vacio: string;
  testId: string;
  onCambio: (valor: string) => void;
  deshabilitado?: boolean;
  /** Motivo de deshabilitado, leído por `aria-describedby`. */
  motivo?: string;
  error?: string;
  idError?: string;
  testIdError?: string;
  ocupado?: boolean;
  /** Lista visible (panel de grupo y diálogos): `min(6, n + 1)` filas. */
  lista?: boolean;
  ayuda?: ReactNode;
  idAyuda?: string;
}

/** Selector con etiqueta visible, opción vacía que no es valor y errores asociados al campo (diseño §4.4). */
export function SelectorAsignacion({ id, etiqueta, nombreAccesible, valor, opciones, vacio, testId, onCambio, deshabilitado, motivo, error, idError, testIdError, ocupado, lista, ayuda, idAyuda }: Props) {
  const idMotivo = `${id}-motivo`;
  const descritoPor = [error ? idError : null, motivo ? idMotivo : null, ayuda ? idAyuda : null].filter(Boolean).join(" ") || undefined;
  const todas = valor && !opciones.some((o) => o.valor === valor) ? [{ valor, etiqueta: valor }, ...opciones] : opciones;
  return (
    <div className="campo selector-asignacion">
      <label htmlFor={id}>{etiqueta}</label>
      <select
        id={id}
        data-testid={testId}
        aria-label={nombreAccesible}
        value={valor}
        size={lista ? Math.min(6, todas.length + 1) : undefined}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-busy={ocupado || undefined}
        aria-describedby={descritoPor}
        onChange={(evento) => onCambio(evento.target.value)}
      >
        <option value="">{vacio}</option>
        {todas.map((o) => (
          <option key={o.valor} value={o.valor} title={o.etiqueta}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      {motivo ? (
        <span id={idMotivo} className="campo-ayuda">
          {motivo}
        </span>
      ) : null}
      {ayuda ? (
        <span id={idAyuda} className="campo-ayuda">
          {ayuda}
        </span>
      ) : null}
      {error ? (
        <span id={idError} className="campo-error" data-testid={testIdError}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
