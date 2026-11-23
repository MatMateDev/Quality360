/**
 * Cliente HTTP de Atlassian para OAuth 2.0 (3LO) (D213, D214, ADR 0019): `fetch` nativo y sin dependencias.
 *
 * Seguridad (misma disciplina que `cliente-jira-http.ts`):
 *  - Los hosts son fijos y están escritos en el código; los de prueba (`http://127.0.0.1:<puerto>`) solo valen con la
 *    bandera de prueba, que la configuración ya apaga en producción.
 *  - `redirect: 'manual'`: una redirección es un error, nunca se sigue.
 *  - El cuerpo de un error NUNCA se lee ni se propaga (puede repetir el `code`, un token o el secreto): el resultado es
 *    una clasificación por estado HTTP.
 *  - El cuerpo de un 2xx se lee con tamaño acotado y su forma se valida; si no cumple, `RESPUESTA_INVALIDA`.
 *  - El Client secret solo viaja en el cuerpo JSON de `/oauth/token`. Ningún mensaje de este módulo trae valores.
 */
import type { AutorizadorAtlassian, FalloAtlassian, ResultadoAtlassian, TokensAtlassian } from '../../dominio/puertos/autorizador-atlassian.js';
import type { OpcionesLlamada } from '../../dominio/puertos/fuente-jira.js';
import { parsearPermisos } from '../../dominio/oauth/permisos.js';
import type { RecursoAccesible } from '../../dominio/oauth/sitios.js';
import { URL_API_ATLASSIAN, URL_AUTORIZACION_ATLASSIAN } from '../../configuracion.js';

/** Tamaño máximo de un 2xx: un token cabe en pocos KB; la lista de sitios, en unos cientos. */
export const MAX_BYTES_TOKEN = 32 * 1024;
export const MAX_BYTES_SITIOS = 256 * 1024;
const MAX_RECURSOS = 200;
const MAX_TOKEN = 8192;
const PATRON_BASE_PRUEBA = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/;

export interface DependenciasAtlassian {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  /** Base de `/oauth/token`. Por defecto `https://auth.atlassian.com`. */
  readonly urlAutorizacion?: string;
  /** Base de `/oauth/token/accessible-resources`. Por defecto `https://api.atlassian.com`. */
  readonly urlApi?: string;
  /** Debe ser `false` en producción (la configuración ya lo garantiza). */
  readonly permitirHostPrueba?: boolean;
  readonly fetch?: typeof fetch;
}

/** La base pedida solo se acepta si es el host fijo o, con la bandera, `http://127.0.0.1:<puerto>`; si no, el fijo. */
export function baseEfectiva(pedida: string | undefined, fija: string, permitirHostPrueba: boolean): string {
  if (pedida === undefined || pedida === fija) return fija;
  const puerto = PATRON_BASE_PRUEBA.exec(pedida)?.[1];
  return permitirHostPrueba && puerto !== undefined && Number(puerto) <= 65535 ? pedida : fija;
}

export class ClienteAtlassianHttp implements AutorizadorAtlassian {
  private readonly http: typeof fetch;
  private readonly base: { readonly autorizacion: string; readonly api: string };

  constructor(private readonly d: DependenciasAtlassian) {
    this.http = d.fetch ?? globalThis.fetch.bind(globalThis);
    const permitir = d.permitirHostPrueba === true;
    this.base = {
      autorizacion: baseEfectiva(d.urlAutorizacion, URL_AUTORIZACION_ATLASSIAN, permitir),
      api: baseEfectiva(d.urlApi, URL_API_ATLASSIAN, permitir),
    };
  }

  canjear(codigo: string, o: OpcionesLlamada): Promise<ResultadoAtlassian<TokensAtlassian>> {
    return this.pedirTokens(
      { grant_type: 'authorization_code', client_id: this.d.clientId, client_secret: this.d.clientSecret, code: codigo, redirect_uri: this.d.redirectUri },
      o,
    );
  }

  renovar(tokenRenovacion: string, o: OpcionesLlamada): Promise<ResultadoAtlassian<TokensAtlassian>> {
    return this.pedirTokens({ grant_type: 'refresh_token', client_id: this.d.clientId, client_secret: this.d.clientSecret, refresh_token: tokenRenovacion }, o);
  }

  async sitios(tokenAcceso: string, o: OpcionesLlamada): Promise<ResultadoAtlassian<RecursoAccesible[]>> {
    const r = await this.llamar(`${this.base.api}/oauth/token/accessible-resources`, { method: 'GET', headers: { Authorization: `Bearer ${tokenAcceso}`, Accept: 'application/json' } }, o, MAX_BYTES_SITIOS);
    if (!r.ok) return r;
    if (!Array.isArray(r.valor)) return falla('RESPUESTA_INVALIDA');
    const recursos: RecursoAccesible[] = [];
    for (const bruto of r.valor.slice(0, MAX_RECURSOS)) {
      const recurso = leerRecurso(bruto);
      if (recurso !== null) recursos.push(recurso);
    }
    return { ok: true, valor: recursos };
  }

  private async pedirTokens(cuerpo: Record<string, string>, o: OpcionesLlamada): Promise<ResultadoAtlassian<TokensAtlassian>> {
    const r = await this.llamar(
      `${this.base.autorizacion}/oauth/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(cuerpo) },
      o,
      MAX_BYTES_TOKEN,
    );
    if (!r.ok) return r;
    const t = objeto(r.valor);
    const acceso = texto(t?.access_token, MAX_TOKEN);
    if (acceso === null) return falla('RESPUESTA_INVALIDA');
    const renovacion = t?.refresh_token === undefined || t.refresh_token === null ? null : texto(t.refresh_token, MAX_TOKEN);
    if (t?.refresh_token !== undefined && t.refresh_token !== null && renovacion === null) return falla('RESPUESTA_INVALIDA');
    const expira = t?.expires_in;
    if (expira !== undefined && expira !== null && (typeof expira !== 'number' || !Number.isFinite(expira) || expira <= 0)) return falla('RESPUESTA_INVALIDA');
    const scope = t?.scope === undefined || t.scope === null ? null : typeof t.scope === 'string' && t.scope.length <= 1000 ? parsearPermisos(t.scope) : undefined;
    if (scope === undefined) return falla('RESPUESTA_INVALIDA');
    return { ok: true, valor: { tokenAcceso: acceso, tokenRenovacion: renovacion, expiraEnSegundos: typeof expira === 'number' ? expira : null, scopes: scope } };
  }

  /** Una llamada con límite de tiempo, sin seguir redirecciones y clasificada por estado. Devuelve el JSON de un 2xx. */
  private async llamar(url: string, init: RequestInit, o: OpcionesLlamada, maxBytes: number): Promise<ResultadoAtlassian<unknown>> {
    const limite = Math.min(o.tiempoLimiteMs, o.restanteMs());
    if (!(limite > 0)) return falla('TIEMPO_AGOTADO');
    let respuesta: Response;
    let contenido: string | null = null;
    try {
      respuesta = await this.http(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(limite) });
      if (respuesta.status >= 200 && respuesta.status < 300) contenido = await leerAcotado(respuesta, maxBytes);
    } catch (e) {
      return falla(esTiempoAgotado(e) ? 'TIEMPO_AGOTADO' : 'NO_DISPONIBLE');
    }
    const estado = respuesta.status;
    if (contenido === null) {
      // El cuerpo de un error no se lee; se cancela para liberar el socket.
      void respuesta.body?.cancel().catch(() => undefined);
      return falla(fallaPorEstado(estado));
    }
    try {
      return { ok: true, valor: JSON.parse(contenido) as unknown };
    } catch {
      return falla('RESPUESTA_INVALIDA');
    }
  }
}

/** Clasificación por estado HTTP (D213, D215): 400, 401 y 403 son definitivos; lo demás no toca la credencial. */
export function fallaPorEstado(estado: number): FalloAtlassian {
  if (estado === 400 || estado === 401 || estado === 403) return 'DEFINITIVO';
  if (estado === 429) return 'LIMITE_DE_TASA';
  if (estado >= 500 && estado <= 599) return 'NO_DISPONIBLE';
  return 'RESPUESTA_INVALIDA'; // redirección (no se sigue), 404, 2xx sin cuerpo útil, etc.
}

/** Lee el cuerpo hasta `maxBytes`; si lo supera devuelve `''` (no es JSON) en vez de cargarlo entero. */
async function leerAcotado(respuesta: Response, maxBytes: number): Promise<string> {
  const lector = respuesta.body?.getReader();
  if (lector === undefined) return '';
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      void lector.cancel().catch(() => undefined);
      return '';
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString('utf8');
}

function leerRecurso(bruto: unknown): RecursoAccesible | null {
  const r = objeto(bruto);
  if (r === null || typeof r.id !== 'string' || typeof r.url !== 'string') return null;
  const nombre = typeof r.name === 'string' ? r.name : '';
  const scopes = Array.isArray(r.scopes) ? r.scopes.filter((s: unknown): s is string => typeof s === 'string' && s.length <= 200).slice(0, 100) : [];
  return { id: r.id, nombre, url: r.url, scopes };
}

function esTiempoAgotado(e: unknown): boolean {
  const nombre = e instanceof Error ? e.name : '';
  return nombre === 'TimeoutError' || nombre === 'AbortError';
}

const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const falla = (fallo: FalloAtlassian): { ok: false; fallo: FalloAtlassian } => ({ ok: false, fallo });
