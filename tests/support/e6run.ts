import type { APIRequestContext } from "@playwright/test";
import { api, iniciarSesion, type RespuestaApi } from "./api";
import { conConexion } from "./db";
import { env } from "./env";
import { DATABASE_URL_DUENO, hdu, hoySantiago, reiniciarFixtureE4, type CodigoHdu } from "./e4";
import { limpiarE6 } from "./e6";

/**
 * Ayudantes de ejecución de la certificación de E6 (dueño: q360-qa). Reconstruidos tras perder la primera versión.
 *
 * Regla de oro: cada archivo deja el fixture como lo encontró. Un cierre es terminal por la API, así que lo que cierra una
 * HDU, aprueba un entregable o reasigna un analista restaura con el dueño de la base: `fotoE6()` antes y `restaurarE6()` después.
 */

const FIXTURE_HDU = `(SELECT id_historia FROM organizacion.historia_usuario WHERE codigo LIKE 'E7-H%')`;
const FIXTURE_CERT = `(SELECT id_certificacion FROM certificaciones.certificacion WHERE id_historia IN ${FIXTURE_HDU})`;
const FIXTURE_ENTREGABLE = `(SELECT id_entregable FROM certificaciones.entregable WHERE id_certificacion IN ${FIXTURE_CERT})`;

interface DefTabla {
  t: string;
  pk: string;
  where: string;
}

const TABLAS: DefTabla[] = [
  { t: "organizacion.historia_usuario", pk: "id_historia", where: `codigo LIKE 'E7-H%'` },
  { t: "organizacion.historia_sprint", pk: "id_historia_sprint", where: `id_historia IN ${FIXTURE_HDU}` },
  { t: "organizacion.hdu_historial_estado", pk: "id", where: `hdu_id IN ${FIXTURE_HDU}` },
  { t: "organizacion.hdu_historial_asignacion", pk: "id", where: `hdu_id IN ${FIXTURE_HDU}` },
  { t: "organizacion.hdu_historial_responsable", pk: "id", where: `hdu_id IN ${FIXTURE_HDU}` },
  { t: "organizacion.usuario", pk: "id_usuario", where: `email NOT LIKE 'qa.%'` },
  { t: "organizacion.celula", pk: "id_celula", where: "true" },
  { t: "organizacion.supervision", pk: "id_supervision", where: "true" },
  { t: "organizacion.celula_lider", pk: "id_celula_lider", where: "true" },
  { t: "certificaciones.certificacion", pk: "id_certificacion", where: `id_historia IN ${FIXTURE_HDU}` },
  { t: "certificaciones.entregable", pk: "id_entregable", where: `id_certificacion IN ${FIXTURE_CERT}` },
  { t: "certificaciones.evento_checklist", pk: "id", where: `hdu_id IN ${FIXTURE_HDU}` },
  { t: "certificaciones.evidencia", pk: "id_evidencia", where: `id_entregable IN ${FIXTURE_ENTREGABLE}` },
  { t: "certificaciones.certificado", pk: "id", where: `hdu_id IN ${FIXTURE_HDU}` },
  { t: "certificaciones.defecto", pk: "id_defecto", where: `id_certificacion IN ${FIXTURE_CERT}` },
  { t: "certificaciones.ejecucion_prueba", pk: "id_ejecucion", where: `id_certificacion IN ${FIXTURE_CERT}` },
];

export type FotoE6 = Array<{ def: DefTabla; filas: unknown[] }>;

/** Foto del estado del fixture (E7-H1..H8, sus checklists, equipos y supervisiones) con el dueño de la base. */
export async function fotoE6(): Promise<FotoE6> {
  return conConexion(DATABASE_URL_DUENO, async (c) => {
    const foto: FotoE6 = [];
    for (const def of TABLAS) {
      const r = await c.query(`SELECT to_jsonb(x) AS j FROM ${def.t} x WHERE ${def.where}`);
      foto.push({ def, filas: r.rows.map((f) => f.j) });
    }
    return foto;
  });
}

/**
 * Devuelve el fixture a la foto: borra lo creado después, repone lo cambiado, vacía `indicadores.*` y `cierre_hdu`.
 * Con `impedimentos` también recarga I1..I5 con `seed:e4` (lo usan las pruebas que resuelven, reabren o escalan).
 */
export async function restaurarE6(foto: FotoE6, opciones: { impedimentos?: boolean } = {}): Promise<void> {
  await conConexion(DATABASE_URL_DUENO, async (c) => {
    await c.query("SET session_replication_role = replica");
    try {
      // Orden inverso: primero lo dependiente.
      for (const { def, filas } of [...foto].reverse()) {
        const ids = filas.map((f) => String((f as Record<string, unknown>)[def.pk]));
        await c.query(`DELETE FROM ${def.t} WHERE (${def.where}) AND ${def.pk}::text <> ALL($1::text[])`, [ids]);
      }
      for (const { def, filas } of foto) {
        if (filas.length === 0) continue;
        const [esquema, tabla] = def.t.split(".");
        const cols = (
          await c.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position`,
            [esquema, tabla],
          )
        ).rows.map((f) => f.column_name as string);
        const lista = cols.map((n) => `"${n}"`).join(",");
        const asignar = cols.filter((n) => n !== def.pk).map((n) => `"${n}" = EXCLUDED."${n}"`).join(",");
        await c.query(
          `INSERT INTO ${def.t} (${lista}) SELECT ${lista} FROM jsonb_populate_recordset(null::${def.t}, $1::jsonb)
           ON CONFLICT (${def.pk}) DO UPDATE SET ${asignar}`,
          [JSON.stringify(filas)],
        );
      }
    } finally {
      await c.query("SET session_replication_role = origin");
    }
  });
  await limpiarE6();
  if (opciones.impedimentos) await reiniciarFixtureE4();
}

// ----------------------------------------------------------------------------------------------------- sesiones

const sesiones = new Map<string, Promise<string>>();

/** Token de cualquier usuario del fixture por la parte local de su correo (`qe3`, `lid3`, `anad`…). */
export function tkLocal(local: string): Promise<string> {
  let t = sesiones.get(local);
  if (!t) {
    t = iniciarSesion(`${local}@quality360.local`, env.contrasenaDemo).then((s) => s.accessToken);
    sesiones.set(local, t);
  }
  return t;
}

const ids = new Map<string, Promise<string>>();
/** Id de Organización de un usuario por la parte local de su correo. */
export function idLocal(request: APIRequestContext, local: string): Promise<string> {
  let p = ids.get(local);
  if (!p) {
    p = (async () => (await api.get<{ id: string }>(request, "/v1/me", { token: await tkLocal(local) })).body.id)();
    ids.set(local, p);
  }
  return p;
}

// ----------------------------------------------------------------------------------------------------- catálogos

export { hdu, hoySantiago };

let cacheCel: Promise<Record<string, string>> | undefined;
/** Ids de las células por nombre (CEL-A..CEL-D). */
export function celulas(request: APIRequestContext): Promise<Record<string, string>> {
  cacheCel ??= (async () => {
    const r = await api.get<{ items: Array<{ id: string; nombre: string }> }>(request, "/v1/catalogos/celulas", { token: await tkLocal("adm1") });
    return Object.fromEntries(r.body.items.map((c) => [c.nombre, c.id]));
  })();
  return cacheCel;
}

let cacheSprints: Promise<Array<{ id: string; nombre: string; celulaId: string }>> | undefined;
/** Id del sprint por prefijo de nombre y célula, p. ej. `sprint(request, "SP-PROX", "CEL-A")`. */
export async function sprint(request: APIRequestContext, prefijo: string, celula: string): Promise<string> {
  cacheSprints ??= (async () => (await api.get<{ sprints: Array<{ id: string; nombre: string; celulaId: string }> }>(request, "/v1/indicadores/filtros", { token: await tkLocal("aud1") })).body.sprints)();
  const c = (await celulas(request))[celula];
  const s = (await cacheSprints).find((x) => x.celulaId === c && x.nombre.startsWith(`${prefijo} ${celula}`));
  if (!s) throw new Error(`No existe el sprint ${prefijo} de ${celula}.`);
  return s.id;
}

// ----------------------------------------------------------------------------------------------------- indicadores

export const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000e60";

export function rutaInd(recurso: string, filtros: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) q.set(k, v);
  const s = q.toString();
  return `/v1/indicadores/${recurso}${s ? `?${s}` : ""}`;
}

/** GET de indicadores como el usuario dado (`undefined` = sin sesión). */
export async function ind<T = any>(request: APIRequestContext, local: string | undefined, recurso: string, filtros: Record<string, string | undefined> = {}, baseURL?: string): Promise<RespuestaApi<T>> {
  return api.get<T>(request, rutaInd(recurso, filtros), { token: local ? await tkLocal(local) : undefined, baseURL });
}

export const val = (c: { estado: string; valor: number | null }): number | null => (c.estado === "ok" ? c.valor : null);

/** Resumen de cumplimiento en la forma del backlog: totales, certificadas, cerradas con excepción, en curso, sin iniciar, bloqueadas, cumplimiento. */
export function cifras(b: any) {
  return {
    totales: val(b.hduTotales),
    certificadas: val(b.certificadas),
    cerradasExcepcion: val(b.cerradasConExcepcion),
    enCurso: val(b.enCurso),
    sinIniciar: val(b.sinIniciar),
    bloqueadas: val(b.bloqueadas),
    cumplimiento: val(b.cumplimientoPromedio),
  };
}

// ----------------------------------------------------------------------------------------------------- snapshots

/** Corre el snapshot como si fuera `instante` (gancho D184 de Indicadores; solo pruebas). */
export async function snapshotEn(instante: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${env.indicadoresUrl}/v1/interno/carga/snapshots`, {
    method: "POST",
    headers: { "x-q360-servicio-token": env.servicioToken, "Content-Type": "application/json" },
    body: JSON.stringify({ instante }),
  });
  return { status: r.status, body: await r.json().catch(() => undefined) };
}

/** Instante a las 15:00 UTC de la fecha de calendario `AAAA-MM-DD` (queda en la misma fecha de Santiago todo el año). */
export const instanteDe = (fecha: string) => `${fecha}T15:00:00.000Z`;

// ----------------------------------------------------------------------------------------------------- HDU

/**
 * Lleva una HDU del fixture a `PENDIENTE_CIERRE` con las herramientas de E2 (como su QE responsable). H5 no tiene analista:
 * se le asigna ANA1 (equipo de QE1; así ANA2 queda fuera de su ámbito) antes. Devuelve las respuestas de cada paso por si la prueba las quiere.
 */
export async function llevarAPendienteCierre(request: APIRequestContext, clave: CodigoHdu): Promise<void> {
  const h = (await hdu(request))[clave];
  const qe = await tkLocal(h.qeResponsable.correo.split("@")[0]);
  const actual = (await api.get<{ estado: string }>(request, `/v1/hdu/${h.id}`, { token: qe })).body.estado;
  if (actual === "PENDIENTE_CIERRE") return;
  if (!h.analista && actual === "PENDIENTE") {
    const a = await api.put(request, `/v1/hdu/${h.id}/analista`, { token: qe, body: { analistaId: await idLocal(request, "ana1"), motivo: "Preparación E6" } });
    if (a.status !== 200) throw new Error(`No se pudo asignar analista a ${clave}: ${a.status} ${JSON.stringify(a.body)}`);
  }
  const ruta = ["PENDIENTE", "DISENO_PRUEBAS", "EN_EJECUCION", "PENDIENTE_CIERRE"];
  for (const estado of ruta.slice(ruta.indexOf(actual) + 1)) {
    const r = await api.post(request, `/v1/hdu/${h.id}/estado`, { token: qe, body: { estado } });
    if (r.status !== 200) throw new Error(`No se pudo llevar ${clave} a ${estado}: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

export const JUSTIFICACION_40 = "Se descarta el alcance restante del sprint.";
export const justificacion = (n: number) => "J".repeat(n);

export async function estadoHdu(request: APIRequestContext, hduId: string, local = "aud1"): Promise<string> {
  return (await api.get<{ estado: string }>(request, `/v1/hdu/${hduId}`, { token: await tkLocal(local) })).body.estado;
}

/** Cuenta `cierre_hdu` con el dueño de la base. */
export function contarCierres(hduId?: string): Promise<number> {
  return conConexion(DATABASE_URL_DUENO, async (c) => Number((await c.query(`SELECT count(*) n FROM organizacion.cierre_hdu ${hduId ? "WHERE id_historia = $1" : ""}`, hduId ? [hduId] : [])).rows[0].n));
}

/** Consulta con el dueño de la base. */
export function consultaDb<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return conConexion(DATABASE_URL_DUENO, async (c) => (await c.query(sql, params)).rows as T[]);
}

/** Aprueba la clave de un entregable de una HDU con el dueño de la base: «preparación de datos» cuando el flujo real exigiría muchos pasos. */
export const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------------------------------- exportación

import { inflateSync } from "node:zlib";

export interface ArchivoExportado {
  status: number;
  tipo: string;
  disposicion: string;
  buf: Buffer;
  texto: string;
}

/** Descarga `GET /v1/indicadores/exportacion` como el usuario dado (cuerpo binario intacto). */
export async function exportar(request: APIRequestContext, local: string | undefined, params: Record<string, string | undefined>, baseURL?: string): Promise<ArchivoExportado> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  const r = await request.fetch(`${baseURL ?? env.gatewayUrl}/v1/indicadores/exportacion?${q}`, {
    method: "GET",
    headers: local ? { Authorization: `Bearer ${await tkLocal(local)}` } : {},
    failOnStatusCode: false,
  });
  const buf = Buffer.from(await r.body());
  const h = r.headers();
  return { status: r.status(), tipo: h["content-type"] ?? "", disposicion: h["content-disposition"] ?? "", buf, texto: buf.toString("utf8") };
}

/** Parser de CSV con `;`, comillas RFC 4180 y BOM. Devuelve filas de celdas. */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ";") {
      fila.push(celda);
      celda = "";
    } else if (c === "\r" && t[i + 1] === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
      i += 1;
    } else celda += c;
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** Separa un CSV de indicadores en su bloque de encabezado (clave → valor) y su tabla (primera fila = columnas). */
export function csvDeIndicadores(texto: string): { encabezado: Record<string, string>; columnas: string[]; filas: string[][] } {
  const todas = parseCsv(texto);
  const corte = todas.findIndex((f) => f.length === 1 && f[0] === "");
  const bloque = corte === -1 ? todas : todas.slice(0, corte);
  const tabla = corte === -1 ? [] : todas.slice(corte + 1).filter((f) => !(f.length === 1 && f[0] === ""));
  return { encabezado: Object.fromEntries(bloque.map((f) => [f[0], f[1] ?? ""])), columnas: tabla[0] ?? [], filas: tabla.slice(1) };
}

/** Texto de un PDF generado con pdf-lib: infla los flujos y recoge las cadenas de los operadores `Tj` y `TJ` (WinAnsi ≈ latin1). */
export function textoPdf(pdf: Buffer): string {
  const bruto = pdf.toString("latin1");
  const salida: string[] = [];
  for (const m of bruto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string;
    try {
      contenido = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      contenido = m[1];
    }
    for (const t of contenido.matchAll(/<([0-9A-Fa-f]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      if (t[1]) salida.push(Buffer.from(t[1], "hex").toString("latin1"));
      else salida.push(t[2].replace(/\\([()\\])/g, "$1"));
    }
  }
  return salida.join("\n");
}

/** Serie de tres días con H1 en 30, 30 y 40 %: los dos primeros antes de aprobar el entregable 4, el tercero después (fechas -3, -2 y -1). */
export async function serieTresDias(request: APIRequestContext): Promise<string[]> {
  const h = await hdu(request);
  const dias = [hoySantiago(-3), hoySantiago(-2), hoySantiago(-1)];
  for (const d of dias.slice(0, 2)) {
    const r = await snapshotEn(instanteDe(d));
    if (r.body?.resultado !== "EXITOSA") throw new Error(`Snapshot ${d}: ${JSON.stringify(r.body)}`);
  }
  const ap = await api.post(request, `/v1/hdu/${h.H1.id}/entregables/APROBACION_CASOS/aprobar`, { token: await tkLocal("qe1") });
  if (ap.status !== 200) throw new Error(`No se pudo aprobar el entregable 4: ${ap.status}`);
  const r = await snapshotEn(instanteDe(dias[2]));
  if (r.body?.resultado !== "EXITOSA") throw new Error(`Snapshot ${dias[2]}: ${JSON.stringify(r.body)}`);
  return dias;
}
