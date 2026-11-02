/**
 * D122 · neutralización de fórmulas en las exportaciones CSV de Certificaciones (bitácora y certificados).
 * Unitaria: sin base de datos. La prueba de API por exportación es de q360-qa (E5-B04-T15).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { celdaCsv, filaCsv, generarCsv } from '../src/infraestructura/csv/generador-csv.js';

describe('D122 · celdas que Excel interpretaría como fórmula (Certificaciones)', () => {
  it('prefija con comilla simple los 6 caracteres de inicio peligrosos', () => {
    assert.equal(celdaCsv('=1+1'), "'=1+1");
    assert.equal(celdaCsv('+56'), "'+56");
    assert.equal(celdaCsv('-x'), "'-x");
    assert.equal(celdaCsv('@SUMA(A1)'), "'@SUMA(A1)");
    // Tabulación y retorno de carro: el retorno de carro además obliga a entrecomillar.
    assert.equal(celdaCsv('\tA'), "'\tA");
    assert.equal(celdaCsv('\rB'), '"\'\rB"');
  });

  it('no prefija los números, las fechas ni los booleanos, ni el texto que no empieza así', () => {
    assert.equal(celdaCsv(-5), '-5');
    assert.equal(celdaCsv(0.5), '0.5');
    assert.equal(celdaCsv(true), 'true');
    assert.equal(celdaCsv(new Date('2026-10-30T12:00:00.000Z')), '2026-10-30T12:00:00.000Z');
    assert.equal(celdaCsv('Informe =final'), 'Informe =final');
    assert.equal(celdaCsv('B'), 'B');
    assert.equal(celdaCsv(null), '');
    assert.equal(celdaCsv(undefined), '');
  });

  it('prefija ANTES de entrecomillar: una celda con ; o " queda prefijada y entrecomillada', () => {
    assert.equal(celdaCsv('=a;b'), `"'=a;b"`);
    assert.equal(celdaCsv('@dice "hola"'), `"'@dice ""hola"""`);
  });

  it('un documento completo neutraliza solo las celdas de texto y conserva el resto de las columnas', () => {
    const csv = generarCsv(['folio', 'titulo', 'cantidad'], [['C-1', '=HYPERLINK("x")', -3]]);
    assert.equal(csv, '﻿folio;titulo;cantidad\r\nC-1;"\'=HYPERLINK(""x"")";-3\r\n');
    assert.equal(filaCsv(['+56', 7]), "'+56;7");
  });
});
