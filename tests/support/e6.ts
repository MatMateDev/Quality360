import type { APIRequestContext } from "@playwright/test";
import { api } from "./api";
import { conConexion } from "./db";
import { DATABASE_URL_DUENO, hoySantiago, recargarE4, reiniciarFixtureE4 } from "./e4";
import { celulasFixture, tokenE7, type ClaveE7 } from "./e7";

/**
 * Soporte de la certificación de E6 · Indicadores y dashboards (dueño: q360-qa). Solo preparación (Q1): la Ola 7 completa los casos.
 *
 * Estado base (sección 8 del backlog E6): fixture E7 + E4 (H1..H8, I1..I5, sprints SP-*) + `seed:e6` (QE3, CEL-D con LID2, ANA4).
 * Reglas de limpieza (plan de construcción, «q360-qa»):
 *  - `indicadores.*` y `organizacion.cierre_hdu` se vacían como dueño de la base, nunca por API.
 *  - Un cierre es terminal (`CERRADA`): todo archivo que cierre una HDU recarga la semilla con `recargarSemillaE6()` al terminar.
 */
export const DUENO = DATABASE_URL_DUENO;

/** Tablas del esquema `indicadores` que las pruebas pueden haber llenado (modelo en la sección 5 del backlog). */
const TABLAS_INDICADORES = ["snapshot_indicadores", "ejecucion_snapshot", "umbral_carga", "evento_umbral_carga"] as const;

export const tk = (clave: ClaveE7) => tokenE7(clave);
export { hoySantiago };

/** Cifras esperadas del estado base (sección 8), fuente única para las pruebas de E6. */
export const ESPERADO = {
  qe1: { totales: 5, certificadas: 1, cerradasExcepcion: 0, enCurso: 3, sinIniciar: 1, bloqueadas: 2, cumplimiento: 44.0 },
  qe2: { totales: 3, certificadas: 1, cerradasExcepcion: 0, enCurso: 1, sinIniciar: 1, bloqueadas: 1, cumplimiento: 33.3 },
  lid1: { totales: 6, certificadas: 1, cerradasExcepcion: 0, enCurso: 3, sinIniciar: 2, bloqueadas: 3, cumplimiento: 36.7 },
  aud1: { totales: 8, certificadas: 2, cerradasExcepcion: 0, enCurso: 4, sinIniciar: 2, bloqueadas: 3, cumplimiento: 40.0 },
} as const;

/** Menús exactos por rol tras E6 (diseño 2.2; brecha 10: el QE conserva «Integraciones» que trajo E5). */
export const MENU = {
  ANALISTA_QA: ["Bandeja", "Mis HDU", "Perfil"],
  QE: ["Bandeja", "Equipo", "Historias supervisadas", "Impedimentos", "Indicadores", "Integraciones", "Perfil"],
  LIDER_QA: ["Bandeja", "Indicadores", "Perfil"],
  AUDITOR: ["Bandeja", "Indicadores", "Perfil"],
  ADMINISTRADOR: ["Bandeja", "Usuarios", "Supervisión", "Integraciones", "Snapshots de indicadores", "Perfil"],
} as const;

/** Rutas nuevas de E6 y el único rol que entra a cada una (se suman a la matriz de E7-F01-T04). */
export const RUTAS_E6 = [
  { ruta: "/qe/indicadores", rol: "QE" },
  { ruta: "/lider/indicadores", rol: "LIDER_QA" },
  { ruta: "/auditor/indicadores", rol: "AUDITOR" },
  { ruta: "/admin/indicadores/snapshots", rol: "ADMINISTRADOR" },
] as const;

/** Vacía `indicadores.*` y `organizacion.cierre_hdu` con el dueño de la base (nunca por API). */
export async function limpiarE6(): Promise<void> {
  await conConexion(DUENO, async (c) => {
    for (const t of TABLAS_INDICADORES) {
      try {
        await c.query(`TRUNCATE indicadores.${t} CASCADE`);
      } catch (e) {
        // La tabla no existe si la migración de Indicadores no se aplicó: se informa, no se oculta.
        throw new Error(`limpiarE6: no se pudo vaciar indicadores.${t} (${(e as Error).message}). ¿Se aplicó 20261104000000_e6_indicadores?`);
      }
    }
    await c.query("TRUNCATE organizacion.cierre_hdu CASCADE");
  });
}

/**
 * Recarga la semilla tras un cierre (terminal): vacía lo de E6 y rehace el fixture de E4 (H1..H8 e impedimentos).
 * Las HDU cerradas por una prueba no se reabren por la API; si el estado base no vuelve, la prueba debe fallar y no suponerlo.
 */
export async function recargarSemillaE6(): Promise<void> {
  await limpiarE6();
  await reiniciarFixtureE4();
  recargarE4();
}

/** Consulta numérica con el dueño de la base (oráculo independiente de la API). */
export function contarDb(sql: string, params: unknown[] = []): Promise<number> {
  return conConexion(DUENO, async (c) => Number((await c.query(sql, params)).rows[0].n));
}

/** Células por nombre: CEL-A..CEL-C del fixture E7 y CEL-D (la crea `seed:e6`; `undefined` si falta la semilla). */
export async function celulasE6(request: APIRequestContext) {
  const base = await celulasFixture(request);
  const r = await api.get<{ items: Array<{ id: string; nombre: string }> }>(request, "/v1/catalogos/celulas", { token: await tokenE7("adm1") });
  return { ...base, "CEL-D": r.body.items?.find((c) => c.nombre === "CEL-D") };
}

/** Ruta de una consulta de indicadores con filtros opcionales (los vacíos se omiten). */
export function rutaIndicadores(recurso: string, filtros: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) q.set(k, v);
  const s = q.toString();
  return `/v1/indicadores/${recurso}${s ? `?${s}` : ""}`;
}
