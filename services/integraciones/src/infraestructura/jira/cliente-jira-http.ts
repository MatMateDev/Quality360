/**
 * Cliente HTTP de Jira Cloud (J1, D95, D96, D105): REST v3, solo lectura, autenticación básica
 * (correo:token), `fetch` nativo y sin dependencias.
 *
 * Seguridad: el sitio se revalida en cada llamada (D95, SSRF); no se siguen redirecciones; la
 * cabecera Authorization se arma al momento y no sale de este archivo; el cuerpo de un error de Jira
 * NUNCA se lee ni se propaga (puede repetir el token): los errores son solo un código fijo.
 */
import { validarSitio } from '../../dominio/mapeo/sitio.js';
import { PATRON_CODIGO } from '../../dominio/mapeo/tipos.js';
import type {
  CodigoErrorJira, CredencialJira, EventoEspera, FuenteJira, IssueJira, OpcionesLlamada,
  PaginaJira, ResultadoJira, SprintJira,
} from '../../dominio/puertos/fuente-jira.js';

export const TAMANO_PAGINA = 50;
const REINTENTOS_429 = 2;
const PATRON_PROYECTO = /^[A-Z][A-Z0-9_]{1,9}$/;
const PATRON_CAMPO = /^customfield_[0-9]{1,9}$/;
const CAMPO_SPRINT_SCHEMA = 'com.pyxis.greenhopper.jira:gh-sprint';
const TIPO_MAX = 60;

/** Un valor que el llamador debió validar antes (error de programación, no de Jira). */
export class ParametroJiraInvalido extends Error {
  constructor(parametro: string) {
    super(`Parámetro no válido: ${parametro}`);
    this.name = 'ParametroJiraInvalido';
  }
}

export interface DependenciasCliente {
  fetch?: typeof fetch;
  /** Sale del entorno con `permitirHostPruebaEfectivo`; en producción debe ser `false` (D95). */
  permitirHostPrueba?: boolean;
  dormir?: (ms: number) => Promise<void>;
  ahora?: () => Date;
}

type Respuesta =
  | { ok: true; json: unknown; eventos: EventoEspera[] }
  | { ok: false; codigo: CodigoErrorJira; eventos: EventoEspera[] };

/** Cómo se interpreta un 404 según el recurso consultado. */
type Recurso = 'sitio' | 'proyecto';

export class ClienteJiraHttp implements FuenteJira {
  private readonly http: typeof fetch;
  private readonly permitirHostPrueba: boolean;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly ahora: () => Date;

  constructor(d: DependenciasCliente = {}) {
    this.http = d.fetch ?? globalThis.fetch.bind(globalThis);
    this.permitirHostPrueba = d.permitirHostPrueba === true;
    this.dormir = d.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.ahora = d.ahora ?? (() => new Date());
  }

  async probar(c: CredencialJira, proyecto: string, o: OpcionesLlamada) {
    this.exigir(PATRON_PROYECTO.test(proyecto), 'proyecto');
    const eventos: EventoEspera[] = [];

    const yo = await this.pedir(c, '/rest/api/3/myself', null, o, 'sitio', eventos);
    if (!yo.ok) return yo;
    const cuenta = objeto(yo.json);
    const usuarioJira = texto(cuenta?.displayName) ?? texto(cuenta?.emailAddress) ?? texto(cuenta?.accountId);
    if (usuarioJira === null) return fallo('JIRA_RESPUESTA_INVALIDA', eventos);

    const p = await this.pedir(c, `/rest/api/3/project/${encodeURIComponent(proyecto)}`, null, o, 'proyecto', eventos);
    if (!p.ok) return p;
    const datos = objeto(p.json);
    const clave = texto(datos?.key);
    const nombre = texto(datos?.name);
    if (clave === null || nombre === null) return fallo('JIRA_RESPUESTA_INVALIDA', eventos);
    return exito({ usuarioJira, proyecto: { clave, nombre } }, eventos);
  }

  async detectarCampoSprint(c: CredencialJira, o: OpcionesLlamada): Promise<ResultadoJira<string | null>> {
    const eventos: EventoEspera[] = [];
    const r = await this.pedir(c, '/rest/api/3/field', null, o, 'sitio', eventos);
    if (!r.ok) return r;
    if (!Array.isArray(r.json)) return fallo('JIRA_RESPUESTA_INVALIDA', eventos);
    const candidatos: { id: string; nombre: string | null }[] = [];
    for (const campo of r.json) {
      const f = objeto(campo);
      const id = texto(f?.id);
      if (id === null || !PATRON_CAMPO.test(id)) continue;
      if (texto(objeto(f?.schema)?.custom) === CAMPO_SPRINT_SCHEMA) candidatos.push({ id, nombre: texto(f?.name) });
    }
    const elegido = candidatos.find((x) => x.nombre === 'Sprint') ?? candidatos[0];
    return exito(elegido?.id ?? null, eventos);
  }

  async buscarPagina(
    c: CredencialJira,
    q: { proyecto: string; tipos: string[]; despuesDe?: string; nextPageToken?: string; campoSprint: string | null },
    o: OpcionesLlamada,
  ): Promise<ResultadoJira<PaginaJira>> {
    const eventos: EventoEspera[] = [];
    const parametros = new URLSearchParams({
      jql: armarJql(q.proyecto, q.tipos, q.despuesDe),
      maxResults: String(TAMANO_PAGINA),
      fields: camposPedidos(q.campoSprint),
    });
    if (q.nextPageToken !== undefined) {
      this.exigir(q.nextPageToken.length > 0 && q.nextPageToken.length <= 4000, 'nextPageToken');
      parametros.set('nextPageToken', q.nextPageToken);
    }
    const r = await this.pedir(c, '/rest/api/3/search/jql', parametros, o, 'proyecto', eventos);
    if (!r.ok) return r;

    const cuerpo = objeto(r.json);
    if (cuerpo === null || !Array.isArray(cuerpo.issues)) return fallo('JIRA_RESPUESTA_INVALIDA', eventos);
    const issues: IssueJira[] = [];
    for (const bruta of cuerpo.issues) {
      const issue = leerIssue(bruta, q.campoSprint);
      if (issue === null) return fallo('JIRA_RESPUESTA_INVALIDA', eventos);
      issues.push(issue);
    }
    const siguiente = typeof cuerpo.nextPageToken === 'string' && cuerpo.nextPageToken !== '' ? cuerpo.nextPageToken : null;
    // Sin token no hay forma de continuar, aunque `isLast` no venga o diga lo contrario.
    return exito({ issues, nextPageToken: siguiente, esUltima: cuerpo.isLast === true || siguiente === null }, eventos);
  }

  private exigir(condicion: boolean, parametro: string): void {
    if (!condicion) throw new ParametroJiraInvalido(parametro);
  }

  /** GET con límite de tiempo, reintentos de 429 y el mapa de errores fijo. */
  private async pedir(
    c: CredencialJira, ruta: string, consulta: URLSearchParams | null, o: OpcionesLlamada,
    recurso: Recurso, eventos: EventoEspera[],
  ): Promise<Respuesta> {
    const sitio = validarSitio(c.sitio, { permitirHostPrueba: this.permitirHostPrueba });
    if (!sitio.ok) return fallo('JIRA_SITIO_NO_ENCONTRADO', eventos); // sin salir a la red (D95)
    const url = `${sitio.sitio}${ruta}${consulta ? `?${consulta.toString()}` : ''}`;

    for (let intento = 0; ; intento++) {
      const limite = Math.min(o.tiempoLimiteMs, o.restanteMs());
      if (!(limite > 0)) return fallo('JIRA_TIEMPO_AGOTADO', eventos);

      let respuesta: Response;
      let texto: string | null = null;
      try {
        const autorizacion = `Basic ${Buffer.from(`${c.correo}:${c.token}`, 'utf8').toString('base64')}`;
        respuesta = await this.http(url, {
          method: 'GET',
          headers: { Authorization: autorizacion, Accept: 'application/json' },
          redirect: 'manual',
          signal: AbortSignal.timeout(limite),
        });
        if (respuesta.status >= 200 && respuesta.status < 300) texto = await respuesta.text();
      } catch (e) {
        return fallo(esTiempoAgotado(e) ? 'JIRA_TIEMPO_AGOTADO' : 'JIRA_SITIO_NO_ENCONTRADO', eventos);
      }

      const estado = respuesta.status;
      // El cuerpo de un error no se lee (D105); se cancela para liberar el socket.
      if (texto === null) void respuesta.body?.cancel().catch(() => undefined);
      if (texto !== null) {
        try {
          return { ok: true, json: JSON.parse(texto) as unknown, eventos };
        } catch {
          return fallo('JIRA_RESPUESTA_INVALIDA', eventos);
        }
      }
      if (estado === 429) {
        const esperaMs = leerRetryAfter(respuesta.headers.get('retry-after'));
        const puedeEsperar = intento < REINTENTOS_429 && esperaMs !== null && esperaMs <= o.esperaMax429Ms && esperaMs < o.restanteMs();
        if (!puedeEsperar) return fallo('JIRA_LIMITE_DE_TASA', eventos);
        eventos.push({ tipo: 'JIRA_LIMITE_DE_TASA', esperaMs, fecha: this.ahora() });
        await this.dormir(esperaMs);
        continue;
      }
      return fallo(codigoPorEstado(estado, recurso), eventos);
    }
  }
}

function codigoPorEstado(estado: number, recurso: Recurso): CodigoErrorJira {
  if (estado === 401) return 'JIRA_CREDENCIAL_INVALIDA';
  if (estado === 403) return 'JIRA_SIN_PERMISO';
  if (estado === 404) return recurso === 'proyecto' ? 'JIRA_PROYECTO_NO_ENCONTRADO' : 'JIRA_SITIO_NO_ENCONTRADO';
  if (estado >= 500 && estado <= 599) return 'JIRA_NO_DISPONIBLE';
  if (estado >= 300 && estado <= 399) return 'JIRA_SITIO_NO_ENCONTRADO'; // no se siguen redirecciones
  return 'JIRA_RESPUESTA_INVALIDA'; // por ejemplo un 400 de JQL
}

/** `Retry-After` en segundos (entero o decimal). Una fecha HTTP o un valor ausente no se espera. */
export function leerRetryAfter(valor: string | null): number | null {
  if (valor === null || !/^\s*\d+(\.\d+)?\s*$/.test(valor)) return null;
  return Math.ceil(Number(valor) * 1000);
}

function esTiempoAgotado(e: unknown): boolean {
  const nombre = e instanceof Error ? e.name : '';
  return nombre === 'TimeoutError' || nombre === 'AbortError';
}

/**
 * Consulta fija de D96, sin JQL libre. Cada valor interpolado se valida: la clave de proyecto, el
 * código de `despuesDe` y los tipos (entrecomillados; se rechazan comillas, barras y controles).
 */
export function armarJql(proyecto: string, tipos: string[], despuesDe?: string): string {
  if (!PATRON_PROYECTO.test(proyecto)) throw new ParametroJiraInvalido('proyecto');
  if (tipos.length === 0 || tipos.length > 10) throw new ParametroJiraInvalido('tipos');
  const citados = tipos.map((t) => {
    const tipo = typeof t === 'string' ? t.trim() : '';
    // eslint-disable-next-line no-control-regex
    if (tipo === '' || tipo.length > TIPO_MAX || /["\\\u0000-\u001f\u007f]/.test(tipo)) throw new ParametroJiraInvalido('tipos');
    return `"${tipo}"`;
  });
  let jql = `project = ${proyecto} AND issuetype in (${citados.join(', ')})`;
  if (despuesDe !== undefined) {
    if (despuesDe.length > 40 || !PATRON_CODIGO.test(despuesDe)) throw new ParametroJiraInvalido('despuesDe');
    jql += ` AND key > "${despuesDe}"`;
  }
  return `${jql} ORDER BY key ASC`;
}

function camposPedidos(campoSprint: string | null): string {
  if (campoSprint !== null && !PATRON_CAMPO.test(campoSprint)) throw new ParametroJiraInvalido('campoSprint');
  const base = ['summary', 'description', 'priority', 'issuetype', 'status', 'assignee'];
  return (campoSprint === null ? base : [...base, campoSprint]).join(',');
}

function leerIssue(bruta: unknown, campoSprint: string | null): IssueJira | null {
  const issue = objeto(bruta);
  const clave = texto(issue?.key);
  const campos = objeto(issue?.fields);
  if (issue === null || clave === null || campos === null) return null;
  return {
    clave,
    tipo: texto(objeto(campos.issuetype)?.name) ?? '',
    titulo: typeof campos.summary === 'string' ? campos.summary : null,
    descripcionAdf: campos.description ?? null,
    prioridad: texto(objeto(campos.priority)?.name),
    estado: texto(objeto(campos.status)?.name),
    responsable: texto(objeto(campos.assignee)?.displayName),
    sprints: campoSprint === null ? [] : leerSprints(campos[campoSprint]),
  };
}

/** En Jira Cloud el campo Sprint es una lista de objetos; lo que no tenga esa forma se descarta. */
function leerSprints(valor: unknown): SprintJira[] {
  if (!Array.isArray(valor)) return [];
  const salida: SprintJira[] = [];
  for (const s of valor) {
    const o = objeto(s);
    const nombre = texto(o?.name);
    const estado = typeof o?.state === 'string' ? o.state.toLowerCase() : '';
    if (nombre === null || (estado !== 'active' && estado !== 'future' && estado !== 'closed')) continue;
    salida.push({ nombre, estado, fin: texto(o?.endDate) ?? texto(o?.completeDate) });
  }
  return salida;
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const exito = <T>(valor: T, eventos: EventoEspera[]): ResultadoJira<T> => ({ ok: true, valor, eventos });
const fallo = (codigo: CodigoErrorJira, eventos: EventoEspera[]): { ok: false; codigo: CodigoErrorJira; eventos: EventoEspera[] } =>
  ({ ok: false, codigo, eventos });
