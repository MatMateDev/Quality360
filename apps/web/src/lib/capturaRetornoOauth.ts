// Captura del retorno de Atlassian (D210, ADR 0019). `main.tsx` importa este módulo en PRIMER lugar: se ejecuta antes de
// que exista el cliente de Supabase. Motivo: supabase-js lee la dirección al crearse y, si trae `error` o
// `error_description` (lo que Atlassian manda al rechazar el consentimiento), cierra la sesión del Administrador.
//
// Reglas:
//  - Solo actúa en `/admin/integraciones/jira/oauth/retorno`; en cualquier otra ruta no toca nada.
//  - Lee `code`, `state` y `error`, y limpia la dirección con `history.replaceState`: ni la recarga ni el historial los
//    conservan. `error_description` y cualquier otro parámetro se descartan sin leerse.
//  - Los valores viven solo en memoria de este módulo, para UN único consumo. Nada va a `localStorage`, a
//    `sessionStorage` ni a una cookie. Este módulo no importa Supabase ni nada que lo cree.
import { RUTA_RETORNO_OAUTH } from "./rutasIntegraciones";

/** Lo único que se envía al gateway (`SolicitudRetornoOauthJira`): `state` y exactamente uno de `code` o `error`. */
export interface RetornoOauth {
  state?: string;
  code?: string;
  error?: string;
}

let pendiente: RetornoOauth | null = null;
let sesionCerrada = false;

type Ubicacion = Pick<Location, "pathname" | "search" | "hash">;
type Historial = Pick<History, "replaceState" | "state">;

function normalizar(ruta: string): string {
  return ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
}

/** Devuelve `true` si estaba en la ruta de retorno (y por tanto limpió la dirección). */
export function capturarRetornoOauth(ubicacion: Ubicacion = window.location, historial: Historial = window.history): boolean {
  if (normalizar(ubicacion.pathname) !== RUTA_RETORNO_OAUTH) return false;
  const params = new URLSearchParams(ubicacion.search);
  const leer = (clave: string): string | undefined => {
    const valor = params.get(clave);
    return valor !== null && valor !== "" ? valor : undefined;
  };
  const captura: RetornoOauth = { state: leer("state"), code: leer("code"), error: leer("error") };
  pendiente = captura.state || captura.code || captura.error ? captura : null;
  // Limpia antes de que nadie más lea la dirección: sin `?…` ni `#…`.
  if (ubicacion.search !== "" || ubicacion.hash !== "") historial.replaceState(historial.state, "", ubicacion.pathname);
  return true;
}

export function hayRetornoOauthPendiente(): boolean {
  return pendiente !== null;
}

/** Entrega lo capturado una sola vez y lo borra de la memoria. */
export function tomarRetornoOauth(): RetornoOauth | null {
  const captura = pendiente;
  pendiente = null;
  return captura;
}

/**
 * Sin sesión al volver (D210): el `code` no se conserva. Se descarta y se recuerda que hay que avisarlo en Conexión
 * («Tu sesión se cerró durante la conexión…»). Devuelve `true` si había algo que descartar.
 */
export function descartarRetornoOauth(): boolean {
  const habia = pendiente !== null;
  pendiente = null;
  if (habia) sesionCerrada = true;
  return habia;
}

/** Consume la marca del aviso de sesión cerrada: se muestra una sola vez. */
export function tomarAvisoSesionCerrada(): boolean {
  const marca = sesionCerrada;
  sesionCerrada = false;
  return marca;
}

/** Solo para pruebas. */
export function reiniciarCapturaRetornoOauth(): void {
  pendiente = null;
  sesionCerrada = false;
}

if (typeof window !== "undefined") capturarRetornoOauth();
