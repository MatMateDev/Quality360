/** Reglas puras del seguimiento del checklist para las bandejas de E7 (D45, D46). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CLAVES_ENTREGABLE, type ClaveEntregable, type EstadoEntregable } from '../src/dominio/entregables.js';
import { calcularSeguimiento, certificadoEsValido, type EntregableSeguimiento } from '../src/dominio/seguimiento.js';

const fecha = (dia: number): Date => new Date(Date.UTC(2026, 9, dia));

function entregables(aprobados: number, extra: Partial<Record<ClaveEntregable, EstadoEntregable>> = {}): EntregableSeguimiento[] {
  return CLAVES_ENTREGABLE.map((clave, indice) => ({
    clave,
    estado: extra[clave] ?? (indice < aprobados ? 'APROBADO' : 'PENDIENTE'),
    completadoEn: fecha(indice + 1),
    aprobadoEn: fecha(indice + 1),
  }));
}

const entrada = (lista: EntregableSeguimiento[], ultimas: Array<[ClaveEntregable, string]> = []) => ({
  hduId: 'h1',
  entregables: lista,
  ultimaAccionPorClave: new Map(ultimas),
  certificado: null,
  ultimaActividad: null,
});

describe('calcularSeguimiento [E7-B03, D46]', () => {
  it('una HDU sin ciclo tiene 0 aprobados y el siguiente entregable es el 1: un dato válido', () => {
    const s = calcularSeguimiento(entrada([]));
    assert.deepEqual([s.aprobados, s.porcentaje, s.porAprobar, s.observaciones, s.listaParaCertificar, s.listaParaCerrar], [0, 0, 0, 0, false, false]);
    assert.deepEqual(s.siguienteEntregable, { clave: 'PLAN_PRUEBAS', orden: 1, nombre: 'Plan de pruebas' });
    assert.deepEqual([s.porAprobarDesde, s.listaDesde, s.ultimaActividad, s.certificado], [null, null, null, null]);
  });

  it('el porcentaje es aprobados sobre 10 (D16) y el siguiente es el primero no aprobado', () => {
    const s = calcularSeguimiento(entrada(entregables(3)));
    assert.deepEqual([s.aprobados, s.porcentaje, s.siguienteEntregable?.orden], [3, 30, 4]);
  });

  it('cuenta los entregables POR_APROBAR y la fecha del más antiguo', () => {
    const lista = entregables(2, { APROBACION_CASOS: 'POR_APROBAR', EJECUCION: 'POR_APROBAR' });
    const s = calcularSeguimiento(entrada(lista));
    assert.equal(s.porAprobar, 2);
    assert.equal(s.porAprobarDesde, fecha(4).toISOString());
  });

  it('con observaciones: PENDIENTE cuyo último evento es RECHAZAR; un entregable re-marcado ya no cuenta', () => {
    const rechazado = calcularSeguimiento(entrada(entregables(1), [['DASHBOARD', 'RECHAZAR']]));
    assert.equal(rechazado.observaciones, 1);
    const remarcado = calcularSeguimiento(entrada(entregables(1, { DASHBOARD: 'POR_APROBAR' }), [['DASHBOARD', 'MARCAR']]));
    assert.equal(remarcado.observaciones, 0);
    const aprobadoDespues = calcularSeguimiento(entrada(entregables(2), [['DASHBOARD', 'APROBAR']]));
    assert.equal(aprobadoDespues.observaciones, 0);
    const sinRechazo = calcularSeguimiento(entrada(entregables(1), [['DASHBOARD', 'DESMARCAR']]));
    assert.equal(sinRechazo.observaciones, 0);
  });

  it('lista para certificar: 1 a 8 aprobados y el 9 no, desde que se aprobó el 8.º', () => {
    const s = calcularSeguimiento(entrada(entregables(8)));
    assert.deepEqual([s.listaParaCertificar, s.listaParaCerrar, s.listaDesde], [true, false, fecha(8).toISOString()]);
    assert.equal(calcularSeguimiento(entrada(entregables(7))).listaParaCertificar, false);
    assert.equal(calcularSeguimiento(entrada(entregables(9))).listaParaCertificar, false, 'con el certificado emitido ya no está para certificar');
  });

  it('lista para cerrar: los 10 aprobados, desde que se aprobó el 10.º, y ya no hay siguiente', () => {
    const s = calcularSeguimiento(entrada(entregables(10)));
    assert.deepEqual([s.listaParaCerrar, s.listaParaCertificar, s.siguienteEntregable, s.listaDesde, s.porcentaje], [true, false, null, fecha(10).toISOString(), 100]);
  });

  it('expone el certificado y la última actividad como ISO 8601', () => {
    const s = calcularSeguimiento({ ...entrada(entregables(10)), certificado: { folio: 'F7', emitidoEn: fecha(9) }, ultimaActividad: fecha(11) });
    assert.deepEqual(s.certificado, { folio: 'F7', emitidoEn: fecha(9).toISOString() });
    assert.equal(s.ultimaActividad, fecha(11).toISOString());
  });
});

describe('certificadoEsValido [D45]', () => {
  it('no hay revocación en el alcance: todo certificado emitido es válido', () => {
    assert.equal(certificadoEsValido({ folio: 'Q360-2026-AAAAAAAA' }), true);
  });
});
