/** Dominio puro de Indicadores: clasificación, redondeo, fechas de Santiago, semáforo, carga y tendencia. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calcularCarga } from '../../src/dominio/carga.js';
import { clasificarHdu, promedioRedondeado } from '../../src/dominio/cumplimiento.js';
import { diasEntre, esFechaIso, fechaHoraSantiago, fechaSantiago, sumarDias } from '../../src/dominio/fechas.js';
import type { FilaSnapshotGuardada } from '../../src/dominio/repositorios.js';
import { armarDrilldown, evaluarCelula, motivosDe } from '../../src/dominio/semaforo.js';
import { armarSeries } from '../../src/dominio/tendencia.js';
import type { AnalistaAmbito, EvaluacionHdu, HduAmbito } from '../../src/dominio/tipos.js';

const filaSnap = (n: number, fecha: string, extra: Partial<FilaSnapshotGuardada> = {}): FilaSnapshotGuardada => ({
  id: `f${n}${fecha}`,
  idEjecucion: 'e',
  generadoEn: new Date(),
  fecha,
  idCelula: `c${n}`,
  celulaNombre: `CEL-${n}`,
  idSprint: `s${n}`,
  sprintNombre: `SP-${n}`,
  sprintInicio: '2026-10-01',
  sprintFin: '2026-12-01',
  ambito: 'TODOS',
  hduTotal: 3,
  certificadas: 0,
  cerradasExcepcion: 0,
  enCurso: 3,
  sinIniciar: 0,
  bloqueadas: 0,
  sumaAvance: 110,
  cumplimientoPromedio: 36.7,
  hduRiesgoAlto: 0,
  hduRiesgoMedio: 0,
  impedimentosAbiertos: 0,
  impedimentosEscalados: 0,
  semaforo: 'VERDE',
  ...extra,
});

describe('series de tendencia (D166, D185)', () => {
  it('a lo sumo 6 series y totalSeries informa cuántas había; ordenadas por célula', () => {
    const filas = Array.from({ length: 8 }, (_, i) => filaSnap(8 - i, '2026-11-03'));
    const r = armarSeries(filas, '2026-11-04', false);
    assert.equal(r.totalSeries, 8);
    assert.deepEqual(r.series.map((s) => s.celula.nombre), ['CEL-1', 'CEL-2', 'CEL-3', 'CEL-4', 'CEL-5', 'CEL-6']);
  });
  it('el punto usa suma_avance / hdu_total y no el promedio guardado: 110/3 = 36.7', () => {
    const r = armarSeries([filaSnap(1, '2026-11-03', { cumplimientoPromedio: 99 })], '2026-11-04', true);
    assert.deepEqual(r.series[0]?.puntos, [{ fecha: '2026-11-03', cumplimiento: 36.7, hduTotal: 3 }]);
  });
  it('un sprint cerrado conserva su serie con la marca cerrado', () => {
    const r = armarSeries([filaSnap(1, '2026-11-03', { sprintFin: '2026-11-03' })], '2026-11-04', true);
    assert.equal(r.series[0]?.sprint.cerrado, true);
  });
});

const hdu = (n: number, cambios: Partial<HduAmbito> = {}): HduAmbito => ({
  id: `h${n}`,
  codigo: `H${n}`,
  titulo: `Historia ${n}`,
  estado: 'EN_EJECUCION',
  cierreParcial: false,
  celula: { id: 'c1', nombre: 'CEL-A' },
  sprint: { id: 's1', nombre: 'SP', inicio: '2026-11-01', fin: '2026-11-14' },
  qeResponsable: { id: 'q1', nombre: 'QE1' },
  analista: null,
  ...cambios,
});
const evaluacion = (hduId: string, cambios: Partial<EvaluacionHdu> & { nivel?: 'BAJO' | 'MEDIO' | 'ALTO' | null; riesgoEstado?: 'ok' | 'indisponible' } = {}): EvaluacionHdu => ({
  hduId,
  bloqueada: (cambios.abiertos ?? 0) > 0,
  abiertos: cambios.abiertos ?? 0,
  escalados: cambios.escalados ?? 0,
  riesgo: { nivelVigente: cambios.nivel ?? 'BAJO', origen: 'SUGERIDO', estado: cambios.riesgoEstado ?? 'ok', calculoParcial: false },
});

describe('clasificación (3.2, D155)', () => {
  it('las cuatro categorías son excluyentes', () => {
    assert.equal(clasificarHdu({ estado: 'CERRADA', cierreParcial: true }, true), 'CERRADA_EXCEPCION', 'cerrada con excepción nunca es certificada');
    assert.equal(clasificarHdu({ estado: 'CERRADA', cierreParcial: false }, false), 'CERTIFICADA');
    assert.equal(clasificarHdu({ estado: 'EN_EJECUCION', cierreParcial: false }, true), 'CERTIFICADA', 'con certificado aunque no esté cerrada');
    assert.equal(clasificarHdu({ estado: 'PENDIENTE', cierreParcial: false }, false), 'SIN_INICIAR');
    assert.equal(clasificarHdu({ estado: 'PENDIENTE', cierreParcial: false }, true), 'CERTIFICADA');
    for (const estado of ['DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE'] as const) assert.equal(clasificarHdu({ estado, cierreParcial: false }, false), 'EN_CURSO');
  });
});

describe('cumplimiento promedio (3.3, D156)', () => {
  it('redondea a un decimal con mitad hacia arriba y usa enteros', () => {
    assert.equal(promedioRedondeado(220, 5), 44);
    assert.equal(promedioRedondeado(220, 6), 36.7);
    assert.equal(promedioRedondeado(40, 3), 13.3);
    assert.equal(promedioRedondeado(5, 2), 2.5);
    assert.equal(promedioRedondeado(1, 8), 0.1, '0,125 → 0,1');
    assert.equal(promedioRedondeado(3, 8), 0.4, '0,375 → 0,4');
    assert.equal(promedioRedondeado(0, 4), 0);
    assert.equal(promedioRedondeado(100, 1), 100);
  });
  it('sin HDU no hay promedio: null, nunca 0', () => {
    assert.equal(promedioRedondeado(0, 0), null);
  });
});

describe('fechas de Santiago (D163)', () => {
  it('la fecha del snapshot es la de Santiago, en invierno y en verano', () => {
    assert.equal(fechaSantiago(new Date('2026-07-01T02:30:00Z')), '2026-06-30', 'invierno: UTC-4');
    assert.equal(fechaSantiago(new Date('2026-12-15T02:30:00Z')), '2026-12-14', 'verano: UTC-3');
    assert.equal(fechaSantiago(new Date('2026-11-04T06:00:00Z')), '2026-11-04', 'el cron de 06:00 UTC cae siempre el mismo día');
    assert.equal(fechaSantiago(new Date('2026-07-01T06:00:00Z')), '2026-07-01');
    assert.equal(fechaSantiago(new Date('2026-12-15T06:00:00Z')), '2026-12-15');
  });
  it('hora de Chile legible y aritmética de días', () => {
    assert.equal(fechaHoraSantiago(new Date('2026-11-04T18:20:00Z')), '2026-11-04 15:20');
    assert.equal(sumarDias('2026-11-04', -89), '2026-08-07');
    assert.equal(diasEntre('2026-11-01', '2026-11-04'), 3);
    assert.equal(esFechaIso('2026-02-30'), false);
    assert.equal(esFechaIso('2026-11-04'), true);
    assert.equal(esFechaIso('04-11-2026'), false);
  });
});

describe('semáforo por célula (3.4, D157, D188)', () => {
  const hdus = [hdu(1), hdu(2)];
  it('rojo con riesgo ALTO o un impedimento escalado; amarillo con MEDIO o abierto; verde si ninguno', () => {
    const rojo = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { nivel: 'ALTO' })], ['h2', evaluacion('h2')]]), certificacionesCaida: false });
    assert.deepEqual([rojo.estado, rojo.color, rojo.riesgoMaximo, rojo.calculoParcial], ['ok', 'ROJO', 'ALTO', false]);
    const escalado = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { nivel: 'MEDIO', abiertos: 1, escalados: 1 })], ['h2', evaluacion('h2')]]), certificacionesCaida: false });
    assert.deepEqual([escalado.color, escalado.impedimentosAbiertos, escalado.impedimentosEscalados, escalado.riesgoMaximo], ['ROJO', 0, 1, 'MEDIO']);
    const amarillo = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { abiertos: 1 })], ['h2', evaluacion('h2')]]), certificacionesCaida: false });
    assert.deepEqual([amarillo.color, amarillo.impedimentosAbiertos], ['AMARILLO', 1]);
    const medio = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { nivel: 'MEDIO' })], ['h2', evaluacion('h2')]]), certificacionesCaida: false });
    assert.equal(medio.color, 'AMARILLO');
    const verde = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1')], ['h2', evaluacion('h2')]]), certificacionesCaida: false });
    assert.deepEqual([verde.color, verde.riesgoMaximo], ['VERDE', 'BAJO']);
  });
  it('solo cuentan las HDU no cerradas; una célula de solo cerradas es verde con 0 activas y sin HDU es gris', () => {
    const soloCerradas = evaluarCelula({ hdu: [hdu(7, { estado: 'CERRADA' })], evaluaciones: new Map(), certificacionesCaida: true });
    assert.deepEqual([soloCerradas.estado, soloCerradas.color, soloCerradas.hduActivas, soloCerradas.riesgoMaximo], ['ok', 'VERDE', 0, null]);
    const vacia = evaluarCelula({ hdu: [], evaluaciones: new Map(), certificacionesCaida: false });
    assert.deepEqual([vacia.estado, vacia.color], ['SIN_HDU', null]);
  });
  it('fuente caída: nunca VERDE; un rojo conocido se muestra parcial; sin rojo queda indisponible con «al menos amarillo»', () => {
    const parcial = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { nivel: 'ALTO' })], ['h2', evaluacion('h2', { nivel: null, riesgoEstado: 'indisponible' })]]), certificacionesCaida: true });
    assert.deepEqual([parcial.estado, parcial.color, parcial.calculoParcial], ['ok', 'ROJO', true]);
    const gris = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { nivel: null, riesgoEstado: 'indisponible' })], ['h2', evaluacion('h2', { nivel: null, riesgoEstado: 'indisponible' })]]), certificacionesCaida: true });
    assert.deepEqual([gris.estado, gris.color, gris.alMenos], ['indisponible', null, null]);
    const alMenos = evaluarCelula({ hdu: hdus, evaluaciones: new Map([['h1', evaluacion('h1', { abiertos: 1, nivel: null, riesgoEstado: 'indisponible' })], ['h2', evaluacion('h2', { nivel: null, riesgoEstado: 'indisponible' })]]), certificacionesCaida: true });
    assert.deepEqual([alMenos.estado, alMenos.color, alMenos.alMenos], ['indisponible', null, 'AMARILLO']);
    const sinImpedimentos = evaluarCelula({ hdu: hdus, evaluaciones: null, certificacionesCaida: false });
    assert.deepEqual([sinImpedimentos.estado, sinImpedimentos.color, sinImpedimentos.impedimentosAbiertos], ['indisponible', null, null]);
  });
  it('motivos: a lo sumo uno de riesgo y uno de impedimento, y solo los del color de la célula', () => {
    const e = evaluacion('h1', { nivel: 'ALTO', abiertos: 2, escalados: 1 });
    assert.deepEqual(motivosDe(e, 'ROJO'), ['RIESGO_ALTO', 'IMPEDIMENTO_ESCALADO']);
    assert.deepEqual(motivosDe(evaluacion('h1', { nivel: 'MEDIO', abiertos: 1 }), 'AMARILLO'), ['RIESGO_MEDIO', 'IMPEDIMENTO_ABIERTO']);
    assert.deepEqual(motivosDe(evaluacion('h1', { nivel: 'ALTO', abiertos: 1 }), 'ROJO'), ['RIESGO_ALTO'], 'el abierto no genera el rojo');
    assert.deepEqual(motivosDe(evaluacion('h1', { nivel: 'ALTO' }), 'VERDE'), []);
  });
  it('drill-down: ordena por gravedad, nivel, días abiertos y código', () => {
    const activas = [hdu(1), hdu(2), hdu(3), hdu(4)];
    const evaluaciones = new Map([
      ['h1', evaluacion('h1', { nivel: 'MEDIO', abiertos: 1, escalados: 1 })],
      ['h2', evaluacion('h2', { nivel: 'ALTO' })],
      ['h3', evaluacion('h3', { nivel: 'MEDIO', abiertos: 1, escalados: 1 })],
      ['h4', evaluacion('h4', { nivel: 'BAJO' })],
    ]);
    const impedimentos = [
      { id: 'i1', hduId: 'h1', titulo: 'a', tipo: 'X', estado: 'ESCALADO' as const, diasAbierto: 2 },
      { id: 'i3', hduId: 'h3', titulo: 'b', tipo: 'X', estado: 'ESCALADO' as const, diasAbierto: 9 },
    ];
    const items = armarDrilldown('ROJO', activas, evaluaciones, impedimentos);
    assert.deepEqual(items.map((i) => i.hdu.codigo), ['H2', 'H3', 'H1'], 'H2 tiene RIESGO_ALTO; luego los escalados por días abiertos descendente');
    assert.equal(items[1]?.impedimentoPrincipal?.id, 'i3');
  });
});

describe('carga por analista (3.5, D159, D160, D182)', () => {
  const ana = (id: string, nombre: string, sup: string | null): AnalistaAmbito => ({ id, nombre, activo: true, supervisor: sup === null ? null : { id: sup, nombre: sup.toUpperCase() } });
  const base = { usuarioId: 'q1', usuarioNombre: 'QE1', umbrales: new Map<string, number>(), umbralDefecto: 5 };

  it('sobrecarga es activas MAYORES que el umbral: 5 no, 6 sí', () => {
    const mias = Array.from({ length: 6 }, (_, i) => hdu(i + 1, { analista: { id: 'a1', nombre: 'ANA1', activo: true } }));
    const seis = calcularCarga({ ...base, rol: 'QE', hdu: mias, analistas: [ana('a1', 'ANA1', 'q1')], filtradas: mias, avance: new Map() });
    assert.equal(seis.grupos[0]?.filas[0]?.sobrecargado, true);
    const cinco = calcularCarga({ ...base, rol: 'QE', hdu: mias.slice(0, 5), analistas: [ana('a1', 'ANA1', 'q1')], filtradas: mias.slice(0, 5), avance: new Map() });
    assert.equal(cinco.grupos[0]?.filas[0]?.sobrecargado, false);
  });
  it('los filtros cambian porEstado y cumplimiento pero no activas ni sobrecargado', () => {
    const a = { id: 'a1', nombre: 'ANA1', activo: true };
    const hdus = [hdu(1, { analista: a }), hdu(2, { analista: a, celula: { id: 'c2', nombre: 'CEL-B' } })];
    const r = calcularCarga({ ...base, rol: 'QE', hdu: hdus, analistas: [ana('a1', 'ANA1', 'q1')], filtradas: [hdus[0] as HduAmbito], avance: new Map([['h1', { hduId: 'h1', aprobados: 3, certificado: false }]]), umbrales: new Map([['q1', 1]]) });
    const fila = r.grupos[0]?.filas[0];
    assert.deepEqual([fila?.activas, fila?.porEstado.EN_EJECUCION, fila?.cumplimiento, fila?.sobrecargado], [2, 1, 30, true]);
  });
  it('un analista sin HDU aparece con ceros y sin cumplimiento; las HDU sin analista van aparte y no se evalúan', () => {
    const huerfana = hdu(9, { analista: null });
    const r = calcularCarga({ ...base, rol: 'QE', hdu: [huerfana], analistas: [ana('a4', 'ANA4', 'q1')], filtradas: [huerfana], avance: new Map() });
    const fila = r.grupos[0]?.filas[0];
    assert.deepEqual([fila?.activas, fila?.sinHdu, fila?.cumplimiento, fila?.supervisadoPorMi], [0, true, null, true]);
    assert.equal(r.sinAnalista?.activas, 1);
  });
  it('Líder y Auditor: un grupo por QE supervisor con su umbral y «Sin QE supervisor» al final con el valor por defecto', () => {
    const hdus = [hdu(1, { analista: { id: 'a1', nombre: 'ANA1', activo: true } }), hdu(2, { analista: { id: 'a1', nombre: 'ANA1', activo: true } })];
    const r = calcularCarga({ ...base, rol: 'AUDITOR', hdu: hdus, analistas: [ana('a1', 'ANA1', 'q2'), ana('a4', 'ANA4', null)], filtradas: hdus, avance: new Map(), umbrales: new Map([['q2', 1]]) });
    assert.deepEqual(r.grupos.map((g) => [g.qe?.id ?? null, g.umbral, g.umbralPorDefecto]), [['q2', 1, false], [null, 5, true]]);
    assert.equal(r.grupos[0]?.filas[0]?.sobrecargado, true);
    assert.equal(r.grupos[0]?.filas[0]?.supervisadoPorMi, null);
    assert.equal(r.grupos[1]?.filas[0]?.sobrecargado, false);
  });
  it('QE: un analista de otro supervisor se marca «No supervisado por ti» y se evalúa con el umbral del QE que mira (D160)', () => {
    const hdus = [hdu(1, { analista: { id: 'a1', nombre: 'ANA1', activo: true } }), hdu(2, { analista: { id: 'a1', nombre: 'ANA1', activo: true } })];
    const r = calcularCarga({ ...base, rol: 'QE', hdu: hdus, analistas: [ana('a1', 'ANA1', 'q2')], filtradas: hdus, avance: new Map(), umbrales: new Map([['q1', 1], ['q2', 50]]) });
    const fila = r.grupos[0]?.filas[0];
    assert.deepEqual([fila?.supervisadoPorMi, fila?.sobrecargado, r.grupos[0]?.umbral], [false, true, 1]);
  });
  it('orden: sobrecargados primero, activas descendente y nombre', () => {
    const a = (n: string) => ({ id: n, nombre: n, activo: true });
    const hdus = [hdu(1, { analista: a('B') }), hdu(2, { analista: a('B') }), hdu(3, { analista: a('A') }), hdu(4, { analista: a('C') }), hdu(5, { analista: a('C') }), hdu(6, { analista: a('C') })];
    const r = calcularCarga({ ...base, rol: 'QE', hdu: hdus, analistas: [ana('A', 'A', 'q1'), ana('B', 'B', 'q1'), ana('C', 'C', 'q1')], filtradas: hdus, avance: new Map(), umbrales: new Map([['q1', 2]]) });
    assert.deepEqual(r.grupos[0]?.filas.map((f) => f.analista.nombre), ['C', 'B', 'A']);
  });
});
