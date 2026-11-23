import { useEventosConfiguracion, esIndisponible } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_CAMPO_CONFIGURACION } from "@/lib/mensajesIntegracion";
import type { CampoConfiguracionJira, EventoConfiguracionJira } from "@/types/dominio";

function camposDe(evento: EventoConfiguracionJira): string {
  const campos: CampoConfiguracionJira[] = [...evento.camposCambiados];
  if (evento.tokenCambiado && !campos.includes("token")) campos.push("token");
  return campos.map((c) => ETIQUETAS_CAMPO_CONFIGURACION[c] ?? c).join(", ") || "sin cambios";
}

/**
 * Texto de un evento (diseño OAuth §3.8). Nunca trae tokens, `code` ni `state`. `REFRESCO_FALLIDO` no tiene persona: el
 * actor del servidor es el Administrador que disparó la renovación, pero el portal muestra «Sistema».
 */
export function textoEvento(evento: EventoConfiguracionJira): string {
  const cuenta = evento.oauth?.cuenta ?? null;
  const sitio = evento.oauth?.sitio ?? null;
  switch (evento.tipo) {
    case "CONECTAR_OAUTH":
      return `${evento.actor.nombre} · conectó con Jira (OAuth)${cuenta ? ` como ${cuenta}` : ""}${sitio ? ` en ${sitio}` : ""}`;
    case "RECONECTAR":
      return `${evento.actor.nombre} · reconectó con Jira (OAuth)${cuenta ? ` como ${cuenta}` : ""}`;
    case "DESCONECTAR":
      return `${evento.actor.nombre} · desconectó la conexión con Jira`;
    case "REFRESCO_FALLIDO":
      return "Sistema · la renovación de la conexión falló; se necesita reconectar";
    default:
      return `${evento.actor.nombre} · cambió: ${camposDe(evento)}`;
  }
}

/** Últimos cambios de configuración (D111). El token solo aparece como «API token (cambiado)». Bloque con estado propio. */
export function ListaEventosConfiguracion() {
  const consulta = useEventosConfiguracion();
  let estado: EstadoDatos;
  if (consulta.isError) estado = esIndisponible(consulta.error) ? "indisponible" : "error";
  else if (consulta.isLoading || !consulta.data) estado = "cargando";
  else if (consulta.data.items.length === 0) estado = "vacio";
  else estado = "ok";
  return (
    <section className="panel" aria-labelledby="titulo-eventos-configuracion">
      <h2 id="titulo-eventos-configuracion">Cambios de configuración</h2>
      <BloqueDatos clave="eventos-configuracion" estado={estado} mensajeVacio="Aún no hay cambios de configuración" onReintentar={() => void consulta.refetch()}>
        <ul className="historial-lista lista-eventos-config" data-testid="lista-eventos-configuracion">
          {consulta.data?.items.slice(0, 10).map((evento) => (
            <li key={evento.id} className="historial-item" data-testid={`evento-configuracion-${evento.id}`}>
              <time dateTime={evento.fecha}>{formatearFecha(evento.fecha)}</time>
              <p data-tipo={evento.tipo}>{textoEvento(evento)}</p>
            </li>
          ))}
        </ul>
      </BloqueDatos>
    </section>
  );
}
