import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calcularAmbito,
  evaluarAccesoHdu,
  filtroAmbitoHdu,
  perteneceAlEquipo,
  puedeConsultarEquipoDe,
  puedeConsultarResumenDeAnalista,
} from '../../src/dominio/reglas/ambito.js';

describe('dominio/reglas/ambito', () => {
  describe('calcularAmbito', () => {
    it('QE: expone sus analistas vigentes, sin supervisor propio', () => {
      assert.deepEqual(calcularAmbito('QE', ['a1', 'a2'], null), { qeSupervisorId: null, analistasSupervisadosIds: ['a1', 'a2'] });
    });

    it('Analista QA: expone su QE vigente, sin analistas', () => {
      assert.deepEqual(calcularAmbito('ANALISTA_QA', [], 'qe-1'), { qeSupervisorId: 'qe-1', analistasSupervisadosIds: [] });
    });

    it('Administrador: ámbito vacío (ve todo por rol, no por ámbito)', () => {
      assert.deepEqual(calcularAmbito('ADMINISTRADOR', ['a1'], 'qe-1'), { qeSupervisorId: null, analistasSupervisadosIds: [] });
    });
  });

  describe('evaluarAccesoHdu — ámbito de QE y QA [E2-B03, D12]', () => {
    const hdu = { qeResponsableId: 'qe-1', analistaId: 'analista-1' };

    it('Administrador accede a cualquier HDU', () => {
      const resultado = evaluarAccesoHdu('ADMINISTRADOR', 'admin-1', { qeSupervisorId: null, analistasSupervisadosIds: [] }, hdu);
      assert.deepEqual(resultado, { permitido: true, relacion: 'ADMINISTRADOR' });
    });

    it('Analista QA accede solo a su propia HDU asignada [E2-B03#1]', () => {
      const propia = evaluarAccesoHdu('ANALISTA_QA', 'analista-1', { qeSupervisorId: 'qe-1', analistasSupervisadosIds: [] }, hdu);
      assert.deepEqual(propia, { permitido: true, relacion: 'ANALISTA_ASIGNADO' });

      const ajena = evaluarAccesoHdu('ANALISTA_QA', 'otro-analista', { qeSupervisorId: 'qe-1', analistasSupervisadosIds: [] }, hdu);
      assert.deepEqual(ajena, { permitido: false, relacion: null });
    });

    it('Analista QA no accede si la HDU no tiene analista asignado', () => {
      const sinAsignar = evaluarAccesoHdu(
        'ANALISTA_QA',
        'analista-1',
        { qeSupervisorId: null, analistasSupervisadosIds: [] },
        { qeResponsableId: 'qe-1', analistaId: null },
      );
      assert.deepEqual(sinAsignar, { permitido: false, relacion: null });
    });

    it('QE accede como responsable aunque el analista no esté en su equipo [E2-B03#2]', () => {
      const resultado = evaluarAccesoHdu('QE', 'qe-1', { qeSupervisorId: null, analistasSupervisadosIds: [] }, hdu);
      assert.deepEqual(resultado, { permitido: true, relacion: 'QE_RESPONSABLE' });
    });

    it('QE accede porque supervisa al analista asignado, aunque no sea el responsable [E2-B03#2]', () => {
      const resultado = evaluarAccesoHdu('QE', 'otro-qe', { qeSupervisorId: null, analistasSupervisadosIds: ['analista-1'] }, hdu);
      assert.deepEqual(resultado, { permitido: true, relacion: 'QE_SUPERVISOR_DEL_ANALISTA' });
    });

    it('QE sin relación con la HDU queda fuera de ámbito (403 D12)', () => {
      const resultado = evaluarAccesoHdu('QE', 'qe-ajeno', { qeSupervisorId: null, analistasSupervisadosIds: ['otro-analista'] }, hdu);
      assert.deepEqual(resultado, { permitido: false, relacion: null });
    });
  });

  describe('filtroAmbitoHdu [E2-B03]', () => {
    it('Administrador: sin filtro (todas)', () => {
      assert.deepEqual(filtroAmbitoHdu('ADMINISTRADOR', 'admin-1', { qeSupervisorId: null, analistasSupervisadosIds: [] }), { tipo: 'TODAS' });
    });

    it('Analista QA: solo lo propio [E2-B03#1]', () => {
      assert.deepEqual(filtroAmbitoHdu('ANALISTA_QA', 'analista-1', { qeSupervisorId: null, analistasSupervisadosIds: [] }), {
        tipo: 'ANALISTA',
        analistaId: 'analista-1',
      });
    });

    it('QE: responsable o equipo vigente [E2-B03#2]', () => {
      assert.deepEqual(filtroAmbitoHdu('QE', 'qe-1', { qeSupervisorId: null, analistasSupervisadosIds: ['a1', 'a2'] }), {
        tipo: 'QE',
        qeResponsableId: 'qe-1',
        analistasSupervisadosIds: ['a1', 'a2'],
      });
    });
  });

  describe('helpers de equipo', () => {
    it('perteneceAlEquipo', () => {
      assert.equal(perteneceAlEquipo('a1', ['a1', 'a2']), true);
      assert.equal(perteneceAlEquipo('a3', ['a1', 'a2']), false);
    });

    it('puedeConsultarEquipoDe [E1-B04#2, E1-B04#3]', () => {
      assert.equal(puedeConsultarEquipoDe('QE', 'qe-1', 'qe-1'), true);
      assert.equal(puedeConsultarEquipoDe('QE', 'qe-1', 'qe-2'), false);
      assert.equal(puedeConsultarEquipoDe('ADMINISTRADOR', 'admin-1', 'qe-2'), true);
      assert.equal(puedeConsultarEquipoDe('ANALISTA_QA', 'a-1', 'qe-2'), false);
    });

    it('puedeConsultarResumenDeAnalista [E1-B05#3]', () => {
      assert.equal(puedeConsultarResumenDeAnalista('ANALISTA_QA', 'a-1', 'a-1'), true);
      assert.equal(puedeConsultarResumenDeAnalista('ANALISTA_QA', 'a-1', 'a-2'), false);
      assert.equal(puedeConsultarResumenDeAnalista('ADMINISTRADOR', 'admin-1', 'a-2'), true);
    });
  });
});
