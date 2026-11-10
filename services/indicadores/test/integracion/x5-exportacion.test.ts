/** X5 · exportación CSV y PDF (E6-B04) contra Postgres con fuentes simuladas. */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';

import request from 'supertest';

import { celdaCsv, generarCsv } from '../../src/infraestructura/exportacion/csv.js';
import { cerrarBases, limpiarIndicadores } from '../ayudas-bd.js';
import { montar, type Montaje } from '../montaje.js';
import { bearer, CELULAS, crearHdus, Mundo, PERSONAS, SPRINTS, SUPERVISION_BASE, TOKEN_SEMILLA } from '../mundo.js';

let m: Montaje;
const mundo = new Mundo();
const AHORA = new Date('2026-11-04T06:00:00Z'); // 03:00 en Santiago

before(async () => {
  await mundo.iniciar();
  m = await montar({ mundo, reloj: { ahora: () => AHORA } });
});
after(async () => {
  await m.cerrar();
  await mundo.cerrar();
  await cerrarBases();
});
beforeEach(async () => {
  await limpiarIndicadores();
  mundo.hdus = crearHdus();
  mundo.supervision = { ...SUPERVISION_BASE };
  mundo.caida = { org: false, cert: false, imp: false };
  mundo.falloAuditoria = false;
  mundo.llamadas = [];
  mundo.exportaciones = [];
  for (const clave of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) mundo.personas[clave] = { ...PERSONAS[clave] };
});

interface Archivo {
  status: number;
  tipo: string;
  disposicion: string;
  filas: string | undefined;
  texto: string;
  binario: Buffer;
  json: Record<string, unknown> | null;
}
async function exportar(persona: Parameters<Montaje['pedir']>[2], consulta: string, servidor: Montaje = m): Promise<Archivo> {
  let peticion = request(servidor.app.getHttpServer()).get(`/v1/indicadores/exportacion?${consulta}`);
  if (persona !== null) peticion = peticion.set('authorization', await bearer(persona));
  const r = await peticion.buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (parte: Buffer) => partes.push(parte));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  });
  const binario = r.body as Buffer;
  const tipo = String(r.headers['content-type'] ?? '');
  return {
    status: r.status,
    tipo,
    disposicion: String(r.headers['content-disposition'] ?? ''),
    filas: r.headers['x-q360-filas'] as string | undefined,
    texto: binario.toString('utf8'),
    binario,
    json: tipo.includes('json') ? (JSON.parse(binario.toString('utf8')) as Record<string, unknown>) : null,
  };
}

/** Líneas de datos de la tabla de un CSV (sin BOM ni encabezado), con sus celdas. */
function tabla(texto: string): { encabezado: Map<string, string>; columnas: string[]; filas: string[][] } {
  const lineas = texto.replace(/^﻿/, '').split('\r\n');
  const corte = lineas.indexOf('');
  const encabezado = new Map(lineas.slice(0, corte).map((l) => [l.split(';')[0] as string, l.slice(l.indexOf(';') + 1)]));
  const cuerpo = lineas.slice(corte + 1).filter((l) => l.length > 0);
  return { encabezado, columnas: (cuerpo[0] ?? '').split(';'), filas: cuerpo.slice(1).map((l) => l.split(';')) };
}

/** Texto de un PDF generado por pdf-lib: las cadenas de `drawText` van en hexadecimal (WinAnsi). */
function textoPdf(binario: Buffer): string {
  const fuente = binario.toString('latin1');
  const cadenas: string[] = [];
  for (const bloque of fuente.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido = bloque[1] as string;
    try {
      contenido = inflateSync(Buffer.from(contenido, 'latin1')).toString('latin1');
    } catch {
      // flujo sin comprimir
    }
    for (const x of contenido.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) cadenas.push(Buffer.from(x[1] as string, 'hex').toString('latin1'));
  }
  return cadenas.join('\n');
}

describe('E6-B04#1 · exportación CSV', () => {
  it('[E6-B04-T01] QE1 exporta cumplimiento de CEL-A: text/csv con BOM, separador «;», CRLF, encabezado con filtros y fecha, y los valores de la vista (3 HDU, 13.3)', async () => {
    const a = await exportar('qe1', `vista=cumplimiento&formato=csv&celulaId=${CELULAS.A.id}`);
    assert.equal(a.status, 200, a.texto);
    assert.match(a.tipo, /^text\/csv; charset=utf-8/);
    assert.equal(a.texto.charCodeAt(0), 0xfeff, 'BOM UTF-8');
    assert.match(a.texto, /\r\n/);
    assert.ok(!/[^\r]\n/.test(a.texto), 'solo CRLF');
    assert.match(a.disposicion, /^attachment; filename="quality360-indicadores-cumplimiento-20261104\.csv"$/);
    const t = tabla(a.texto);
    assert.deepEqual([...t.encabezado.entries()], [
      ['Reporte', 'Quality360 · Indicadores'],
      ['Vista', 'cumplimiento'],
      ['Filtros', 'Célula CEL-A'],
      ['Rol y ámbito', 'QE · QE1 (sus HDU y las de su equipo)'],
      ['Generado (hora de Chile)', '2026-11-04 03:00'],
    ]);
    const vista = await m.pedir('get', `/v1/indicadores/cumplimiento?celulaId=${CELULAS.A.id}`, 'qe1');
    const esperado = new Map(t.filas.map((f) => [f[0], f[1]]));
    assert.equal(esperado.get('HDU totales'), String(vista.body.hduTotales.valor));
    assert.equal(esperado.get('HDU totales'), '3');
    assert.equal(esperado.get('Cumplimiento promedio (%)'), '13.3');
    assert.equal(esperado.get('Bloqueadas'), '1');
    assert.equal(a.filas, '7');
  });

  it('[E6-B04-T02] las celdas de texto que empiezan con = + - @ tabulación o retorno de carro llevan el prefijo «\'»; los números y las fechas ISO no', async () => {
    const titulos: Record<string, string> = { H1: '=HYPERLINK("http://x")', H2: '+cmd|x', H5: '-1+2', H6: '@SUMA(A1)', H8: '\tcon tabulación' };
    for (const h of mundo.hdus) if (titulos[h.codigo] !== undefined) h.titulo = titulos[h.codigo] as string;
    mundo.personas.ana1 = { ...PERSONAS.ana1, nombre: '\r=ANA1' };
    mundo.personas.ana2 = { ...PERSONAS.ana2, nombre: '-ANA2' };
    const semaforo = await exportar('qe1', 'vista=semaforo&formato=csv');
    assert.equal(semaforo.status, 200, semaforo.texto);
    for (const crudo of ["'=HYPERLINK(\"\"http://x\"\")", "'+cmd|x", "'@SUMA(A1)"]) assert.ok(semaforo.texto.includes(crudo), `contiene ${crudo} en ${JSON.stringify(semaforo.texto)}`);
    assert.ok(semaforo.texto.includes("'-1+2"));
    assert.ok(semaforo.texto.includes("\"'\tcon tabulación\"") || semaforo.texto.includes("'\tcon tabulación"), 'tabulación con prefijo');
    assert.ok(!/;=HYPERLINK/.test(semaforo.texto) && !/;\+cmd/.test(semaforo.texto) && !/;@SUMA/.test(semaforo.texto), 'ninguna celda queda empezando con un operador');
    const carga = await exportar('qe1', 'vista=carga&formato=csv');
    assert.ok(carga.texto.includes("\"'\r=ANA1\"") && carga.texto.includes("'-ANA2"), 'nombres de analista neutralizados (el retorno de carro lleva prefijo y entrecomillado)');
    // Los números (incluso negativos) y las fechas ISO no se prefijan.
    assert.equal(celdaCsv(-5), '-5');
    assert.equal(celdaCsv(0), '0');
    assert.equal(celdaCsv('2026-11-04'), '2026-11-04');
    assert.equal(celdaCsv('-5'), "'-5", 'un texto que parece número sí');
    assert.equal(celdaCsv(null), '');
    assert.equal(celdaCsv('a;b'), '"a;b"');
    assert.equal(celdaCsv('di "hola"'), '"di ""hola"""');
  });

  it('[E6-B04-T02] el encabezado también se neutraliza: un filtro o un nombre de rol que empiece con = se prefija', () => {
    const csv = generarCsv({ encabezado: [['Reporte', 'Quality360 · Indicadores'], ['Filtros', '=cmd()'], ['Rol y ámbito', '@x']], columnas: ['A'], filas: [['-y']], textoSinDatos: 'x' });
    assert.ok(csv.includes("Filtros;'=cmd()"));
    assert.ok(csv.includes("Rol y ámbito;'@x"));
    assert.ok(csv.includes("\r\n'-y\r\n"));
  });

  it('[E6-B04-T04] ámbito del semáforo: QE2 solo H3 y H4; QE1 sin H3; LID1 sin H4 ni H8; AUD1 las tres células', async () => {
    const codigos = (a: Archivo) => tabla(a.texto).filas.map((f) => f[2]).filter((c) => c !== '');
    const celulas = (a: Archivo) => new Set(tabla(a.texto).filas.map((f) => f[0]));
    const qe2 = await exportar('qe2', 'vista=semaforo&formato=csv');
    assert.deepEqual([...codigos(qe2)].sort(), ['H3', 'H4']);
    assert.ok(!qe2.texto.includes('H1;') && !qe2.texto.includes('H6;'));
    assert.deepEqual([...celulas(qe2)].sort(), ['CEL-A', 'CEL-B', 'CEL-C'], 'CEL-A (solo una cerrada) tiene su fila de célula sin HDU activa');
    const fila = tabla(qe2.texto).filas.find((f) => f[0] === 'CEL-A');
    assert.deepEqual(fila?.slice(1), ['Verde', '', '', '', '', '', '']);
    const qe1 = await exportar('qe1', 'vista=semaforo&formato=csv');
    assert.deepEqual([...codigos(qe1)].sort(), ['H1', 'H2', 'H5', 'H6', 'H8']);
    const lid = await exportar('lid1', 'vista=semaforo&formato=csv');
    assert.deepEqual([...codigos(lid)].sort(), ['H1', 'H2', 'H3', 'H5', 'H6']);
    const aud = await exportar('aud1', 'vista=semaforo&formato=csv');
    assert.deepEqual([...codigos(aud)].sort(), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H8']);
    assert.deepEqual([...celulas(aud)].sort(), ['CEL-A', 'CEL-B', 'CEL-C']);
  });

  it('el semáforo exporta una fila por HDU no cerrada con el color de la célula, riesgo, impedimentos y motivos', async () => {
    const t = tabla((await exportar('qe1', 'vista=semaforo&formato=csv')).texto);
    assert.deepEqual(t.columnas, ['Célula', 'Color de la célula', 'HDU', 'Título', 'Riesgo vigente', 'Impedimentos abiertos', 'Escalados', 'Motivos']);
    const h1 = t.filas.find((f) => f[2] === 'H1');
    assert.deepEqual(h1, ['CEL-A', 'Rojo', 'H1', 'Historia H1', 'Alto', '1', '0', 'Riesgo alto']);
    const h2 = t.filas.find((f) => f[2] === 'H2');
    assert.deepEqual(h2?.slice(1), ['Rojo', 'H2', 'Historia H2', 'Medio', '0', '0', ''], 'H2 no genera el rojo de la célula: sin motivos');
    const h6 = t.filas.find((f) => f[2] === 'H6');
    assert.deepEqual(h6?.slice(4), ['Medio', '0', '1', 'Impedimento escalado']);
  });

  it('[E6-B04-T06] exportar carga deja una entrada EXPORTAR en Organización con actor, vista, formato, filtros y filas, antes de entregar el archivo', async () => {
    const a = await exportar('qe1', 'vista=carga&formato=csv');
    assert.equal(a.status, 200);
    assert.equal(mundo.exportaciones.length, 1);
    assert.deepEqual(mundo.exportaciones[0], {
      actor: PERSONAS.qe1.id,
      rol: 'QE',
      recurso: 'INDICADORES',
      filtros: { vista: 'carga', formato: 'csv', celulaId: null, sprintId: null, desde: null, hasta: null },
      filas: tabla(a.texto).filas.length,
    });
    assert.equal(a.filas, String(tabla(a.texto).filas.length));
    const t = tabla(a.texto);
    assert.equal(t.filas.at(-1)?.[1], 'Sin analista asignado');
    assert.deepEqual(t.filas.find((f) => f[1] === 'ANA1')?.slice(0, 5), ['QE1', 'ANA1', 'Activo', 'Sí', '2']);
  });

  it('[E6-B04-T07] con la auditoría de Organización fallando: 503 SERVICIO_NO_DISPONIBLE y sin archivo', async () => {
    mundo.falloAuditoria = true;
    const a = await exportar('qe1', 'vista=carga&formato=csv');
    assert.equal(a.status, 503);
    assert.equal(a.json?.codigo, 'SERVICIO_NO_DISPONIBLE');
    assert.ok(!a.tipo.includes('csv'));
  });

  it('[E6-B04-T05] con Impedimentos detenido, exportar el semáforo da 503 INDICADORES_NO_DISPONIBLES, sin archivo ni registro; con Certificaciones, igual para cumplimiento y carga', async () => {
    mundo.caida.imp = true;
    const sem = await exportar('qe1', 'vista=semaforo&formato=csv');
    assert.equal(sem.status, 503);
    assert.equal(sem.json?.codigo, 'INDICADORES_NO_DISPONIBLES');
    assert.equal((await exportar('qe1', 'vista=cumplimiento&formato=pdf')).json?.codigo, 'INDICADORES_NO_DISPONIBLES', 'bloqueadas indisponible');
    mundo.caida.imp = false;
    mundo.caida.cert = true;
    for (const vista of ['cumplimiento', 'carga', 'semaforo']) {
      const r = await exportar('qe1', `vista=${vista}&formato=csv`);
      assert.deepEqual([r.status, r.json?.codigo], [503, 'INDICADORES_NO_DISPONIBLES'], vista);
    }
    mundo.caida.cert = false;
    mundo.caida.org = true;
    const org = await exportar('qe1', 'vista=cumplimiento&formato=csv');
    assert.deepEqual([org.status, org.json?.codigo], [503, 'SERVICIO_NO_DISPONIBLE']);
    assert.equal(mundo.exportaciones.length, 0, 'nada se registró');
  });

  it('[E6-B04-T08] con los límites bajos: CSV sobre el tope da 422 «Acota los filtros»; PDF sobre su tope da 422 «Usa CSV»; no se registra', async () => {
    const bajo = await montar({ mundo, conservarDatos: true, reloj: { ahora: () => AHORA }, config: { csvLimiteFilas: 3, pdfLimiteFilas: 3 } });
    try {
      const csv = await exportar('qe1', 'vista=semaforo&formato=csv', bajo);
      assert.equal(csv.status, 422);
      assert.equal(csv.json?.codigo, 'EXPORTACION_EXCEDE_LIMITE');
      assert.match(String(csv.json?.mensaje), /Acota los filtros/);
      const pdf = await exportar('qe1', 'vista=semaforo&formato=pdf', bajo);
      assert.equal(pdf.status, 422);
      assert.match(String(pdf.json?.mensaje), /Usa CSV/);
      assert.equal(mundo.exportaciones.length, 0);
      assert.equal((await exportar('qe1', 'vista=cumplimiento&formato=csv', bajo)).status, 422, 'cumplimiento tiene 7 filas');
    } finally {
      await bajo.cerrar();
    }
  });

  it('[E6-B04-T09] ANA1 y ADM1 reciben 403; sin sesión 401', async () => {
    for (const persona of ['ana1', 'adm1'] as const) {
      const r = await exportar(persona, 'vista=carga&formato=csv');
      assert.equal(r.status, 403, persona);
      assert.equal(r.json?.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await exportar(null, 'vista=carga&formato=csv')).status, 401);
    assert.equal(mundo.exportaciones.length, 0);
  });

  it('[E6-B04-T10] vista=otra, formato=xls y celulaId=abc dan 400 VALIDACION con campo; faltantes también', async () => {
    for (const [consulta, campo] of [
      ['vista=otra&formato=csv', 'vista'],
      ['vista=carga&formato=xls', 'formato'],
      ['vista=carga&formato=csv&celulaId=abc', 'celulaId'],
      ['formato=csv', 'vista'],
      ['vista=carga', 'formato'],
      ['vista=carga&formato=csv&sprintId=x', 'sprintId'],
      ['vista=tendencia&formato=csv&desde=ayer', 'desde'],
      ['vista=carga&vista=semaforo&formato=csv', 'vista'],
    ] as const) {
      const r = await exportar('qe1', consulta);
      assert.equal(r.status, 400, consulta);
      assert.equal(r.json?.codigo, 'VALIDACION');
      assert.equal((r.json?.detalles as Array<{ campo: string }>)[0]?.campo, campo, consulta);
    }
    assert.equal(mundo.exportaciones.length, 0);
  });

  it('[E6-B04-T11] con filtros CEL-C y SP-PROX (sin HDU) el archivo trae el encabezado y «Sin datos para los filtros aplicados», sin cifras ni «0 %»', async () => {
    const consulta = `vista=cumplimiento&celulaId=${CELULAS.C.id}&sprintId=${SPRINTS.PROX.id}`;
    const csv = await exportar('qe1', `${consulta}&formato=csv`);
    assert.equal(csv.status, 200);
    assert.ok(csv.texto.includes('Sin datos para los filtros aplicados'));
    assert.ok(!/HDU totales|;0\b|0 ?%/.test(csv.texto.split('\r\n').slice(6).join('\n')), 'ninguna fila de cifras');
    assert.equal(csv.filas, '0');
    assert.match(csv.texto, /Filtros;Célula CEL-C; Sprint SP-PROX|Filtros;"?Célula CEL-C; Sprint SP-PROX/);
    const pdf = await exportar('qe1', `${consulta}&formato=pdf`);
    assert.equal(pdf.status, 200);
    const texto = textoPdf(pdf.binario);
    assert.ok(texto.includes('Sin datos para los filtros aplicados'));
    assert.ok(!/0 ?%/.test(texto));
  });

  it('[E6-B04-T12] exportar la tendencia con 3 snapshots: tres filas por fecha ascendente (30.0, 30.0, 40.0), iguales a GET tendencia; un día sin snapshot no genera fila', async () => {
    const semilla = (instante: string) => request(m.app.getHttpServer()).post('/v1/interno/carga/snapshots').set('x-q360-servicio-token', TOKEN_SEMILLA).send({ instante });
    await semilla('2026-11-01T09:00:00Z');
    mundo.hdus.find((h) => h.codigo === 'H1')!.aprobados = 3;
    await semilla('2026-11-03T09:00:00Z');
    mundo.hdus.find((h) => h.codigo === 'H1')!.aprobados = 4;
    await semilla('2026-11-04T09:00:00Z');
    const filtros = `celulaId=${CELULAS.A.id}&sprintId=${SPRINTS.PROX.id}`;
    const a = await exportar('qe1', `vista=tendencia&formato=csv&${filtros}`);
    assert.equal(a.status, 200, a.texto);
    const t = tabla(a.texto);
    assert.deepEqual(t.columnas, ['Fecha', 'Célula', 'Sprint', 'Cumplimiento (%)', 'HDU']);
    assert.deepEqual(t.filas.map((f) => [f[0], f[3]]), [['2026-11-01', '30'], ['2026-11-03', '30'], ['2026-11-04', '40']], 'el 2 de noviembre no tiene snapshot: sin fila');
    const vista = await m.pedir('get', `/v1/indicadores/tendencia?${filtros}`, 'qe1');
    assert.deepEqual(t.filas.map((f) => Number(f[3])), vista.body.series[0].puntos.map((p: { cumplimiento: number }) => p.cumplimiento));
    assert.match(t.encabezado.get('Filtros') ?? '', /Desde 2026-08-07/);
  });

  it('el Auditor y el Líder también exportan; el archivo trae su rol y ámbito', async () => {
    const aud = await exportar('aud1', 'vista=cumplimiento&formato=csv');
    assert.equal(tabla(aud.texto).encabezado.get('Rol y ámbito'), 'Auditor · AUD1 (todo el sistema)');
    assert.equal(tabla(aud.texto).filas.find((f) => f[0] === 'HDU totales')?.[1], '8');
    const lid = await exportar('lid1', 'vista=cumplimiento&formato=csv');
    assert.equal(tabla(lid.texto).encabezado.get('Rol y ámbito'), 'Líder QA · LID1 (sus células)');
    assert.equal(tabla(lid.texto).filas.find((f) => f[0] === 'Cumplimiento promedio (%)')?.[1], '36.7');
    assert.equal(mundo.exportaciones.length, 2);
  });
});

describe('E6-B04#2 · exportación PDF', () => {
  it('[E6-B04-T03] QE1 exporta el semáforo en PDF: application/pdf que empieza con %PDF, con título, filtros, rol, fecha de Chile y «Rojo» en las filas', async () => {
    const a = await exportar('qe1', 'vista=semaforo&formato=pdf');
    assert.equal(a.status, 200);
    assert.equal(a.tipo, 'application/pdf');
    assert.equal(a.binario.subarray(0, 4).toString('latin1'), '%PDF');
    assert.match(a.disposicion, /filename="quality360-indicadores-semaforo-20261104\.pdf"/);
    const texto = textoPdf(a.binario);
    for (const esperado of ['Quality360 · Indicadores', 'Sin filtros', 'QE · QE1', '2026-11-04 03:00', 'Rojo', 'H1', 'Riesgo alto', 'Página 1 de 1']) assert.ok(texto.includes(esperado), `contiene «${esperado}»`);
    assert.equal(a.filas, '5');
    assert.equal(mundo.exportaciones.length, 1);
    assert.equal((mundo.exportaciones[0] as { filtros: { formato: string } }).filtros.formato, 'pdf');
  });

  it('un PDF con muchas filas pagina y numera las páginas', async () => {
    const muchas = await montar({ mundo, conservarDatos: true, reloj: { ahora: () => AHORA } });
    try {
      for (let i = 0; i < 60; i += 1) mundo.hdus.push({ ...crearHdus()[0]!, id: `00000000-0000-4000-8000-${(0xf00 + i).toString(16).padStart(12, '0')}`, codigo: `X${i}`, titulo: `Historia X${i}`, aprobados: 0, impedimentos: [] });
      const a = await exportar('aud1', 'vista=semaforo&formato=pdf', muchas);
      assert.equal(a.status, 200);
      const texto = textoPdf(a.binario);
      assert.match(texto, /Página 1 de [2-9]/);
      assert.ok(texto.includes('Página 2 de'));
    } finally {
      mundo.hdus = crearHdus();
      await muchas.cerrar();
    }
  });
});
