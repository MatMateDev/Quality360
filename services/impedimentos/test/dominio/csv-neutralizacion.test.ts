/**
 * D122 · neutralización de fórmulas en las exportaciones CSV de Impedimentos (`impedimentos` y
 * `gestion-impedimentos`). Unitaria: sin base de datos. La prueba de API por exportación es de q360-qa (E5-B04-T15).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { celdaCsv, filaCsv, generarCsv } from '../../src/infraestructura/csv/generador-csv.js';

describe('D122 · celdas que Excel interpretaría como fórmula (Impedimentos)', () => {
  it('prefija con comilla simple los 6 caracteres de inicio peligrosos', () => {
    assert.equal(celdaCsv('=1+1'), "'=1+1");
    assert.equal(celdaCsv('+56'), "'+56");
    assert.equal(celdaCsv('-x'), "'-x");
    assert.equal(celdaCsv('@SUMA(A1)'), "'@SUMA(A1)");
    assert.equal(celdaCsv('\tA'), "'\tA");
    assert.equal(celdaCsv('\rB'), '"\'\rB"');
  });

  it('no prefija los números, las fechas ni los booleanos, ni el texto que no empieza así', () => {
    assert.equal(celdaCsv(-5), '-5');
    assert.equal(celdaCsv(0.5), '0.5');
    assert.equal(celdaCsv(false), 'false');
    assert.equal(celdaCsv(new Date('2026-10-30T12:00:00.000Z')), '2026-10-30T12:00:00.000Z');
    assert.equal(celdaCsv('Servidor =caído'), 'Servidor =caído');
    assert.equal(celdaCsv(null), '');
  });

  it('prefija ANTES de entrecomillar: una celda con ; o " queda prefijada y entrecomillada', () => {
    assert.equal(celdaCsv('=a;b'), `"'=a;b"`);
    assert.equal(celdaCsv('-dice "hola"'), `"'-dice ""hola"""`);
  });

  it('un documento completo neutraliza el título de un impedimento y conserva los números', () => {
    const csv = generarCsv(['codigo', 'titulo', 'dias'], [['QTY-1', '=HYPERLINK("x")', -1]]);
    assert.equal(csv, '﻿codigo;titulo;dias\r\nQTY-1;"\'=HYPERLINK(""x"")";-1\r\n');
    assert.equal(filaCsv(['@x', 3]), "'@x;3");
  });
});
