/**
 * Sitios accesibles de la cuenta (D212). Puro: recibe lo que devolvió `accessible-resources` y decide qué sitios son
 * candidatos. Un `cloudid` que no es UUID o una URL que no sea `https://<sub>.atlassian.net` descartan el sitio (SSRF, D213).
 */
import { PERMISOS_REQUERIDOS_POR_SITIO, permisosFaltantes } from './permisos.js';

export const MAX_SITIOS = 50;
const PATRON_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PATRON_URL = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/;
const LARGO_NOMBRE = 150;

/** Un recurso tal como lo devuelve Atlassian, ya con la forma validada por el cliente HTTP. */
export interface RecursoAccesible {
  readonly id: string;
  readonly nombre: string;
  readonly url: string;
  readonly scopes: readonly string[];
}

export interface SitioJira {
  readonly id: string;
  readonly nombre: string;
  readonly url: string;
}

export interface SitioCandidato extends SitioJira {
  readonly actual: boolean;
}

export type ResultadoSitios =
  | { readonly tipo: 'OK'; readonly sitios: SitioJira[] }
  /** Hay sitios de Jira, pero ninguno con los permisos requeridos. */
  | { readonly tipo: 'PERMISOS_INSUFICIENTES'; readonly faltantes: string[] }
  /** Ninguno es un sitio de Jira. */
  | { readonly tipo: 'SIN_SITIO' };

/** Un scope de Jira es el que nombra a Jira (`read:jira-work`, `manage:jira-project`, …); los de Confluence no cuentan. */
export function esScopeDeJira(scope: string): boolean {
  return /(^|[:_./-])jira([:_./-]|$)/.test(scope);
}

/** Forma del recurso: lo que no la cumple se descarta antes de mirar permisos. */
export function sitioValido(recurso: RecursoAccesible): boolean {
  return PATRON_UUID.test(recurso.id) && PATRON_URL.test(recurso.url) && recurso.scopes.some(esScopeDeJira);
}

/** Filtra, ordena por nombre (hasta 50) y decide entre sitios, permisos insuficientes y ningún sitio. */
export function seleccionarSitios(recursos: readonly RecursoAccesible[]): ResultadoSitios {
  const deJira = recursos.filter(sitioValido);
  if (deJira.length === 0) return { tipo: 'SIN_SITIO' };
  const completos = deJira.filter((r) => permisosFaltantes(r.scopes, PERMISOS_REQUERIDOS_POR_SITIO).length === 0);
  if (completos.length === 0) {
    // Lo que falta en el sitio al que le falta menos, para que el mensaje sea accionable.
    const faltantes = deJira.map((r) => permisosFaltantes(r.scopes, PERMISOS_REQUERIDOS_POR_SITIO)).sort((a, b) => a.length - b.length)[0] ?? [];
    return { tipo: 'PERMISOS_INSUFICIENTES', faltantes };
  }
  const unicos = new Map<string, SitioJira>();
  for (const r of completos) {
    const id = r.id.toLowerCase();
    if (unicos.has(id)) continue;
    const subdominio = r.url.slice('https://'.length, r.url.indexOf('.atlassian.net'));
    const nombre = r.nombre.trim().length > 0 ? r.nombre.trim().slice(0, LARGO_NOMBRE) : subdominio;
    unicos.set(id, { id, nombre, url: r.url });
  }
  const ordenados = [...unicos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  return { tipo: 'OK', sitios: ordenados.slice(0, MAX_SITIOS) };
}

/** Marca como `actual` el sitio ya configurado (por URL), sin elegirlo nunca por el Administrador (D212). */
export function marcarActual(sitios: readonly SitioJira[], urlActual: string | null): SitioCandidato[] {
  return sitios.map((s) => ({ ...s, actual: urlActual !== null && s.url === urlActual }));
}

export function esUuid(valor: string): boolean {
  return PATRON_UUID.test(valor);
}
