import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { api, type RespuestaApi } from "./api";
import { conConexion } from "./db";
import { RAIZ_REPO } from "./env";
import { celulasFixture, tokenE7, type ClaveE7 } from "./e7";
import { DATABASE_URL_DUENO, uid } from "./e4";
import { jiraFalso } from "./jira-falso/cliente";
import { TOKEN_VALIDO, CORREO_VALIDO } from "./jira-falso/servidor";

/**
 * Soporte de la certificación de E5 · Integración con Jira (dueño: q360-qa).
 * Estado base (sección 10.4 del backlog): fixture E7 + E4 + `seed:e5`, Jira falso en NORMAL e `integraciones.*` vacío.
 * Cada archivo de pruebas termina con `limpiarE5()` (sección 9: las HDU importadas no se pueden borrar por la API).
 */
export const SITIO_FALSO = "http://127.0.0.1:4010";
export const SITIO_CERRADO = "http://127.0.0.1:4011";
export const TOKEN_FALSO = TOKEN_VALIDO;
export const CORREO_FALSO = CORREO_VALIDO;
/** Prefijo de las HDU manuales que crean las pruebas de E5 (se limpian junto con las importadas). */
export const PREFIJO_MANUAL = "E5M-";

export const URL_INTEGRACIONES = process.env.INTEGRACIONES_URL ?? "http://localhost:3004";
export const URL_I2 = "http://localhost:3104";
export const URL_I3 = "http://localhost:3105";
export const URL_I4 = "http://localhost:3106";
export const URL_I5 = "http://localhost:3107";

export const tk = (clave: ClaveE7) => tokenE7(clave);

export function leerFixture(nombre: string): string {
  return readFileSync(path.join(RAIZ_REPO, "tests", "fixtures", "e5", nombre), "utf8");
}

/** Registro (stdout/stderr) de `npm run local`, donde caen los logs de todos los servicios. */
export function registroServicios(): string {
  // Fuera de test-results: Playwright vacía esa carpeta en cada corrida.
  const dir = path.join(RAIZ_REPO, "tests", "logs-e5");
  try {
    return readdirSync(dir).filter((f) => /^(local-up|gateway-[0-9]+)\.log$/.test(f)).map((f) => readFileSync(path.join(dir, f), "utf8")).join(String.fromCharCode(10));
  } catch {
    return "";
  }
}

export interface Destino {
  celulaId: string;
  qeId: string;
  qe1Id: string;
  sprint1Id: string;
  sprint2Id: string;
  celulaA: string;
}

let cacheDestino: Promise<Destino> | undefined;
export function destino(request: APIRequestContext): Promise<Destino> {
  cacheDestino ??= (async () => {
    const celulas = await celulasFixture(request);
    const token = await tk("adm1");
    const sp = await api.get<{ items: Array<{ id: string; nombre: string }> }>(request, `/v1/catalogos/sprints?celulaId=${celulas["CEL-C"].id}`, { token });
    const s1 = sp.body.items.find((s) => s.nombre === "E5 Sprint 1");
    const s2 = sp.body.items.find((s) => s.nombre === "E5 Sprint 2");
    if (!s1 || !s2) throw new Error("Faltan los sprints «E5 Sprint 1/2»: ejecuta npm run seed:e5.");
    return { celulaId: celulas["CEL-C"].id, celulaA: celulas["CEL-A"].id, qeId: await uid(request, "qe2"), qe1Id: await uid(request, "qe1"), sprint1Id: s1.id, sprint2Id: s2.id };
  })();
  return cacheDestino;
}

/** Cuerpo de «Configuración base»: sitio falso, QTY, Story/Historia, CEL-C, QE2 y «E5 Sprint 1» de respaldo. */
export async function cuerpoConfigBase(request: APIRequestContext, sobre: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const d = await destino(request);
  return {
    sitio: SITIO_FALSO,
    correo: CORREO_FALSO,
    token: TOKEN_FALSO,
    proyecto: "QTY",
    tiposIssue: ["Story", "Historia"],
    celulaId: d.celulaId,
    qeResponsableId: d.qeId,
    sprintRespaldoId: d.sprint1Id,
    ...sobre,
  };
}

/** Cuerpo de `probar` (SolicitudPruebaJira): sin el destino. */
export async function cuerpoPrueba(request: APIRequestContext, sobre: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { celulaId: _c, qeResponsableId: _q, sprintRespaldoId: _s, ...resto } = await cuerpoConfigBase(request, sobre);
  return resto;
}

export async function guardarConfigBase(request: APIRequestContext, sobre: Record<string, unknown> = {}): Promise<RespuestaApi<any>> {
  return api.put(request, "/v1/integraciones/jira/configuracion", { token: await tk("adm1"), body: await cuerpoConfigBase(request, sobre) });
}

export async function sincronizar(request: APIRequestContext, body: Record<string, unknown> = {}, baseURL?: string): Promise<RespuestaApi<any>> {
  return api.post(request, "/v1/integraciones/jira/sincronizaciones", { token: await tk("adm1"), body, baseURL });
}

export function cuerpoArchivo(nombre: string, contenido?: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const formato = nombre.toLowerCase().endsWith(".json") ? "JSON" : "CSV";
  return { formato, nombre, contenido: contenido ?? leerFixture(nombre), ...extra };
}

export async function importar(request: APIRequestContext, nombre: string, extra: Record<string, unknown> = {}, contenido?: string, clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.post(request, "/v1/integraciones/archivos/importaciones", { token: await tk(clave), body: cuerpoArchivo(nombre, contenido, extra) });
}

export async function vistaPrevia(request: APIRequestContext, nombre: string, extra: Record<string, unknown> = {}, contenido?: string, clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.post(request, "/v1/integraciones/archivos/vista-previa", { token: await tk(clave), body: cuerpoArchivo(nombre, contenido, extra) });
}

export async function detalleEjecucion(request: APIRequestContext, id: string, query = "tamanoPagina=100", clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.get(request, `/v1/integraciones/ejecuciones/${id}/detalle?${query}`, { token: await tk(clave) });
}

export async function ejecuciones(request: APIRequestContext, query = "", clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.get(request, `/v1/integraciones/ejecuciones${query ? `?${query}` : ""}`, { token: await tk(clave) });
}

export async function hduPorCodigo(request: APIRequestContext, codigo: string, clave: ClaveE7 = "aud1"): Promise<any | undefined> {
  const f = await sql<{ id_historia: string }>("SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]);
  if (f.length === 0) return undefined;
  return (await api.get(request, `/v1/hdu/${f[0].id_historia}`, { token: await tk(clave) })).body;
}

export async function contarHdu(request: APIRequestContext, clave: ClaveE7 = "aud1"): Promise<number> {
  const r = await api.get<{ total: number }>(request, "/v1/hdu?tamanoPagina=1", { token: await tk(clave) });
  return r.body.total;
}

/** Consulta con el dueño de la base (oráculo independiente de la API). */
export function sql<T = any>(consulta: string, params: unknown[] = []): Promise<T[]> {
  return conConexion(DATABASE_URL_DUENO, async (c) => (await c.query(consulta, params)).rows as T[]);
}

/** Borra de `tabla` las filas que cumplen `donde` (con $1 = ids), primero las filas hijas que las referencian por llave foránea (recursivo). */
async function borrarCascada(c: import("pg").Client, tabla: string, donde: string, ids: string[], mareadas = new Set<string>()): Promise<void> {
  const clave = `${tabla}|${donde}`;
  if (mareadas.has(clave)) return;
  mareadas.add(clave);
  const hijas = await c.query(
    `SELECT format('%I.%I', n.nspname, cl.relname) AS t, a.attname AS col, ra.attname AS refcol
       FROM pg_constraint co
       JOIN pg_class cl ON cl.oid = co.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
       JOIN pg_attribute ra ON ra.attrelid = co.confrelid AND ra.attnum = co.confkey[1]
      WHERE co.contype = 'f' AND co.confrelid = $1::regclass AND array_length(co.conkey, 1) = 1 AND co.conrelid <> co.confrelid`,
    [tabla],
  );
  for (const h of hijas.rows) {
    await borrarCascada(c, h.t as string, `${h.col} IN (SELECT ${h.refcol} FROM ${tabla} WHERE ${donde})`, ids, mareadas);
  }
  await c.query(`DELETE FROM ${tabla} WHERE ${donde}`, [ids]);
}

/**
 * Limpieza obligatoria de la sección 9: borra, con el dueño de la base, las HDU con origen distinto de MANUAL (y las manuales
 * `E5M-*` que crean las pruebas) con sus filas dependientes, y vacía `integraciones.*`. Luego deja el falso en estado base.
 */
export async function limpiarE5(): Promise<void> {
  await conConexion(DATABASE_URL_DUENO, async (c) => {
    const ids = (await c.query(`SELECT id_historia FROM organizacion.historia_usuario WHERE origen <> 'MANUAL' OR codigo LIKE $1`, [`${PREFIJO_MANUAL}%`])).rows.map((r) => r.id_historia as string);
    if (ids.length > 0) {
      // Los disparadores de integridad (RI) de Impedimentos fallan con «permission denied» al borrar su tabla de acciones; el dueño de la base
      // (superusuario) los desactiva durante la limpieza.
      await c.query("SET session_replication_role = replica");
      // Dependientes en otros esquemas (sin llaves foráneas hacia la HDU): checklist, certificados, impedimentos y riesgo de esas HDU.
      await borrarCascada(c, "impedimentos.impedimento", "id_historia = ANY($1::uuid[])", ids);
      await borrarCascada(c, "impedimentos.riesgo_hdu", "id_historia = ANY($1::uuid[])", ids);
      await borrarCascada(c, "certificaciones.evento_checklist", "hdu_id = ANY($1::uuid[])", ids);
      await borrarCascada(c, "certificaciones.certificado", "hdu_id = ANY($1::uuid[])", ids);
      await borrarCascada(c, "certificaciones.certificacion", "id_historia = ANY($1::uuid[])", ids);
      await c.query("DELETE FROM organizacion.auditoria WHERE entidad = 'HDU' AND entidad_id = ANY($1::uuid[])", [ids]).catch(() => undefined);
      await borrarCascada(c, "organizacion.historia_usuario", "id_historia = ANY($1::uuid[])", ids);
      await c.query("SET session_replication_role = DEFAULT");
    }
    await c.query("TRUNCATE integraciones.detalle_ejecucion, integraciones.ejecucion_integracion, integraciones.evento_configuracion, integraciones.configuracion_jira CASCADE");
  });
  await jiraFalso.reset();
}

/** Estado base sin configuración: limpia todo y deja el falso en NORMAL. */
export async function estadoSinConfig(): Promise<void> {
  await limpiarE5();
}

/** Estado base con la «Configuración base» guardada y conectada. */
export async function estadoConfigBase(request: APIRequestContext): Promise<void> {
  await limpiarE5();
  const r = await guardarConfigBase(request);
  if (r.status !== 200 || r.body?.guardado !== true) throw new Error(`No se pudo guardar la configuración base: ${r.status} ${JSON.stringify(r.body)}`);
  await jiraFalso.limpiarSolicitudes();
}

/** Cadenas que no pueden aparecer jamás en una respuesta, tabla o registro (D94): el token, el Base64 de correo:token y el encabezado. */
export function cadenasSecretas(token = TOKEN_FALSO, correo = CORREO_FALSO): string[] {
  return [token, Buffer.from(`${correo}:${token}`, "utf8").toString("base64"), "Authorization", "Basic "];
}

export function contieneSecreto(texto: string, token = TOKEN_FALSO): string | undefined {
  return cadenasSecretas(token).find((s) => texto.includes(s));
}

/** Sincroniza y devuelve la ejecución. Falla si la API no responde 200. */
export async function sincronizarOk(request: APIRequestContext, body: Record<string, unknown> = {}): Promise<any> {
  const r = await sincronizar(request, body);
  if (r.status !== 200) throw new Error(`sincronizar: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Escritura de HDU manual de la prueba (QE responsable). */
export async function crearHduManual(request: APIRequestContext, codigo: string, qe: ClaveE7 = "qe2"): Promise<RespuestaApi<any>> {
  const d = await destino(request);
  return api.post(request, "/v1/hdu", {
    token: await tk(qe),
    body: { codigo, titulo: `Manual ${codigo}`, prioridad: "MEDIA", celulaId: d.celulaId, sprintId: d.sprint1Id },
  });
}

/** Prepara R1–R4 del estado previo de E5-F04. */
export async function prepararR1aR4(request: APIRequestContext): Promise<{ r1: any; r2: any; r3: any; r4: any }> {
  await estadoConfigBase(request);
  const r1 = await sincronizarOk(request);
  const r2 = (await importar(request, "historias-validas.csv")).body;
  const r3 = (await importar(request, "historias-con-errores.csv")).body;
  await jiraFalso.modo("CAIDO");
  const r4 = await sincronizarOk(request);
  await jiraFalso.modo("NORMAL");
  return { r1, r2, r3, r4 };
}

/**
 * Secretos que no pueden aparecer en un registro (log) de los servicios (D94): el token (cualquiera de los de prueba), su Base64 de `correo:token`,
 * un esquema `Basic <valor>` y un encabezado `Authorization` con valor. El gateway nombra la cabecera ausente («sin cabecera Authorization Bearer»),
 * sin valor: eso no es un secreto. Devuelve la lista de hallazgos (vacía = limpio).
 */
export function hallazgosDeSecreto(texto: string): string[] {
  const hallazgos: string[] = [];
  for (const token of [TOKEN_FALSO, "q360-token-nuevo-CD34", "token-malo-ZZ99"]) {
    if (texto.includes(token)) hallazgos.push(`token ${token.slice(0, 12)}…`);
    const b64 = Buffer.from(`${CORREO_FALSO}:${token}`, "utf8").toString("base64");
    if (texto.includes(b64)) hallazgos.push(`base64 de correo:${token.slice(0, 12)}…`);
  }
  if (/Basic [A-Za-z0-9+/=]{8,}/.test(texto)) hallazgos.push("esquema Basic con valor");
  if (/Authorization["']?\s*[:=]\s*["']?(Basic|Bearer)\s+\S/i.test(texto)) hallazgos.push("encabezado Authorization con valor");
  return hallazgos;
}

/**
 * Borra, con el dueño de la base, usuarios creados por una prueba de E5 (Organización y Auth) y las entradas de auditoría posteriores a `desde`
 * (la prueba corre sola, en serie): así los valores absolutos de E7 (usuarios inactivos, últimos cambios) quedan como antes de la prueba.
 */
export async function borrarUsuariosDePrueba(ids: string[], desde: Date): Promise<void> {
  await conConexion(DATABASE_URL_DUENO, async (c) => {
    await c.query("SET session_replication_role = replica");
    await c.query("DELETE FROM organizacion.auditoria WHERE fecha > $1", [desde]);
    await c.query("DELETE FROM organizacion.supervision WHERE id_supervisado = ANY($1::uuid[]) OR id_supervisor = ANY($1::uuid[])", [ids]).catch(async () => {
      await c.query("DELETE FROM organizacion.supervision WHERE id_supervisado = ANY($1::uuid[])", [ids]);
    });
    await c.query("DELETE FROM organizacion.celula_lider WHERE id_usuario = ANY($1::uuid[])", [ids]);
    await c.query("DELETE FROM organizacion.usuario WHERE id_usuario = ANY($1::uuid[])", [ids]);
    await c.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [ids]);
    await c.query("SET session_replication_role = DEFAULT");
  });
}
