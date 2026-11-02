import type { ReactNode } from "react";

export interface PropsControl {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required": true;
}

interface Props {
  /** `id` del control; el error es `<id>-error` y la ayuda `<id>-ayuda`. */
  id: string;
  /** Sufijo de `error-campo-<clave>`. */
  clave: string;
  etiqueta: string;
  obligatorio?: boolean;
  ayuda?: ReactNode;
  error?: string;
  amplio?: boolean;
  children: (props: PropsControl) => ReactNode;
}

/**
 * Campo con `<label>` visible, ayuda y error asociados con `aria-describedby`. El asterisco se acompaña de un
 * «obligatorio» solo para lectores de pantalla.
 */
export function CampoForm({ id, clave, etiqueta, obligatorio = true, ayuda, error, amplio, children }: Props) {
  const descripcion = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`campo${amplio ? " campo--amplio" : ""}`}>
      <label htmlFor={id}>
        {etiqueta}
        {obligatorio ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : null}
      </label>
      {children({ id, "aria-describedby": descripcion, "aria-invalid": error ? true : undefined, "aria-required": true })}
      {ayuda ? (
        <span className="campo-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </span>
      ) : null}
      {error ? (
        <span className="campo-error" id={`${id}-error`} data-testid={`error-campo-${clave}`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
