/**
 * Pruebas unitarias del cliente HTTP de Jira (J1): `fetch` simulado, sin red, más un servidor
 * `node:http` mínimo en 127.0.0.1 para los casos que necesitan un socket real (tiempo, puerto cerrado).
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';

import type { CredencialJira, OpcionesLlamada } from '../../../src/dominio/puertos/fuente-jira.js';
import { ClienteJiraHttp, ParametroJiraInvalido, armarJql, leerRetryAfter } from '../../../src/infraestructura/jira/cliente-jira-http.js';

const SITIO = 'https://equipo.atlassian.net';
const TOKEN = 'q360-token-secreto-AB12';
const CRED: CredencialJira = { sitio: SITIO, correo: 'admin@quality360.local', token: TOKEN };
const BASICA = `Basic ${Buffer.from(`admin@quality360.local:${TOKEN}`).toString('base64')}`;

const opciones = (c: Partial<OpcionesLlamada> = {}): OpcionesLlamada => ({ tiempoLimiteMs: 3000, esperaMax429Ms: 3000, restanteMs: () => 8000, ...c });

interface Llamada { url: URL; init: RequestInit }
type Respuestas = (Response | Error | ((l: Llamada) => Response | Error))[];

/** `fetch` falso: entrega las respuestas en orden y registra cada llamada. */
function falso(respuestas: Respuestas) {
  const llamadas: Llamada[] = [];
  const fetchFalso = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const l: Llamada = { url: new URL(String(entrada)), init: init ?? {} };
    llamadas.push(l);
    const siguiente = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    const r = typeof siguiente === 'function' ? siguiente(l) : siguiente;
    if (r instanceof Error) throw r;
    return r as Response;
  }) as typeof fetch;
  const dormidos: number[] = [];
  const cliente = new ClienteJiraHttp({ fetch: fetchFalso, dormir: async (ms) => { dormidos.push(ms); }, ahora: () => new Date('2026-10-30T12:00:00Z') });
  return { cliente, llamadas, dormidos };
}
const json = (cuerpo: unknown, estado = 200, cabeceras: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json', ...cabeceras } });
const vacio = (estado: number, cabeceras: Record<string, string> = {}): Response => new Response(null, { status: estado, headers: cabeceras });
const error = (nombre: string): Error => Object.assign(new Error('x'), { name: nombre });

const YO = { accountId: 'abc', displayName: 'Admin Jira Falso' };
const PROYECTO = { key: 'QTY', name: 'Quality 360' };
const issue = (clave: string, c: Record<string, unknown> = {}) => ({
  key: clave,
  fields: {
    summary: `Historia ${clave}`, description: { type: 'doc', version: 1, content: [] }, priority: { name: 'High' },
    issuetype: { name: 'Story' }, status: { name: 'To Do' }, assignee: { displayName: 'Ana' }, ...c,
  },
});
const consulta = { proyecto: 'QTY', tipos: ['Story', 'Historia'], campoSprint: 'customfield_10020' };

describe('probar', () => {
  it('hace exactamente 2 llamadas: myself y project', async () => {
    const { cliente, llamadas } = falso([json(YO), json(PROYECTO)]);
    const r = await cliente.probar(CRED, 'QTY', opciones());
    assert.deepEqual(r, { ok: true, valor: { usuarioJira: 'Admin Jira Falso', proyecto: { clave: 'QTY', nombre: 'Quality 360' } }, eventos: [] });
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0]?.url.pathname, '/rest/api/3/myself');
    assert.equal(llamadas[1]?.url.pathname, '/rest/api/3/project/QTY');
  });

  it('autenticación básica correo:token, GET y sin seguir redirecciones', async () => {
    const { cliente, llamadas } = falso([json(YO), json(PROYECTO)]);
    await cliente.probar(CRED, 'QTY', opciones());
    for (const l of llamadas) {
      assert.equal(l.init.method, 'GET');
      assert.equal((l.init.headers as Record<string, string>).Authorization, BASICA);
      assert.equal((l.init.headers as Record<string, string>).Accept, 'application/json');
      assert.equal(l.init.redirect, 'manual');
      assert.ok(l.init.signal instanceof AbortSignal);
      assert.equal(l.url.origin, SITIO);
      assert.equal(l.url.search, '');
    }
  });

  it('401 en myself: credencial inválida y no consulta el proyecto', async () => {
    const { cliente, llamadas } = falso([vacio(401)]);
    const r = await cliente.probar(CRED, 'QTY', opciones());
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_CREDENCIAL_INVALIDA', eventos: [] });
    assert.equal(llamadas.length, 1);
  });

  it('404 de myself: sitio; 404 del proyecto: proyecto; 403: sin permiso', async () => {
    assert.equal((await falso([vacio(404)]).cliente.probar(CRED, 'QTY', opciones()) as { codigo: string }).codigo, 'JIRA_SITIO_NO_ENCONTRADO');
    assert.equal((await falso([json(YO), vacio(404)]).cliente.probar(CRED, 'NOEXISTE', opciones()) as { codigo: string }).codigo, 'JIRA_PROYECTO_NO_ENCONTRADO');
    assert.equal((await falso([json(YO), vacio(403)]).cliente.probar(CRED, 'QTY', opciones()) as { codigo: string }).codigo, 'JIRA_SIN_PERMISO');
  });

  it('respuestas con otra forma: JIRA_RESPUESTA_INVALIDA', async () => {
    for (const rs of [[json({})], [json([])], [json(YO), json({ key: 'QTY' })], [json(YO), json({ name: 'x' })], [json(YO), json([])]]) {
      const r = await falso(rs).cliente.probar(CRED, 'QTY', opciones());
      assert.deepEqual(r, { ok: false, codigo: 'JIRA_RESPUESTA_INVALIDA', eventos: [] });
    }
  });

  it('el nombre del usuario cae a correo o a accountId', async () => {
    const a = await falso([json({ emailAddress: 'a@x.test' }), json(PROYECTO)]).cliente.probar(CRED, 'QTY', opciones());
    assert.equal(a.ok && a.valor.usuarioJira, 'a@x.test');
    const b = await falso([json({ accountId: '123' }), json(PROYECTO)]).cliente.probar(CRED, 'QTY', opciones());
    assert.equal(b.ok && b.valor.usuarioJira, '123');
  });

  it('una clave de proyecto no válida es error de programación y no sale ninguna petición', async () => {
    const { cliente, llamadas } = falso([json(YO)]);
    for (const p of ['qty', 'Q', 'QTY/../x', 'QTY?x=1', 'ABCDEFGHIJK', '1QTY', '']) {
      await assert.rejects(cliente.probar(CRED, p, opciones()), ParametroJiraInvalido, p);
    }
    assert.equal(llamadas.length, 0);
  });
});

describe('detectarCampoSprint', () => {
  const campos = [
    { id: 'summary', name: 'Summary', schema: { type: 'string', system: 'summary' } },
    { id: 'customfield_10016', name: 'Story point estimate', schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' } },
    { id: 'customfield_10020', name: 'Sprint', schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint', customId: 10020 } },
  ];

  it('toma el campo con esquema gh-sprint', async () => {
    const { cliente, llamadas } = falso([json(campos)]);
    const r = await cliente.detectarCampoSprint(CRED, opciones());
    assert.deepEqual(r, { ok: true, valor: 'customfield_10020', eventos: [] });
    assert.equal(llamadas[0]?.url.pathname, '/rest/api/3/field');
  });
  it('sin campo Sprint devuelve null (el proyecto no es de software)', async () => {
    assert.deepEqual(await falso([json(campos.slice(0, 2))]).cliente.detectarCampoSprint(CRED, opciones()), { ok: true, valor: null, eventos: [] });
    assert.deepEqual(await falso([json([])]).cliente.detectarCampoSprint(CRED, opciones()), { ok: true, valor: null, eventos: [] });
  });
  it('con dos campos gh-sprint prefiere el llamado «Sprint»', async () => {
    const dos = [{ id: 'customfield_10001', name: 'Sprint antiguo', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } }, ...campos];
    const r = await falso([json(dos)]).cliente.detectarCampoSprint(CRED, opciones());
    assert.equal(r.ok && r.valor, 'customfield_10020');
  });
  it('ignora ids con forma inesperada (no pueden entrar a la consulta)', async () => {
    const r = await falso([json([{ id: 'customfield_1,summary', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } }])]).cliente.detectarCampoSprint(CRED, opciones());
    assert.deepEqual(r, { ok: true, valor: null, eventos: [] });
  });
  it('si no es una lista: JIRA_RESPUESTA_INVALIDA', async () => {
    assert.deepEqual(await falso([json({ a: 1 })]).cliente.detectarCampoSprint(CRED, opciones()), { ok: false, codigo: 'JIRA_RESPUESTA_INVALIDA', eventos: [] });
  });
});

describe('buscarPagina', () => {
  it('pide search/jql con la consulta fija, maxResults 50 y los campos acotados', async () => {
    const { cliente, llamadas } = falso([json({ issues: [], isLast: true })]);
    await cliente.buscarPagina(CRED, consulta, opciones());
    const u = llamadas[0]?.url as URL;
    assert.equal(u.pathname, '/rest/api/3/search/jql');
    assert.equal(u.searchParams.get('jql'), 'project = QTY AND issuetype in ("Story", "Historia") ORDER BY key ASC');
    assert.equal(u.searchParams.get('maxResults'), '50');
    assert.equal(u.searchParams.get('fields'), 'summary,description,priority,issuetype,status,assignee,customfield_10020');
    assert.equal(u.searchParams.has('nextPageToken'), false);
  });

  it('continuar: despuesDe agrega key > "X" y nextPageToken va como parámetro', async () => {
    const { cliente, llamadas } = falso([json({ issues: [], isLast: true })]);
    await cliente.buscarPagina(CRED, { ...consulta, despuesDe: 'BIG-100', nextPageToken: 'tok/+=&x' }, opciones());
    const u = llamadas[0]?.url as URL;
    assert.equal(u.searchParams.get('jql'), 'project = QTY AND issuetype in ("Story", "Historia") AND key > "BIG-100" ORDER BY key ASC');
    assert.equal(u.searchParams.get('nextPageToken'), 'tok/+=&x');
  });

  it('sin campo Sprint no lo pide ni lo lee', async () => {
    const { cliente, llamadas } = falso([json({ issues: [issue('QTY-1', { customfield_10020: [{ name: 'S', state: 'active' }] })], isLast: true })]);
    const r = await cliente.buscarPagina(CRED, { ...consulta, campoSprint: null }, opciones());
    assert.equal(llamadas[0]?.url.searchParams.get('fields'), 'summary,description,priority,issuetype,status,assignee');
    assert.deepEqual(r.ok && r.valor.issues[0]?.sprints, []);
  });

  it('lee los campos de la issue y los sprints (estado en cualquier caso, fin de endDate o completeDate)', async () => {
    const sprints = [
      { id: 1, name: 'E5 Sprint 1', state: 'ACTIVE', endDate: '2026-11-10T10:00:00.000Z' },
      { id: 2, name: 'Externo 9', state: 'closed', completeDate: '2026-01-02T00:00:00.000Z' },
      { id: 3, name: 'Futuro', state: 'future' },
      { id: 4, name: 'Raro', state: 'inventado' },
      { id: 5, state: 'active' },
      'texto',
      null,
    ];
    const { cliente } = falso([json({ issues: [issue('QTY-12', { customfield_10020: sprints })], nextPageToken: 'abc', isLast: false })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.ok(r.ok);
    assert.deepEqual(r.valor.issues[0], {
      clave: 'QTY-12', tipo: 'Story', titulo: 'Historia QTY-12', descripcionAdf: { type: 'doc', version: 1, content: [] },
      prioridad: 'High', estado: 'To Do', responsable: 'Ana',
      sprints: [
        { nombre: 'E5 Sprint 1', estado: 'active', fin: '2026-11-10T10:00:00.000Z' },
        { nombre: 'Externo 9', estado: 'closed', fin: '2026-01-02T00:00:00.000Z' },
        { nombre: 'Futuro', estado: 'future', fin: null },
      ],
    });
    assert.equal(r.valor.nextPageToken, 'abc');
    assert.equal(r.valor.esUltima, false);
  });

  it('campos ausentes o nulos quedan en null (sin prioridad, sin asignado, sin descripción, sin sprint)', async () => {
    const { cliente } = falso([json({ issues: [{ key: 'QTY-5', fields: { summary: 'x', description: null, priority: null, assignee: null, status: null, customfield_10020: null } }], isLast: true })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.ok(r.ok);
    assert.deepEqual(r.valor.issues[0], { clave: 'QTY-5', tipo: '', titulo: 'x', descripcionAdf: null, prioridad: null, estado: null, responsable: null, sprints: [] });
  });

  it('un summary que no es texto da título null', async () => {
    const { cliente } = falso([json({ issues: [{ key: 'QTY-11', fields: { summary: null } }], isLast: true })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.equal(r.ok && r.valor.issues[0]?.titulo, null);
  });

  it('última página: isLast verdadero, o sin nextPageToken aunque isLast no venga', async () => {
    const a = await falso([json({ issues: [issue('QTY-1')], isLast: true })]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(a.ok && [a.valor.esUltima, a.valor.nextPageToken], [true, null]);
    const b = await falso([json({ issues: [issue('QTY-1')] })]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(b.ok && [b.valor.esUltima, b.valor.nextPageToken], [true, null]);
    const c = await falso([json({ issues: [issue('QTY-1')], nextPageToken: '', isLast: false })]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(c.ok && c.valor.esUltima, true);
    const d = await falso([json({ issues: [issue('QTY-1')], nextPageToken: 'sig' })]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(d.ok && [d.valor.esUltima, d.valor.nextPageToken], [false, 'sig']);
  });

  it('página vacía válida', async () => {
    const r = await falso([json({ issues: [], isLast: true })]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(r, { ok: true, valor: { issues: [], nextPageToken: null, esUltima: true }, eventos: [] });
  });

  it('cuerpo con otra forma, issue sin clave o sin fields: JIRA_RESPUESTA_INVALIDA', async () => {
    const malos: unknown[] = [{}, [], { issues: 'x' }, { issues: [{ fields: {} }] }, { issues: [{ key: 'A-1' }] }, { issues: [null] }, { issues: [{ key: 5, fields: {} }] }];
    for (const m of malos) {
      const r = await falso([json(m)]).cliente.buscarPagina(CRED, consulta, opciones());
      assert.deepEqual(r, { ok: false, codigo: 'JIRA_RESPUESTA_INVALIDA', eventos: [] }, JSON.stringify(m));
    }
  });

  it('200 que no es JSON (HTML de login, texto): JIRA_RESPUESTA_INVALIDA', async () => {
    for (const cuerpo of ['<html>login</html>', 'no json', '']) {
      const r = await falso([new Response(cuerpo, { status: 200 })]).cliente.buscarPagina(CRED, consulta, opciones());
      assert.deepEqual(r, { ok: false, codigo: 'JIRA_RESPUESTA_INVALIDA', eventos: [] });
    }
  });

  it('un 404 en la búsqueda es proyecto no encontrado; un 400 de JQL, respuesta inválida', async () => {
    assert.equal((await falso([vacio(404)]).cliente.buscarPagina(CRED, consulta, opciones()) as { codigo: string }).codigo, 'JIRA_PROYECTO_NO_ENCONTRADO');
    assert.equal((await falso([vacio(400)]).cliente.buscarPagina(CRED, consulta, opciones()) as { codigo: string }).codigo, 'JIRA_RESPUESTA_INVALIDA');
    assert.equal((await falso([vacio(410)]).cliente.buscarPagina(CRED, consulta, opciones()) as { codigo: string }).codigo, 'JIRA_RESPUESTA_INVALIDA');
  });

  it('valores sin validar no llegan a Jira', async () => {
    const { cliente, llamadas } = falso([json({ issues: [] })]);
    const malos = [
      { ...consulta, proyecto: 'qty' }, { ...consulta, proyecto: 'QTY OR 1=1' }, { ...consulta, tipos: [] },
      { ...consulta, tipos: ['Story") OR project = "X'] }, { ...consulta, tipos: ['a\\b'] }, { ...consulta, tipos: ['a\nb'] },
      { ...consulta, despuesDe: 'X-1" OR "1"="1' }, { ...consulta, despuesDe: '' }, { ...consulta, campoSprint: 'customfield_1,summary' },
      { ...consulta, nextPageToken: '' },
    ];
    for (const q of malos) await assert.rejects(cliente.buscarPagina(CRED, q, opciones()), ParametroJiraInvalido, JSON.stringify(q));
    assert.equal(llamadas.length, 0);
  });
});

describe('armarJql', () => {
  it('consulta fija de D96', () => {
    assert.equal(armarJql('QTY', ['Story', 'Historia']), 'project = QTY AND issuetype in ("Story", "Historia") ORDER BY key ASC');
    assert.equal(armarJql('A_1', ['Épica ñ']), 'project = A_1 AND issuetype in ("Épica ñ") ORDER BY key ASC');
    assert.equal(armarJql('QTY', [' Story '], 'QTY-9'), 'project = QTY AND issuetype in ("Story") AND key > "QTY-9" ORDER BY key ASC');
  });
  it('rechaza tipos con comillas, barras, controles o demasiado largos', () => {
    for (const t of ['a"b', 'a\\b', 'a\u0000b', '', '   ', 'x'.repeat(61)]) assert.throws(() => armarJql('QTY', [t]), ParametroJiraInvalido, JSON.stringify(t));
    assert.throws(() => armarJql('QTY', Array.from({ length: 11 }, (_, i) => `T${i}`)), ParametroJiraInvalido);
  });
});

describe('errores de Jira (D105): código fijo y sin texto de Jira', () => {
  const casos: [number, string][] = [[401, 'JIRA_CREDENCIAL_INVALIDA'], [403, 'JIRA_SIN_PERMISO'], [500, 'JIRA_NO_DISPONIBLE'], [502, 'JIRA_NO_DISPONIBLE'], [503, 'JIRA_NO_DISPONIBLE'], [504, 'JIRA_NO_DISPONIBLE'], [599, 'JIRA_NO_DISPONIBLE']];
  for (const [estado, codigo] of casos) {
    it(`${estado} en search/jql: ${codigo}`, async () => {
      const r = await falso([vacio(estado)]).cliente.buscarPagina(CRED, consulta, opciones());
      assert.deepEqual(r, { ok: false, codigo, eventos: [] });
    });
  }

  it('el cuerpo de un 401 que repite el token no se lee ni se propaga', async () => {
    let leido = false;
    const cuerpo = new Response(`{"message":"token ${TOKEN} revocado"}`, { status: 401 });
    Object.defineProperty(cuerpo, 'text', { value: async () => { leido = true; return ''; } });
    Object.defineProperty(cuerpo, 'json', { value: async () => { leido = true; return {}; } });
    const r = await falso([cuerpo]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.equal(leido, false);
    assert.ok(!JSON.stringify(r).includes(TOKEN));
    assert.ok(!JSON.stringify(r).includes(Buffer.from(`admin@quality360.local:${TOKEN}`).toString('base64')));
  });

  it('una excepción de red no filtra su mensaje (podría incluir la URL)', async () => {
    const e = Object.assign(new Error(`getaddrinfo ENOTFOUND ${TOKEN}`), { name: 'TypeError' });
    const r = await falso([e]).cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_SITIO_NO_ENCONTRADO', eventos: [] });
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  });

  it('TimeoutError y AbortError: JIRA_TIEMPO_AGOTADO', async () => {
    for (const nombre of ['TimeoutError', 'AbortError']) {
      const r = await falso([error(nombre)]).cliente.buscarPagina(CRED, consulta, opciones());
      assert.deepEqual(r, { ok: false, codigo: 'JIRA_TIEMPO_AGOTADO', eventos: [] });
    }
  });

  it('una redirección no se sigue: JIRA_SITIO_NO_ENCONTRADO', async () => {
    const { cliente, llamadas } = falso([vacio(302, { location: 'http://169.254.169.254/' })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_SITIO_NO_ENCONTRADO', eventos: [] });
    assert.equal(llamadas.length, 1);
  });
});

describe('tiempo límite y presupuesto', () => {
  it('usa el menor entre el tiempo límite y lo que queda del presupuesto', async () => {
    const { cliente, llamadas } = falso([json({ issues: [], isLast: true })]);
    await cliente.buscarPagina(CRED, consulta, opciones({ tiempoLimiteMs: 3000, restanteMs: () => 400 }));
    const senal = llamadas[0]?.init.signal as AbortSignal;
    assert.equal(senal.aborted, false);
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(senal.aborted, true); // se acotó a ~400 ms, no a 3 s
  });

  it('sin presupuesto no inicia la llamada: JIRA_TIEMPO_AGOTADO', async () => {
    const { cliente, llamadas } = falso([json({ issues: [] })]);
    for (const restante of [0, -5, Number.NaN]) {
      const r = await cliente.buscarPagina(CRED, consulta, opciones({ restanteMs: () => restante }));
      assert.deepEqual(r, { ok: false, codigo: 'JIRA_TIEMPO_AGOTADO', eventos: [] });
    }
    assert.equal(llamadas.length, 0);
  });
});

describe('límite de tasa 429 (D105)', () => {
  const pagina = (): Response => json({ issues: [issue('QTY-1')], isLast: true }); // un Response nuevo por uso

  it('reintenta hasta 2 veces respetando Retry-After y registra cada espera', async () => {
    const { cliente, llamadas, dormidos } = falso([vacio(429, { 'retry-after': '1' }), vacio(429, { 'retry-after': '1' }), pagina]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.ok(r.ok);
    assert.equal(llamadas.length, 3);
    assert.deepEqual(dormidos, [1000, 1000]);
    assert.deepEqual(r.eventos, [
      { tipo: 'JIRA_LIMITE_DE_TASA', esperaMs: 1000, fecha: new Date('2026-10-30T12:00:00Z') },
      { tipo: 'JIRA_LIMITE_DE_TASA', esperaMs: 1000, fecha: new Date('2026-10-30T12:00:00Z') },
    ]);
  });

  it('un tercer 429 termina con JIRA_LIMITE_DE_TASA y conserva los eventos', async () => {
    const { cliente, llamadas, dormidos } = falso([vacio(429, { 'retry-after': '1' })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.codigo, 'JIRA_LIMITE_DE_TASA');
    assert.equal(llamadas.length, 3);
    assert.equal(dormidos.length, 2);
    assert.equal(r.eventos.length, 2);
  });

  it('Retry-After mayor que el máximo: no espera ni reintenta', async () => {
    const { cliente, llamadas, dormidos } = falso([vacio(429, { 'retry-after': '4' })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones({ esperaMax429Ms: 3000 }));
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_LIMITE_DE_TASA', eventos: [] });
    assert.equal(llamadas.length, 1);
    assert.deepEqual(dormidos, []);
  });

  it('exactamente el máximo sí espera', async () => {
    const { cliente, dormidos } = falso([vacio(429, { 'retry-after': '3' }), pagina]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones({ esperaMax429Ms: 3000 }));
    assert.ok(r.ok);
    assert.deepEqual(dormidos, [3000]);
  });

  it('sin presupuesto para esperar: no reintenta', async () => {
    const { cliente, llamadas } = falso([vacio(429, { 'retry-after': '2' })]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones({ restanteMs: () => 1500 }));
    assert.equal(!r.ok && r.codigo, 'JIRA_LIMITE_DE_TASA');
    assert.equal(llamadas.length, 1);
  });

  it('Retry-After ausente, ilegible o una fecha HTTP: no reintenta', async () => {
    for (const cabeceras of [{} as Record<string, string>,{ 'retry-after': 'pronto' }, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }, { 'retry-after': '-1' }, { 'retry-after': '' }]) {
      const { cliente, llamadas } = falso([vacio(429, cabeceras)]);
      const r = await cliente.buscarPagina(CRED, consulta, opciones());
      assert.equal(!r.ok && r.codigo, 'JIRA_LIMITE_DE_TASA', JSON.stringify(cabeceras));
      assert.equal(llamadas.length, 1);
    }
  });

  it('Retry-After decimal se redondea hacia arriba', () => {
    assert.equal(leerRetryAfter('0.5'), 500);
    assert.equal(leerRetryAfter('1.2'), 1200);
    assert.equal(leerRetryAfter('0'), 0);
    assert.equal(leerRetryAfter(null), null);
  });

  it('los reintentos usan lo que queda de presupuesto en cada intento', async () => {
    let restante = 5000;
    const { cliente, llamadas } = falso([vacio(429, { 'retry-after': '1' }), pagina]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones({ restanteMs: () => (restante -= 1000) }));
    assert.ok(r.ok);
    assert.equal(llamadas.length, 2);
  });

  it('un 5xx después de un 429 conserva los eventos', async () => {
    const { cliente } = falso([vacio(429, { 'retry-after': '1' }), vacio(503)]);
    const r = await cliente.buscarPagina(CRED, consulta, opciones());
    assert.equal(!r.ok && r.codigo, 'JIRA_NO_DISPONIBLE');
    assert.equal(r.eventos.length, 1);
  });
});

describe('protección SSRF (D95): el cliente revalida el sitio', () => {
  const malos = ['http://equipo.atlassian.net', 'https://evil.com', 'https://equipo.atlassian.net.evil.com', 'http://169.254.169.254', 'http://127.0.0.1:4010', 'https://localhost', ''];

  for (const sitio of malos) {
    it(`no sale ninguna petición hacia ${JSON.stringify(sitio)}`, async () => {
      const { cliente, llamadas } = falso([json(YO), json(PROYECTO)]);
      const c = { ...CRED, sitio };
      assert.equal(!(await cliente.probar(c, 'QTY', opciones())).ok, true);
      assert.equal(!(await cliente.detectarCampoSprint(c, opciones())).ok, true);
      assert.equal(!(await cliente.buscarPagina(c, consulta, opciones())).ok, true);
      assert.equal(llamadas.length, 0);
    });
  }

  it('el código es JIRA_SITIO_NO_ENCONTRADO', async () => {
    const r = await falso([json(YO)]).cliente.detectarCampoSprint({ ...CRED, sitio: 'https://evil.com' }, opciones());
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_SITIO_NO_ENCONTRADO', eventos: [] });
  });

  it('con la bandera de pruebas sí admite 127.0.0.1; sin ella o en producción, no', async () => {
    const con = new ClienteJiraHttp({ permitirHostPrueba: true, fetch: (async () => json([])) as typeof fetch });
    assert.equal((await con.detectarCampoSprint({ ...CRED, sitio: 'http://127.0.0.1:4010' }, opciones())).ok, true);
    const sin = new ClienteJiraHttp({ permitirHostPrueba: false, fetch: (async () => json([])) as typeof fetch });
    assert.equal((await sin.detectarCampoSprint({ ...CRED, sitio: 'http://127.0.0.1:4010' }, opciones())).ok, false);
    const porDefecto = new ClienteJiraHttp({ fetch: (async () => json([])) as typeof fetch });
    assert.equal((await porDefecto.detectarCampoSprint({ ...CRED, sitio: 'http://127.0.0.1:4010' }, opciones())).ok, false);
  });
});

describe('contra un servidor HTTP real en 127.0.0.1 (sin red externa)', () => {
  async function servidor(manejador: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ sitio: string; cerrar: () => Promise<void>; srv: Server }> {
    const srv = createServer(manejador);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const puerto = (srv.address() as AddressInfo).port;
    return { sitio: `http://127.0.0.1:${puerto}`, srv, cerrar: () => new Promise<void>((r) => { srv.closeAllConnections(); srv.close(() => r()); }) };
  }
  const real = () => new ClienteJiraHttp({ permitirHostPrueba: true });

  it('flujo completo con paginación por nextPageToken y autenticación verificada por el servidor', async () => {
    const vistas: { ruta: string; jql: string | null; token: string | null; auth: string | undefined }[] = [];
    const s = await servidor((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x');
      vistas.push({ ruta: u.pathname, jql: u.searchParams.get('jql'), token: u.searchParams.get('nextPageToken'), auth: req.headers.authorization });
      res.setHeader('content-type', 'application/json');
      if (u.pathname === '/rest/api/3/search/jql') {
        const segunda = u.searchParams.get('nextPageToken') === 'pag2';
        res.end(JSON.stringify(segunda ? { issues: [issue('QTY-2')], isLast: true } : { issues: [issue('QTY-1')], nextPageToken: 'pag2', isLast: false }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    try {
      const c = { ...CRED, sitio: s.sitio };
      const p1 = await real().buscarPagina(c, consulta, opciones());
      assert.ok(p1.ok);
      assert.equal(p1.valor.nextPageToken, 'pag2');
      const p2 = await real().buscarPagina(c, { ...consulta, nextPageToken: p1.valor.nextPageToken as string }, opciones());
      assert.ok(p2.ok);
      assert.equal(p2.valor.esUltima, true);
      assert.equal(p2.valor.issues[0]?.clave, 'QTY-2');
      assert.deepEqual(vistas.map((v) => v.token), [null, 'pag2']);
      assert.ok(vistas.every((v) => v.auth === BASICA));
    } finally {
      await s.cerrar();
    }
  });

  it('un servidor que no responde a tiempo: JIRA_TIEMPO_AGOTADO', async () => {
    const s = await servidor(() => { /* nunca responde */ });
    try {
      const t0 = Date.now();
      const r = await real().detectarCampoSprint({ ...CRED, sitio: s.sitio }, opciones({ tiempoLimiteMs: 200 }));
      assert.deepEqual(r, { ok: false, codigo: 'JIRA_TIEMPO_AGOTADO', eventos: [] });
      assert.ok(Date.now() - t0 < 2000);
    } finally {
      await s.cerrar();
    }
  });

  it('un cuerpo que empieza y se corta a mitad: JIRA_TIEMPO_AGOTADO (el tiempo cubre la lectura)', async () => {
    const s = await servidor((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('[{"id":'); });
    try {
      const r = await real().detectarCampoSprint({ ...CRED, sitio: s.sitio }, opciones({ tiempoLimiteMs: 200 }));
      assert.equal(!r.ok && r.codigo, 'JIRA_TIEMPO_AGOTADO');
    } finally {
      await s.cerrar();
    }
  });

  it('puerto cerrado: JIRA_SITIO_NO_ENCONTRADO', async () => {
    const s = await servidor(() => {});
    const sitio = s.sitio;
    await s.cerrar();
    const r = await real().detectarCampoSprint({ ...CRED, sitio }, opciones());
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_SITIO_NO_ENCONTRADO', eventos: [] });
  });

  it('429 real con Retry-After y recuperación', async () => {
    let n = 0;
    const s = await servidor((_req, res) => {
      n += 1;
      if (n <= 2) { res.statusCode = 429; res.setHeader('retry-after', '0'); res.end(`{"message":"${TOKEN}"}`); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ issues: [], isLast: true }));
    });
    try {
      const r = await real().buscarPagina({ ...CRED, sitio: s.sitio }, consulta, opciones());
      assert.ok(r.ok);
      assert.equal(r.eventos.length, 2);
      assert.equal(n, 3);
    } finally {
      await s.cerrar();
    }
  });

  it('una redirección hacia otro host no se sigue', async () => {
    let destinoVisitado = false;
    const destino = await servidor((_req, res) => { destinoVisitado = true; res.end('{}'); });
    const s = await servidor((_req, res) => { res.statusCode = 302; res.setHeader('location', destino.sitio); res.end(); });
    try {
      const r = await real().detectarCampoSprint({ ...CRED, sitio: s.sitio }, opciones());
      assert.equal(!r.ok && r.codigo, 'JIRA_SITIO_NO_ENCONTRADO');
      assert.equal(destinoVisitado, false);
    } finally {
      await s.cerrar();
      await destino.cerrar();
    }
  });
});
