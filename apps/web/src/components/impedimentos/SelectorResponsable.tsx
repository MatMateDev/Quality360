import { useId } from "react";
import { ETIQUETAS_ROL, type PersonaRolCandidata } from "./tiposImpedimentos";

export const VALOR_OTRO = "__otro__";

interface Props {
  /** Prefijo de los `id` y `data-testid`: `campo-responsable` o `campo-destino`. */
  idSelect: string;
  idOtro: string;
  /** `data-testid` del select y del campo «Otro». */
  testIdSelect: string;
  testIdOtro: string;
  etiqueta: string;
  ayuda?: string;
  candidatos: PersonaRolCandidata[];
  /** Id del candidato elegido, `VALOR_OTRO` o vacío. */
  valor: string;
  nombreOtro: string;
  onCambioValor: (valor: string) => void;
  onCambioNombre: (nombre: string) => void;
  error?: string | null;
  errorOtro?: string | null;
  testIdError?: string;
  testIdErrorOtro?: string;
  refSelect?: React.Ref<HTMLSelectElement>;
  refOtro?: React.Ref<HTMLInputElement>;
}

/**
 * Selector de responsable (registro) o de destino (escalamiento): candidatos activos de Organización más «Otro
 * (nombre)…», que revela un campo de texto (3 a 150). El responsable no obtiene permisos (D57).
 */
export function SelectorResponsable(props: Props) {
  const { idSelect, idOtro, testIdSelect, testIdOtro, etiqueta, ayuda, candidatos, valor, nombreOtro, onCambioValor, onCambioNombre } = props;
  const base = useId();
  const idAyuda = `${base}-ayuda`;
  const idError = `${base}-error`;
  const idErrorOtro = `${base}-error-otro`;
  const describedBy = [ayuda ? idAyuda : null, props.error ? idError : null].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <div className="campo">
        <label htmlFor={idSelect}>
          {etiqueta}
          <span aria-hidden="true"> *</span>
          <span className="sr-only"> (obligatorio)</span>
        </label>
        <select
          id={idSelect}
          ref={props.refSelect}
          data-testid={testIdSelect}
          value={valor}
          aria-required="true"
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(evento) => onCambioValor(evento.target.value)}
        >
          <option value="">Selecciona una persona</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {ETIQUETAS_ROL[c.rol]}
            </option>
          ))}
          <option value={VALOR_OTRO}>Otro (nombre)…</option>
        </select>
        {ayuda ? (
          <p className="campo-ayuda" id={idAyuda}>
            {ayuda}
          </p>
        ) : null}
        {props.error ? (
          <p className="campo-error" id={idError} data-testid={props.testIdError}>
            {props.error}
          </p>
        ) : null}
      </div>
      {valor === VALOR_OTRO ? (
        <div className="campo">
          <label htmlFor={idOtro}>
            Nombre de quien debe resolverlo
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </label>
          <input
            id={idOtro}
            ref={props.refOtro}
            type="text"
            data-testid={testIdOtro}
            value={nombreOtro}
            maxLength={150}
            aria-required="true"
            aria-invalid={props.errorOtro ? true : undefined}
            aria-describedby={props.errorOtro ? idErrorOtro : undefined}
            onChange={(evento) => onCambioNombre(evento.target.value)}
          />
          {props.errorOtro ? (
            <p className="campo-error" id={idErrorOtro} data-testid={props.testIdErrorOtro}>
              {props.errorOtro}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
