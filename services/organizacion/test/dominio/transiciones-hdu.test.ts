import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { esEstadoTerminal, transicionesPermitidas, validarTransicion } from '../../src/dominio/reglas/transiciones-hdu.js';

describe('dominio/reglas/transiciones-hdu (D10)', () => {
  it('PENDIENTE solo avanza a DISENO_PRUEBAS [E2-B02#1]', () => {
    assert.deepEqual(transicionesPermitidas('PENDIENTE'), ['DISENO_PRUEBAS']);
    assert.equal(validarTransicion('PENDIENTE', 'DISENO_PRUEBAS').valida, true);
  });

  it('PENDIENTE -> CERRADA es inválida y lista las permitidas [E2-B02#2]', () => {
    const resultado = validarTransicion('PENDIENTE', 'CERRADA');
    assert.equal(resultado.valida, false);
    assert.deepEqual(resultado.transicionesPermitidas, ['DISENO_PRUEBAS']);
  });

  it('DISENO_PRUEBAS solo avanza a EN_EJECUCION', () => {
    assert.deepEqual(transicionesPermitidas('DISENO_PRUEBAS'), ['EN_EJECUCION']);
  });

  it('EN_EJECUCION solo avanza a PENDIENTE_CIERRE', () => {
    assert.deepEqual(transicionesPermitidas('EN_EJECUCION'), ['PENDIENTE_CIERRE']);
  });

  it('PENDIENTE_CIERRE permite cerrar o reabrir hacia EN_EJECUCION', () => {
    assert.deepEqual(transicionesPermitidas('PENDIENTE_CIERRE'), ['CERRADA', 'EN_EJECUCION']);
  });

  it('CERRADA es terminal: sin transiciones', () => {
    assert.deepEqual(transicionesPermitidas('CERRADA'), []);
    assert.equal(esEstadoTerminal('CERRADA'), true);
    assert.equal(esEstadoTerminal('PENDIENTE'), false);
  });
});
