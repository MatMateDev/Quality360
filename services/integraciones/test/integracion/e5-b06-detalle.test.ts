/**
 * E5-B06 · Detalle de la HDU en la consulta (D196-D200) y E5-B02 #5, #6 (presupuesto; clasificación con `yaAsignada`).
 * Postgres local real; Organización y Jira falsos (ayudas.ts), y un Jira HTTP local para ver las peticiones reales del cliente.
 * IDs de `docs/backlog/e5-detalle-asignacion-por-hdu.md`.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, issue, type OrganizacionFalsa } from '../ayudas.js';
import { ClienteJiraHttp } from '../../src/infraestructura/jira/cliente-jira-http.js';
import type { IssueJira } from '../../src/dominio/puertos/fuente-jira.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const CONSULTAR = '/v1/integraciones/jira/consultas';
const doc = (...c: unknown[]) => ({ type: 'doc', version: 1, content: c });
const parrafo = (t: string, marks?: unknown[]) => ({ type: 'paragraph', content: [{ type: 'text', text: t, ...(marks === undefined ? {} : { marks }) }] });
const encabezado = (t: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t }] });

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});

afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
  org.versionAnterior = false;
  org.caida = false;
  org.llamadas.length = 0;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

async function listo(proyecto = 'QTY', config: Parameters<typeof montar>[0] = {}): Promise<Montaje> {
  m = await montar({ org, ...config });
  const guardado = await guardarConfiguracion(m, { proyecto });
  assert.equal(guardado.status, 200);
  assert.equal(guardado.body.guardado, true);
  m.jira.llamadas.length = 0;
  return m;
}

const consultar = (cuerpo: unknown = {}) => m.pedir('post', CONSULTAR, 'adm1', cuerpo);
const items = async (id: string, grupo: string) => (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=${grupo}&tamanoPagina=100`, 'adm1')).body;
const filaDe = async (id: string, grupo: string, codigo: string) => (await items(id, grupo)).items.find((i: { codigo: string }) => i.codigo === codigo);
const detalleDe = (id: string, itemId: string, persona: Parameters<Montaje['pedir']>[2] = 'adm1') => m.pedir('get', `${CONSULTAR}/${id}/items/${itemId}`, persona);

function proyecto(clave: string, ...reglas: Array<[number, Partial<IssueJira>]>): void {
  const base = new Map(reglas);
  m.jira.proyectos.set(
    clave,
    Array.from({ length: Math.max(...reglas.map(([n]) => n)) }, (_, i) => issue(i + 1, clave, base.get(i + 1) ?? {})),
  );
}

describe('E5-B06#1 · una sola llamada (cliente HTTP real contra un Jira local)', () => {
  let jira: Server;
  const peticiones: Array<{ ruta: string; consulta: URLSearchParams }> = [];

  before(async () => {
    jira = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      peticiones.push({ ruta: url.pathname, consulta: url.searchParams });
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/rest/api/3/myself') return void res.end(JSON.stringify({ accountId: 'a', displayName: 'Jira Local' }));
      if (url.pathname === '/rest/api/3/project/QTY') return void res.end(JSON.stringify({ key: 'QTY', name: 'Proyecto' }));
      if (url.pathname === '/rest/api/3/field') {
        return void res.end(
          JSON.stringify([
            { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
            { id: 'customfield_10300', name: 'Acceptance Criteria', schema: { custom: 'textarea' } },
          ]),
        );
      }
      if (url.pathname === '/rest/api/3/search/jql') {
        const issues = Array.from({ length: 3 }, (_, i) => ({
          key: `QTY-${i + 1}`,
          fields: {
            summary: `Historia ${i + 1}`, description: doc(parrafo('Texto')), priority: { name: 'High' }, issuetype: { name: 'Story' }, status: { name: 'To Do' },
            assignee: { displayName: 'Ana' }, labels: ['a'], created: '2026-10-20T11:00:00.000-0300', customfield_10300: doc(parrafo('1. Criterio del campo')),
            parent: { key: 'QTY-100', fields: { summary: 'Épica', issuetype: { name: 'Epic', hierarchyLevel: 1 } } },
            customfield_10020: [{ name: 'E5 Sprint 2', state: 'active', startDate: '2026-11-02T12:00:00.000Z', endDate: '2026-11-16T12:00:00.000Z' }],
          },
        }));
        return void res.end(JSON.stringify({ issues, isLast: true }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
    await new Promise<void>((r) => jira.listen(0, '127.0.0.1', r));
  });

  after(async () => {
    await new Promise<void>((r) => jira.close(() => r()));
  });

  it('E5-B06-T01 / E5-B02-T25 mismo número de peticiones por página, fields con los campos de D196 y el de criterios; sin GET /issue ni expand', async () => {
    const puerto = (jira.address() as { port: number }).port;
    m = await montar({ org, fuenteJira: new ClienteJiraHttp({ permitirHostPrueba: true }) });
    const guardado = await guardarConfiguracion(m, { sitio: `http://127.0.0.1:${puerto}` });
    assert.equal(guardado.status, 200);
    assert.equal(guardado.body.guardado, true);
    // Guardar detecta Sprint y criterios con UNA sola llamada a /field.
    assert.deepEqual(peticiones.map((p) => p.ruta), ['/rest/api/3/myself', '/rest/api/3/project/QTY', '/rest/api/3/field']);
    assert.equal((await consultaDuenio<{ campo_criterios: string; campo_sprint: string }>('SELECT campo_criterios, campo_sprint FROM integraciones.configuracion_jira'))[0]?.campo_criterios, 'customfield_10300');

    peticiones.length = 0;
    const r = await consultar();
    assert.equal(r.status, 200);
    assert.equal(r.body.ejecucion.leidas, 3);
    assert.deepEqual(peticiones.map((p) => p.ruta), ['/rest/api/3/search/jql']);
    const fields = (peticiones[0]?.consulta.get('fields') ?? '').split(',');
    for (const campo of ['summary', 'description', 'priority', 'issuetype', 'status', 'assignee', 'labels', 'created', 'updated', 'duedate', 'resolutiondate', 'parent', 'customfield_10020', 'customfield_10300']) {
      assert.ok(fields.includes(campo), campo);
    }
    assert.equal(peticiones[0]?.consulta.has('expand'), false);
    assert.equal(peticiones.some((p) => /\/issue\//.test(p.ruta)), false);

    // El detalle sale de esa misma respuesta: criterios del campo, épica, fechas y sprint con inicio.
    const fila = await filaDe(r.body.consulta.id, 'NUEVA', 'QTY-1');
    const d = (await detalleDe(r.body.consulta.id, fila.id)).body.detalle;
    assert.equal(d.criterios.texto, '1. Criterio del campo');
    assert.equal(d.criterios.origen, 'CAMPO');
    assert.deepEqual(d.epica, { clave: 'QTY-100', titulo: 'Épica' });
    assert.equal(d.fechas.creada, '2026-10-20T14:00:00.000Z');
    assert.deepEqual(d.sprints, [{ nombre: 'E5 Sprint 2', estado: 'ACTIVO', inicio: '2026-11-02T12:00:00.000Z', fin: '2026-11-16T12:00:00.000Z' }]);
  });

  it('probar la conexión no detecta campos: solo myself y project (D199)', async () => {
    const puerto = (jira.address() as { port: number }).port;
    m = await montar({ org, fuenteJira: new ClienteJiraHttp({ permitirHostPrueba: true }) });
    peticiones.length = 0;
    const r = await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', { sitio: `http://127.0.0.1:${puerto}`, correo: 'a@quality360.local', token: 'x'.repeat(12), proyecto: 'QTY' });
    assert.equal(r.status, 200);
    assert.deepEqual(peticiones.map((p) => p.ruta), ['/rest/api/3/myself', '/rest/api/3/project/QTY']);
  });
});

describe('E5-B06#2, #3 · mapeo completo y criterios de aceptación', () => {
  it('E5-B06-T02 el detalle guarda todos los campos; el listado NO lo trae (E5-B05-T25)', async () => {
    await listo();
    proyecto('QTY', [
      1,
      {
        descripcionAdf: doc(parrafo('Como usuario quiero un segundo factor.')),
        labels: ['seguridad', 'login'],
        padre: { clave: 'QTY-100', titulo: 'Seguridad de acceso', esEpica: true },
        creada: '2026-10-20T11:00:00.000-0300',
        vencimiento: '2026-11-20',
        sprints: [{ nombre: 'E5 Sprint 2', estado: 'active', inicio: '2026-11-02T12:00:00.000Z', fin: '2026-11-16T12:00:00.000Z' }],
      },
    ]);
    const r = await consultar();
    const id = r.body.consulta.id as string;
    const lista = await items(id, 'NUEVA');
    assert.equal(JSON.stringify(lista).includes('detalle'), false);
    assert.equal('detalle' in lista.items[0], false);
    const fila = lista.items[0];
    const respuesta = await detalleDe(id, fila.id);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(Object.keys(respuesta.body).sort(), ['detalle', 'item', 'leidaEn', 'version']);
    assert.equal(respuesta.body.item.id, fila.id);
    assert.equal(respuesta.body.item.revision, 1);
    assert.equal(respuesta.body.version, r.body.consulta.version);
    assert.ok(Math.abs(Date.parse(respuesta.body.leidaEn) - Date.now()) < 30_000);
    assert.deepEqual(respuesta.body.detalle, {
      resumen: 'Historia QTY-1',
      descripcion: { texto: 'Como usuario quiero un segundo factor.', truncado: false },
      criterios: { texto: null, origen: null, truncado: false },
      estadoJira: 'In Progress',
      prioridadJira: 'High',
      prioridadQ360: 'ALTA',
      tipo: 'Story',
      responsableJira: 'Dev Uno',
      etiquetas: [{ valor: 'seguridad' }, { valor: 'login' }],
      etiquetasTotal: 2,
      sprints: [{ nombre: 'E5 Sprint 2', estado: 'ACTIVO', inicio: '2026-11-02T12:00:00.000Z', fin: '2026-11-16T12:00:00.000Z' }],
      epica: { clave: 'QTY-100', titulo: 'Seguridad de acceso' },
      fechas: { creada: '2026-10-20T14:00:00.000Z', actualizada: null, vencimiento: '2026-11-20', resolucion: null },
      urlJira: 'http://127.0.0.1:4010/browse/QTY-1',
    });
  });

  it('E5-B06-T03 criterios: CAMPO, DESCRIPCION o null; la descripción conserva todo su texto y no hay llamadas nuevas a Jira', async () => {
    await listo();
    m.jira.campoCriterios = 'customfield_10300';
    // El campo se detecta al guardar: se guarda de nuevo para que la configuración lo recoja.
    assert.equal((await guardarConfiguracion(m, { proyecto: 'QTY' })).status, 200);
    m.jira.llamadas.length = 0;
    const seccion = doc(parrafo('Intro.'), encabezado('Criterios de aceptación'), parrafo('Pide el código'), encabezado('Notas'), parrafo('Otra cosa'));
    proyecto(
      'QTY',
      [1, { criteriosAdf: doc(parrafo('Del campo')), descripcionAdf: seccion }],
      [2, { descripcionAdf: seccion }],
      [3, { descripcionAdf: doc(parrafo('Sin encabezado')) }],
    );
    const id = (await consultar()).body.consulta.id as string;
    assert.deepEqual(m.jira.llamadas, ['buscarPagina']);
    assert.equal(m.jira.consultas[0]?.campoCriterios, 'customfield_10300');
    const criterios = async (codigo: string) => (await detalleDe(id, (await filaDe(id, 'NUEVA', codigo)).id)).body.detalle;
    assert.deepEqual((await criterios('QTY-1')).criterios, { texto: 'Del campo', origen: 'CAMPO', truncado: false });
    const dos = await criterios('QTY-2');
    assert.deepEqual(dos.criterios, { texto: 'Pide el código', origen: 'DESCRIPCION', truncado: false });
    assert.equal(dos.descripcion.texto, 'Intro.\nCriterios de aceptación\nPide el código\nNotas\nOtra cosa');
    assert.deepEqual((await criterios('QTY-3')).criterios, { texto: null, origen: null, truncado: false });
    assert.deepEqual(m.jira.llamadas, ['buscarPagina']);
  });

  it('una configuración anterior (campo_criterios NULL) sigue usando la sección de la descripción hasta el siguiente guardado', async () => {
    await listo();
    await consultaDuenio('UPDATE integraciones.configuracion_jira SET campo_criterios = NULL');
    proyecto('QTY', [1, { descripcionAdf: doc(encabezado('Acceptance criteria'), parrafo('Uno')) }]);
    const id = (await consultar()).body.consulta.id as string;
    assert.equal(m.jira.consultas[0]?.campoCriterios, null);
    const d = (await detalleDe(id, (await filaDe(id, 'NUEVA', 'QTY-1')).id)).body.detalle;
    assert.deepEqual(d.criterios, { texto: 'Uno', origen: 'DESCRIPCION', truncado: false });
  });
});

describe('E5-B06#4, #5 · saneamiento, límites y datos raros', () => {
  it('E5-B06-T04 QTY-15: 20 KB de ADF con media, macro y <script> se guarda como texto plano de menos de 40 KB y la fila no se rechaza', async () => {
    await listo();
    // Lo especial va primero (el recorte a 8.000 caracteres se lleva el final) y después el relleno hasta los 20 KB.
    const bloques: unknown[] = [];
    bloques.push({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x', type: 'file' } }] });
    bloques.push({ type: 'bodiedExtension', attrs: { extensionType: 'macro' }, content: [parrafo('dentro del macro')] });
    bloques.push(parrafo('<script>alert(1)</script> y <img src=x onerror=alert(1)>'));
    bloques.push(parrafo('mal enlace', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]));
    bloques.push(parrafo('buen enlace', [{ type: 'link', attrs: { href: 'https://equipo.atlassian.net/x' } }]));
    bloques.push(parrafo('control\u0000\u0007 incluido'));
    for (let i = 0; i < 160; i++) bloques.push(parrafo(`Párrafo ${i} con texto de relleno para ocupar espacio en la descripción. `.repeat(3)));
    proyecto('QTY', [15, { descripcionAdf: doc(...bloques) }]);
    const r = await consultar();
    assert.equal(r.status, 200);
    assert.equal(r.body.ejecucion.conError, 0);
    const id = r.body.consulta.id as string;
    const d = (await detalleDe(id, (await filaDe(id, 'NUEVA', 'QTY-15')).id)).body.detalle;
    const texto = d.descripcion.texto as string;
    assert.match(texto, /\[contenido no mostrable\]/);
    assert.doesNotMatch(texto, /<script|<img|javascript:|[\u0000-\u0008]/);
    assert.match(texto, /buen enlace \(https:\/\/equipo\.atlassian\.net\/x\)/);
    assert.equal(d.descripcion.truncado, true, 'más de 8.000 caracteres');
    assert.equal(texto.length, 8000);
    const tamano = (await consultaDuenio<{ n: number }>('SELECT max(octet_length(detalle::text))::int AS n FROM integraciones.consulta_item'))[0]?.n ?? 0;
    assert.ok(tamano > 0 && tamano <= 40_960, String(tamano));
  });

  it('E5-B06-T05 QTY-16 vacía y datos raros: el campo queda null o vacío, la issue no pasa a CON_ERROR y la tanda sigue', async () => {
    await listo();
    proyecto(
      'QTY',
      [16, { descripcionAdf: null, prioridad: null, estado: null, responsable: null, sprints: [], labels: [] }],
      [17, { creada: 'ayer', vencimiento: '20/11/2026', sprints: [{ nombre: 'Sin fechas', estado: 'future', fin: null }], padre: { clave: 'QTY-9', titulo: 'No es épica', esEpica: false }, labels: 'no-lista' as unknown as string[] }],
    );
    const r = await consultar();
    assert.equal(r.body.ejecucion.conError, 0);
    assert.equal(r.body.ejecucion.leidas, 17);
    const id = r.body.consulta.id as string;
    const vacia = (await detalleDe(id, (await filaDe(id, 'NUEVA', 'QTY-16')).id)).body.detalle;
    assert.deepEqual([vacia.descripcion, vacia.etiquetas, vacia.sprints, vacia.epica, vacia.estadoJira, vacia.prioridadQ360, vacia.responsableJira], [{ texto: null, truncado: false }, [], [], null, null, null, null]);
    const rara = (await detalleDe(id, (await filaDe(id, 'NUEVA', 'QTY-17')).id)).body.detalle;
    assert.deepEqual(rara.fechas, { creada: null, actualizada: null, vencimiento: null, resolucion: null });
    assert.deepEqual([rara.sprints, rara.epica, rara.etiquetas], [[{ nombre: 'Sin fechas', estado: 'FUTURO', inicio: null, fin: null }], null, []]);
  });

  it('E5-B06-T06 los textos de Jira no llegan a los logs, a ejecucion_integracion ni a detalle_ejecucion', async () => {
    m = await montar({ org, capturarRegistro: true });
    assert.equal((await guardarConfiguracion(m, { proyecto: 'QTY' })).status, 200);
    proyecto('QTY', [1, { descripcionAdf: doc(parrafo('SECRETO-DE-JIRA-987 descripción')), criteriosAdf: doc(parrafo('SECRETO-CRITERIO-654')) }]);
    const id = (await consultar()).body.consulta.id as string;
    await detalleDe(id, (await filaDe(id, 'NUEVA', 'QTY-1')).id);
    for (const tabla of ['ejecucion_integracion', 'detalle_ejecucion', 'evento_configuracion']) {
      const n = (await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.${tabla} x WHERE x::text ILIKE '%SECRETO-%'`))[0]?.n;
      assert.equal(n, 0, tabla);
    }
    assert.equal(m.registro?.lineas.some((l) => l.includes('SECRETO-')), false);
  });
});

describe('E5-B06#6, #7, #9 · leer el detalle, retención y consulta anterior', () => {
  it('E5-B06-T07 solo el Administrador (401 sin sesión, 403 al resto); sin llamar a Jira ni a Organización', async () => {
    await listo();
    const id = (await consultar()).body.consulta.id as string;
    const itemId = (await filaDe(id, 'NUEVA', 'QTY-1')).id as string;
    const llamadasJira = m.jira.llamadas.length;
    const llamadasOrg = org.llamadas.filter((l) => !l.endsWith('/v1/interno/acceso')).length;
    assert.equal((await detalleDe(id, itemId, null)).status, 401);
    for (const persona of ['qe1', 'ana1', 'lid1', 'aud1'] as const) assert.equal((await detalleDe(id, itemId, persona)).status, 403, persona);
    assert.equal((await detalleDe(id, itemId, 'adm2')).status, 200, 'otro Administrador también lo lee');
    assert.equal(m.jira.llamadas.length, llamadasJira);
    assert.equal(org.llamadas.filter((l) => !l.endsWith('/v1/interno/acceso')).length, llamadasOrg);
  });

  it('E5-B06-T08 404 si la consulta no existe o el itemId es de otra consulta o inexistente; 400 con ids mal formados', async () => {
    await listo();
    const a = (await consultar()).body.consulta.id as string;
    const itemA = (await filaDe(a, 'NUEVA', 'QTY-1')).id as string;
    const b = (await consultar({ reemplazar: true })).body.consulta.id as string;
    assert.equal((await detalleDe(b, itemA)).status, 404, 'fila de otra consulta (la anterior ya se purgó)');
    const itemB = (await filaDe(b, 'NUEVA', 'QTY-1')).id as string;
    assert.deepEqual([(await detalleDe(b, '0c000000-0000-4000-8000-00000000ffff')).status, (await detalleDe('0c000000-0000-4000-8000-00000000ffff', itemB)).status], [404, 404]);
    assert.equal((await detalleDe(b, 'no-uuid')).status, 400);
    assert.equal((await detalleDe('no-uuid', itemB)).status, 400);
    assert.equal((await detalleDe(b, itemB)).status, 200);
  });

  it('E5-B06-T09 consulta vencida: 410; descartada: 409; después de la purga no queda detalle en ninguna tabla (retención)', async () => {
    await listo();
    proyecto('QTY', [1, { descripcionAdf: doc(parrafo('SECRETO-DE-JIRA-123')) }], [2, {}]);
    const id = (await consultar()).body.consulta.id as string;
    const itemId = (await filaDe(id, 'NUEVA', 'QTY-1')).id as string;
    assert.equal((await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE detalle::text LIKE '%SECRETO-DE-JIRA-123%'`))[0]?.n, 1);

    await consultaDuenio(`UPDATE integraciones.consulta_jira SET vence_en = now() - interval '1 second' WHERE id_consulta = '${id}'`);
    const vencida = await detalleDe(id, itemId);
    assert.deepEqual([vencida.status, vencida.body.codigo], [410, 'CONSULTA_VENCIDA']);
    assert.equal((await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item`))[0]?.n, 0);

    const id2 = (await consultar()).body.consulta.id as string;
    const item2 = (await filaDe(id2, 'NUEVA', 'QTY-1')).id as string;
    assert.equal((await m.pedir('post', `${CONSULTAR}/${id2}/descartes`, 'adm1', {})).status, 200);
    const cerrada = await detalleDe(id2, item2);
    assert.deepEqual([cerrada.status, cerrada.body.codigo], [409, 'CONSULTA_NO_ABIERTA']);
    for (const tabla of ['consulta_item', 'consulta_jira', 'ejecucion_integracion', 'detalle_ejecucion']) {
      const n = (await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.${tabla} x WHERE x::text LIKE '%SECRETO-DE-JIRA-123%'`))[0]?.n;
      assert.equal(n, 0, tabla);
    }
  });

  it('E5-B06-T10 una fila anterior al cambio responde 200 con detalle null y sigue asignable', async () => {
    await listo();
    const id = (await consultar()).body.consulta.id as string;
    const itemId = (await filaDe(id, 'NUEVA', 'QTY-1')).id as string;
    await consultaDuenio('UPDATE integraciones.consulta_item SET detalle = NULL');
    const r = await detalleDe(id, itemId);
    assert.equal(r.status, 200);
    assert.equal(r.body.detalle, null);
    assert.equal(r.body.item.codigo, 'QTY-1');
    assert.ok(Date.parse(r.body.leidaEn) > 0, 'leidaEn cae a la creación de la consulta');
    const asignada = await m.pedir('patch', `${CONSULTAR}/${id}/items`, 'adm1', { itemIds: [itemId], asignacion: { celulaId: '0ce00000-0000-4000-8000-00000000000c' } });
    assert.equal(asignada.status, 200);
  });
});

describe('E5-B06#8 / E5-B02#5 · peso y tiempo', () => {
  it('E5-B06-T11 100 issues con descripciones de 20 KB caben en 40 KB por fila y la tanda no necesita más peticiones', async () => {
    await listo('BIG');
    const grande = doc(...Array.from({ length: 120 }, (_, i) => parrafo(`Línea ${i} `.padEnd(170, 'x'))));
    m.jira.proyectos.set('BIG', Array.from({ length: 230 }, (_, i) => issue(i + 1, 'BIG', { descripcionAdf: grande })));
    const r = await consultar();
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.ejecucion.leidas, r.body.consulta.hayMas], [100, true]);
    assert.equal(m.jira.llamadas.filter((l) => l === 'buscarPagina').length, 2, '2 páginas de 50, sin llamadas por HDU');
    const max = (await consultaDuenio<{ n: number }>('SELECT max(octet_length(detalle::text))::int AS n FROM integraciones.consulta_item'))[0]?.n ?? 0;
    assert.ok(max > 8000 && max <= 40_960, String(max));
  });

  it('E5-B06-T12 con Jira lento y descripciones grandes la tanda termina INCOMPLETA con hayMas y "Continuar" sigue; ninguna fila queda a medias', async () => {
    await listo('BIG', { config: { presupuestoMs: 2500, topeIssues: 500 } });
    const grande = doc(...Array.from({ length: 60 }, (_, i) => parrafo(`Línea ${i} `.padEnd(170, 'y'))));
    m.jira.proyectos.set('BIG', Array.from({ length: 230 }, (_, i) => issue(i + 1, 'BIG', { descripcionAdf: grande })));
    m.jira.retardoMs = 1000;
    const r = await consultar();
    assert.equal(r.body.ejecucion.resultado, 'INCOMPLETA');
    assert.equal(r.body.consulta.hayMas, true);
    const filas = (await consultaDuenio<{ n: number; con: number }>('SELECT count(*)::int AS n, count(detalle)::int AS con FROM integraciones.consulta_item'))[0];
    assert.equal(filas?.n, r.body.ejecucion.leidas);
    assert.equal(filas?.con, filas?.n, 'toda fila guardada trae su detalle completo');
    m.jira.retardoMs = 0;
    const c = await m.pedir('post', `${CONSULTAR}/${r.body.consulta.id}/continuaciones`, 'adm1', {});
    assert.equal(c.status, 200);
    assert.ok(c.body.ejecucion.leidas > 0);
  });
});

describe('E5-B02#6 · clasificación y HDU existente (D204)', () => {
  it('E5-B02-T26 CAMBIO y SIN_CAMBIOS traen yaAsignada {idHistoria, qe, analista} e idHistoria; NUEVA no; yaAsignadas cuenta', async () => {
    await listo();
    const con = org.agregarHdu({ codigo: 'QTY-1', titulo: 'Otro nombre', origen: 'JIRA', qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id });
    const sin = org.agregarHdu({ codigo: 'QTY-2', titulo: 'Historia QTY-2', descripcion: 'Descripción QTY-2', prioridad: 'MEDIA', origen: 'MANUAL', qeId: PERSONAS.qe1.id });
    const cerrada = org.agregarHdu({ codigo: 'QTY-3', titulo: 'Cerrada', estado: 'CERRADA', origen: 'JIRA', qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id });
    const r = await consultar();
    const id = r.body.consulta.id as string;
    const cambio = (await items(id, 'CAMBIO')).items.find((i: { codigo: string }) => i.codigo === 'QTY-1');
    assert.deepEqual(cambio.yaAsignada, { idHistoria: con.id, qe: 'Marcos QE', analista: 'Ana Tres' });
    assert.equal(cambio.idHistoria, con.id);
    const manual = (await items(id, 'SIN_CAMBIOS')).items.find((i: { codigo: string }) => i.codigo === 'QTY-2');
    assert.deepEqual(manual.yaAsignada, { idHistoria: sin.id, qe: 'Carla QE', analista: null });
    const hecha = (await items(id, 'SIN_CAMBIOS')).items.find((i: { codigo: string }) => i.codigo === 'QTY-3');
    assert.equal(hecha.yaAsignada.idHistoria, cerrada.id);
    const nueva = (await items(id, 'NUEVA')).items[0];
    assert.deepEqual([nueva.yaAsignada, nueva.idHistoria, nueva.revision, nueva.analistaAuto, nueva.aplicando, nueva.aplicacion], [null, null, 1, false, false, null]);
    // La página y la consulta cuentan las yaAsignadas.
    assert.equal((await items(id, 'CAMBIO')).yaAsignadas, 1);
    assert.equal((await items(id, 'SIN_CAMBIOS')).yaAsignadas, 2);
    assert.equal((await items(id, 'NUEVA')).yaAsignadas, 0);
    const c = (await m.pedir('get', `${CONSULTAR}/${id}`, 'adm1')).body;
    assert.deepEqual([c.yaAsignadas, c.creadas], [3, 0]);
  });

  it('con una Organización anterior (sin analista en estado-codigos) se trata como «sin Analista» y la consulta sigue', async () => {
    await listo();
    org.versionAnterior = true;
    const h = org.agregarHdu({ codigo: 'QTY-1', titulo: 'Otro', origen: 'JIRA', analistaId: PERSONAS.ana3.id });
    const id = (await consultar()).body.consulta.id as string;
    const cambio = (await items(id, 'CAMBIO')).items[0];
    assert.deepEqual(cambio.yaAsignada, { idHistoria: h.id, qe: 'Marcos QE', analista: null });
  });
});
