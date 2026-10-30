/** Pruebas unitarias del mapeo de issues: ADF, prioridad, sprint, sitio, issue y fila de archivo (J2, J3). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { adfATexto } from '../../../src/dominio/mapeo/adf-a-texto.js';
import { validarFilasArchivo, type FilaCruda } from '../../../src/dominio/mapeo/fila-archivo.js';
import { mapearIssue } from '../../../src/dominio/mapeo/issue.js';
import { mapearPrioridadJira, resolverPrioridad } from '../../../src/dominio/mapeo/prioridad.js';
import { permitirHostPruebaEfectivo, validarSitio } from '../../../src/dominio/mapeo/sitio.js';
import { elegirSprint } from '../../../src/dominio/mapeo/sprint.js';
import { aFilaUpsert, recortar } from '../../../src/dominio/mapeo/tipos.js';
import type { IssueJira, SprintJira } from '../../../src/dominio/puertos/fuente-jira.js';

const SITIO = 'https://equipo.atlassian.net';
const texto = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const parrafo = (...c: unknown[]) => ({ type: 'paragraph', content: c });
const doc = (...c: unknown[]) => ({ type: 'doc', version: 1, content: c });

describe('adfATexto', () => {
  it('separa párrafos y títulos por salto de línea', () => {
    const adf = doc({ type: 'heading', attrs: { level: 2 }, content: [texto('Contexto')] }, parrafo(texto('Primero')), parrafo(texto('Segundo')));
    assert.equal(adfATexto(adf), 'Contexto\nPrimero\nSegundo');
  });

  it('viñetas con «- », lista numerada y anidada', () => {
    const adf = doc(
      { type: 'bulletList', content: [
        { type: 'listItem', content: [parrafo(texto('uno'))] },
        { type: 'listItem', content: [parrafo(texto('dos')), { type: 'bulletList', content: [{ type: 'listItem', content: [parrafo(texto('dos.a'))] }] }] },
      ] },
      { type: 'orderedList', attrs: { order: 3 }, content: [{ type: 'listItem', content: [parrafo(texto('tres'))] }, { type: 'listItem', content: [parrafo(texto('cuatro'))] }] },
    );
    assert.equal(adfATexto(adf), '- uno\n- dos\n  - dos.a\n3. tres\n4. cuatro');
  });

  it('mención y enlace con su texto, en la misma línea', () => {
    const adf = doc(parrafo(
      texto('Hola '), { type: 'mention', attrs: { id: 'x', text: '@Ana Torres' } }, texto(', mira '),
      texto('la guía', [{ type: 'link', attrs: { href: 'https://ejemplo.test/guia' } }]), texto('.'),
    ));
    assert.equal(adfATexto(adf), 'Hola @Ana Torres, mira la guía.');
  });

  it('salto duro, emoji, estado, tarjeta en línea y fecha', () => {
    const adf = doc(parrafo(
      texto('a'), { type: 'hardBreak' }, texto('b '), { type: 'emoji', attrs: { shortName: ':smile:', text: '😄' } },
      texto(' '), { type: 'status', attrs: { text: 'LISTO', color: 'green' } }, texto(' '),
      { type: 'inlineCard', attrs: { url: 'https://ejemplo.test/x' } }, texto(' '),
      { type: 'date', attrs: { timestamp: String(Date.UTC(2026, 9, 30)) } },
    ));
    assert.equal(adfATexto(adf), 'a\nb 😄 LISTO https://ejemplo.test/x 2026-10-30');
  });

  it('ignora nodos desconocidos con todo su contenido, sin etiquetas ni JSON', () => {
    const adf = doc(
      parrafo(texto('visible')),
      { type: 'nodoInventado', content: [parrafo(texto('oculto'))] },
      { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x' } }] },
      { type: 'rule' },
      parrafo(texto('final')),
    );
    const salida = adfATexto(adf);
    assert.equal(salida, 'visible\nfinal');
    assert.ok(!/[<>{}]/.test(salida));
  });

  it('bloque de código, cita, panel y tabla', () => {
    const adf = doc(
      { type: 'codeBlock', content: [texto('línea 1\nlínea 2')] },
      { type: 'blockquote', content: [parrafo(texto('cita'))] },
      { type: 'panel', attrs: { panelType: 'info' }, content: [parrafo(texto('aviso'))] },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [parrafo(texto('A'))] }, { type: 'tableHeader', content: [parrafo(texto('B'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [parrafo(texto('1'))] }, { type: 'tableCell', content: [parrafo(texto('2'))] }] },
      ] },
    );
    assert.equal(adfATexto(adf), 'línea 1\nlínea 2\ncita\naviso\nA | B\n1 | 2');
  });

  it('entradas vacías o con otra forma devuelven cadena vacía', () => {
    for (const v of [null, undefined, 42, [], true, {}, doc(), doc(parrafo()), { type: 'doc', content: 'no es lista' }]) {
      assert.equal(adfATexto(v), '');
    }
  });

  it('un texto plano (formato v2) se devuelve limpio', () => {
    assert.equal(adfATexto('  Como usuario quiero activar 2FA \r\n'), 'Como usuario quiero activar 2FA');
  });

  it('quita caracteres de control, incluido NUL', () => {
    assert.equal(adfATexto(doc(parrafo(texto('a\u0000b\u0007c')))), 'abc');
  });

  it('una anidación hostil no desborda la pila', () => {
    let nodo: unknown = parrafo(texto('profundo'));
    for (let i = 0; i < 5000; i++) nodo = { type: 'blockquote', content: [nodo] };
    assert.doesNotThrow(() => adfATexto(doc(nodo)));
    assert.equal(adfATexto(doc(nodo)), '');
  });

  it('acota la salida enorme', () => {
    const grande = doc(...Array.from({ length: 5000 }, () => parrafo(texto('x'.repeat(50)))));
    assert.ok(adfATexto(grande).length <= 20_000);
  });
});

describe('prioridad', () => {
  it('tabla 5.1 sin distinguir mayúsculas ni tildes', () => {
    const casos: [string, string][] = [
      ['Highest', 'CRITICA'], ['BLOCKER', 'CRITICA'], ['critical', 'CRITICA'], ['Más alta', 'CRITICA'], ['MAS ALTA', 'CRITICA'], ['Crítica', 'CRITICA'], ['CRITICA', 'CRITICA'],
      ['High', 'ALTA'], ['Alta', 'ALTA'], ['alta', 'ALTA'],
      ['Medium', 'MEDIA'], ['Media', 'MEDIA'], ['MEDIA', 'MEDIA'],
      ['Low', 'BAJA'], ['Lowest', 'BAJA'], ['Baja', 'BAJA'], ['Más baja', 'BAJA'], ['  más   baja ', 'BAJA'],
    ];
    for (const [entrada, esperado] of casos) assert.equal(resolverPrioridad(entrada), esperado, entrada);
  });

  it('valores fuera de la tabla son null (incluidos nombres de Object.prototype)', () => {
    for (const v of ['Urgentísima', '', 'urgente', 'constructor', '__proto__', 'toString']) assert.equal(resolverPrioridad(v), null, v);
  });

  it('Jira: ausente y desconocida llevan advertencia y prioridad null', () => {
    assert.deepEqual(mapearPrioridadJira(null), { prioridad: null, advertencia: 'PRIORIDAD_AUSENTE' });
    assert.deepEqual(mapearPrioridadJira('   '), { prioridad: null, advertencia: 'PRIORIDAD_AUSENTE' });
    assert.deepEqual(mapearPrioridadJira('Urgentísima'), { prioridad: null, advertencia: 'PRIORIDAD_DESCONOCIDA' });
    assert.deepEqual(mapearPrioridadJira('High'), { prioridad: 'ALTA', advertencia: null });
  });
});

describe('elegirSprint', () => {
  const s = (nombre: string, estado: SprintJira['estado'], fin: string | null = null): SprintJira => ({ nombre, estado, fin });

  it('prefiere el activo aunque haya cerrados y futuros', () => {
    assert.equal(elegirSprint([s('Externo 9', 'closed', '2026-01-01'), s('E5 Sprint 1', 'active'), s('F', 'future')]), 'E5 Sprint 1');
  });
  it('sin activo, el futuro más próximo', () => {
    assert.equal(elegirSprint([s('Lejano', 'future', '2026-12-31'), s('Cercano', 'future', '2026-11-15'), s('C', 'closed', '2026-10-01')]), 'Cercano');
    assert.equal(elegirSprint([s('Sin fecha', 'future'), s('Con fecha', 'future', '2026-11-15')]), 'Con fecha');
  });
  it('sin activo ni futuro, el cerrado más reciente', () => {
    assert.equal(elegirSprint([s('Viejo', 'closed', '2026-01-01'), s('Nuevo', 'closed', '2026-09-01'), s('Sin fecha', 'closed')]), 'Nuevo');
    assert.equal(elegirSprint([s('Sin fecha', 'closed'), s('Con fecha', 'closed', '2026-09-01')]), 'Con fecha');
  });
  it('sin sprints, o con nombre vacío, devuelve null', () => {
    assert.equal(elegirSprint([]), null);
    assert.equal(elegirSprint([s('  ', 'active')]), null);
  });
  it('recorta el nombre y tolera fechas ilegibles', () => {
    assert.equal(elegirSprint([s('  E5 Sprint 2 ', 'active')]), 'E5 Sprint 2');
    assert.equal(elegirSprint([s('A', 'closed', 'no es fecha'), s('B', 'closed', '2026-02-01')]), 'B');
  });
});

describe('validarSitio (D95)', () => {
  const sin = { permitirHostPrueba: false };
  const con = { permitirHostPrueba: true };

  it('acepta solo https://<subdominio>.atlassian.net', () => {
    assert.deepEqual(validarSitio('https://equipo.atlassian.net', sin), { ok: true, sitio: 'https://equipo.atlassian.net' });
    assert.deepEqual(validarSitio('  https://a-b1.atlassian.net ', sin), { ok: true, sitio: 'https://a-b1.atlassian.net' });
  });

  it('rechaza lo que puede apuntar a otra parte (SSRF)', () => {
    const malos = [
      'http://equipo.atlassian.net', 'https://equipo.atlassian.net/', 'https://equipo.atlassian.net/ruta',
      'https://equipo.atlassian.net:8443', 'https://usuario@equipo.atlassian.net', 'https://usuario:clave@equipo.atlassian.net',
      'https://atlassian.net', 'https://.atlassian.net', 'https://-a.atlassian.net', 'https://EQUIPO.atlassian.net',
      'https://equipo.atlassian.net.evil.com', 'https://evil.com/.atlassian.net', 'https://equipo.atlassian.net@evil.com',
      'https://equipo.atlassian.net?x=1', 'https://equipo.atlassian.net#x', 'https://sub.equipo.atlassian.net',
      'https://equipo.atlassian.com', 'https://localhost', 'https://127.0.0.1', 'https://169.254.169.254',
      'http://127.0.0.1:4010', 'ftp://equipo.atlassian.net', '', '   ', 'equipo.atlassian.net',
      `https://${'a'.repeat(64)}.atlassian.net`, 'https://equipo.atlassian.net\u0000', 'https://equipo.atlassian.net\n.evil.com',
    ];
    for (const m of malos) assert.deepEqual(validarSitio(m, sin), { ok: false }, JSON.stringify(m));
    for (const v of [null, undefined, 42, {}, []]) assert.deepEqual(validarSitio(v, sin), { ok: false });
  });

  it('con la bandera de pruebas admite http://127.0.0.1:<puerto> y nada más', () => {
    assert.deepEqual(validarSitio('http://127.0.0.1:4010', con), { ok: true, sitio: 'http://127.0.0.1:4010' });
    for (const m of ['http://127.0.0.1', 'http://127.0.0.1:0', 'http://127.0.0.1:99999', 'http://127.0.0.1:4010/x', 'http://localhost:4010',
      'http://10.0.0.1:80', 'http://127.0.0.2:4010', 'https://127.0.0.1:4010', 'http://127.0.0.1:4010@evil.com', 'http://[::1]:4010']) {
      assert.deepEqual(validarSitio(m, con), { ok: false }, m);
    }
  });

  it('la bandera se ignora con NODE_ENV=production', () => {
    assert.equal(permitirHostPruebaEfectivo({ INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }), true);
    assert.equal(permitirHostPruebaEfectivo({ NODE_ENV: 'development', INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }), true);
    assert.equal(permitirHostPruebaEfectivo({ NODE_ENV: 'production', INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }), false);
    assert.equal(permitirHostPruebaEfectivo({ INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'false' }), false);
    assert.equal(permitirHostPruebaEfectivo({ INTEGRACIONES_PERMITIR_HOST_PRUEBA: '1' }), false);
    assert.equal(permitirHostPruebaEfectivo({}), false);
  });
});

describe('mapearIssue', () => {
  const base = (c: Partial<IssueJira> = {}): IssueJira => ({
    clave: 'QTY-1', tipo: 'Story', titulo: 'Login con doble factor', descripcionAdf: doc(parrafo(texto('Como usuario quiero activar 2FA'))),
    prioridad: 'High', estado: 'In Progress', responsable: 'Ana Torres', sprints: [{ nombre: 'E5 Sprint 2', estado: 'active', fin: null }], ...c,
  });

  it('caso base (QTY-1): campos mapeados, enlace y referencia', () => {
    assert.deepEqual(mapearIssue(base(), 1, SITIO), {
      fila: 1, codigo: 'QTY-1', titulo: 'Login con doble factor', descripcion: 'Como usuario quiero activar 2FA', prioridad: 'ALTA',
      sprint: 'E5 Sprint 2', claveExterna: 'QTY-1', urlExterna: 'https://equipo.atlassian.net/browse/QTY-1',
      advertencias: [], referencia: { estado: 'In Progress', responsable: 'Ana Torres' }, error: null,
    });
  });

  it('QTY-3: descripción null no es error, prioridad Highest y sprint cerrado', () => {
    const f = mapearIssue(base({ clave: 'QTY-3', descripcionAdf: null, prioridad: 'Highest', sprints: [{ nombre: 'Sprint Externo 9', estado: 'closed', fin: '2026-01-01' }] }), 3, SITIO);
    assert.equal(f.prioridad, 'CRITICA');
    assert.equal(f.descripcion, null);
    assert.equal(f.sprint, 'Sprint Externo 9');
    assert.equal(f.error, null);
  });

  it('sin prioridad: advertencia y prioridad null (Organización decide MEDIA al crear)', () => {
    const f = mapearIssue(base({ prioridad: null }), 1, SITIO);
    assert.equal(f.prioridad, null);
    assert.deepEqual(f.advertencias, ['PRIORIDAD_AUSENTE']);
    assert.deepEqual(mapearIssue(base({ prioridad: 'Urgentísima' }), 1, SITIO).advertencias, ['PRIORIDAD_DESCONOCIDA']);
  });

  it('recorta el título a 200 con TITULO_TRUNCADO (QTY-8)', () => {
    const f = mapearIssue(base({ titulo: 'T'.repeat(250) }), 8, SITIO);
    assert.equal(f.titulo?.length, 200);
    assert.deepEqual(f.advertencias, ['TITULO_TRUNCADO']);
    assert.equal(f.error, null);
  });

  it('recorta la descripción a 1.000 con DESCRIPCION_TRUNCADA (QTY-9)', () => {
    const f = mapearIssue(base({ descripcionAdf: doc(parrafo(texto('d'.repeat(1500)))) }), 9, SITIO);
    assert.equal(f.descripcion?.length, 1000);
    assert.deepEqual(f.advertencias, ['DESCRIPCION_TRUNCADA']);
  });

  it('no parte un par sustituto al recortar', () => {
    const f = mapearIssue(base({ titulo: `${'a'.repeat(199)}😄😄` }), 1, SITIO);
    assert.equal(f.titulo, 'a'.repeat(199));
    assert.equal(recortar('ab😄', 3), 'ab');
  });

  it('título vacío, solo espacios o nulo: TITULO_VACIO (QTY-11)', () => {
    for (const t of ['', '   ', null, '\u0000\t']) {
      const f = mapearIssue(base({ titulo: t }), 11, SITIO);
      assert.equal(f.error, 'TITULO_VACIO');
      assert.equal(f.titulo, null);
    }
  });

  it('código inválido: CODIGO_INVALIDO, sin enlace ni clave externa', () => {
    for (const c of ['', 'QTY 1', 'Q'.repeat(41), '-QTY-1', 'QTY-1/../x', 'QTY-1\u0000', '<script>']) {
      const f = mapearIssue(base({ clave: c }), 1, SITIO);
      assert.equal(f.error, 'CODIGO_INVALIDO', JSON.stringify(c));
      assert.equal(f.urlExterna, null);
      assert.equal(f.claveExterna, null);
    }
  });

  it('con varios problemas el error es el primero (código antes que título)', () => {
    assert.equal(mapearIssue(base({ clave: 'a b', titulo: '' }), 1, SITIO).error, 'CODIGO_INVALIDO');
  });

  it('el título queda en una línea y sin controles', () => {
    assert.equal(mapearIssue(base({ titulo: '  Hola\n\tmundo\u0000  ' }), 1, SITIO).titulo, 'Hola mundo');
  });

  it('elige el sprint activo entre varios (QTY-12)', () => {
    const f = mapearIssue(base({ sprints: [{ nombre: 'Sprint Externo 9', estado: 'closed', fin: '2026-01-01' }, { nombre: 'E5 Sprint 1', estado: 'active', fin: null }] }), 12, SITIO);
    assert.equal(f.sprint, 'E5 Sprint 1');
  });

  it('sin sprint: null', () => {
    assert.equal(mapearIssue(base({ sprints: [] }), 4, SITIO).sprint, null);
  });

  it('estado y responsable solo van en la referencia, acotados', () => {
    const f = mapearIssue(base({ estado: 'E'.repeat(300), responsable: null }), 1, SITIO);
    assert.equal(f.referencia?.estado?.length, 100);
    assert.equal(f.referencia?.responsable, null);
    assert.ok(!('estado' in aFilaUpsert(f)) && !('referencia' in aFilaUpsert(f)));
  });

  it('aFilaUpsert deja solo los campos del contrato', () => {
    const claves = Object.keys(aFilaUpsert(mapearIssue(base(), 1, SITIO))).sort();
    assert.deepEqual(claves, ['claveExterna', 'codigo', 'descripcion', 'fila', 'prioridad', 'sprint', 'titulo', 'urlExterna']);
  });

  it('la URL externa cabe en 300 caracteres con clave de 40', () => {
    const f = mapearIssue(base({ clave: 'A'.repeat(40) }), 1, 'https://' + 'a'.repeat(63) + '.atlassian.net');
    assert.ok((f.urlExterna ?? '').length <= 300);
  });
});

describe('validarFilasArchivo', () => {
  const fila = (n: number, valores: FilaCruda['valores']): FilaCruda => ({ fila: n, valores });
  const una = (valores: FilaCruda['valores']) => (validarFilasArchivo([fila(1, valores)])[0] as ReturnType<typeof validarFilasArchivo>[number]);

  it('fila válida completa', () => {
    const f = una({ codigo: ' ARC-1 ', titulo: 'Alta de cliente', descripcion: 'Registro básico', prioridad: 'alta', celula: 'CEL-C', sprint: 'E5 Sprint 2', qe_correo: 'qe2@quality360.local' });
    assert.deepEqual(f, {
      fila: 1, codigo: 'ARC-1', titulo: 'Alta de cliente', descripcion: 'Registro básico', prioridad: 'ALTA', celula: 'CEL-C', sprint: 'E5 Sprint 2',
      qeCorreo: 'qe2@quality360.local', claveExterna: null, urlExterna: null, advertencias: [], referencia: null, error: null,
    });
  });

  it('opcionales vacíos pasan como null; prioridad vacía es null (no error)', () => {
    const f = una({ codigo: 'ARC-2', titulo: 'Baja', descripcion: '', prioridad: '', celula: ' ', sprint: '', qe_correo: '' });
    assert.equal(f.error, null);
    assert.equal(f.prioridad, null);
    assert.equal(f.descripcion, null);
    assert.equal(f.celula, null);
    assert.equal(f.qeCorreo, null);
  });

  it('prioridades de la tabla y variantes', () => {
    const esperadas: [string, string | null][] = [['alta', 'ALTA'], ['Alta', 'ALTA'], ['Crítica', 'CRITICA'], ['High', 'ALTA'], ['baja', 'BAJA']];
    for (const [entrada, esperado] of esperadas) assert.equal(una({ codigo: 'X', titulo: 't', prioridad: entrada }).prioridad, esperado);
    const mala = una({ codigo: 'X', titulo: 't', prioridad: 'urgente' });
    assert.equal(mala.error, 'PRIORIDAD_INVALIDA');
    assert.equal(una({ codigo: 'X', titulo: 't', prioridad: { a: 1 } }).error, 'PRIORIDAD_INVALIDA');
  });

  it('CODIGO_INVALIDO: vacío, con espacio, de 41 caracteres, con símbolo, objeto', () => {
    for (const c of ['', '   ', 'ARC 12', 'A'.repeat(41), '_ARC', 'AR/C', undefined, null, { x: 1 }]) {
      assert.equal(una({ codigo: c, titulo: 't' }).error, 'CODIGO_INVALIDO', JSON.stringify(c));
    }
    assert.equal(una({ codigo: 'A'.repeat(40), titulo: 't' }).error, null);
  });

  it('el código numérico de un JSON se acepta como texto', () => {
    assert.equal(una({ codigo: 123, titulo: 't' }).codigo, '123');
  });

  it('TITULO_VACIO y TITULO_LARGO (en archivo no se trunca: es error)', () => {
    assert.equal(una({ codigo: 'X', titulo: '  ' }).error, 'TITULO_VACIO');
    assert.equal(una({ codigo: 'X' }).error, 'TITULO_VACIO');
    const largo = una({ codigo: 'X', titulo: 't'.repeat(201) });
    assert.equal(largo.error, 'TITULO_LARGO');
    assert.ok(!largo.advertencias.includes('TITULO_TRUNCADO'));
    assert.equal(una({ codigo: 'X', titulo: 't'.repeat(200) }).error, null);
  });

  it('descripción de más de 1.000: recorte con advertencia; conserva los saltos de línea', () => {
    const f = una({ codigo: 'X', titulo: 't', descripcion: 'd'.repeat(1001) });
    assert.equal(f.descripcion?.length, 1000);
    assert.deepEqual(f.advertencias, ['DESCRIPCION_TRUNCADA']);
    assert.equal(una({ codigo: 'X', titulo: 't', descripcion: 'a\r\nb' }).descripcion, 'a\nb');
  });

  it('CODIGO_DUPLICADO_EN_ARCHIVO: gana la primera, sin distinguir mayúsculas', () => {
    const r = validarFilasArchivo([fila(1, { codigo: 'ARC-9', titulo: 'a' }), fila(2, { codigo: 'arc-9', titulo: 'b' }), fila(3, { codigo: 'ARC-9', titulo: 'c' })]);
    assert.deepEqual(r.map((x) => x.error), [null, 'CODIGO_DUPLICADO_EN_ARCHIVO', 'CODIGO_DUPLICADO_EN_ARCHIVO']);
  });

  it('un código inválido no ocupa el nombre para los duplicados', () => {
    const r = validarFilasArchivo([fila(1, { codigo: 'A B', titulo: 'a' }), fila(2, { codigo: 'A B', titulo: 'b' })]);
    assert.deepEqual(r.map((x) => x.error), ['CODIGO_INVALIDO', 'CODIGO_INVALIDO']);
  });

  it('una fila con título vacío igual reserva su código', () => {
    const r = validarFilasArchivo([fila(1, { codigo: 'D-1', titulo: '' }), fila(2, { codigo: 'D-1', titulo: 'x' })]);
    assert.deepEqual(r.map((x) => x.error), ['TITULO_VACIO', 'CODIGO_DUPLICADO_EN_ARCHIVO']);
  });

  it('precedencia: código, duplicado, título vacío, título largo, prioridad', () => {
    assert.equal(una({ codigo: 'a b', titulo: '', prioridad: 'x' }).error, 'CODIGO_INVALIDO');
    assert.equal(una({ codigo: 'ok', titulo: '', prioridad: 'x' }).error, 'TITULO_VACIO');
    assert.equal(una({ codigo: 'ok', titulo: 't'.repeat(300), prioridad: 'x' }).error, 'TITULO_LARGO');
  });

  it('celdas que empiezan con = + - @ se conservan tal cual (D122)', () => {
    for (const p of ['=SUMA(A1)', '+1', '-2', '@usuario']) {
      const f = una({ codigo: 'F-1', titulo: p, descripcion: p });
      assert.equal(f.titulo, p);
      assert.equal(f.descripcion, p);
      assert.equal(f.error, null);
    }
  });

  it('celula, sprint y correo más largos que el contrato son error de fila, no 400 del lote', () => {
    assert.equal(una({ codigo: 'X', titulo: 't', celula: 'c'.repeat(121) }).error, 'CELULA_NO_ENCONTRADA');
    assert.equal(una({ codigo: 'X', titulo: 't', sprint: 's'.repeat(121) }).error, 'SPRINT_NO_ENCONTRADO');
    assert.equal(una({ codigo: 'X', titulo: 't', qe_correo: 'q'.repeat(151) }).error, 'QE_INVALIDO');
    assert.equal(una({ codigo: 'X', titulo: 't', celula: 'c'.repeat(120) }).error, null);
  });

  it('el código de una fila inválida muy largo se acota al límite del contrato', () => {
    assert.equal(una({ codigo: 'A'.repeat(500), titulo: 't' }).codigo.length, 200);
  });

  it('conserva el número de fila recibido', () => {
    assert.deepEqual(validarFilasArchivo([fila(7, { codigo: 'A', titulo: 'a' }), fila(8, { codigo: 'B', titulo: 'b' })]).map((f) => f.fila), [7, 8]);
  });
});
