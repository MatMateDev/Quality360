import type { APIRequestContext } from "@playwright/test";
import { api, type RespuestaApi } from "./api";
import { conConexion } from "./db";
import { DATABASE_URL_DUENO, uid } from "./e4";
import { crearUsuarioE7, sesionDe, type ClaveE7 } from "./e7";
import { borrarUsuariosDePrueba, destino, sql, tk } from "./e5";
import { env } from "./env";

/**
 * Soporte de la certificación de «E5 · consulta y asignación» (dueño: q360-qa).
 * Rutas, ayudas de consulta/edición/confirmación y el arnés (ADM2, QE5 y una célula de 60 caracteres que crea la prueba, no la semilla).
 */
export const CONSULTAS = "/v1/integraciones/jira/consultas";

export type Ruta = { baseURL?: string };

export async function consultar(request: APIRequestContext, body: Record<string, unknown> = {}, baseURL?: string, clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.post(request, CONSULTAS, { token: await tk(clave), body, baseURL });
}

/** Consulta y exige 200 con una consulta guardada. */
export async function consultarOk(request: APIRequestContext, body: Record<string, unknown> = {}, baseURL?: string): Promise<any> {
  const r = await consultar(request, body, baseURL);
  if (r.status !== 200) throw new Error(`consultar: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function continuar(request: APIRequestContext, id: string, baseURL?: string, clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.post(request, `${CONSULTAS}/${id}/continuaciones`, { token: await tk(clave), body: {}, baseURL });
}

export async function actual(request: APIRequestContext, clave: ClaveE7 = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return api.get(request, `${CONSULTAS}/actual`, { token: await tk(clave), baseURL });
}

export async function cabecera(request: APIRequestContext, id: string, clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.get(request, `${CONSULTAS}/${id}`, { token: await tk(clave) });
}

export async function items(request: APIRequestContext, id: string, grupo: string, query = "tamanoPagina=100", clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.get(request, `${CONSULTAS}/${id}/items?grupo=${grupo}${query ? `&${query}` : ""}`, { token: await tk(clave) });
}

/** Todas las filas de un grupo (recorre las páginas de 100). */
export async function todasLasFilas(request: APIRequestContext, id: string, grupo: string): Promise<any[]> {
  const out: any[] = [];
  for (let p = 1; ; p += 1) {
    const r = await items(request, id, grupo, `pagina=${p}&tamanoPagina=100`);
    if (r.status !== 200) throw new Error(`items ${grupo}: ${r.status} ${JSON.stringify(r.body)}`);
    out.push(...r.body.items);
    if (out.length >= r.body.total || r.body.items.length === 0) return out;
  }
}

export async function fila(request: APIRequestContext, id: string, codigo: string, grupo = "NUEVA"): Promise<any> {
  const r = await items(request, id, grupo, `q=${encodeURIComponent(codigo)}&tamanoPagina=100`);
  const f = (r.body?.items ?? []).find((i: any) => i.codigo === codigo);
  if (!f) throw new Error(`No hay fila ${codigo} en ${grupo}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return f;
}

export async function editar(request: APIRequestContext, id: string, body: Record<string, unknown>, clave: ClaveE7 = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return api.patch(request, `${CONSULTAS}/${id}/items`, { token: await tk(clave), body, baseURL });
}

export async function confirmar(request: APIRequestContext, id: string, version: number, clave: ClaveE7 = "adm1", baseURL?: string): Promise<RespuestaApi<any>> {
  return api.post(request, `${CONSULTAS}/${id}/confirmaciones`, { token: await tk(clave), body: { version }, baseURL });
}

export async function descartar(request: APIRequestContext, id: string, clave: ClaveE7 = "adm1"): Promise<RespuestaApi<any>> {
  return api.post(request, `${CONSULTAS}/${id}/descartes`, { token: await tk(clave), body: {} });
}

export interface Pares {
  celC: string;
  celA: string;
  qe1: string;
  qe2: string;
  ana1: string;
  ana2: string;
  ana3: string;
  ana4: string;
  sprintA1: string;
  sprint1: string;
  sprint2: string;
}

let cachePares: Promise<Pares> | undefined;
export function pares(request: APIRequestContext): Promise<Pares> {
  cachePares ??= (async () => {
    const d = await destino(request);
    const sp = await api.get<{ items: Array<{ id: string; nombre: string }> }>(request, `/v1/catalogos/sprints?celulaId=${d.celulaA}`, { token: await tk("adm1") });
    const a1 = sp.body.items.find((s) => s.nombre === "E5 Sprint A1");
    if (!a1) throw new Error("Falta «E5 Sprint A1» en CEL-A: ejecuta npm run seed:e5.");
    return {
      celC: d.celulaId, celA: d.celulaA, qe1: d.qe1Id, qe2: d.qeId,
      ana1: await uid(request, "ana1"), ana2: await uid(request, "ana2"), ana3: await uid(request, "ana3"), ana4: await uid(request, "ana4"),
      sprintA1: a1.id, sprint1: d.sprint1Id, sprint2: d.sprint2Id,
    };
  })();
  return cachePares;
}

/** Asigna (CEL-C, QE2, ANA3 por defecto) y marca las filas NUEVA indicadas por código. Devuelve el cuerpo del PATCH. */
export async function asignarYMarcar(
  request: APIRequestContext, consultaId: string, codigos: string[],
  asig: { celulaId?: string; qeId?: string; analistaId?: string } = {}, marcar = true, clave: ClaveE7 = "adm1", baseURL?: string,
): Promise<RespuestaApi<any>> {
  const p = await pares(request);
  const ids: string[] = [];
  for (const c of codigos) ids.push((await fila(request, consultaId, c)).id);
  return editar(request, consultaId, {
    itemIds: ids,
    asignacion: { celulaId: asig.celulaId ?? p.celC, qeId: asig.qeId ?? p.qe2, analistaId: asig.analistaId ?? p.ana3 },
    ...(marcar ? { marcada: true } : {}),
  }, clave, baseURL);
}

/** Consulta base A (11 leídas) con QTY-1 a QTY-4 asignadas y marcadas (CEL-C, QE2, ANA3). */
export async function consultaAConMarcadas(request: APIRequestContext, baseURL?: string): Promise<{ consulta: any; ids: Record<string, string> }> {
  const r = await consultarOk(request, {}, baseURL);
  const patch = await asignarYMarcar(request, r.consulta.id, ["QTY-1", "QTY-2", "QTY-3", "QTY-4"], {}, true, "adm1", baseURL);
  if (patch.status !== 200) throw new Error(`asignarYMarcar: ${patch.status} ${JSON.stringify(patch.body)}`);
  const ids: Record<string, string> = {};
  for (const i of patch.body.items) ids[i.codigo] = i.id;
  return { consulta: (await cabecera(request, r.consulta.id)).body, ids };
}

/** Consulta A completa y confirmada con QTY-1..QTY-4 (CEL-C, QE2, ANA3); luego deja el falso como estaba. */
export async function consultaAConfirmada(request: APIRequestContext, baseURL?: string): Promise<any> {
  const { consulta } = await consultaAConMarcadas(request, baseURL);
  const c = await confirmar(request, consulta.id, consulta.version, "adm1", baseURL);
  if (c.status !== 200) throw new Error(`confirmar: ${c.status} ${JSON.stringify(c.body)}`);
  return c.body;
}

/** Consulta A con todas las NUEVA válidas marcadas (10) y confirmada. */
export async function consultaACompletaConfirmada(request: APIRequestContext, baseURL?: string): Promise<any> {
  const r = await consultarOk(request, {}, baseURL);
  const p = await pares(request);
  const e = await editar(request, r.consulta.id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 }, marcarListas: true }, "adm1", baseURL);
  if (e.status !== 200) throw new Error(`asignar todas: ${e.status} ${JSON.stringify(e.body)}`);
  const c = await confirmar(request, r.consulta.id, e.body.version, "adm1", baseURL);
  if (c.status !== 200) throw new Error(`confirmar: ${c.status} ${JSON.stringify(c.body)}`);
  return c.body;
}

export async function solicitudesJira() {
  const { jiraFalso } = await import("./jira-falso/cliente");
  return jiraFalso.solicitudes();
}

/** Estado de una HDU directo en la base (oráculo independiente de la API). */
export const hduDb = (codigo: string) => sql("SELECT * FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]);

// ---------------------------------------------------------------- arnés: ADM2, QE5 y célula de 60 caracteres
export interface ArnesE5 {
  adm2: { id: string; correo: string; token: string };
  qe5: { id: string };
  limpiar: () => Promise<void>;
}

/** Crea ADM2 (segundo Administrador) y QE5 (QE activo sin analistas) por la API. `limpiar` los borra con su auditoría. */
export async function crearArnes(request: APIRequestContext): Promise<ArnesE5> {
  const t0 = new Date();
  const adm = await tk("adm1");
  const a2 = await crearUsuarioE7(request, adm, "ADMINISTRADOR", { prefijo: "e5adm2", conContrasena: true });
  const q5 = await crearUsuarioE7(request, adm, "QE", { prefijo: "e5qe5" });
  const sesion = await sesionDe(a2.correo);
  return {
    adm2: { id: a2.id, correo: a2.correo, token: sesion.accessToken },
    qe5: { id: q5.id },
    limpiar: () => borrarUsuariosDePrueba([a2.id, q5.id], t0),
  };
}

/** Crea (con el dueño de la base) una célula de 60 caracteres con un sprint y la devuelve; `borrar` la elimina. */
export async function crearCelulaLarga(): Promise<{ id: string; nombre: string; sprintId: string; sprintNombre: string; borrar: () => Promise<void> }> {
  const nombre = "CEL-E5-" + "L".repeat(53);
  const sprintNombre = "Sprint larguísimo " + "S".repeat(40);
  const filas = await conConexion(DATABASE_URL_DUENO, async (c) => {
    const cel = await c.query("INSERT INTO organizacion.celula (id_celula, nombre, descripcion, activo) VALUES (gen_random_uuid(), $1, 'célula de prueba E5', true) RETURNING id_celula", [nombre]);
    const idCel = cel.rows[0].id_celula as string;
    const sp = await c.query(
      "INSERT INTO organizacion.sprint (id_sprint, nombre, fecha_inicio, fecha_fin, estado, id_celula) VALUES (gen_random_uuid(), $1, current_date, current_date + 14, 'ACTIVO', $2) RETURNING id_sprint",
      [sprintNombre, idCel],
    );
    return { id: idCel, sprintId: sp.rows[0].id_sprint as string };
  }).catch(async (e) => {
    throw new Error(`No se pudo crear la célula larga: ${String(e)}`);
  });
  return {
    id: filas.id, nombre, sprintId: filas.sprintId, sprintNombre,
    borrar: () => conConexion(DATABASE_URL_DUENO, async (c) => {
      await c.query("SET session_replication_role = replica");
      await c.query("DELETE FROM organizacion.sprint WHERE id_celula = $1", [filas.id]);
      await c.query("DELETE FROM organizacion.celula WHERE id_celula = $1", [filas.id]);
      await c.query("SET session_replication_role = DEFAULT");
    }),
  };
}

/** Ejecuciones del historial (todas las fases) en orden descendente. */
export async function ejecucionesPorFase(request: APIRequestContext, fase: string, clave: ClaveE7 = "adm1"): Promise<any[]> {
  const r = await api.get<any>(request, `/v1/integraciones/ejecuciones?fase=${fase}&tamanoPagina=100`, { token: await tk(clave) });
  if (r.status !== 200) throw new Error(`ejecuciones fase=${fase}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.items;
}

export const URL_GATEWAY_REAL = env.gatewayUrl;

/**
 * Estado previo del Historial (E5-F04 / E5-B04): C1 = consulta A (fase CONSULTA), R1 = su confirmación (10 creadas, CEL-C · QE2 · ANA3),
 * R2 y R3 = importaciones de archivo (fase DIRECTA) y R4 = consulta fallida por Jira caído. Orden de inicio: C1, R1, R2, R3, R4.
 */
export async function prepararR1aR4(request: APIRequestContext): Promise<{ c1: any; r1: any; r2: any; r3: any; r4: any }> {
  const { estadoConfigBase, importar } = await import("./e5");
  const { jiraFalso } = await import("./jira-falso/cliente");
  await estadoConfigBase(request);
  const c = await consultarOk(request);
  const p = await pares(request);
  const e = await editar(request, c.consulta.id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 }, marcarListas: true });
  if (e.status !== 200) throw new Error(`asignar todas: ${e.status} ${JSON.stringify(e.body)}`);
  const r1 = await confirmar(request, c.consulta.id, e.body.version);
  if (r1.status !== 200) throw new Error(`confirmar: ${r1.status} ${JSON.stringify(r1.body)}`);
  const r2 = (await importar(request, "historias-validas.csv")).body;
  const r3 = (await importar(request, "historias-con-errores.csv")).body;
  await jiraFalso.modo("CAIDO");
  const r4 = await consultar(request, {});
  await jiraFalso.modo("NORMAL");
  if (r4.status !== 200) throw new Error(`consulta fallida: ${r4.status} ${JSON.stringify(r4.body)}`);
  return { c1: c.ejecucion, r1: r1.body.ejecucion, r2, r3, r4: r4.body.ejecucion };
}

// ---------------------------------------------------------------- ayudas para los escenarios de B05 / F05
const adf = (...t: string[]) => ({ type: "doc", version: 1, content: t.map((x) => ({ type: "paragraph", content: [{ type: "text", text: x }] })) });
export const adfTexto = adf;

/** Crea una HDU a mano (como el QE indicado) y ajusta con el dueño de la base los campos que la API de creación no recibe. */
export async function crearManual(
  request: APIRequestContext, codigo: string, titulo: string,
  o: { prioridad?: string; descripcion?: string | null; qe?: ClaveE7 } = {},
): Promise<any> {
  const d = await destino(request);
  const r = await api.post<any>(request, "/v1/hdu", {
    token: await tk(o.qe ?? "qe1"),
    body: { codigo, titulo, prioridad: o.prioridad ?? "MEDIA", celulaId: d.celulaId, sprintId: d.sprint1Id },
  });
  if (r.status !== 201) throw new Error(`crearManual ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
  if (o.descripcion !== undefined) await sql("UPDATE organizacion.historia_usuario SET descripcion = $2 WHERE codigo_normalizado = lower($1)", [codigo, o.descripcion]);
  return r.body;
}

export async function conReplica<T>(fn: (c: import("pg").Client) => Promise<T>): Promise<T> {
  return conConexion(DATABASE_URL_DUENO, async (c) => {
    await c.query("SET session_replication_role = replica");
    try {
      return await fn(c);
    } finally {
      await c.query("SET session_replication_role = DEFAULT");
    }
  });
}

export const cerrarHdu = (codigo: string) =>
  conReplica((c) => c.query("UPDATE organizacion.historia_usuario SET estado = 'CERRADA' WHERE codigo_normalizado = lower($1)", [codigo]));

export const fijarActivo = (id: string, activo: boolean) =>
  conReplica((c) => c.query("UPDATE organizacion.usuario SET activo = $2 WHERE id_usuario = $1", [id, activo]));

/** Consulta A completa confirmada (10 creadas: QTY-1 y QTY-2 con QE1/ANA1 si `qe1para` las incluye) y consulta B (1 nueva, 2 cambiaron, 8 sin cambios, 1 con error). */
export async function prepararConsultaB(request: APIRequestContext, o: { baseURL?: string; qe1para?: string[] } = {}): Promise<{ consulta: any; ejecucion: any }> {
  const { jiraFalso } = await import("./jira-falso/cliente");
  const p = await pares(request);
  const a = await consultarOk(request, {}, o.baseURL);
  const id = a.consulta.id as string;
  const e1 = await editar(request, id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 }, marcarListas: true }, "adm1", o.baseURL);
  if (e1.status !== 200) throw new Error(`asignar todas: ${e1.status} ${JSON.stringify(e1.body)}`);
  if (o.qe1para?.length) {
    const ids: string[] = [];
    for (const c of o.qe1para) ids.push((await fila(request, id, c)).id);
    const e2 = await editar(request, id, { itemIds: ids, asignacion: { qeId: p.qe1, analistaId: p.ana1 }, marcada: true }, "adm1", o.baseURL);
    if (e2.status !== 200) throw new Error(`asignar QE1: ${e2.status} ${JSON.stringify(e2.body)}`);
  }
  const act = (await cabecera(request, id)).body;
  const c = await confirmar(request, id, act.version, "adm1", o.baseURL);
  if (c.status !== 200) throw new Error(`confirmar A: ${c.status} ${JSON.stringify(c.body)}`);
  await jiraFalso.issue("QTY-2", { summary: "Recuperar clave", priority: "Highest" });
  await jiraFalso.issue("QTY-1", { description: adf("Otra descripción de Jira") });
  await jiraFalso.issue("QTY-14", { tipo: "Story", summary: "Reportes por célula", priority: "Medium", description: adf("Texto") });
  return consultarOk(request, {}, o.baseURL);
}

/** Detalle de una HDU por código (API, como Auditor). */
export async function hduApi(request: APIRequestContext, codigo: string): Promise<any> {
  const { hduPorCodigo } = await import("./e5");
  return hduPorCodigo(request, codigo);
}

/** Confirma la consulta A completa (10 creadas, CEL-C · QE2 · ANA3) y deja en el falso los cambios de la consulta B, sin consultar todavía. */
export async function prepararCambiosB(request: APIRequestContext): Promise<void> {
  const { jiraFalso } = await import("./jira-falso/cliente");
  await consultaACompletaConfirmada(request);
  await jiraFalso.issue("QTY-2", { summary: "Recuperar clave", priority: "Highest" });
  await jiraFalso.issue("QTY-1", { description: adf("Otra descripción de Jira") });
  await jiraFalso.issue("QTY-14", { tipo: "Story", summary: "Reportes por célula", priority: "Medium", description: adf("Texto") });
}
