import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decidirCambioSupervision, esAsignacionDeRolesValida, esMotivoValido } from '../../src/dominio/reglas/supervision.js';

describe('dominio/reglas/supervision', () => {
  describe('esAsignacionDeRolesValida [E1-B09#1]', () => {
    it('acepta QE activo supervisando a Analista QA activo', () => {
      assert.equal(esAsignacionDeRolesValida({ rol: 'QE', activo: true }, { rol: 'ANALISTA_QA', activo: true }), true);
    });

    it('rechaza si el supervisor no es QE', () => {
      assert.equal(esAsignacionDeRolesValida({ rol: 'ANALISTA_QA', activo: true }, { rol: 'ANALISTA_QA', activo: true }), false);
    });

    it('rechaza si el supervisado no es Analista QA', () => {
      assert.equal(esAsignacionDeRolesValida({ rol: 'QE', activo: true }, { rol: 'QE', activo: true }), false);
    });

    it('rechaza si el QE está inactivo', () => {
      assert.equal(esAsignacionDeRolesValida({ rol: 'QE', activo: false }, { rol: 'ANALISTA_QA', activo: true }), false);
    });

    it('rechaza si el analista está inactivo', () => {
      assert.equal(esAsignacionDeRolesValida({ rol: 'QE', activo: true }, { rol: 'ANALISTA_QA', activo: false }), false);
    });
  });

  describe('decidirCambioSupervision — máximo un QE vigente por analista [E1-B09#2]', () => {
    it('primera asignación: cambio sin exigir motivo', () => {
      const decision = decidirCambioSupervision(null, 'qe-1');
      assert.deepEqual(decision, { cambio: true, requiereMotivo: false });
    });

    it('mismo QE vigente: no hay cambio y no se toca nada', () => {
      const decision = decidirCambioSupervision({ qeId: 'qe-1' }, 'qe-1');
      assert.deepEqual(decision, { cambio: false, requiereMotivo: false });
    });

    it('QE vigente distinto: hay cambio y se exige motivo (E1-B09#2, E1-B12#2)', () => {
      const decision = decidirCambioSupervision({ qeId: 'qe-1' }, 'qe-2');
      assert.deepEqual(decision, { cambio: true, requiereMotivo: true });
    });
  });

  describe('esMotivoValido', () => {
    it('rechaza vacío, nulo o indefinido', () => {
      assert.equal(esMotivoValido(undefined), false);
      assert.equal(esMotivoValido(null), false);
      assert.equal(esMotivoValido(''), false);
      assert.equal(esMotivoValido('  '), false);
    });

    it('rechaza menos de 3 caracteres tras recortar espacios', () => {
      assert.equal(esMotivoValido(' ab '), false);
    });

    it('acepta 3 caracteres o más tras recortar espacios', () => {
      assert.equal(esMotivoValido(' Reasignación de carga '), true);
    });
  });
});
