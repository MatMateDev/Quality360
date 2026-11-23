import { useId, useRef, type KeyboardEvent } from "react";

/** Un paso de la guía: `guia-oauth-paso-<n>` (diseño OAuth §11.2). Texto fijo y estático: ninguna llamada al servidor. */
const PASOS: Array<{ titulo: string; texto: string }> = [
  {
    titulo: "Quién registra la app.",
    texto: "La aplicación de Quality360 en Atlassian la registra una sola vez quien administra Quality360, no tú. Tú no tienes que crear ninguna app ni copiar ningún token.",
  },
  { titulo: "Qué haces tú.", texto: "Pulsa «Conectar con Jira», inicia sesión en Atlassian y acepta los permisos de solo lectura. Es solo la primera vez." },
  {
    titulo: "Qué permisos se piden.",
    texto: "Solo lectura: ver datos de issues, ver el perfil del usuario y mantener la conexión. Quality360 nunca escribe en Jira.",
  },
  {
    titulo: "Qué verás en Atlassian.",
    texto: "Puede aparecer un aviso de que Atlassian no revisó la app. Es normal mientras la app no esté publicada en su tienda.",
  },
  {
    titulo: "Si el botón aparece deshabilitado.",
    texto: "Significa que quien administra Quality360 aún no cargó las credenciales de la app en el servidor. Avísale, o usa la conexión con API token mientras tanto.",
  },
  {
    titulo: "Si dice «Reconexión necesaria».",
    texto: "Revocaste el permiso en Atlassian o la conexión venció. Pulsa «Reconectar» y acepta de nuevo.",
  },
  {
    titulo: "Cómo quitar el permiso.",
    texto: "Desconectar borra lo guardado en Quality360. Para quitar el permiso en tu cuenta de Atlassian: id.atlassian.com, Perfil y visibilidad, Apps conectadas, busca Quality360 y revoca el acceso.",
  },
];

interface PropsGuia {
  abierta: boolean;
  onCambiar: (abierta: boolean) => void;
}

/**
 * Botón «¿Cómo se configura?» y su panel expandible (`panel-guia-oauth`, diseño OAuth §11). No es un manual de registro:
 * el Administrador no registra la app. No muestra nombres de variables, el Client ID ni el secreto (E5-F08 #7, D216):
 * el pie solo cita la ruta del documento para quien despliega.
 */
export function GuiaOauthJira({ abierta, onCambiar }: PropsGuia) {
  const idPanel = useId();
  const boton = useRef<HTMLButtonElement>(null);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape" && abierta) {
      evento.stopPropagation();
      onCambiar(false);
      boton.current?.focus();
    }
  }

  return (
    <div className="guia-oauth">
      <button
        ref={boton}
        type="button"
        className="boton boton--enlace"
        data-testid="boton-guia-oauth"
        aria-expanded={abierta}
        aria-controls={idPanel}
        onClick={() => onCambiar(!abierta)}
      >
        ¿Cómo se configura?
      </button>
      <div id={idPanel} className="guia-oauth__panel" data-testid="panel-guia-oauth" hidden={!abierta} onKeyDown={alTeclear} tabIndex={-1}>
        <h3>¿Cómo funciona la conexión con Jira?</h3>
        <ol>
          {PASOS.map((paso, indice) => (
            <li key={paso.titulo} data-testid={`guia-oauth-paso-${indice + 1}`}>
              <strong>{paso.titulo}</strong> {paso.texto}
            </li>
          ))}
        </ol>
        <p className="campo-ayuda">
          ¿Eres quien despliega Quality360? Los pasos para registrar la app y cargar sus datos en el servidor están en la guía de despliegue del proyecto:{" "}
          <code>docs/arquitectura/guia-oauth-atlassian.md</code>. No los pegues en el chat ni en un documento: el secreto de la app no debe salir de tu gestor de contraseñas ni de la configuración del servidor.
        </p>
      </div>
    </div>
  );
}

/**
 * `ayuda-revocar-jira` (diseño OAuth §3.6): desconectar borra lo guardado en Quality360, pero el permiso sigue en la cuenta
 * de Atlassian. Visible tras desconectar (`abierta`) y siempre disponible en la tarjeta de la conexión.
 */
export function AyudaRevocarJira({ abierta = false }: { abierta?: boolean }) {
  return (
    <details className="ayuda-revocar" data-testid="ayuda-revocar-jira" open={abierta || undefined}>
      <summary>Cómo quitar el permiso en Atlassian</summary>
      <p role="note">
        Desconectar borra las credenciales guardadas en Quality360, pero el permiso sigue en tu cuenta de Atlassian. Para quitarlo: entra a id.atlassian.com, abre Perfil y visibilidad, luego Apps conectadas, busca Quality360 y revoca el acceso.
      </p>
      <p>
        <a href="https://id.atlassian.com/" target="_blank" rel="noopener noreferrer">
          Abrir id.atlassian.com (se abre en una pestaña nueva)
        </a>
      </p>
    </details>
  );
}
