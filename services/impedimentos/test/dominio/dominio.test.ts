/** Pruebas unitarias del dominio: ciclo de vida, permisos, días y cálculo de riesgo. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diasAbierto, diasEntre, esNuevo, fechaSantiago } from '../../src/dominio/dias.js';
import { estadoResultante, operacionesDelEstado } from '../../src/dominio/impedimento.js';
import { permisosDe, puedeGestionarPorRelacion, puedeRegistrarPorRelacion, puedeVerRiesgoPorRelacion } from '../../src/dominio/permisos.js';
import { calcularRiesgoSugerido, nivelVigente, type EntradaRiesgo } from '../../src/dominio/riesgo/calculo.js';

const UMBRALES = { diasImpedimentoAlto: 5, diasSprintAlto: 3, avanceAlto: 70, diasSprintMedio: 7, avanceMedio: 50 };
const HOY = '2026-10-26';
const SPRINT = { id: 's', nombre: 'Sprint' };
const antes = (dias: number): Date => new Date(Date.UTC(2026, 9, 26, 15) - dias * 86_400_000);

function entrada(cambios: Partial<EntradaRiesgo>): EntradaRiesgo {
  return { hduCerrada: false, impedimentos: [], sprint: SPRINT, sprintFin: '2026-11-15', avance: 0, hoy: HOY, umbrales: UMBRALES, ...cambios };
}
const abierto = (dias: number, estado: 'ABIERTO' | 'ESCALADO' = 'ABIERTO') => ({ id: `i${dias}`, estado, abiertoDesde: antes(dias) });
const codigos = (e: Partial<EntradaRiesgo>) => calcularRiesgoSugerido(entrada(e)).factores.map((f) => f.codigo);

describe('[E4-B02] ciclo de vida y permisos', () => {
  it('[E4-B02#1] las transiciones válidas siguen la tabla 3.2', () => {
    assert.equal(estadoResultante('ABIERTO', 'RESOLVER'), 'RESUELTO');
    assert.equal(estadoResultante('ESCALADO', 'RESOLVER'), 'RESUELTO');
    assert.equal(estadoResultante('ABIERTO', 'ESCALAR'), 'ESCALADO');
    assert.equal(estadoResultante('ESCALADO', 'ESCALAR'), 'ESCALADO');
    assert.equal(estadoResultante('RESUELTO', 'REABRIR'), 'ABIERTO');
    assert.equal(estadoResultante('ESCALADO', 'SEGUIMIENTO'), 'ESCALADO');
  });

  it('[E4-B02#3] un resuelto solo admite reabrir y un abierto no se reabre', () => {
    assert.deepEqual(operacionesDelEstado('RESUELTO'), ['REABRIR']);
    for (const operacion of ['RESOLVER', 'ESCALAR', 'SEGUIMIENTO'] as const) assert.equal(estadoResultante('RESUELTO', operacion), null);
    assert.equal(estadoResultante('ABIERTO', 'REABRIR'), null);
    assert.equal(estadoResultante('ESCALADO', 'REABRIR'), null);
  });

  it('[E4-B01#3] matriz de permisos por relación (D57, D73, D83)', () => {
    assert.deepEqual(
      (['ANALISTA_ASIGNADO', 'QE_RESPONSABLE', 'QE_SUPERVISOR_DEL_ANALISTA', 'LECTOR_CELULA', 'ADMINISTRADOR', 'LECTOR_AUDITORIA'] as const).map((r) => [puedeRegistrarPorRelacion(r), puedeGestionarPorRelacion(r), puedeVerRiesgoPorRelacion(r)]),
      [[true, false, false], [true, true, true], [false, false, true], [false, false, true], [false, false, true], [false, false, true]],
    );
  });

  it('[E4-B01#3] una HDU cerrada no admite registrar, gestionar ni fijar riesgo', () => {
    assert.deepEqual(permisosDe('QE_RESPONSABLE', 'CERRADA'), { puedeRegistrar: false, puedeGestionar: false, puedeVerRiesgo: true, puedeFijarRiesgo: false });
    assert.deepEqual(permisosDe('QE_RESPONSABLE', 'EN_EJECUCION'), { puedeRegistrar: true, puedeGestionar: true, puedeVerRiesgo: true, puedeFijarRiesgo: true });
  });

  it('[E4-B01#1] días de calendario en America/Santiago y esNuevo con reloj real', () => {
    assert.equal(diasEntre('2026-10-20', '2026-10-26'), 6);
    assert.equal(fechaSantiago(new Date('2026-10-26T02:30:00Z')), '2026-10-25');
    assert.equal(diasAbierto(antes(6), null, HOY), 6);
    assert.equal(diasAbierto(antes(5), antes(2), HOY), 3);
    const ahora = new Date();
    assert.equal(esNuevo(new Date(ahora.getTime() - 23 * 3_600_000), false, ahora), true);
    assert.equal(esNuevo(new Date(ahora.getTime() - 25 * 3_600_000), false, ahora), false);
    assert.equal(esNuevo(ahora, true, ahora), false);
  });
});

describe('[E4-B03] cálculo del riesgo sugerido', () => {
  it('[E4-B03#1] un impedimento abierto sugiere al menos MEDIO; 5 días o escalado, ALTO', () => {
    assert.equal(calcularRiesgoSugerido(entrada({ impedimentos: [abierto(0)] })).nivelSugerido, 'MEDIO');
    assert.equal(calcularRiesgoSugerido(entrada({ impedimentos: [abierto(4)] })).nivelSugerido, 'MEDIO');
    assert.deepEqual(codigos({ impedimentos: [abierto(5)] }), ['IMPEDIMENTO_ANTIGUO', 'IMPEDIMENTO_ABIERTO']);
    assert.deepEqual(codigos({ impedimentos: [abierto(1, 'ESCALADO')] }), ['IMPEDIMENTO_ESCALADO', 'IMPEDIMENTO_ABIERTO']);
    // La antigüedad solo cuenta en los ABIERTO.
    assert.deepEqual(codigos({ impedimentos: [abierto(9, 'ESCALADO')] }), ['IMPEDIMENTO_ESCALADO', 'IMPEDIMENTO_ABIERTO']);
  });

  it('[E4-B03#2] bordes del sprint: 70 % exacto no es atraso, el día de término cuenta 0', () => {
    assert.deepEqual(codigos({ sprintFin: '2026-10-29', avance: 70 }), ['ATRASO_SPRINT_MEDIO'].filter(() => false));
    assert.deepEqual(codigos({ sprintFin: '2026-10-29', avance: 69.9 }), ['ATRASO_SPRINT_ALTO']);
    assert.deepEqual(codigos({ sprintFin: '2026-10-30', avance: 10 }), ['ATRASO_SPRINT_MEDIO']);
    assert.deepEqual(codigos({ sprintFin: '2026-11-02', avance: 49.9 }), ['ATRASO_SPRINT_MEDIO']);
    assert.deepEqual(codigos({ sprintFin: '2026-11-02', avance: 50 }), []);
    assert.deepEqual(codigos({ sprintFin: '2026-11-03', avance: 0 }), []);
    const hoyEsFin = calcularRiesgoSugerido(entrada({ sprintFin: HOY, avance: 0 }));
    assert.equal(hoyEsFin.factores[0]?.codigo, 'ATRASO_SPRINT_ALTO');
    assert.equal(hoyEsFin.factores[0]?.detalle.diasRestantes, 0);
  });

  it('[E4-B03#2] sprint vencido: ALTO con días restantes negativos', () => {
    const resultado = calcularRiesgoSugerido(entrada({ sprintFin: '2026-10-23', avance: 100 }));
    assert.equal(resultado.nivelSugerido, 'ALTO');
    assert.equal(resultado.factores[0]?.codigo, 'SPRINT_VENCIDO');
    assert.equal(resultado.factores[0]?.detalle.diasRestantes, -3);
  });

  it('[E4-B03#2] sin sprint no aplican los factores de sprint', () => {
    const resultado = calcularRiesgoSugerido(entrada({ sprint: null, sprintFin: null, avance: null }));
    assert.deepEqual([resultado.nivelSugerido, resultado.estado, resultado.calculoParcial, resultado.factoresNoEvaluados], ['BAJO', 'ok', false, []]);
  });

  it('[E4-B03#2] sin factores el nivel es BAJO', () => {
    assert.deepEqual([calcularRiesgoSugerido(entrada({})).nivelSugerido, codigos({})], ['BAJO', []]);
  });

  it('[E4-B03#2] fuente caída: nunca BAJO; un ALTO ya alcanzado vale como parcial', () => {
    const sinNada = calcularRiesgoSugerido(entrada({ avance: null }));
    assert.deepEqual([sinNada.nivelSugerido, sinNada.estado, sinNada.motivoSinSugerencia], [null, 'indisponible', 'FUENTE_NO_DISPONIBLE']);
    assert.deepEqual(sinNada.factoresNoEvaluados, ['ATRASO_SPRINT_ALTO', 'ATRASO_SPRINT_MEDIO']);
    const medio = calcularRiesgoSugerido(entrada({ avance: null, impedimentos: [abierto(1)] }));
    assert.equal(medio.nivelSugerido, null);
    const alto = calcularRiesgoSugerido(entrada({ avance: null, impedimentos: [abierto(6)] }));
    assert.deepEqual([alto.nivelSugerido, alto.calculoParcial, alto.estado], ['ALTO', true, 'ok']);
    // D90: SPRINT_VENCIDO no necesita el avance.
    const vencido = calcularRiesgoSugerido(entrada({ avance: null, sprintFin: '2026-10-20' }));
    assert.deepEqual([vencido.nivelSugerido, vencido.calculoParcial, vencido.factoresNoEvaluados], ['ALTO', false, []]);
  });

  it('[E4-B03#3] HDU cerrada: sin sugerencia; el nivel fijado prevalece y se detecta la sugerencia distinta', () => {
    const cerrada = calcularRiesgoSugerido(entrada({ hduCerrada: true, impedimentos: [abierto(9)] }));
    assert.deepEqual([cerrada.nivelSugerido, cerrada.motivoSinSugerencia, cerrada.factores], [null, 'HDU_CERRADA', []]);
    assert.deepEqual(nivelVigente(null, cerrada), { nivelVigente: null, origen: null, estado: 'ok', calculoParcial: false });
    const alto = calcularRiesgoSugerido(entrada({ impedimentos: [abierto(9)] }));
    assert.deepEqual(nivelVigente({ nivel: 'BAJO' }, alto), { nivelVigente: 'BAJO', origen: 'MANUAL', estado: 'ok', calculoParcial: false });
    assert.deepEqual(nivelVigente(null, alto), { nivelVigente: 'ALTO', origen: 'SUGERIDO', estado: 'ok', calculoParcial: false });
  });
});
