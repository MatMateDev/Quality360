/**
 * Detalle de la HDU (D196-D199, E5-B06 #2-#5): mapeo completo, criterios de aceptación, saneamiento y límites, datos raros.
 * Dominio puro: sin base de datos ni red.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { adfADetalle, criteriosDeDescripcion, esUrlHttp, quitarEtiquetas } from '../../../src/dominio/mapeo/adf-a-texto.js';
import { bytesDe, construirDetalle, fechaHoraIso, fechaIso, LIMITES_DETALLE } from '../../../src/dominio/mapeo/detalle.js';
import { mapearIssue } from '../../../src/dominio/mapeo/issue.js';
import type { IssueJira } from '../../../src/dominio/puertos/fuente-jira.js';

const SITIO = 'https://equipo.atlassian.net';
const URL_JIRA = `${SITIO}/browse/QTY-17`;

const texto = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks === undefined ? {} : { marks }) });
const parrafo = (...c: unknown[]) => ({ type: 'paragraph', content: c });
const encabezado = (nivel: number, t: string) => ({ type: 'heading', attrs: { level: nivel }, content: [texto(t)] });
const doc = (...c: unknown[]) => ({ type: 'doc', version: 1, content: c });
const lista = (...items: string[]) => ({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [parrafo(texto(t))] })) });

const issue = (parcial: Partial<IssueJira> = {}): IssueJira => ({
  clave: 'QTY-17', tipo: 'Historia', titulo: 'Login con doble factor', descripcionAdf: doc(parrafo(texto('Como usuario quiero un segundo factor.'))),
  prioridad: 'High', estado: 'Por hacer', responsable: 'Rosa Pérez', sprints: [], ...parcial,
});

describe('E5-B06 #2 · mapeo completo', () => {
  it('guarda todos los campos de DetalleHdu, la prioridad de Jira y su equivalente, sprints con estado y fechas, y la épica desde parent', () => {
    const d = construirDetalle(
      issue({
        labels: ['seguridad', 'login'],
        sprints: [
          { nombre: 'E5 Sprint 1', estado: 'closed', inicio: '2026-10-19T12:00:00.000Z', fin: '2026-11-01T12:00:00.000Z' },
          { nombre: 'E5 Sprint 2', estado: 'active', inicio: '2026-11-02T12:00:00.000Z', fin: null },
          { nombre: 'E5 Sprint 3', estado: 'future', fin: null },
        ],
        padre: { clave: 'QTY-100', titulo: 'Seguridad de acceso', esEpica: true },
        creada: '2026-10-20T11:00:00.000-0300',
        actualizada: '2026-11-04T15:30:00.000+0000',
        vencimiento: '2026-11-20',
        resolucion: null,
      }),
      URL_JIRA,
    );
    assert.deepEqual(d, {
      resumen: 'Login con doble factor',
      descripcion: { texto: 'Como usuario quiero un segundo factor.', truncado: false },
      criterios: { texto: null, origen: null, truncado: false },
      estadoJira: 'Por hacer',
      prioridadJira: 'High',
      prioridadQ360: 'ALTA',
      tipo: 'Historia',
      responsableJira: 'Rosa Pérez',
      etiquetas: [{ valor: 'seguridad' }, { valor: 'login' }],
      etiquetasTotal: 2,
      sprints: [
        { nombre: 'E5 Sprint 1', estado: 'CERRADO', inicio: '2026-10-19T12:00:00.000Z', fin: '2026-11-01T12:00:00.000Z' },
        { nombre: 'E5 Sprint 2', estado: 'ACTIVO', inicio: '2026-11-02T12:00:00.000Z', fin: null },
        { nombre: 'E5 Sprint 3', estado: 'FUTURO', inicio: null, fin: null },
      ],
      epica: { clave: 'QTY-100', titulo: 'Seguridad de acceso' },
      fechas: { creada: '2026-10-20T14:00:00.000Z', actualizada: '2026-11-04T15:30:00.000Z', vencimiento: '2026-11-20', resolucion: null },
      urlJira: URL_JIRA,
    });
  });

  it('la prioridad de Jira se conserva tal cual aunque no tenga equivalente; la equivalente es null', () => {
    const d = construirDetalle(issue({ prioridad: 'Urgentísima' }), URL_JIRA);
    assert.deepEqual([d.prioridadJira, d.prioridadQ360], ['Urgentísima', null]);
    const sin = construirDetalle(issue({ prioridad: null }), URL_JIRA);
    assert.deepEqual([sin.prioridadJira, sin.prioridadQ360], [null, null]);
  });

  it('con más de 20 etiquetas guarda 20 de hasta 50 caracteres y cuenta el total (etiquetasTotal)', () => {
    const labels = Array.from({ length: 25 }, (_, i) => `etiqueta-${i + 1}`);
    labels[0] = 'x'.repeat(80);
    const d = construirDetalle(issue({ labels }), URL_JIRA);
    assert.equal(d.etiquetas.length, 20);
    assert.equal(d.etiquetas[0]?.valor.length, 50);
    assert.equal(d.etiquetasTotal, 25);
  });

  it('con más de 10 sprints guarda 10', () => {
    const sprints = Array.from({ length: 14 }, (_, i) => ({ nombre: `Sprint ${i + 1}`, estado: 'closed' as const, fin: null }));
    assert.equal(construirDetalle(issue({ sprints }), URL_JIRA).sprints.length, 10);
  });

  it('la épica solo sale de un parent que Jira marca como épica; el resumen llega hasta 255 caracteres (el título de la HDU sigue en 200)', () => {
    assert.equal(construirDetalle(issue({ padre: { clave: 'QTY-5', titulo: 'Otra historia', esEpica: false } }), URL_JIRA).epica, null);
    assert.equal(construirDetalle(issue({ padre: { clave: 'QTY-5', titulo: 'x', esEpica: false }, titulo: 'T'.repeat(300) }), URL_JIRA).resumen?.length, 255);
    assert.deepEqual(construirDetalle(issue({ padre: { clave: 'QTY-100', titulo: 'E'.repeat(250), esEpica: true } }), URL_JIRA).epica?.titulo?.length, 200);
  });
});

describe('E5-B06 #3 · criterios de aceptación (D199)', () => {
  const descripcionConSeccion = doc(
    parrafo(texto('Como usuario quiero un segundo factor.')),
    encabezado(2, 'Criterios de aceptación'),
    lista('Pide el código tras la contraseña', 'Bloquea tras 5 intentos'),
    encabezado(2, 'Notas'),
    parrafo(texto('Fuera de alcance: biometría.')),
  );

  it('origen CAMPO: el campo detectado manda, aunque la descripción también tenga la sección', () => {
    const d = construirDetalle(issue({ criteriosAdf: doc(parrafo(texto('1. Del campo'))), descripcionAdf: descripcionConSeccion }), URL_JIRA);
    assert.deepEqual(d.criterios, { texto: '1. Del campo', origen: 'CAMPO', truncado: false });
  });

  it('origen DESCRIPCION: la sección bajo el encabezado, hasta el siguiente encabezado del mismo nivel; la descripción conserva TODO su texto', () => {
    const d = construirDetalle(issue({ descripcionAdf: descripcionConSeccion }), URL_JIRA);
    assert.deepEqual(d.criterios, { texto: '• Pide el código tras la contraseña\n• Bloquea tras 5 intentos', origen: 'DESCRIPCION', truncado: false });
    assert.match(d.descripcion.texto ?? '', /Criterios de aceptación/);
    assert.match(d.descripcion.texto ?? '', /Fuera de alcance: biometría\./);
  });

  it('reconoce «Acceptance criteria:» en inglés, en un párrafo y en una descripción de texto plano', () => {
    const enParrafo = doc(parrafo(texto('Acceptance criteria:')), parrafo(texto('Debe validar el código')));
    assert.equal(construirDetalle(issue({ descripcionAdf: enParrafo }), URL_JIRA).criterios.texto, 'Debe validar el código');
    assert.equal(criteriosDeDescripcion('Resumen\nCriterios de aceptación\nUno\nDos'), 'Uno\nDos');
  });

  it('origen null: ni campo ni encabezado', () => {
    assert.deepEqual(construirDetalle(issue(), URL_JIRA).criterios, { texto: null, origen: null, truncado: false });
    // Un encabezado sin contenido tampoco cuenta.
    assert.equal(criteriosDeDescripcion(doc(encabezado(2, 'Criterios de aceptación'))), null);
  });

  it('los criterios se recortan a 4.000 caracteres y marcan truncado', () => {
    const d = construirDetalle(issue({ criteriosAdf: doc(parrafo(texto('c'.repeat(5000)))) }), URL_JIRA);
    assert.equal(d.criterios.texto?.length, 4000);
    assert.equal(d.criterios.truncado, true);
  });
});

describe('E5-B06 #4 · saneamiento y límites (D198)', () => {
  it('listas con «• » o «N. », tablas como «celda · celda», media y macros como «[contenido no mostrable]»', () => {
    const adf = doc(
      lista('uno', 'dos'),
      { type: 'orderedList', content: [{ type: 'listItem', content: [parrafo(texto('primero'))] }, { type: 'listItem', content: [parrafo(texto('segundo'))] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [parrafo(texto('A'))] }, { type: 'tableCell', content: [parrafo(texto('B'))] }] }] },
      { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x', type: 'file' } }] },
      { type: 'bodiedExtension', attrs: { extensionType: 'com.atlassian.confluence.macro.core' }, content: [parrafo(texto('contenido del macro'))] },
    );
    assert.equal(adfADetalle(adf), '• uno\n• dos\n1. primero\n2. segundo\nA · B\n[contenido no mostrable]\n[contenido no mostrable]');
  });

  it('solo los enlaces http(s) quedan como «texto (url)»; javascript: y data: se quedan en el texto, sin la URL', () => {
    const https = { type: 'link', attrs: { href: 'https://equipo.atlassian.net/wiki/x' } };
    const malo = { type: 'link', attrs: { href: 'javascript:alert(1)' } };
    const datos = { type: 'link', attrs: { href: 'data:text/html;base64,PHNjcmlwdD4=' } };
    const adf = doc(parrafo(texto('ver guía', [https]), texto(' y '), texto('hacer clic', [malo]), texto(' o '), texto('abrir', [datos])));
    const salida = adfADetalle(adf);
    assert.equal(salida, 'ver guía (https://equipo.atlassian.net/wiki/x) y hacer clic o abrir');
    assert.doesNotMatch(salida, /javascript|data:/i);
    assert.deepEqual([esUrlHttp('https://a.b'), esUrlHttp('http://a.b/x'), esUrlHttp('javascript:alert(1)'), esUrlHttp('//a.b'), esUrlHttp('ftp://a.b'), esUrlHttp(null)], [true, true, false, false, false, false]);
  });

  it('una tarjeta (inlineCard) con una URL que no es http(s) no aparece', () => {
    assert.equal(adfADetalle(doc({ type: 'paragraph', content: [{ type: 'inlineCard', attrs: { url: 'javascript:alert(1)' } }, texto('ok')] })), 'ok');
  });

  it('sin etiquetas ejecutables: <script>, <style> y cualquier etiqueta HTML salen del texto', () => {
    const adf = doc(parrafo(texto('Hola <script>alert("x")</script>mundo <img src=x onerror=alert(1)> <b>negrita</b> y <style>p{}</style>fin')));
    const salida = adfADetalle(adf);
    assert.equal(salida, 'Hola mundo  negrita y fin');
    assert.doesNotMatch(salida, /[<>]/);
    assert.equal(quitarEtiquetas('a < b y c > d'), 'a < b y c > d');
    assert.equal(adfADetalle('<p onclick="x()">texto v2</p>'), 'texto v2');
  });

  it('elimina caracteres de control (incluido NUL) y las mitades sueltas de un par sustituto', () => {
    const sucio = `uno\u0000dos\u0007tres\ud800cuatro\udc00cinco\u{1F600}`;
    const salida = adfADetalle(doc(parrafo(texto(sucio))));
    assert.equal(salida, 'unodostrescuatrocinco\u{1F600}');
    assert.doesNotMatch(salida, /[\u0000-\u0008]/);
  });

  it('más de 8.000 caracteres: recorta a 8.000 con truncado true y la fila no se rechaza', () => {
    const d = construirDetalle(issue({ descripcionAdf: doc(parrafo(texto('d'.repeat(9000)))) }), URL_JIRA);
    assert.equal(d.descripcion.texto?.length, 8000);
    assert.equal(d.descripcion.truncado, true);
    const f = mapearIssue(issue({ clave: 'QTY-1', descripcionAdf: doc(parrafo(texto('d'.repeat(9000)))) }), 1, SITIO);
    assert.equal(f.error, null);
    assert.equal(f.detalle?.descripcion.truncado, true);
  });

  it('20 KB de ADF con media, macro y <script> (QTY-15): cabe en 40 KB, trae los marcadores y ningún script', () => {
    const bloques: unknown[] = [];
    for (let i = 0; i < 200; i++) {
      bloques.push(parrafo(texto(`Párrafo ${i} con acentos áéíóú ñ y un texto bastante largo para ocupar espacio. `.repeat(2))));
      if (i % 40 === 0) bloques.push({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: String(i), type: 'file' } }] });
    }
    bloques.push({ type: 'extension', attrs: { extensionType: 'x', extensionKey: 'macro' } });
    bloques.push(parrafo(texto('<script>alert(1)</script>')));
    const d = construirDetalle(issue({ descripcionAdf: doc(...bloques) }), URL_JIRA);
    assert.ok(bytesDe(d) < 40_960);
    assert.match(d.descripcion.texto ?? '', /\[contenido no mostrable\]/);
    assert.doesNotMatch(JSON.stringify(d), /<script/i);
  });

  it('descripción y criterios de 3 bytes por carácter: se recorta lo necesario para caber en 40 KB, sin rechazar la fila', () => {
    const d = construirDetalle(issue({ descripcionAdf: doc(parrafo(texto('漢'.repeat(9000)))), criteriosAdf: doc(parrafo(texto('漢'.repeat(5000)))) }), URL_JIRA);
    assert.ok(bytesDe(d) <= LIMITES_DETALLE.bytesMax, String(bytesDe(d)));
    assert.equal(d.descripcion.truncado || d.criterios.truncado, true);
  });
});

describe('E5-B06 #5 · datos faltantes o raros', () => {
  it('QTY-16 vacía: todo null o vacío, la fila no pasa a CON_ERROR y nada lanza', () => {
    const f = mapearIssue(
      { clave: 'QTY-16', tipo: '', titulo: 'Vacía', descripcionAdf: null, prioridad: null, estado: null, responsable: null, sprints: [] },
      16,
      SITIO,
    );
    assert.equal(f.error, null);
    assert.deepEqual(f.detalle, {
      resumen: 'Vacía',
      descripcion: { texto: null, truncado: false },
      criterios: { texto: null, origen: null, truncado: false },
      estadoJira: null, prioridadJira: null, prioridadQ360: null, tipo: null, responsableJira: null,
      etiquetas: [], etiquetasTotal: 0, sprints: [], epica: null,
      fechas: { creada: null, actualizada: null, vencimiento: null, resolucion: null },
      urlJira: `${SITIO}/browse/QTY-16`,
    });
  });

  it('fechas que no son ISO, un sprint sin fechas y labels que no es una lista dejan null o vacío', () => {
    const raro = issue({
      creada: 'ayer', actualizada: '2026-13-45T00:00:00Z', vencimiento: '20/11/2026', resolucion: '',
      sprints: [{ nombre: 'Sin fechas', estado: 'active', fin: 'pronto', inicio: 'antes' }],
      labels: 'no-es-lista' as unknown as string[],
      padre: { clave: '', titulo: null, esEpica: true },
    });
    const d = construirDetalle(raro, URL_JIRA);
    assert.deepEqual(d.fechas, { creada: null, actualizada: null, vencimiento: null, resolucion: null });
    assert.deepEqual(d.sprints, [{ nombre: 'Sin fechas', estado: 'ACTIVO', inicio: null, fin: null }]);
    assert.deepEqual([d.etiquetas, d.etiquetasTotal, d.epica], [[], 0, null]);
  });

  it('una issue imposible de leer (campos con tipos inesperados) no lanza: el mapeo deja el detalle en null o completo, nunca corta la tanda', () => {
    // Lo que el cliente HTTP puede entregar con tipos válidos pero contenido raro (el puerto ya filtra strings y objetos).
    const hostil = {
      clave: 'QTY-9', tipo: 'Story', titulo: 'Raro', descripcionAdf: [1, 2, { type: 99 }], prioridad: 'High', estado: 'X', responsable: null,
      sprints: [null, { nombre: 5, estado: 'active', fin: null }, { nombre: 'ok', estado: 'inventado', fin: null }, { nombre: 'Bueno', estado: 'active', fin: null }],
      labels: [1, null, { a: 1 }, 'ok'], criteriosAdf: { type: 'doc', content: 'no' }, padre: { clave: 7, titulo: [], esEpica: true },
    } as unknown as IssueJira;
    const f = mapearIssue(hostil, 9, SITIO);
    assert.equal(f.error, null);
    assert.deepEqual(f.detalle?.etiquetas, [{ valor: 'ok' }]);
    assert.deepEqual(f.detalle?.sprints.map((s) => s.nombre), ['Bueno']);
    assert.equal(f.detalle?.epica, null);
  });

  it('fechaHoraIso y fechaIso aceptan el formato de Jira y rechazan el resto', () => {
    assert.equal(fechaHoraIso('2026-11-04T18:30:00.000-0300'), '2026-11-04T21:30:00.000Z');
    assert.equal(fechaHoraIso('2026-11-04T18:30:00Z'), '2026-11-04T18:30:00.000Z');
    assert.equal(fechaHoraIso('no'), null);
    assert.equal(fechaHoraIso(null), null);
    assert.equal(fechaIso('2026-02-30'), null);
    assert.equal(fechaIso('2026-11-20'), '2026-11-20');
    assert.equal(fechaIso('2026-11-20T00:00:00.000Z'), '2026-11-20');
  });
});
