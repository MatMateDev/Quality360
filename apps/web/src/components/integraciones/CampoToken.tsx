import type { Ref } from "react";
import type { ConfiguracionJira } from "@/types/dominio";
import { CampoForm } from "./CampoForm";

/**
 * Estado del token como TEXTO (nunca un candado solo): «Configurado · termina en XXXX», «No configurado» o
 * «No disponible: vuelve a ingresarlo» (D94, D116). Es lo único del token que el servidor entrega.
 */
export function EstadoToken({ token, descifrable }: { token: ConfiguracionJira["token"]; descifrable: boolean }) {
  const configurado = token.configurado;
  let texto = "No configurado";
  if (configurado && !descifrable) texto = "No disponible: vuelve a ingresarlo";
  else if (configurado) texto = `Configurado · termina en ${token.ultimos4 ?? "····"}`;
  return (
    <span className="estado-token" data-testid="token-estado" data-configurado={String(configurado)}>
      {texto}
    </span>
  );
}

interface Props {
  valor: string;
  onCambio: (valor: string) => void;
  /** Hay un token guardado y se puede descifrar: dejar el campo vacío significa «conservar» (D116). */
  puedeConservar: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Campo del API token: `type="password"`, sin botón «mostrar», `autocomplete="new-password"` y NUNCA con un valor
 * que no haya escrito la persona (D116). El valor vive solo en el estado del formulario y se vacía tras cada intento.
 */
export function CampoToken({ valor, onCambio, puedeConservar, error, inputRef }: Props) {
  return (
    <CampoForm
      id="campo-token"
      clave="token"
      etiqueta="API token"
      obligatorio={!puedeConservar}
      error={error}
      ayuda={puedeConservar ? "Déjalo vacío para conservar el token actual." : "Créalo en tu cuenta de Atlassian. Se guarda cifrado y no se vuelve a mostrar."}
    >
      {(props) => (
        <input
          {...props}
          aria-required={!puedeConservar}
          ref={inputRef}
          data-testid="campo-token"
          type="password"
          name="jira-api-token"
          autoComplete="new-password"
          spellCheck={false}
          autoCapitalize="off"
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
        />
      )}
    </CampoForm>
  );
}
