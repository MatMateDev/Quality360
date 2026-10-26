import { useId } from "react";

interface Props {
  /** `id` del control (y base de los ids de ayuda y error). */
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  /** Largo máximo: se aplica como `maxLength` y se muestra «n/máx». */
  max: number;
  multilinea?: boolean;
  filas?: number;
  obligatorio?: boolean;
  ayuda?: string;
  error?: string | null;
  /** `data-testid` del control. */
  testId?: string;
  /** `data-testid` del contador (p. ej. `contador-descripcion-impedimento`). */
  testIdContador?: string;
  /** `data-testid` del mensaje de error. */
  testIdError?: string;
  /** Si se indica, se pasa el foco al control cuando el padre lo pide (primer campo inválido). */
  refControl?: React.Ref<HTMLInputElement & HTMLTextAreaElement>;
}

/**
 * Campo de texto con etiqueta visible, contador `n/máx`, ayuda y error asociados (`aria-describedby`). Al
 * llegar al límite avisa con un mensaje `sr-only` en `role="status"`; el contador en sí no es `aria-live` para no
 * anunciar cada pulsación (diseño E4 §2.3).
 */
export function CampoTextoContador({
  id,
  etiqueta,
  valor,
  onCambio,
  max,
  multilinea = false,
  filas = 4,
  obligatorio = false,
  ayuda,
  error,
  testId,
  testIdContador,
  testIdError,
  refControl,
}: Props) {
  const base = useId();
  const idAyuda = `${base}-ayuda`;
  const idError = `${base}-error`;
  const describedBy = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ") || undefined;
  const propiedades = {
    id,
    "data-testid": testId,
    value: valor,
    maxLength: max,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    "aria-required": obligatorio ? (true as const) : undefined,
    onChange: (evento: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onCambio(evento.target.value),
  };
  return (
    <div className="campo">
      <label htmlFor={id}>
        {etiqueta}
        {obligatorio ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : null}
      </label>
      {multilinea ? <textarea ref={refControl} rows={filas} {...propiedades} /> : <input ref={refControl} type="text" {...propiedades} />}
      {ayuda ? (
        <p className="campo-ayuda" id={idAyuda}>
          {ayuda}
        </p>
      ) : null}
      <span className="contador-caracteres" data-testid={testIdContador}>
        {valor.length}/{max}
      </span>
      <span className="sr-only" role="status">
        {valor.length >= max ? `Llegaste al máximo de ${max} caracteres.` : ""}
      </span>
      {error ? (
        <p className="campo-error" id={idError} data-testid={testIdError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
