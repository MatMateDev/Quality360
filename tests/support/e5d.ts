import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { api, type RespuestaApi } from "./api";
import { cumpleContrato } from "./contrato";
import { DATABASE_URL_DUENO, uid } from "./e4";
import { borrarUsuariosDePrueba, estadoConfigBase, sql, tk } from "./e5";
import { CONSULTAS, consultarOk, crearArnes, editar, fijarActivo, fila, pares, type ArnesE5 } from "./e5c";
import { crearUsuarioE7, sesionDe, type ClaveE7 } from "./e7";
import { RAIZ_REPO } from "./env";
import { jiraFalso } from "./jira-falso/cliente";

/**
 * Soporte de la certificación de «E5 · detalle de la HDU y confirmación una a una» (dueño: q360-qa).
 * Rutas nuevas (D200, D202), el arnés con QE6 (ANA5 inactiva y ANA6 activa) y ADM2, y ayudas para el Jira falso con el detalle.
 */
export const IMPORTANTE = DATABASE_URL_DUENO;

export async function obtenerItem(request: APIRequestContext, consultaId: string, itemId: string, clave: ClaveE7 = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return api.get(request, `${CONSULTAS}/${consultaId}/items/${itemId}`, { token: await tk(clave), baseURL });
}

export async function confirmarFila(
  request: APIRequestContext, consultaId: string, itemId: string, revision: unknown, o: { clave?: ClaveE7; token?: string; baseURL?: string; body?: Record<string, unknown> } = {},
): Promise<RespuestaApi<any>> {
  return api.post(request, `${CONSULTAS}/${consultaId}/items/${itemId}/confirmaciones`, {
    token: o.token ?? (await tk(o.clave ?? "adm1")),
    body: o.body ?? { revision },
    baseURL: o.baseURL,
  });
}

/**
 * Valida un `DetalleItemConsulta` contra el contrato. `DetalleHdu.urlJira` exige `^https://` y el Jira simulado local es http
 * (`INTEGRACIONES_PERMITIR_HOST_PRUEBA`, D95): solo para validar, el esquema de la dirección se sube a https; el resto se valida tal cual.
 */
export function contratoDetalle(cuerpo: any): { ok: boolean; errores: string[] } {
  const copia = JSON.parse(JSON.stringify(cuerpo));
  if (copia?.detalle?.urlJira) copia.detalle.urlJira = String(copia.detalle.urlJira).replace("http://", "https://");
  return cumpleContrato("DetalleItemConsulta", copia);
}

/** Configuración base + issues del detalle (QTY-15 a QTY-18) cargadas en el Jira falso. */
export async function prepararDetalle(request: APIRequestContext, pesado = false): Promise<void> {
  await estadoConfigBase(request);
  await jiraFalso.detalle(pesado);
}

/** Configuración base, detalle cargado y una consulta de QTY (15 historias + QTY-7 que es Bug). */
export async function consultaConDetalle(request: APIRequestContext, baseURL?: string): Promise<any> {
  await prepararDetalle(request);
  return consultarOk(request, {}, baseURL);
}

export interface ArnesDetalle extends ArnesE5 {
  /** QE6: ANA5 inactiva y ANA6 activa (el auto-asignable es ANA6). */
  qe6: { id: string; ana5: string; ana6: string };
  /** QE con dos analistas activos (QE1 de la semilla: ANA1 y ANA2). */
  restaurar: () => Promise<void>;
}

/** ADM2, QE5 (sin analistas) y QE6 con ANA5 (inactiva) y ANA6 (activa), creados por la API de Organización. */
export async function crearArnesDetalle(request: APIRequestContext): Promise<ArnesDetalle> {
  const t0 = new Date();
  const base = await crearArnes(request);
  const adm = await tk("adm1");
  const qe6 = await crearUsuarioE7(request, adm, "QE", { prefijo: "e5qe6" });
  const ana5 = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "e5ana5" });
  const ana6 = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "e5ana6" });
  for (const a of [ana5, ana6]) {
    const r = await api.put<any>(request, `/v1/analistas/${a.id}/supervisor`, { token: adm, body: { qeId: qe6.id } });
    if (r.status !== 200) throw new Error(`supervisor de ${a.id}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  await fijarActivo(ana5.id, false);
  return {
    ...base,
    qe6: { id: qe6.id, ana5: ana5.id, ana6: ana6.id },
    restaurar: async () => undefined,
    limpiar: async () => {
      await base.limpiar();
      await borrarUsuariosDePrueba([qe6.id, ana5.id, ana6.id], t0);
    },
  };
}

/** Sesión de un usuario creado por la prueba (ADM2). */
export const tokenDe = async (correo: string) => (await sesionDe(correo)).accessToken;

/** Ids del fixture útiles para los casos de B07/F07. */
export async function idsFixture(request: APIRequestContext) {
  const p = await pares(request);
  return { ...p, qe5: undefined as unknown as string, uid: (clave: ClaveE7) => uid(request, clave) };
}

/** Marca una fila lista: asigna todo explícito (CEL-C, QE y Analista dados). */
export async function asignarFila(
  request: APIRequestContext, consultaId: string, codigo: string, a: { qeId?: string; analistaId?: string; celulaId?: string; sprintId?: string }, baseURL?: string,
): Promise<RespuestaApi<any>> {
  const p = await pares(request);
  const f = await fila(request, consultaId, codigo);
  return editar(request, consultaId, {
    itemIds: [f.id],
    asignacion: { celulaId: a.celulaId ?? p.celC, ...(a.qeId ? { qeId: a.qeId } : {}), ...(a.analistaId ? { analistaId: a.analistaId } : {}), ...(a.sprintId ? { sprintId: a.sprintId } : {}) },
  }, "adm1", baseURL);
}

/**
 * Proxy delante de Organización que REENVÍA la petición (Organización la procesa y escribe) pero destruye la conexión del cliente antes de
 * devolver la respuesta, las primeras `veces` llamadas a `fragmento`. Simula «Organización creó la HDU pero Integraciones no alcanzó a marcarla» (E5-B07 #11).
 */
export async function proxyCortaRespuesta(destino: string, puerto: number, fragmento: string, veces = 1): Promise<{ url: string; cortadas: () => number; cerrar: () => Promise<void> }> {
  const { createServer, request } = await import("node:http");
  let cortadas = 0;
  const destinoUrl = new URL(destino);
  const servidor = createServer((req, res) => {
    const coincide = (req.url ?? "").includes(fragmento);
    const saliente = request({ host: destinoUrl.hostname, port: destinoUrl.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      if (coincide && cortadas < veces) {
        cortadas += 1;
        r.resume();
        r.on("end", () => req.socket.destroy());
        return;
      }
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    saliente.on("error", () => req.socket.destroy());
    req.pipe(saliente);
  });
  await new Promise<void>((ok) => servidor.listen(puerto, "127.0.0.1", () => ok()));
  return { url: `http://127.0.0.1:${puerto}`, cortadas: () => cortadas, cerrar: () => new Promise<void>((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }) };
}

/** Un QE nuevo con `n` analistas activos supervisados (todo se borra con `limpiar`). */
export async function crearEquipo(request: APIRequestContext, n: number, prefijo = "e5eq"): Promise<{ qeId: string; qeNombre: string; analistas: Array<{ id: string; nombre: string }>; limpiar: () => Promise<void> }> {
  const t0 = new Date();
  const adm = await tk("adm1");
  const qe = await crearUsuarioE7(request, adm, "QE", { prefijo: `${prefijo}qe` });
  const analistas: Array<{ id: string; nombre: string }> = [];
  for (let i = 0; i < n; i += 1) {
    const a = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: `${prefijo}an${i}` });
    const r = await api.put<any>(request, `/v1/analistas/${a.id}/supervisor`, { token: adm, body: { qeId: qe.id } });
    if (r.status !== 200) throw new Error(`supervisor: ${r.status} ${JSON.stringify(r.body)}`);
    analistas.push({ id: a.id, nombre: a.nombre });
  }
  return { qeId: qe.id, qeNombre: qe.nombre, analistas, limpiar: () => borrarUsuariosDePrueba([qe.id, ...analistas.map((a) => a.id)], t0) };
}

/** Texto de los registros de los servicios de esta corrida (tests/logs-e5d). */
export function registrosE5D(): string {
  const dir = path.join(RAIZ_REPO, "tests", "logs-e5d");
  try {
    return readdirSync(dir).filter((f) => /^(org|integ|gw|gw2|cert|imp|pgb-org|pgb-integ|pgb-gw|pgb-gwapi|pgb-imp)\.log$/.test(f)).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  } catch {
    return "";
  }
}

/** Nombre visible de un usuario de Organización (oráculo directo). */
export const nombreUsuario = async (id: string) => (await sql<{ nombre: string }>("SELECT nombre FROM organizacion.usuario WHERE id_usuario = $1", [id]))[0].nombre;

/** Id de una HDU por código (oráculo directo). */
export const idHdu = async (codigo: string) => (await sql<{ id_historia: string }>("SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]))[0]?.id_historia;

/** Filas de `consulta_item` de la consulta, con el tamaño del detalle en bytes (oráculo directo en la base). */
export const filasDetalleDb = (consultaId: string) =>
  sql<{ codigo: string; con_detalle: boolean; bytes: number | null; revision: number; analista_auto: boolean; aplicada: boolean; ya_asignada: any }>(
    "SELECT codigo, detalle IS NOT NULL AS con_detalle, octet_length(detalle::text) AS bytes, revision, analista_auto, aplicada, ya_asignada FROM integraciones.consulta_item WHERE id_consulta = $1 ORDER BY posicion",
    [consultaId],
  );
