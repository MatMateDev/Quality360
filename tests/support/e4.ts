import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { api } from "./api";
import { conConexion } from "./db";
import { RAIZ_REPO, env } from "./env";
import { hduFixture, tokenE7, type ClaveE7, type HduE7 } from "./e7";

/**
 * Soporte de la certificación de E4 · Impedimentos y riesgos (dueño: q360-qa).
 * Fixture: `npm run seed:e7` + `npm run seed:e4` (sección 7 de `docs/backlog/e4-impedimentos-y-riesgos.md`).
 * Las pruebas que escriben recargan el fixture con `reiniciarFixtureE4()`: vacía `impedimentos.*` con el dueño de la
 * base (`svc_impedimentos` no puede borrar, D65) y vuelve a correr `seed:e4`.
 */
export const DATABASE_URL_DUENO = process.env.DATABASE_URL_DUENO ?? "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";

export type CodigoHdu = "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7" | "H8";
export type CodigoImp = "I1" | "I2" | "I3" | "I4" | "I5";

/** Título de cada impedimento del fixture (sección 7). */
export const TITULO_IMP: Record<CodigoImp, string> = {
  I1: "Ambiente QA no responde",
  I2: "Faltan cuentas de prueba con saldo",
  I3: "API de Pagos sin sandbox",
  I4: "Criterio de aceptación ambiguo",
  I5: "Permisos de la herramienta de pruebas",
};

export function recargarE4(): void {
  // Defecto DEF-E4-01 (q360-integraciones): infrastructure/seed/e4/cargar.mjs lee solo la primera página (100) de GET /v1/hdu y falla
  // con «Faltan las HDU H1…H8» cuando la base compartida pasa de 100 HDU. Para no depender de eso se ejecuta una copia en memoria
  // del mismo script con la única diferencia de recorrer todas las páginas (no se modifica el código del repositorio).
  const dir = path.join(RAIZ_REPO, "infrastructure", "seed", "e4");
  let fuente = readFileSync(path.join(dir, "cargar.mjs"), "utf8");
  const original = "const pagina = exigir(await http(ORG, 'GET', '/v1/hdu?tamanoPagina=100', { cabeceras: admin }), 'listar HDU');";
  if (!fuente.includes(original)) {
    // DEF-E4-01 quedó corregido en la semilla (commit cdb28be: recorre todas las páginas): ya no hace falta la copia parchada, se ejecuta tal cual.
    const directo = spawnSync(process.execPath, ["--env-file-if-exists=infrastructure/seed/mvp/.env.carga", path.join(dir, "cargar.mjs"), "--sin-verificar"], { cwd: RAIZ_REPO, encoding: "utf8" });
    if (directo.status !== 0) throw new Error(`seed:e4 falló: ${directo.stdout}
${directo.stderr}`);
    return;
  }
  fuente = fuente
    .replace(original, "const pagina = { items: [] }; for (let p = 1; p <= 100; p += 1) { const r = exigir(await http(ORG, 'GET', `/v1/hdu?pagina=${p}&tamanoPagina=100`, { cabeceras: admin }), 'listar HDU'); pagina.items.push(...r.items); if (pagina.items.length >= r.total || r.items.length === 0) break; }")
    .replace("const aqui = dirname(fileURLToPath(import.meta.url));", `const aqui = ${JSON.stringify(dir)};`);
  const copia = path.join(RAIZ_REPO, "tests", "test-results", "cargar-e4-paginado.mjs");
  mkdirSync(path.dirname(copia), { recursive: true });
  writeFileSync(copia, fuente);
  const r = spawnSync(process.execPath, ["--env-file-if-exists=infrastructure/seed/mvp/.env.carga", copia, "--sin-verificar"], { cwd: RAIZ_REPO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed:e4 falló: ${r.stdout}
${r.stderr}`);
}

let cacheImp: Promise<Record<CodigoImp, ImpedimentoApi>> | undefined;

/** Vacía las tres tablas de Impedimentos con el dueño de la base y recarga el fixture E4. */
export async function reiniciarFixtureE4(): Promise<void> {
  await conConexion(DATABASE_URL_DUENO, async (c) => {
    await c.query("TRUNCATE impedimentos.accion_impedimento, impedimentos.impedimento, impedimentos.riesgo_hdu CASCADE");
  });
  recargarE4();
  cacheImp = undefined;
}

export interface AccionApi {
  id: string;
  tipo: string;
  estadoAnterior: string | null;
  estado: string;
  actor: { id: string; nombre: string; rol: string };
  fecha: string;
  comentario: string;
  detalle: { responsableAnterior: { id: string | null; nombre: string }; responsableNuevo: { id: string | null; nombre: string } } | null;
}

export interface ImpedimentoApi {
  id: string;
  hduId: string;
  certificacionId: string | null;
  tipo: string;
  titulo: string;
  descripcion: string;
  estado: "ABIERTO" | "ESCALADO" | "RESUELTO";
  responsable: { id: string | null; nombre: string; externo: boolean };
  creadoPor: { id: string; nombre: string; rol: string };
  fechaRegistro: string;
  abiertoDesde: string;
  fechaResolucion: string | null;
  diasAbierto: number;
  esNuevo: boolean;
  actualizadoEn: string;
  operacionesPermitidas: string[];
  acciones?: AccionApi[];
}

/** Códigos H1..H8 del fixture (`E7-H<n>`). */
export async function hdu(request: APIRequestContext): Promise<Record<CodigoHdu, HduE7>> {
  const h = await hduFixture(request);
  return { H1: h["E7-H1"], H2: h["E7-H2"], H3: h["E7-H3"], H4: h["E7-H4"], H5: h["E7-H5"], H6: h["E7-H6"], H7: h["E7-H7"], H8: h["E7-H8"] };
}

/** I1..I5 del fixture (por título), con la lectura global del Auditor. Se invalida con `reiniciarFixtureE4`. */
export function imps(request: APIRequestContext): Promise<Record<CodigoImp, ImpedimentoApi>> {
  cacheImp ??= (async () => {
    const token = await tokenE7("aud1");
    const r = await api.get<{ items: ImpedimentoApi[] }>(request, "/v1/auditor/impedimentos?tamanoPagina=100", { token });
    if (r.status !== 200) throw new Error(`No se pudo listar los impedimentos: ${r.status} ${JSON.stringify(r.body)}`);
    const salida = {} as Record<CodigoImp, ImpedimentoApi>;
    for (const [codigo, titulo] of Object.entries(TITULO_IMP) as Array<[CodigoImp, string]>) {
      const i = r.body.items.find((x) => x.titulo === titulo);
      if (!i) throw new Error(`Falta ${codigo} («${titulo}») del fixture: ejecuta npm run seed:e4.`);
      salida[codigo] = i;
    }
    return salida;
  })();
  return cacheImp;
}

/** Consulta numérica con el dueño de la base (oráculo independiente de la API). */
export function contarDb(sql: string, params: unknown[] = []): Promise<number> {
  return conConexion(DATABASE_URL_DUENO, async (c) => Number((await c.query(sql, params)).rows[0].n));
}

/** «Hoy» en America/Santiago como AAAA-MM-DD, desplazado en días. */
export function hoySantiago(desplazarDias = 0): string {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(a, m - 1, d + desplazarDias)).toISOString().slice(0, 10);
}

export const texto = (n: number, base = "x") => base.repeat(n).slice(0, n);

const cacheUid = new Map<string, Promise<string>>();
/** Id de Organización de un usuario del fixture (por `GET /v1/me`). */
export function uid(request: APIRequestContext, clave: ClaveE7): Promise<string> {
  let p = cacheUid.get(clave);
  if (!p) {
    p = (async () => (await api.get<{ id: string }>(request, "/v1/me", { token: await tokenE7(clave) })).body.id)();
    cacheUid.set(clave, p);
  }
  return p;
}

/** Evaluación interna de Impedimentos (D69), llamada directo al servicio con el token del usuario. */
export async function evaluar(
  token: string,
  hdus: Array<{ hduId: string; estado: string; sprintFin?: string | null; avance?: number | null }>,
  incluirImpedimentos = false,
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${env.impedimentosUrl}/v1/interno/impedimentos/evaluacion`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-trace-id": "qa-e4" },
    body: JSON.stringify({ hdu: hdus.map((h) => ({ sprintFin: null, avance: null, ...h })), incluirImpedimentos }),
  });
  return { status: r.status, body: await r.json().catch(() => undefined) };
}

/** Días de calendario (America/Santiago) entre una fecha ISO y hoy (D74): el fixture registra I1 «hace 2 horas», que tras la medianoche ya es 1 día. */
export function diasCalendario(iso: string): number {
  const dia = (d: Date) => {
    const [a, m, n] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
    return Date.UTC(a, m - 1, n);
  };
  return Math.round((dia(new Date()) - dia(new Date(iso))) / 86_400_000);
}
