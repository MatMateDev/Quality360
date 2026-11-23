/**
 * Doble propio de Atlassian para las pruebas de integración de OAuth (E5, ADR 0019). Un servidor `node:http` local que habla
 * como Atlassian: `POST /oauth/token` (canje y renovación), `GET /oauth/token/accessible-resources` y `ANY /ex/jira/{cloudid}/rest/api/3/*`.
 *
 * Reproduce la ROTACIÓN: cada renovación invalida el token de renovación anterior y el de acceso anterior. Quien no guarda
 * el token nuevo (o renueva dos veces a la vez) rompe la conexión y la prueba lo ve: la segunda renovación con el token viejo
 * responde 403 `invalid_grant`. Cuenta las renovaciones y registra cada petición sin guardar nunca valores de tokens ni del secreto.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const CLIENT_ID_PRUEBA = 'q360-prueba-id';
export const CLIENT_SECRET_PRUEBA = 'secreto-de-prueba-no-real-0001';
export const REDIRECT_PRUEBA = 'http://localhost:5173/admin/integraciones/jira/oauth/retorno';
export const CLOUD_A = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
export const CLOUD_B = '2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809';

export interface SitioFalso {
  id: string;
  name: string;
  url: string;
  scopes: string[];
}

export const SITIO_A: SitioFalso = { id: CLOUD_A, name: 'empresa', url: 'https://empresa.atlassian.net', scopes: ['read:jira-work', 'read:jira-user'] };
export const SITIO_B: SitioFalso = { id: CLOUD_B, name: 'laboratorio', url: 'https://laboratorio.atlassian.net', scopes: ['read:jira-work', 'read:jira-user'] };

export type ModoAtlassian =
  | 'NORMAL'
  /** El canje responde 403. */
  | 'CANJE_RECHAZADO'
  /** El canje responde 503. */
  | 'CANJE_CAIDO'
  /** La renovación responde 403 (`invalid_grant`). */
  | 'RENOVACION_INVALID_GRANT'
  /** La renovación responde 503. */
  | 'RENOVACION_CAIDA'
  /** La renovación responde 429. */
  | 'RENOVACION_429'
  /** La renovación responde 200 con un cuerpo sin la forma de un token. */
  | 'RENOVACION_RESPUESTA_INVALIDA'
  /** El canje no trae `refresh_token`. */
  | 'SIN_REFRESH'
  /** `accessible-resources` responde 401. */
  | 'SITIOS_RECHAZADO'
  /** Redirige (302) el canje. */
  | 'REDIRECCION';

export interface SolicitudRegistrada {
  metodo: string;
  ruta: string;
  /** Solo para la API de Jira: si el Bearer era el vigente. */
  bearerValido: boolean | null;
}

export class AtlassianDoble {
  modo: ModoAtlassian = 'NORMAL';
  /** `expires_in` que entrega. Menor a 300 obliga a renovar en el siguiente uso (D214). */
  expiresIn = 3600;
  /** Retardo de la renovación (ms): abre la ventana para las pruebas de carrera. */
  retardoRenovacionMs = 0;
  sitios: SitioFalso[] = [SITIO_A];
  /** Permisos que trae el `scope` del canje; `null`: no trae `scope`. */
  scopeDelCanje: string | null = 'read:jira-work read:jira-user offline_access';
  /** Si es `false`, la API de Jira responde 401 aunque el Bearer sea el vigente (acceso revocado). */
  accesoAceptado = true;
  /** Si es `true`, `/myself` y el resto responden 401 aun con un acceso recién renovado (permisos que no alcanzan). */
  jiraRechazaSiempre = false;
  /** Si es `true`, la renovación no responde nunca (tiempo agotado del lado del servicio) y no rota nada. */
  colgarRenovacion = false;
  /** Si es `false`, la renovación no entrega `refresh_token` y el anterior sigue valiendo (Atlassian sin rotación). */
  rotarRenovacion = true;
  renovaciones = 0;
  canjes = 0;
  readonly solicitudes: SolicitudRegistrada[] = [];
  /** Los cuerpos de `/oauth/token` recibidos (con secretos): solo para que las pruebas verifiquen qué se envió; nunca se imprimen. */
  readonly cuerposToken: Array<Record<string, unknown>> = [];

  private readonly codigos = new Set<string>();
  private accesoVigente: string | null = null;
  private renovacionVigente: string | null = null;
  private servidor: Server | null = null;

  get url(): string {
    const puerto = (this.servidor?.address() as AddressInfo).port;
    return `http://127.0.0.1:${puerto}`;
  }

  /** El token de acceso vigente (solo para que una prueba lo busque en los registros y la base). */
  get accesoActual(): string | null {
    return this.accesoVigente;
  }

  get renovacionActual(): string | null {
    return this.renovacionVigente;
  }

  async iniciar(): Promise<this> {
    this.servidor = createServer((q, r) => void this.atender(q, r));
    await new Promise<void>((resolver) => this.servidor?.listen(0, '127.0.0.1', resolver));
    return this;
  }

  async cerrar(): Promise<void> {
    this.servidor?.closeAllConnections();
    await new Promise<void>((resolver) => (this.servidor ? this.servidor.close(() => resolver()) : resolver()));
  }

  reiniciar(): void {
    this.modo = 'NORMAL';
    this.expiresIn = 3600;
    this.retardoRenovacionMs = 0;
    this.sitios = [SITIO_A];
    this.scopeDelCanje = 'read:jira-work read:jira-user offline_access';
    this.accesoAceptado = true;
    this.jiraRechazaSiempre = false;
    this.colgarRenovacion = false;
    this.rotarRenovacion = true;
    this.renovaciones = 0;
    this.canjes = 0;
    this.solicitudes.length = 0;
    this.cuerposToken.length = 0;
    this.codigos.clear();
    this.accesoVigente = null;
    this.renovacionVigente = null;
  }

  /** Un `code` válido de un solo uso, como el que Atlassian entrega al volver al portal. */
  emitirCodigo(): string {
    const codigo = `codigo-${randomBytes(12).toString('hex')}`;
    this.codigos.add(codigo);
    return codigo;
  }

  /** El acceso actual deja de valer (revocado): la renovación con el token de renovación vigente sigue funcionando. */
  invalidarAcceso(): void {
    this.accesoVigente = null;
  }

  /** Cuántas veces se llamó a un endpoint (ruta exacta o prefijo). */
  llamadasA(prefijo: string): number {
    return this.solicitudes.filter((s) => s.ruta.startsWith(prefijo)).length;
  }

  private async atender(q: IncomingMessage, r: ServerResponse): Promise<void> {
    const url = new URL(q.url ?? '/', 'http://x');
    const ruta = url.pathname;
    const metodo = q.method ?? 'GET';
    const cuerpo = await leerCuerpo(q);

    if (metodo === 'POST' && ruta === '/oauth/token') return this.token(r, cuerpo);

    const bearer = (q.headers.authorization ?? '').startsWith('Bearer ') ? (q.headers.authorization ?? '').slice(7) : null;
    const valido = bearer !== null && bearer === this.accesoVigente && this.accesoAceptado;

    if (metodo === 'GET' && ruta === '/oauth/token/accessible-resources') {
      this.solicitudes.push({ metodo, ruta, bearerValido: valido });
      if (this.modo === 'SITIOS_RECHAZADO' || !valido) return responder(r, 401, null);
      return responder(r, 200, this.sitios.map((s) => ({ id: s.id, name: s.name, url: s.url, scopes: s.scopes, avatarUrl: 'https://x.invalid/a.png' })));
    }

    const coincide = /^\/ex\/jira\/([^/]+)(\/rest\/api\/3\/.*)$/.exec(ruta);
    if (coincide !== null) {
      const [, cloudId, api] = coincide;
      this.solicitudes.push({ metodo, ruta: `/ex/jira/${cloudId}${api}`, bearerValido: valido });
      if (!valido || this.jiraRechazaSiempre) return responder(r, 401, null);
      if (!this.sitios.some((s) => s.id === cloudId)) return responder(r, 404, null);
      return this.jira(r, api as string, url);
    }
    this.solicitudes.push({ metodo, ruta, bearerValido: null });
    return responder(r, 404, null);
  }

  private token(r: ServerResponse, cuerpo: string): void {
    let datos: Record<string, unknown> = {};
    try {
      datos = JSON.parse(cuerpo) as Record<string, unknown>;
    } catch {
      return responder(r, 400, { error: 'invalid_request' });
    }
    this.cuerposToken.push(datos);
    this.solicitudes.push({ metodo: 'POST', ruta: '/oauth/token', bearerValido: null });
    if (datos.client_id !== CLIENT_ID_PRUEBA || datos.client_secret !== CLIENT_SECRET_PRUEBA) return responder(r, 401, { error: 'invalid_client', error_description: 'no incluir nunca esto' });

    if (datos.grant_type === 'authorization_code') {
      if (this.modo === 'REDIRECCION') {
        r.writeHead(302, { location: 'https://evil.invalid/robar' });
        return void r.end();
      }
      if (this.modo === 'CANJE_CAIDO') return responder(r, 503, { error: 'server_error' });
      if (this.modo === 'CANJE_RECHAZADO') return responder(r, 403, { error: 'invalid_grant', error_description: `code=${String(datos.code)}` });
      const codigo = String(datos.code);
      if (datos.redirect_uri !== REDIRECT_PRUEBA || !this.codigos.delete(codigo)) return responder(r, 403, { error: 'invalid_grant' });
      this.canjes += 1;
      return responder(r, 200, this.emitir(this.scopeDelCanje, this.modo !== 'SIN_REFRESH'));
    }

    if (datos.grant_type === 'refresh_token') {
      if (this.modo === 'RENOVACION_CAIDA') return responder(r, 503, { error: 'server_error' });
      if (this.modo === 'RENOVACION_429') return responder(r, 429, { error: 'rate_limit' }, { 'retry-after': '30' });
      if (this.modo === 'RENOVACION_RESPUESTA_INVALIDA') return responder(r, 200, { inesperado: true });
      if (this.modo === 'RENOVACION_INVALID_GRANT') return responder(r, 403, { error: 'invalid_grant', error_description: `refresh_token=${String(datos.refresh_token)}` });
      if (this.colgarRenovacion) return; // sin respuesta: el cliente vence por tiempo
      const presentado = String(datos.refresh_token);
      // Rotación: solo vale el último token de renovación entregado.
      if (presentado !== this.renovacionVigente) return responder(r, 403, { error: 'invalid_grant' });
      this.renovaciones += 1;
      const emitir = (): void => responder(r, 200, this.emitir(null, this.rotarRenovacion));
      if (this.retardoRenovacionMs > 0) setTimeout(emitir, this.retardoRenovacionMs);
      else emitir();
      return;
    }
    return responder(r, 400, { error: 'unsupported_grant_type' });
  }

  /** Entrega tokens nuevos e invalida los anteriores (acceso y renovación). */
  private emitir(scope: string | null, conRenovacion: boolean): Record<string, unknown> {
    this.accesoVigente = `acceso-${randomBytes(18).toString('hex')}`;
    const cuerpo: Record<string, unknown> = { access_token: this.accesoVigente, expires_in: this.expiresIn, token_type: 'Bearer' };
    if (scope !== null) cuerpo.scope = scope;
    if (conRenovacion) {
      this.renovacionVigente = `renovacion-${randomBytes(18).toString('hex')}`;
      cuerpo.refresh_token = this.renovacionVigente;
    }
    return cuerpo;
  }

  private jira(r: ServerResponse, api: string, url: URL): void {
    if (api === '/rest/api/3/myself') return responder(r, 200, { accountId: 'cuenta-1234', displayName: 'Ana Pérez', emailAddress: 'ana@quality360.local' });
    if (api.startsWith('/rest/api/3/project/')) {
      const clave = api.slice('/rest/api/3/project/'.length);
      return clave === 'QTY' ? responder(r, 200, { key: 'QTY', name: 'Quality 360' }) : responder(r, 404, null);
    }
    if (api === '/rest/api/3/field') {
      return responder(r, 200, [
        { id: 'summary', name: 'Summary', schema: { type: 'string' } },
        { id: 'customfield_10020', name: 'Sprint', schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
      ]);
    }
    if (api === '/rest/api/3/search/jql') {
      void url;
      const issues = [1, 2, 3].map((n) => ({
        key: `QTY-${n}`,
        fields: {
          summary: `Historia QTY-${n}`,
          description: null,
          priority: { name: 'High' },
          issuetype: { name: 'Story' },
          status: { name: 'To Do' },
          assignee: { displayName: 'Dev Uno' },
          customfield_10020: [{ name: 'E5 Sprint 2', state: 'active' }],
        },
      }));
      return responder(r, 200, { issues, isLast: true });
    }
    return responder(r, 404, null);
  }
}

function leerCuerpo(q: IncomingMessage): Promise<string> {
  return new Promise((resolver) => {
    const partes: Buffer[] = [];
    q.on('data', (p: Buffer) => partes.push(p));
    q.on('end', () => resolver(Buffer.concat(partes).toString('utf8')));
  });
}

function responder(r: ServerResponse, estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): void {
  r.writeHead(estado, { 'content-type': 'application/json', ...cabeceras });
  r.end(cuerpo === null ? '' : JSON.stringify(cuerpo));
}
