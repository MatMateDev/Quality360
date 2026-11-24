// Estado de la conexión con Jira que el portal muestra, derivado de `GET …/configuracion` (decisiones-mvp,
// «Chip de la conexión»). El servidor decide; aquí solo se elige qué decir.
import type { ConfiguracionJira, ConexionOauthJira } from "@/types/dominio";
import { INFO_CHIP_CONEXION, type EstadoChipConexion } from "./mensajesIntegracion";

/** `chip-conexion` refleja siempre el método ACTIVO. Se aplica la primera regla que cumpla. */
export function estadoChip(config: ConfiguracionJira): EstadoChipConexion {
  const { metodo, oauth, estadoConexion } = config;
  if (metodo === "API_TOKEN" && estadoConexion === "FALLIDA") return "fallo";
  if (metodo === "API_TOKEN") return "conectado-api-token";
  if (!oauth) return "sin-conectar";
  if (oauth.estado === "RECONEXION_NECESARIA" || !oauth.descifrable) return "reconexion-necesaria";
  if (oauth.estado === "PENDIENTE_SITIO") return "falta-sitio";
  if (metodo === "OAUTH" && estadoConexion === "FALLIDA") return "fallo";
  return "conectado-oauth";
}

/** «Conectado con Jira (OAuth) como <cuenta> en <sitio>» (D215); sin cuenta o sitio conocidos, queda la forma corta. */
export function textoChip(estado: EstadoChipConexion, oauth: ConexionOauthJira | null): string {
  const base = INFO_CHIP_CONEXION[estado].etiqueta;
  if (estado !== "conectado-oauth" || !oauth) return base;
  const cuenta = oauth.cuenta?.nombre;
  const sitio = oauth.sitio?.nombre;
  return `${base}${cuenta ? ` como ${cuenta}` : ""}${sitio ? ` en ${sitio}` : ""}`;
}

/** La conexión OAuth guardada existe pero el método activo es otro («Lista, sin activar», diseño §6.1). */
export function oauthSinActivar(config: ConfiguracionJira): boolean {
  return config.metodo !== "OAUTH" && config.oauth !== null;
}

/** Hay una conexión OAuth que se puede probar y con la que se puede guardar el proyecto. */
export function oauthUtilizable(config: ConfiguracionJira): boolean {
  return Boolean(config.oauth && config.oauth.estado === "CONECTADA" && config.oauth.descifrable);
}

/** Texto del aviso de éxito al volver de Atlassian (diseño §4.3). */
export function textoConexionHecha(cuenta: string | null | undefined, sitio: string | null | undefined, hayDestino: boolean): string {
  const quien = cuenta ? ` como ${cuenta}` : "";
  const donde = sitio ? ` en ${sitio}` : "";
  const base = `Conectado con Jira (OAuth)${quien}${donde}.`;
  return hayDestino ? `${base} Pulsa «Probar y guardar» para confirmar.` : `${base} Ahora elige el proyecto y el destino de las HDU nuevas.`;
}
