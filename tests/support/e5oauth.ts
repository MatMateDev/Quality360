import { createHash } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { api, type RespuestaApi } from "./api";
import { atlassianFalso, type ResultadoAutorizacion } from "./atlassian-falso/cliente";
import { conConexion } from "./db";
import { DATABASE_URL_DUENO } from "./e4";
import { limpiarE5, sql, tk, destino } from "./e5";
import type { ClaveE7 } from "./e7";

/**
 * Soporte de la certificación de E5 OAuth (dueño: q360-qa). Estado base: el de E5 (fixture E7 + E4 + seed:e5, Jira falso en NORMAL), el Atlassian falso
 * (:4011) en NORMAL y `integraciones.*` sin conexión OAuth. Cada archivo termina con `limpiarOauth()`.
 */
export const OAUTH = "/v1/integraciones/jira/oauth";
export const CONFIG = "/v1/integraciones/jira/configuracion";
export const RUTAS_OAUTH = [
  { metodo: "POST", ruta: `${OAUTH}/iniciar`, cuerpo: undefined },
  { metodo: "POST", ruta: `${OAUTH}/retorno`, cuerpo: { state: "x", code: "y" } },
  { metodo: "POST", ruta: `${OAUTH}/sitio`, cuerpo: { sitioId: "1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8" } },
  { metodo: "DELETE", ruta: OAUTH, cuerpo: undefined },
] as const;

const TABLAS_OAUTH = ["evento_oauth_jira", "oauth_estado_jira", "conexion_oauth_jira"] as const;

/** Vacía las 3 tablas OAuth (si ya existen) con el dueño de la base, restablece el Atlassian falso y deja el estado base de E5. */
export async function limpiarOauth(): Promise<void> {
  await conConexion(DATABASE_URL_DUENO, async (c) => {
    for (const t of TABLAS_OAUTH) {
      const existe = (await c.query("SELECT to_regclass($1) AS r", [`integraciones.${t}`])).rows[0].r;
      if (existe) await c.query(`TRUNCATE integraciones.${t}`);
    }
  });
  await atlassianFalso.reset();
  await limpiarE5();
}

export const sha256Hex = (texto: string) => createHash("sha256").update(texto).digest("hex");

export function stateDe(urlAutorizacion: string): string {
  return new URL(urlAutorizacion).searchParams.get("state") ?? "";
}

export function iniciarOauth(request: APIRequestContext, clave: ClaveE7 | string = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return tk(clave as ClaveE7).then((token) => api.post(request, `${OAUTH}/iniciar`, { token, baseURL }));
}

export function retornoOauth(request: APIRequestContext, body: Record<string, unknown>, clave: ClaveE7 | string = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return tk(clave as ClaveE7).then((token) => api.post(request, `${OAUTH}/retorno`, { token, body, baseURL }));
}

export function sitioOauth(request: APIRequestContext, sitioId: string, clave: ClaveE7 | string = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return tk(clave as ClaveE7).then((token) => api.post(request, `${OAUTH}/sitio`, { token, body: { sitioId }, baseURL }));
}

export function desconectarOauth(request: APIRequestContext, clave: ClaveE7 | string = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return tk(clave as ClaveE7).then((token) => api.delete(request, OAUTH, { token, baseURL }));
}

/** «Probar conexión» de la tarjeta (E5-B01#2): `{metodo: OAUTH}`; solo `myself` (más el proyecto guardado, si lo hay). */
export function probarOauth(request: APIRequestContext, extra: Record<string, unknown> = {}, baseURL?: string): Promise<RespuestaApi<any>> {
  return tk("adm1").then((token) => api.post(request, `${CONFIG}/probar`, { token, body: { metodo: "OAUTH", ...extra }, baseURL }));
}

/** «Probar y guardar» con OAuth (E5-B01#4): proyecto QTY con el destino de la «Configuración base». */
export async function guardarOauth(request: APIRequestContext, sobre: Record<string, unknown> = {}, baseURL?: string): Promise<RespuestaApi<any>> {
  const d = await destino(request);
  const body = { metodo: "OAUTH", proyecto: "QTY", tiposIssue: ["Story", "Historia"], celulaId: d.celulaId, qeResponsableId: d.qeId, sprintRespaldoId: d.sprint1Id, ...sobre };
  return api.put(request, CONFIG, { token: await tk("adm1"), body, baseURL });
}

export interface Conexion {
  ini: RespuestaApi<any>;
  aut: ResultadoAutorizacion;
  state: string;
  ret: RespuestaApi<any>;
}

/**
 * Flujo completo contra el stack y el Atlassian falso, sin navegador: `oauth/iniciar` → `/authorize` del falso (consentimiento automático) →
 * `oauth/retorno` con el `code` y el `state`. El navegador lo hace el portal; aquí lo hace la prueba.
 */
export async function conectarOauth(request: APIRequestContext, opciones: { clave?: ClaveE7 | string; baseURL?: string } = {}): Promise<Conexion> {
  const ini = await iniciarOauth(request, opciones.clave ?? "adm1", opciones.baseURL);
  if (ini.status !== 200) throw new Error(`oauth/iniciar respondió ${ini.status}: ${JSON.stringify(ini.body)}`);
  const aut = await atlassianFalso.autorizar(ini.body.urlAutorizacion);
  const state = stateDe(ini.body.urlAutorizacion);
  const cuerpo = aut.code ? { code: aut.code, state: aut.state ?? state } : { error: aut.error ?? "access_denied", state: aut.state ?? state };
  const ret = await retornoOauth(request, cuerpo, opciones.clave ?? "adm1", opciones.baseURL);
  return { ini, aut, state, ret };
}

// ----------------------------------------------------------------------------- oráculos con el dueño de la base
export const filaConexion = async () => (await sql("SELECT * FROM integraciones.conexion_oauth_jira"))[0];
export const filasEstado = () => sql("SELECT * FROM integraciones.oauth_estado_jira ORDER BY creado_en");
export const eventosOauth = () => sql("SELECT * FROM integraciones.evento_oauth_jira ORDER BY fecha, id_evento");
export const tiposEventoOauth = async () => (await eventosOauth()).map((e) => e.tipo as string);

/** Fuerza que el backend vea el acceso a punto de vencer (la renovación se decide con `acceso_expira_en`, no con el reloj del falso). */
export async function vencerAccesoEnBase(): Promise<void> {
  await sql("UPDATE integraciones.conexion_oauth_jira SET acceso_expira_en = now() - interval '1 minute'");
}

/** Texto de las 3 tablas OAuth con cada `bytea` en utf8, latin1, hex y base64, para buscar fugas de tokens, `code`, `state` o secreto con `atlassianFalso.fugas`. */
export async function textoDeTablasOauth(): Promise<string> {
  const partes: string[] = [];
  for (const t of TABLAS_OAUTH) {
    for (const fila of await sql(`SELECT * FROM integraciones.${t}`)) {
      for (const valor of Object.values(fila)) {
        if (Buffer.isBuffer(valor)) partes.push(valor.toString("utf8"), valor.toString("latin1"), valor.toString("hex"), valor.toString("base64"));
        else partes.push(typeof valor === "object" ? JSON.stringify(valor) : String(valor));
      }
    }
  }
  return partes.join("\n");
}

/** Texto de las tablas de ejecución y de la configuración de Jira (para afirmar que ningún secreto de OAuth llegó allí). */
export async function textoDeTablasEjecucion(): Promise<string> {
  const filas = [
    ...(await sql("SELECT * FROM integraciones.configuracion_jira")),
    ...(await sql("SELECT * FROM integraciones.evento_configuracion")),
    ...(await sql("SELECT * FROM integraciones.ejecucion_integracion")),
    ...(await sql("SELECT * FROM integraciones.detalle_ejecucion")),
  ];
  return filas.map((f) => JSON.stringify(f, (_k, v) => (v && v.type === "Buffer" ? Buffer.from(v.data).toString("latin1") : v))).join("\n");
}

/**
 * Crea un `state` ya vencido (más de 10 minutos) del Administrador `adm1`. Un disparador solo deja pasar `usado_en`, así que no se puede
 * envejecer un state por UPDATE: se inserta una fila nueva con el actor de un `iniciar` real.
 */
export async function crearEstadoVencido(request: APIRequestContext): Promise<string> {
  const ini = await iniciarOauth(request);
  if (ini.status !== 200) throw new Error(`oauth/iniciar respondió ${ini.status}`);
  const actor = (await sql("SELECT actor_id FROM integraciones.oauth_estado_jira WHERE estado_hash = $1", [sha256Hex(stateDe(ini.body.urlAutorizacion))]))[0].actor_id;
  const state = `vencido-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await sql(
    `INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, creado_en, expira_en) VALUES ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes')`,
    [sha256Hex(state), actor],
  );
  return state;
}
