import type { ChangeEvent, ReactNode, Ref } from "react";
import { useState } from "react";
import { IconoError, IconoOjo, IconoOjoTachado } from "./Iconos";

interface PropsCampoContrasena {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  autoComplete: "current-password" | "new-password";
  referencia?: Ref<HTMLInputElement>;
  /** Mensaje de error del campo, asociado con `aria-describedby`. */
  error?: string;
  /** Texto de ayuda (p. ej. el mínimo de caracteres) asociado con `aria-describedby`. */
  ayuda?: string;
  /** Id de un bloque externo (alerta global) que también describe al campo. */
  descritoPor?: string;
  invalido?: boolean;
  soloLectura?: boolean;
  /** Elemento a la derecha de la etiqueta (p. ej. «¿Olvidaste tu contraseña?»). */
  accionEtiqueta?: ReactNode;
  /** Nombre accesible del botón: `[mostrar, ocultar]`. */
  nombresBoton?: [string, string];
}

/** Campo de contraseña con el botón de ojo DENTRO del campo para mostrar u ocultar el texto. */
export function CampoContrasena({
  id,
  etiqueta,
  valor,
  alCambiar,
  autoComplete,
  referencia,
  error,
  ayuda,
  descritoPor,
  invalido,
  soloLectura,
  accionEtiqueta,
  nombresBoton = ["Mostrar contraseña", "Ocultar contraseña"],
}: PropsCampoContrasena) {
  const [visible, setVisible] = useState(false);
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const marcadoInvalido = Boolean(error) || Boolean(invalido);
  // La ayuda se oculta cuando hay un error propio: ambos dicen lo mismo.
  const mostrarAyuda = Boolean(ayuda) && !error;
  const describe = [error ? idError : null, mostrarAyuda ? idAyuda : null, descritoPor ?? null].filter(Boolean).join(" ");

  return (
    <div className="acceso-campo">
      <div className="acceso-etiqueta-fila">
        <label className="acceso-etiqueta" htmlFor={id}>
          {etiqueta}
        </label>
        {accionEtiqueta}
      </div>
      <div
        className={[
          "acceso-contrasena",
          marcadoInvalido ? "acceso-contrasena--invalida" : "",
          soloLectura ? "acceso-contrasena--ocupada" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          id={id}
          name={id}
          ref={referencia}
          className="acceso-contrasena__entrada"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={valor}
          readOnly={soloLectura}
          onChange={(evento: ChangeEvent<HTMLInputElement>) => alCambiar(evento.target.value)}
          aria-invalid={marcadoInvalido}
          aria-describedby={describe || undefined}
        />
        <button
          type="button"
          className="acceso-contrasena__ojo"
          onClick={() => setVisible((actual) => !actual)}
          aria-label={visible ? nombresBoton[1] : nombresBoton[0]}
          aria-pressed={visible}
        >
          {visible ? <IconoOjoTachado tamano={20} /> : <IconoOjo tamano={20} />}
        </button>
      </div>
      {error ? (
        <p className="acceso-error" id={idError}>
          <IconoError tamano={14} />
          {error}
        </p>
      ) : null}
      {mostrarAyuda ? (
        <p className="acceso-ayuda" id={idAyuda}>
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}
