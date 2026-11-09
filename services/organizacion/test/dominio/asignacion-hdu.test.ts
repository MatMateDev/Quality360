/**
 * Reglas puras de la asignación de una HDU (E2-B02, D137, D138): las comparten la asignación de analista, la
 * validación de la consulta de Jira y la confirmación.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analistaEstaEnEquipo, esAnalistaAsignable, proponerSprint, validarAsignacion } from '../../src/dominio/reglas/asignacion-hdu.js';

const CEL = { id: 'c1' };
const QE = { id: 'q1', rol: 'QE', activo: true } as const;
const ANA = { id: 'a1', rol: 'ANALISTA_QA', activo: true } as const;
const SPR = { id: 's1', celulaId: 'c1' };
const TODOS = { celulaId: true, qeResponsableId: true, analistaId: true, sprintId: true };

describe('esAnalistaAsignable y analistaEstaEnEquipo', () => {
  it('exige rol Analista QA y activo; pertenecer al equipo vigente', () => {
    assert.equal(esAnalistaAsignable(ANA), true);
    assert.equal(esAnalistaAsignable({ rol: 'ANALISTA_QA', activo: false }), false);
    assert.equal(esAnalistaAsignable({ rol: 'QE', activo: true }), false);
    assert.equal(esAnalistaAsignable(null), false);
    assert.equal(analistaEstaEnEquipo(['a1', 'a2'], 'a1'), true);
    assert.equal(analistaEstaEnEquipo([], 'a1'), false);
  });
});

describe('validarAsignacion (D138)', () => {
  it('una combinación coherente no tiene errores', () => {
    assert.deepEqual(validarAsignacion(TODOS, { celula: CEL, qe: QE, analista: ANA, sprint: SPR, equipoDelQe: ['a1'] }), []);
  });

  it('QE inexistente, inactivo o con otro rol: QE_INVALIDO, y no se comprueba el equipo', () => {
    for (const qe of [null, { ...QE, activo: false }, { ...QE, rol: 'ANALISTA_QA' as const }]) {
      assert.deepEqual(validarAsignacion(TODOS, { celula: CEL, qe, analista: ANA, sprint: SPR, equipoDelQe: null }), [{ campo: 'qeResponsableId', codigo: 'QE_INVALIDO' }]);
    }
  });

  it('analista inválido, fuera del equipo o sin QE', () => {
    assert.deepEqual(validarAsignacion(TODOS, { celula: CEL, qe: QE, analista: { ...ANA, activo: false }, sprint: SPR, equipoDelQe: ['a1'] }), [{ campo: 'analistaId', codigo: 'ANALISTA_INVALIDO' }]);
    assert.deepEqual(validarAsignacion(TODOS, { celula: CEL, qe: QE, analista: ANA, sprint: SPR, equipoDelQe: ['otro'] }), [{ campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' }]);
    assert.deepEqual(validarAsignacion({ ...TODOS, qeResponsableId: false }, { celula: CEL, qe: null, analista: ANA, sprint: SPR, equipoDelQe: null }), [{ campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' }]);
  });

  it('célula inexistente y sprint inexistente o de otra célula: CATALOGO_INVALIDO', () => {
    assert.deepEqual(validarAsignacion({ ...TODOS, qeResponsableId: false, analistaId: false }, { celula: null, qe: null, analista: null, sprint: SPR, equipoDelQe: null }), [{ campo: 'celulaId', codigo: 'CATALOGO_INVALIDO' }]);
    assert.deepEqual(validarAsignacion({ ...TODOS, qeResponsableId: false, analistaId: false }, { celula: CEL, qe: null, analista: null, sprint: { id: 's2', celulaId: 'c2' }, equipoDelQe: null }), [{ campo: 'sprintId', codigo: 'CATALOGO_INVALIDO' }]);
    assert.deepEqual(validarAsignacion({ ...TODOS, qeResponsableId: false, analistaId: false, celulaId: false }, { celula: null, qe: null, analista: null, sprint: null, equipoDelQe: null }), [{ campo: 'sprintId', codigo: 'CATALOGO_INVALIDO' }]);
  });

  it('los campos ausentes no se validan', () => {
    assert.deepEqual(validarAsignacion({ celulaId: false, qeResponsableId: false, analistaId: false, sprintId: false }, { celula: null, qe: null, analista: null, sprint: null, equipoDelQe: null }), []);
  });
});

describe('proponerSprint (D137)', () => {
  const respaldo = { id: 'r1', celulaId: 'c1' };
  it('el nombre de Jira encontrado en la célula gana (JIRA)', () => {
    assert.deepEqual(proponerSprint({ nombreJira: 'Sprint 5', sprintDeLaCelulaConEseNombre: { id: 'j1' }, respaldo, celulaId: 'c1' }), { sprintId: 'j1', origen: 'JIRA', sprintJiraNoEncontrado: false });
  });
  it('sin coincidencia usa el respaldo si es de la célula (RESPALDO) y avisa que el de Jira no existe', () => {
    assert.deepEqual(proponerSprint({ nombreJira: 'Sprint 5', sprintDeLaCelulaConEseNombre: null, respaldo, celulaId: 'c1' }), { sprintId: 'r1', origen: 'RESPALDO', sprintJiraNoEncontrado: true });
    assert.deepEqual(proponerSprint({ nombreJira: null, sprintDeLaCelulaConEseNombre: null, respaldo, celulaId: 'c1' }), { sprintId: 'r1', origen: 'RESPALDO', sprintJiraNoEncontrado: false });
  });
  it('un respaldo de otra célula, o ninguno, no propone nada', () => {
    assert.deepEqual(proponerSprint({ nombreJira: 'X', sprintDeLaCelulaConEseNombre: null, respaldo, celulaId: 'c9' }), { sprintId: null, origen: null, sprintJiraNoEncontrado: true });
    assert.deepEqual(proponerSprint({ nombreJira: ' ', sprintDeLaCelulaConEseNombre: null, respaldo: null, celulaId: 'c1' }), { sprintId: null, origen: null, sprintJiraNoEncontrado: false });
  });
});
