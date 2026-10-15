import type { Ref } from "react";
import { IconoError } from "./Iconos";

interface PropsCampoCorreo {
  id: string;
  valor: string;
  alCambiar: (valor: string) => void;
  referencia?: Ref<HTMLInputElement>;
  error?: string;
  soloLectura?: boolean;
}

/** Campo de correo de la pantalla de acceso (label real, error asociado y foco visible). */
export function CampoCorreo({ id, valor, alCambiar, referencia, error, soloLectura }: PropsCampoCorreo) {
  const idError = `${id}-error`;
  return (
    <div className="acceso-campo">
      <label className="acceso-etiqueta" htmlFor={id}>
        Correo electrónico
      </label>
      <input
        id={id}
        name={id}
        ref={referencia}
        className={soloLectura ? "acceso-entrada acceso-entrada--ocupada" : "acceso-entrada"}
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="nombre@empresa.cl"
        value={valor}
        readOnly={soloLectura}
        onChange={(evento) => alCambiar(evento.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? idError : undefined}
      />
      {error ? (
        <p className="acceso-error" id={idError}>
          <IconoError tamano={14} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
