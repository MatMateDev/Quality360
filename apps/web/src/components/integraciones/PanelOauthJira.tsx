import { useRef, useState } from "react";
import type { ConfiguracionJira } from "@/types/dominio";
import { GuiaOauthJira } from "./AyudaOauthJira";
import { BotonConectarJira, ErrorInicioOauth, type ConexionOauth } from "./ConectarJira";

interface Props {
  config: ConfiguracionJira;
  conexion: ConexionOauth;
  /** «Usar API token»: cambia el selector y lleva el foco a `campo-sitio` (diseño §2.3). */
  onUsarApiToken: () => void;
}

/**
 * Panel del método OAuth (diseño OAuth §2.3). El botón es siempre el mismo `button`; en `no-disponible` usa
 * `aria-disabled` (sigue en el orden de tabulación) y su motivo `aviso-oauth-no-disponible` va ligado con `aria-describedby`.
 */
export function PanelOauthJira({ config, conexion, onUsarApiToken }: Props) {
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const guia = useRef<HTMLDivElement>(null);
  const oauth = config.oauth;
  const enRecuperacion = Boolean(oauth && (oauth.estado === "RECONEXION_NECESARIA" || oauth.estado === "PENDIENTE_SITIO" || !oauth.descifrable));
  const noDisponible = conexion.estado === "no-disponible";
  // Con el API token activo y la conexión OAuth aún sin lista, se aclara que no cambia nada hasta que funcione (§6.1).
  const avisarCambio = config.metodo === "API_TOKEN" && !(oauth && oauth.estado === "CONECTADA" && oauth.descifrable);

  function abrirGuia() {
    setGuiaAbierta(true);
    // El panel ya está en el DOM (solo oculto): se enfoca en el siguiente turno, cuando se muestra.
    setTimeout(() => guia.current?.querySelector<HTMLElement>("[data-testid=panel-guia-oauth]")?.focus(), 0);
  }

  return (
    <section className="panel" aria-labelledby="titulo-panel-oauth" data-testid="panel-oauth">
      <h2 id="titulo-panel-oauth">Conectar con Jira</h2>
      {avisarCambio ? (
        <p className="mensaje-aviso" role="note" data-testid="aviso-cambio-a-oauth">
          Tu conexión con API token sigue activa. No se cambiará hasta que la conexión con Jira funcione.
        </p>
      ) : null}
      <p>Se abrirá Atlassian para que inicies sesión y aceptes permisos de solo lectura. Quality360 nunca ve tu contraseña ni escribe en Jira.</p>
      <p>Permisos que se piden: ver datos de issues, ver el perfil del usuario y mantener la conexión.</p>

      {/* Con la conexión pendiente o vencida, el botón único está en la tarjeta de estado (diseño §3.2 B). */}
      {!enRecuperacion ? (
        <p>
          <BotonConectarJira texto={oauth ? "Reconectar" : "Conectar con Jira"} estado={conexion.estado} describedBy="aviso-oauth-no-disponible" onClick={() => void conexion.iniciar()} />
        </p>
      ) : null}

      <div role="note" id="aviso-oauth-no-disponible" className="mensaje-aviso" data-testid="aviso-oauth-no-disponible" hidden={!noDisponible}>
        <p>
          La conexión automática aún no está habilitada en el servidor. Usa la conexión con API token o pide a quien despliega que cargue las credenciales de la app de Atlassian.
        </p>
        <p>
          <button type="button" className="boton boton--enlace" data-testid="enlace-usar-api-token" onClick={onUsarApiToken}>
            Usar API token
          </button>{" "}
          <button type="button" className="boton boton--enlace" data-testid="enlace-ayuda-oauth" onClick={abrirGuia}>
            Cómo se configura
          </button>
        </p>
      </div>

      {conexion.error ? <ErrorInicioOauth codigo={conexion.error} /> : null}
      {conexion.estado === "en-curso" ? (
        <p role="status" className="campo-ayuda" data-testid="estado-abriendo-atlassian">
          Abriendo Atlassian…
        </p>
      ) : null}

      <div ref={guia}>
        <GuiaOauthJira abierta={guiaAbierta} onCambiar={setGuiaAbierta} />
      </div>
    </section>
  );
}
