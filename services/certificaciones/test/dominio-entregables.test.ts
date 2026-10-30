import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExcepcionQ360 } from '@quality360/auth-nest';

import {
  CLAVES_ENTREGABLE,
  calcularResumen,
  evaluarCertificacion,
  exigirRelacion,
  generarFolio,
  sanearNombreArchivo,
  validarCertificable,
  validarDesmarcable,
  validarMarcable,
  validarPorAprobar,
  type ClaveEntregable,
  type EstadoEntregable,
} from '../src/dominio/entregables.js';

function estados(pares: Array<[ClaveEntregable, EstadoEntregable]>): Map<ClaveEntregable, EstadoEntregable> {
  return new Map(pares);
}

function aprobadosHasta(ultimo: number): Map<ClaveEntregable, EstadoEntregable> {
  return new Map(CLAVES_ENTREGABLE.slice(0, ultimo).map((clave) => [clave, 'APROBADO' as const]));
}

function codigoDe(accion: () => void): string {
  try {
    accion();
  } catch (error) {
    assert.ok(error instanceof ExcepcionQ360);
    return `${error.getStatus()} ${error.codigo}`;
  }
  return 'sin error';
}

describe('Checklist · catálogo (D15)', () => {
  it('tiene 10 entregables en el orden del prototipo', () => {
    assert.equal(CLAVES_ENTREGABLE.length, 10);
    assert.equal(CLAVES_ENTREGABLE[0], 'PLAN_PRUEBAS');
    assert.equal(CLAVES_ENTREGABLE[8], 'CERTIFICADO');
    assert.equal(CLAVES_ENTREGABLE[9], 'CIERRE_PRUEBAS');
  });
});

describe('Checklist · cumplimiento [E3-F01#2] [E3-B02#3]', () => {
  it('sin registros: 0 % e incompleto', () => {
    assert.deepEqual(calcularResumen(new Map()), { totalEntregables: 10, completados: 0, porcentajeCumplimiento: 0, completo: false });
  });

  it('solo cuentan los aprobados, sobre los 10', () => {
    const resumen = calcularResumen(estados([['PLAN_PRUEBAS', 'APROBADO'], ['DASHBOARD', 'APROBADO'], ['CASOS_PRUEBA', 'POR_APROBAR']]));
    assert.equal(resumen.completados, 2);
    assert.equal(resumen.porcentajeCumplimiento, 20);
  });

  it('10 aprobados: 100 % y completo', () => {
    const resumen = calcularResumen(aprobadosHasta(10));
    assert.equal(resumen.porcentajeCumplimiento, 100);
    assert.equal(resumen.completo, true);
  });
});

describe('Checklist · orden libre al marcar [E3-F02#2] [E3-B02#1] [E3-B01#2] (D130)', () => {
  it('el primero se marca sin dependencias', () => {
    assert.equal(codigoDe(() => validarMarcable(new Map(), 'PLAN_PRUEBAS')), 'sin error');
  });

  it('cualquier pendiente se marca aunque los anteriores no estén aprobados', () => {
    assert.equal(codigoDe(() => validarMarcable(new Map(), 'DASHBOARD')), 'sin error');
    assert.equal(codigoDe(() => validarMarcable(new Map(), 'CIERRE_PRUEBAS')), 'sin error');
    assert.equal(codigoDe(() => validarMarcable(estados([['PLAN_PRUEBAS', 'POR_APROBAR']]), 'APROBACION_UAT')), 'sin error');
  });

  it('un entregable ya registrado no se vuelve a marcar', () => {
    assert.equal(codigoDe(() => validarMarcable(estados([['PLAN_PRUEBAS', 'POR_APROBAR']]), 'PLAN_PRUEBAS')), '409 ENTREGABLE_YA_REGISTRADO');
  });

  it('el certificado no se marca a mano (D19)', () => {
    assert.equal(codigoDe(() => validarMarcable(aprobadosHasta(8), 'CERTIFICADO')), '409 ENTREGABLE_AUTOMATICO');
  });
});

describe('Checklist · desmarcar [E3-F02#3]', () => {
  it('solo lo marcado, en cualquier orden (D130)', () => {
    assert.equal(codigoDe(() => validarDesmarcable(new Map(), 'PLAN_PRUEBAS')), '409 ESTADO_ENTREGABLE_INVALIDO');
    assert.equal(codigoDe(() => validarDesmarcable(aprobadosHasta(2), 'PLAN_PRUEBAS')), 'sin error');
    assert.equal(codigoDe(() => validarDesmarcable(aprobadosHasta(2), 'DASHBOARD')), 'sin error');
  });

  it('el certificado emitido no se desmarca', () => {
    assert.equal(codigoDe(() => validarDesmarcable(aprobadosHasta(9), 'CERTIFICADO')), '409 ENTREGABLE_AUTOMATICO');
  });
});

describe('Checklist · aprobación [E3-F03#1] [E3-B02#2]', () => {
  it('solo se aprueba lo que está por aprobar', () => {
    assert.equal(codigoDe(() => validarPorAprobar(new Map(), 'PLAN_PRUEBAS')), '409 ESTADO_ENTREGABLE_INVALIDO');
    assert.equal(codigoDe(() => validarPorAprobar(estados([['PLAN_PRUEBAS', 'POR_APROBAR']]), 'PLAN_PRUEBAS')), 'sin error');
  });

  it('la relación exigida decide el permiso y una HDU cerrada no admite cambios', () => {
    assert.equal(codigoDe(() => exigirRelacion('ANALISTA_ASIGNADO', 'QE_RESPONSABLE', 'EN_EJECUCION', 'aprobar')), '403 ACCESO_DENEGADO');
    assert.equal(codigoDe(() => exigirRelacion('QE_SUPERVISOR_DEL_ANALISTA', 'QE_RESPONSABLE', 'EN_EJECUCION', 'aprobar')), '403 ACCESO_DENEGADO');
    assert.equal(codigoDe(() => exigirRelacion('QE_RESPONSABLE', 'QE_RESPONSABLE', 'CERRADA', 'aprobar')), '409 HDU_CERRADA');
    assert.equal(codigoDe(() => exigirRelacion('QE_RESPONSABLE', 'QE_RESPONSABLE', 'EN_EJECUCION', 'aprobar')), 'sin error');
  });
});

describe('Certificado · precondiciones [E3-F04#2] [E3-B03#3]', () => {
  it('faltando un entregable: deshabilitado con motivo y faltantes', () => {
    const evaluacion = evaluarCertificacion(aprobadosHasta(7), false, 'EN_EJECUCION');
    assert.equal(evaluacion.habilitada, false);
    assert.deepEqual(evaluacion.faltantes, ['APROBACION_UAT']);
    assert.match(evaluacion.motivo ?? '', /Aprobación UAT/);
    assert.equal(codigoDe(() => validarCertificable(aprobadosHasta(7), false, 'EN_EJECUCION')), '409 ENTREGABLES_PENDIENTES');
  });

  it('con 1 a 8 aprobados: habilitado; con certificado previo: 409', () => {
    assert.equal(evaluarCertificacion(aprobadosHasta(8), false, 'EN_EJECUCION').habilitada, true);
    assert.equal(codigoDe(() => validarCertificable(aprobadosHasta(9), true, 'EN_EJECUCION')), '409 CERTIFICADO_EXISTENTE');
  });
});

describe('Utilidades', () => {
  it('folio Q360-AAAA-XXXXXXXX en base32', () => {
    const folio = generarFolio(new Uint8Array([255, 0, 128, 7, 42]), new Date('2026-09-17T12:00:00Z'));
    assert.match(folio, /^Q360-2026-[A-Z2-7]{8}$/);
    assert.notEqual(folio, generarFolio(new Uint8Array([1, 2, 3, 4, 5]), new Date('2026-09-17T12:00:00Z')));
  });

  it('nombre de archivo sin separadores ni tildes', () => {
    assert.equal(sanearNombreArchivo('../Evidencia de ejecución (final).pdf'), 'Evidencia-de-ejecucion-final-.pdf');
    assert.equal(sanearNombreArchivo('///'), 'evidencia');
  });
});
