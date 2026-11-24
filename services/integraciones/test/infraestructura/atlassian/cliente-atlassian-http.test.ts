/**
 * Cliente HTTP de Atlassian (JO4, E5-B08 #2, #4, #7, #10, #14): `fetch` simulado, sin red, más el doble local de Atlassian
 * para el recorrido real (un socket, redirecciones, cuerpos grandes). Hosts fijos, sin seguir redirecciones, cuerpo de
 * error nunca leído, 2xx acotado y validado, clasificación por estado.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { OpcionesLlamada } from '../../../src/dominio/puertos/fuente-jira.js';
import { ClienteAtlassianHttp, MAX_BYTES_TOKEN, baseEfectiva, fallaPorEstado } from '../../../src/infraestructura/atlassian/cliente-atlassian-http.js';
import { AtlassianDoble, CLIENT_ID_PRUEBA, CLIENT_SECRET_PRUEBA, CLOUD_A, REDIRECT_PRUEBA } from '../../atlassian-doble.js';

const opciones = (c: Partial<OpcionesLlamada> = {}): OpcionesLlamada => ({ tiempoLimiteMs: 3000, esperaMax429Ms: 0, restanteMs: () => 8000, ...c });
const SECRETO_RECIBIDO = 'secreto-de-prueba-no-real-0001';

interface Llamada { url: URL; init: RequestInit }
type Respuestas = (Response | Error)[];

function falso(respuestas: Respuestas, extra: Partial<ConstructorParameters<typeof ClienteAtlassianHttp>[0]> = {}) {
  const llamadas: Llamada[] = [];
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: new URL(String(entrada)), init: init ?? {} });
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return r as Response;
  }) as typeof fetch;
  const cliente = new ClienteAtlassianHttp({ clientId: CLIENT_ID_PRUEBA, clientSecret: SECRETO_RECIBIDO, redirectUri: REDIRECT_PRUEBA, fetch: fetchFalso, ...extra });
  return { cliente, llamadas };
}
const json = (cuerpo: unknown, estado = 200): Response => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } });
const vacio = (estado: number, cabeceras: Record<string, string> = {}): Response => new Response(null, { status: estado, headers: cabeceras });
const error = (nombre: string): Error => Object.assign(new Error('x'), { name: nombre });
const TOKENS = { access_token: 'acceso-1', refresh_token: 'renovacion-1', expires_in: 3600, scope: 'read:jira-work read:jira-user offline_access' };

describe('canje y renovación (POST /oauth/token)', () => {
  it('el canje envía JSON con grant_type, client_id, client_secret, code y redirect_uri al host fijo', async () => {
    const { cliente, llamadas } = falso([json(TOKENS)]);
    const r = await cliente.canjear('codigo-1', opciones());
    assert.deepEqual(r, { ok: true, valor: { tokenAcceso: 'acceso-1', tokenRenovacion: 'renovacion-1', expiraEnSegundos: 3600, scopes: ['read:jira-work', 'read:jira-user', 'offline_access'] } });
    const l = llamadas[0] as Llamada;
    assert.equal(l.url.origin + l.url.pathname, 'https://auth.atlassian.com/oauth/token');
    assert.equal(l.init.method, 'POST');
    assert.equal((l.init.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.equal(l.init.redirect, 'manual');
    assert.ok(l.init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(l.init.body as string), { grant_type: 'authorization_code', client_id: CLIENT_ID_PRUEBA, client_secret: SECRETO_RECIBIDO, code: 'codigo-1', redirect_uri: REDIRECT_PRUEBA });
    // El secreto solo viaja en el cuerpo: ni en la dirección ni en cabeceras.
    assert.equal(l.url.search, '');
    assert.equal(JSON.stringify(l.init.headers).includes(SECRETO_RECIBIDO), false);
  });

  it('la renovación envía grant_type refresh_token con el token de renovación', async () => {
    const { cliente, llamadas } = falso([json({ access_token: 'acceso-2', refresh_token: 'renovacion-2', expires_in: 3600 })]);
    const r = await cliente.renovar('renovacion-1', opciones());
    assert.deepEqual(r, { ok: true, valor: { tokenAcceso: 'acceso-2', tokenRenovacion: 'renovacion-2', expiraEnSegundos: 3600, scopes: null } });
    assert.deepEqual(JSON.parse((llamadas[0] as Llamada).init.body as string), { grant_type: 'refresh_token', client_id: CLIENT_ID_PRUEBA, client_secret: SECRETO_RECIBIDO, refresh_token: 'renovacion-1' });
  });

  it('sin refresh_token en la respuesta: tokenRenovacion null (la aplicación conserva el anterior)', async () => {
    const { cliente } = falso([json({ access_token: 'a', expires_in: 60 })]);
    const r = await cliente.renovar('x', opciones());
    assert.deepEqual(r, { ok: true, valor: { tokenAcceso: 'a', tokenRenovacion: null, expiraEnSegundos: 60, scopes: null } });
  });

  it('400, 401 y 403 son definitivos; 429, 5xx, red y tiempo no tocan la credencial', async () => {
    for (const [estado, esperado] of [[400, 'DEFINITIVO'], [401, 'DEFINITIVO'], [403, 'DEFINITIVO'], [429, 'LIMITE_DE_TASA'], [500, 'NO_DISPONIBLE'], [503, 'NO_DISPONIBLE'], [404, 'RESPUESTA_INVALIDA'], [302, 'RESPUESTA_INVALIDA']] as const) {
      const { cliente } = falso([vacio(estado)]);
      assert.deepEqual(await cliente.renovar('x', opciones()), { ok: false, fallo: esperado }, String(estado));
      assert.equal(fallaPorEstado(estado), esperado);
    }
    assert.deepEqual(await falso([error('TimeoutError')]).cliente.renovar('x', opciones()), { ok: false, fallo: 'TIEMPO_AGOTADO' });
    assert.deepEqual(await falso([error('TypeError')]).cliente.renovar('x', opciones()), { ok: false, fallo: 'NO_DISPONIBLE' });
    assert.deepEqual(await falso([vacio(200)]).cliente.renovar('x', opciones()), { ok: false, fallo: 'RESPUESTA_INVALIDA' });
  });

  it('el cuerpo de un error nunca se lee: el resultado no trae texto de Atlassian', async () => {
    let leido = false;
    const cuerpo = new Response(
      new ReadableStream({
        pull(c) {
          leido = true;
          c.enqueue(new TextEncoder().encode(JSON.stringify({ error: 'invalid_grant', error_description: `refresh_token=renovacion-1 ${SECRETO_RECIBIDO}` })));
          c.close();
        },
        cancel() {},
      }, { highWaterMark: 0 }),
      { status: 403 },
    );
    const r = await falso([cuerpo]).cliente.renovar('renovacion-1', opciones());
    assert.deepEqual(r, { ok: false, fallo: 'DEFINITIVO' });
    assert.equal(JSON.stringify(r).includes('renovacion-1'), false);
    assert.equal(JSON.stringify(r).includes(SECRETO_RECIBIDO), false);
    assert.equal(leido, false);
  });

  it('un 2xx con forma inesperada es RESPUESTA_INVALIDA', async () => {
    for (const cuerpo of [{}, { access_token: '' }, { access_token: 7 }, { access_token: 'a', refresh_token: 5 }, { access_token: 'a', expires_in: 'x' }, { access_token: 'a', expires_in: -1 }, { access_token: 'a', scope: 9 }, [], 'texto']) {
      const r = await falso([json(cuerpo)]).cliente.canjear('c', opciones());
      assert.deepEqual(r, { ok: false, fallo: 'RESPUESTA_INVALIDA' }, JSON.stringify(cuerpo));
    }
    assert.deepEqual(await falso([new Response('no es json', { status: 200 })]).cliente.canjear('c', opciones()), { ok: false, fallo: 'RESPUESTA_INVALIDA' });
  });

  it('un 2xx de más de 32 KB se descarta sin cargarlo entero', async () => {
    const grande = JSON.stringify({ access_token: 'a'.repeat(MAX_BYTES_TOKEN + 10) });
    assert.deepEqual(await falso([new Response(grande, { status: 200 })]).cliente.canjear('c', opciones()), { ok: false, fallo: 'RESPUESTA_INVALIDA' });
  });

  it('sin presupuesto no sale a la red', async () => {
    const { cliente, llamadas } = falso([json(TOKENS)]);
    assert.deepEqual(await cliente.canjear('c', opciones({ restanteMs: () => 0 })), { ok: false, fallo: 'TIEMPO_AGOTADO' });
    assert.equal(llamadas.length, 0);
  });
});

describe('sitios accesibles (GET /oauth/token/accessible-resources)', () => {
  it('Bearer al host fijo; valida la forma y descarta lo que no la cumple sin fallar', async () => {
    const { cliente, llamadas } = falso([json([{ id: CLOUD_A, name: 'empresa', url: 'https://empresa.atlassian.net', scopes: ['read:jira-work', 7, 'read:jira-user'], avatarUrl: 'x' }, { id: 5 }, 'texto', null])]);
    const r = await cliente.sitios('acceso-1', opciones());
    assert.deepEqual(r, { ok: true, valor: [{ id: CLOUD_A, nombre: 'empresa', url: 'https://empresa.atlassian.net', scopes: ['read:jira-work', 'read:jira-user'] }] });
    const l = llamadas[0] as Llamada;
    assert.equal(l.url.origin + l.url.pathname, 'https://api.atlassian.com/oauth/token/accessible-resources');
    assert.equal(l.init.method, 'GET');
    assert.equal((l.init.headers as Record<string, string>).Authorization, 'Bearer acceso-1');
    assert.equal(l.init.redirect, 'manual');
  });

  it('401 y 403 son definitivos; un objeto en vez de una lista es RESPUESTA_INVALIDA', async () => {
    assert.deepEqual(await falso([vacio(401)]).cliente.sitios('a', opciones()), { ok: false, fallo: 'DEFINITIVO' });
    assert.deepEqual(await falso([vacio(403)]).cliente.sitios('a', opciones()), { ok: false, fallo: 'DEFINITIVO' });
    assert.deepEqual(await falso([json({ id: CLOUD_A })]).cliente.sitios('a', opciones()), { ok: false, fallo: 'RESPUESTA_INVALIDA' });
  });
});

describe('hosts fijos (D213)', () => {
  it('una base de prueba solo vale con la bandera y como http://127.0.0.1:<puerto>', () => {
    assert.equal(baseEfectiva(undefined, 'https://auth.atlassian.com', false), 'https://auth.atlassian.com');
    assert.equal(baseEfectiva('http://127.0.0.1:4011', 'https://auth.atlassian.com', true), 'http://127.0.0.1:4011');
    for (const mala of ['http://127.0.0.1:4011', 'https://evil.example.com', 'http://localhost:4011', 'http://127.0.0.1:4011/x']) {
      assert.equal(baseEfectiva(mala, 'https://auth.atlassian.com', mala === 'http://127.0.0.1:4011' ? false : true), 'https://auth.atlassian.com', mala);
    }
  });

  it('el cliente ignora una base no permitida y llama al host fijo', async () => {
    const { cliente, llamadas } = falso([json(TOKENS)], { urlAutorizacion: 'https://evil.example.com', urlApi: 'http://127.0.0.1:1', permitirHostPrueba: false });
    await cliente.canjear('c', opciones());
    await cliente.sitios('a', opciones());
    assert.equal((llamadas[0] as Llamada).url.origin, 'https://auth.atlassian.com');
    assert.equal((llamadas[1] as Llamada).url.origin, 'https://api.atlassian.com');
  });
});

describe('contra el doble local de Atlassian', () => {
  const doble = new AtlassianDoble();
  before(async () => {
    await doble.iniciar();
  });
  after(async () => {
    await doble.cerrar();
  });

  const real = () => new ClienteAtlassianHttp({ clientId: CLIENT_ID_PRUEBA, clientSecret: CLIENT_SECRET_PRUEBA, redirectUri: REDIRECT_PRUEBA, urlAutorizacion: doble.url, urlApi: doble.url, permitirHostPrueba: true });

  it('canje, sitios y renovación con rotación: el token de renovación anterior deja de servir', async () => {
    doble.reiniciar();
    const c = real();
    const canje = await c.canjear(doble.emitirCodigo(), opciones());
    assert.equal(canje.ok, true);
    if (!canje.ok) return;
    const sitios = await c.sitios(canje.valor.tokenAcceso, opciones());
    assert.equal(sitios.ok, true);
    const renovado = await c.renovar(canje.valor.tokenRenovacion as string, opciones());
    assert.equal(renovado.ok, true);
    assert.equal(doble.renovaciones, 1);
    // Rotación: usar el token viejo de nuevo es un fallo definitivo.
    assert.deepEqual(await c.renovar(canje.valor.tokenRenovacion as string, opciones()), { ok: false, fallo: 'DEFINITIVO' });
    // Y el acceso anterior ya no vale en accessible-resources.
    assert.deepEqual(await c.sitios(canje.valor.tokenAcceso, opciones()), { ok: false, fallo: 'DEFINITIVO' });
  });

  it('no sigue una redirección (302) ni la trata como éxito', async () => {
    doble.reiniciar();
    doble.modo = 'REDIRECCION';
    assert.deepEqual(await real().canjear(doble.emitirCodigo(), opciones()), { ok: false, fallo: 'RESPUESTA_INVALIDA' });
  });

  it('un code reutilizado o un secreto equivocado son definitivos', async () => {
    doble.reiniciar();
    const c = real();
    const codigo = doble.emitirCodigo();
    assert.equal((await c.canjear(codigo, opciones())).ok, true);
    assert.deepEqual(await c.canjear(codigo, opciones()), { ok: false, fallo: 'DEFINITIVO' });
    const malo = new ClienteAtlassianHttp({ clientId: CLIENT_ID_PRUEBA, clientSecret: 'otro', redirectUri: REDIRECT_PRUEBA, urlAutorizacion: doble.url, urlApi: doble.url, permitirHostPrueba: true });
    assert.deepEqual(await malo.canjear(doble.emitirCodigo(), opciones()), { ok: false, fallo: 'DEFINITIVO' });
  });
});
