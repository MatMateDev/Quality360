import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estadoSprintPorFechas } from '../../src/dominio/reglas/sprint.js';

describe('dominio/reglas/sprint', () => {
  const inicio = new Date('2026-03-02');
  const fin = new Date('2026-03-15');

  it('PLANIFICADO antes del inicio', () => {
    assert.equal(estadoSprintPorFechas(inicio, fin, new Date('2026-03-01T23:00:00Z')), 'PLANIFICADO');
  });

  it('EN_CURSO desde el inicio hasta el fin, ambos incluidos', () => {
    assert.equal(estadoSprintPorFechas(inicio, fin, new Date('2026-03-02T00:00:00Z')), 'EN_CURSO');
    assert.equal(estadoSprintPorFechas(inicio, fin, new Date('2026-03-15T23:59:59Z')), 'EN_CURSO');
  });

  it('CERRADO después del fin', () => {
    assert.equal(estadoSprintPorFechas(inicio, fin, new Date('2026-03-16T00:00:00Z')), 'CERRADO');
  });
});
