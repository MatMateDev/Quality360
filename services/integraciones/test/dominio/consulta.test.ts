/**
 * Dominio de la consulta (IC2): clasificación (D136), asignación y marcado (D137-D139, D145), vida (D134, D135, D148)
 * y confirmación (D140, D141). Todo puro: sin base de datos ni red.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clasificarFila, type HduExistente } from '../../src/dominio/consulta/clasificacion.js';
import {
  combinarAsignacion,
  decidirEdicion,
  esMarcable,
  estaCompleta,
  faltantes,
  motivoNoMarcable,
  puedeAsignarse,
  type EstadoFila,
  type ValidacionAsignacion,
} from '../../src/dominio/consulta/asignacion.js';
import { detalleDeConfirmacion, nombresDeAsignacion, pasosPendientes, planDeLotes } from '../../src/dominio/consulta/confirmacion.js';
import { ASIGNACION_VACIA, type AsignacionFila, type ItemConsulta } from '../../src/dominio/consulta/tipos.js';
import { calcularVencimiento, cupoRestante, decidirConsultar, obstaculoDeContinuar, obstaculoDeLectura, pasoSuVigencia, sinRepetidos } from '../../src/dominio/consulta/vida.js';

const ref = (id: string, nombre = id) => ({ id, nombre });
const COMPLETA: AsignacionFila = { celula: ref('c', 'CEL-C'), qe: ref('q', 'QE2'), analista: ref('a', 'ANA3'), sprint: ref('s', 'E5 Sprint 2'), sprintOrigen: 'JIRA' };

const existente = (parcial: Partial<HduExistente> = {}): HduExistente => ({
  idHistoria: 'h1',
  estado: 'PENDIENTE',
  origen: 'JIRA',
  titulo: 'Titulo',
  descripcion: 'Descripcion',
  prioridad: 'MEDIA',
  qeResponsable: 'QE1',
  ...parcial,
});
const fila = (parcial: Record<string, unknown> = {}) => ({ titulo: 'Titulo', descripcion: 'Descripcion', prioridad: 'MEDIA' as const, error: null, ...parcial }) as Parameters<typeof clasificarFila>[0];

describe('clasificarFila (D136)', () => {
  it('error de mapeo: CON_ERROR con su motivo; sin HDU: NUEVA', () => {
    assert.deepEqual(clasificarFila(fila({ error: 'TITULO_VACIO' }), null), { grupo: 'CON_ERROR', motivo: 'TITULO_VACIO', cambios: null });
    assert.deepEqual(clasificarFila(fila({ error: 'CODIGO_INVALIDO' }), existente()), { grupo: 'CON_ERROR', motivo: 'CODIGO_INVALIDO', cambios: null });
    assert.deepEqual(clasificarFila(fila(), null), { grupo: 'NUEVA', motivo: null, cambios: null });
  });

  it('una HDU cerrada es SIN_CAMBIOS con HDU_CERRADA aunque Jira traiga otro título', () => {
    assert.deepEqual(clasificarFila(fila({ titulo: 'Otro' }), existente({ estado: 'CERRADA' })), { grupo: 'SIN_CAMBIOS', motivo: 'HDU_CERRADA', cambios: null });
  });

  it('título, descripción o prioridad distintos: CAMBIO con antes y después; iguales: SIN_CAMBIOS', () => {
    const c = clasificarFila(fila({ titulo: 'Recuperar clave', prioridad: 'CRITICA' }), existente({ titulo: 'Recuperar contraseña' }));
    assert.equal(c.grupo, 'CAMBIO');
    assert.deepEqual(c.cambios, { titulo: { antes: 'Recuperar contraseña', despues: 'Recuperar clave' }, prioridad: { antes: 'MEDIA', despues: 'CRITICA' } });
    assert.deepEqual(clasificarFila(fila(), existente()), { grupo: 'SIN_CAMBIOS', motivo: 'SIN_CAMBIOS', cambios: null });
  });

  it('una prioridad ausente o desconocida (null del mapeo) y un valor vacío no cuentan como cambio', () => {
    assert.equal(clasificarFila(fila({ prioridad: null }), existente({ prioridad: 'ALTA' })).grupo, 'SIN_CAMBIOS');
    assert.equal(clasificarFila(fila({ descripcion: null }), existente()).grupo, 'SIN_CAMBIOS');
    assert.equal(clasificarFila(fila({ descripcion: '   ' }), existente({ descripcion: null })).grupo, 'SIN_CAMBIOS');
  });

  it('una HDU a mano con el mismo contenido es SIN_CAMBIOS y con otro título es CAMBIO; los valores llegan hasta 1.000 caracteres', () => {
    assert.equal(clasificarFila(fila(), existente({ origen: 'MANUAL' })).grupo, 'SIN_CAMBIOS');
    assert.equal(clasificarFila(fila({ titulo: 'Notificaciones' }), existente({ origen: 'MANUAL' })).grupo, 'CAMBIO');
    const larga = 'x'.repeat(1200);
    const c = clasificarFila(fila({ descripcion: larga }), existente({ descripcion: 'y'.repeat(1100) }));
    assert.equal(c.cambios?.descripcion?.despues?.length, 1000);
    assert.equal(c.cambios?.descripcion?.antes?.length, 1000);
  });
});

describe('completitud y marcado (D139)', () => {
  const nueva = (asignacion: AsignacionFila, extra: Partial<EstadoFila> = {}): EstadoFila => ({ grupo: 'NUEVA', asignacion, marcada: false, aplicada: false, ...extra });

  it('faltantes en el orden del portal; completa cuando no falta ninguno', () => {
    assert.deepEqual(faltantes(ASIGNACION_VACIA), ['celulaId', 'qeId', 'analistaId', 'sprintId']);
    assert.deepEqual(faltantes({ ...COMPLETA, analista: null }), ['analistaId']);
    assert.equal(estaCompleta(COMPLETA), true);
  });

  it('solo NUEVA completa y CAMBIO se marcan; SIN_CAMBIOS, CON_ERROR y una aplicada, no', () => {
    assert.equal(esMarcable(nueva(COMPLETA)), true);
    assert.equal(esMarcable(nueva(ASIGNACION_VACIA)), false);
    assert.equal(esMarcable({ grupo: 'CAMBIO', asignacion: ASIGNACION_VACIA, marcada: false, aplicada: false }), true);
    for (const grupo of ['SIN_CAMBIOS', 'CON_ERROR'] as const) assert.deepEqual(motivoNoMarcable({ grupo, asignacion: ASIGNACION_VACIA, marcada: false, aplicada: false }), { motivo: 'FILA_NO_MARCABLE', campo: null });
    assert.deepEqual(motivoNoMarcable(nueva(COMPLETA, { marcada: true, aplicada: true })), { motivo: 'FILA_NO_MARCABLE', campo: null });
    assert.deepEqual(motivoNoMarcable(nueva({ ...COMPLETA, sprint: null, sprintOrigen: null })), { motivo: 'ASIGNACION_INCOMPLETA', campo: null, faltantes: ['sprintId'] });
  });

  it('solo NUEVA no aplicada admite asignación', () => {
    assert.equal(puedeAsignarse({ grupo: 'NUEVA', aplicada: false }), true);
    assert.equal(puedeAsignarse({ grupo: 'NUEVA', aplicada: true }), false);
    assert.equal(puedeAsignarse({ grupo: 'CAMBIO', aplicada: false }), false);
  });
});

describe('combinarAsignacion (D138)', () => {
  it('cambiar el QE limpia el analista, salvo que venga en el mismo cuerpo', () => {
    assert.equal(combinarAsignacion(COMPLETA, { qeId: 'q9' }).ids.analistaId, null);
    assert.equal(combinarAsignacion(COMPLETA, { qeId: 'q9', analistaId: 'a9' }).ids.analistaId, 'a9');
    assert.equal(combinarAsignacion(COMPLETA, { qeId: 'q' }).ids.analistaId, 'a');
  });

  it('cambiar la célula recalcula el sprint (PROPONER), salvo que venga sprintId (EXPLICITO); sin célula se limpia', () => {
    const c = combinarAsignacion(COMPLETA, { celulaId: 'c9' });
    assert.deepEqual([c.modoSprint, c.ids.sprintId], ['PROPONER', null]);
    assert.equal(combinarAsignacion(COMPLETA, { celulaId: 'c9', sprintId: 's9' }).modoSprint, 'EXPLICITO');
    assert.deepEqual([combinarAsignacion(COMPLETA, { celulaId: null }).modoSprint, combinarAsignacion(COMPLETA, { sprintId: null }).modoSprint], ['LIMPIAR', 'LIMPIAR']);
    assert.equal(combinarAsignacion(COMPLETA, { celulaId: 'c' }).modoSprint, 'MANTENER');
  });

  it('solo valida lo que toca, con su pareja', () => {
    assert.deepEqual([...combinarAsignacion(COMPLETA, { analistaId: 'a9' }).aValidar].sort(), ['analistaId', 'qeId']);
    assert.deepEqual([...combinarAsignacion(COMPLETA, { sprintId: 's9' }).aValidar].sort(), ['celulaId', 'sprintId']);
    assert.deepEqual([...combinarAsignacion(COMPLETA, { celulaId: 'c9' }).aValidar], ['celulaId']);
    assert.equal(combinarAsignacion(COMPLETA, {}).aValidar.size, 0);
    assert.deepEqual([...combinarAsignacion(ASIGNACION_VACIA, { celulaId: 'c', qeId: 'q', analistaId: 'a' }).aValidar].sort(), ['analistaId', 'celulaId', 'qeId']);
  });
});

describe('decidirEdicion (D139, D145)', () => {
  const vacia: EstadoFila = { grupo: 'NUEVA', asignacion: ASIGNACION_VACIA, marcada: false, aplicada: false };
  const valida = (extra: Partial<ValidacionAsignacion> = {}): ValidacionAsignacion => ({
    errores: [],
    celula: ref('c', 'CEL-C'),
    qe: ref('q', 'QE2'),
    analista: ref('a', 'ANA3'),
    sprint: null,
    sprintPropuesto: { sprint: ref('s', 'E5 Sprint 2'), origen: 'JIRA', sprintJiraNoEncontrado: false },
    celulaSinLiderActivo: false,
    ...extra,
  });
  const editar = (fila: EstadoFila, pedido: Parameters<typeof decidirEdicion>[1], validacion: ValidacionAsignacion | null = valida()) =>
    decidirEdicion(fila, pedido, pedido.cambio === undefined ? null : combinarAsignacion(fila.asignacion, pedido.cambio), validacion);

  it('asigna y deja la fila completa con el sprint propuesto', () => {
    const d = editar(vacia, { cambio: { celulaId: 'c', qeId: 'q', analistaId: 'a' } });
    assert.equal(d.tipo, 'OK');
    if (d.tipo !== 'OK') return;
    assert.equal(estaCompleta(d.asignacion), true);
    assert.deepEqual([d.asignacion.sprint?.nombre, d.asignacion.sprintOrigen, d.cambioAsignacion], ['E5 Sprint 2', 'JIRA', true]);
  });

  it('el primer error de validación rechaza la fila con su campo; una fila que no se asigna se rechaza antes', () => {
    const d = editar(vacia, { cambio: { qeId: 'x' } }, valida({ errores: [{ campo: 'qeId', codigo: 'QE_INVALIDO' }] }));
    assert.deepEqual(d, { tipo: 'RECHAZADA', rechazo: { motivo: 'QE_INVALIDO', campo: 'qeId' } });
    const ajena = decidirEdicion({ ...vacia, grupo: 'SIN_CAMBIOS' }, { cambio: { qeId: 'q' } }, null, null);
    assert.deepEqual(ajena, { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_NO_ASIGNABLE', campo: null } });
  });

  it('marcar una incompleta es ASIGNACION_INCOMPLETA con faltantes; marcar una completa funciona', () => {
    assert.deepEqual(editar(vacia, { marcada: true }, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'ASIGNACION_INCOMPLETA', campo: null, faltantes: ['celulaId', 'qeId', 'analistaId', 'sprintId'] } });
    const d = editar({ ...vacia, asignacion: COMPLETA }, { marcada: true }, null);
    assert.equal(d.tipo === 'OK' && d.marcada && d.marcadaAhora, true);
  });

  it('una edición que invalida una fila marcada la desmarca y lo informa', () => {
    const marcada: EstadoFila = { grupo: 'NUEVA', asignacion: COMPLETA, marcada: true, aplicada: false };
    const d = editar(marcada, { cambio: { celulaId: 'c9' } }, valida({ celula: ref('c9', 'CEL-A'), sprintPropuesto: { sprint: null, origen: null, sprintJiraNoEncontrado: true } }));
    assert.equal(d.tipo === 'OK' && d.desmarcada && !d.marcada, true);
    if (d.tipo === 'OK') assert.deepEqual([d.asignacion.sprint, d.sprintJiraNoEncontrado], [null, true]);
  });

  it('marcarListas marca las NUEVA que quedan completas y cuenta las demás, sin rechazarlas', () => {
    const completa = editar({ ...vacia, asignacion: COMPLETA }, { marcarListas: true }, null);
    assert.equal(completa.tipo === 'OK' && completa.marcada && completa.marcadaAhora && !completa.incompleta, true);
    const incompleta = editar(vacia, { marcarListas: true }, null);
    assert.equal(incompleta.tipo === 'OK' && !incompleta.marcada && incompleta.incompleta, true);
    const aplicada = editar({ ...vacia, asignacion: COMPLETA, marcada: true, aplicada: true }, { marcarListas: true }, null);
    assert.equal(aplicada.tipo === 'OK' && !aplicada.incompleta && aplicada.marcada, true);
  });

  it('una fila aplicada no se desmarca ni se asigna; CAMBIO se marca sin asignación', () => {
    const aplicada: EstadoFila = { grupo: 'NUEVA', asignacion: COMPLETA, marcada: true, aplicada: true };
    assert.deepEqual(editar(aplicada, { marcada: false }, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_NO_MARCABLE', campo: null } });
    assert.deepEqual(editar(aplicada, { cambio: { qeId: 'q9' } }), { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_NO_ASIGNABLE', campo: null } });
    const cambio = editar({ grupo: 'CAMBIO', asignacion: ASIGNACION_VACIA, marcada: false, aplicada: false }, { marcada: true }, null);
    assert.equal(cambio.tipo === 'OK' && cambio.marcada, true);
  });

  it('un sprint explícito queda MANUAL y el aviso de Líder viene de la validación', () => {
    const base: EstadoFila = { ...vacia, asignacion: COMPLETA };
    const d = editar(base, { cambio: { sprintId: 's9' } }, valida({ sprint: ref('s9', 'Otro sprint'), celulaSinLiderActivo: true }));
    assert.equal(d.tipo === 'OK' && d.asignacion.sprintOrigen === 'MANUAL' && d.asignacion.sprint?.nombre === 'Otro sprint' && d.avisoSinLider, true);
  });
});

describe('analista único, HDU ya asignada y fila en toma (D201, D202, D204)', () => {
  const conQe: EstadoFila = { grupo: 'NUEVA', asignacion: { ...ASIGNACION_VACIA, celula: ref('c', 'CEL-C') }, marcada: false, aplicada: false };
  const validar = (extra: Partial<ValidacionAsignacion> = {}): ValidacionAsignacion => ({
    errores: [], celula: null, qe: ref('q', 'QE2'), analista: null, sprint: null, sprintPropuesto: null, celulaSinLiderActivo: false,
    analistasActivos: 1, analistaPropuesto: ref('a', 'ANA3'), ...extra,
  });
  const editar = (fila: EstadoFila, pedido: Parameters<typeof decidirEdicion>[1], validacion: ValidacionAsignacion | null) =>
    decidirEdicion(fila, pedido, pedido.cambio === undefined ? null : combinarAsignacion(fila.asignacion, pedido.cambio), validacion);

  it('proponerAnalista solo cuando el QE cambia y no viene analistaId', () => {
    assert.equal(combinarAsignacion(conQe.asignacion, { qeId: 'q' }).proponerAnalista, true);
    assert.equal(combinarAsignacion(conQe.asignacion, { qeId: 'q', analistaId: 'a' }).proponerAnalista, false);
    assert.equal(combinarAsignacion(conQe.asignacion, { qeId: 'q', analistaId: null }).proponerAnalista, false);
    assert.equal(combinarAsignacion(conQe.asignacion, { qeId: null }).proponerAnalista, false);
    assert.equal(combinarAsignacion(COMPLETA, { qeId: 'q' }).proponerAnalista, false, 'el mismo QE no es un cambio');
    assert.equal(combinarAsignacion(COMPLETA, { celulaId: 'c9' }).proponerAnalista, false);
  });

  it('con un único analista activo la fila queda con él y analistaAuto true (E5-B07 #1)', () => {
    const d = editar(conQe, { cambio: { qeId: 'q' } }, validar());
    assert.equal(d.tipo, 'OK');
    if (d.tipo !== 'OK') return;
    assert.deepEqual([d.asignacion.analista?.id, d.analistaAuto], ['a', true]);
  });

  it('con 0 o 2+ analistas (sin propuesta) queda vacío y sin error (E5-B07 #2)', () => {
    // 0 activos, 3 activos y una Organización anterior (sin los campos nuevos).
    const casos: Array<Partial<ValidacionAsignacion>> = [
      { analistasActivos: 0, analistaPropuesto: null },
      { analistasActivos: 3, analistaPropuesto: null },
      { analistasActivos: undefined, analistaPropuesto: undefined },
    ];
    for (const extra of casos) {
      const d = editar(conQe, { cambio: { qeId: 'q' } }, validar(extra));
      assert.equal(d.tipo, 'OK');
      if (d.tipo !== 'OK') continue;
      assert.deepEqual([d.asignacion.analista, d.analistaAuto], [null, false]);
    }
  });

  it('un analista explícito se respeta y deja analistaAuto false, aunque el servidor tuviera uno propuesto (E5-B07 #3)', () => {
    const auto: EstadoFila = { grupo: 'NUEVA', asignacion: COMPLETA, marcada: false, aplicada: false, analistaAuto: true };
    const mismo = editar(auto, { cambio: { analistaId: 'a' } }, null);
    assert.equal(mismo.tipo === 'OK' && mismo.analistaAuto, false);
    const limpia = editar(auto, { cambio: { analistaId: null } }, validar());
    assert.deepEqual(limpia.tipo === 'OK' ? [limpia.asignacion.analista, limpia.analistaAuto] : null, [null, false]);
    const otroQe = editar(auto, { cambio: { qeId: 'q9' } }, validar({ analistasActivos: 2, analistaPropuesto: null, qe: ref('q9') }));
    assert.deepEqual(otroQe.tipo === 'OK' ? [otroQe.asignacion.analista, otroQe.analistaAuto] : null, [null, false]);
  });

  it('editar otra cosa no toca analistaAuto; marcar tampoco', () => {
    const auto: EstadoFila = { grupo: 'NUEVA', asignacion: COMPLETA, marcada: false, aplicada: false, analistaAuto: true };
    const celula = editar(auto, { cambio: { celulaId: 'c9' } }, validar({ celula: ref('c9'), sprintPropuesto: null }));
    assert.equal(celula.tipo === 'OK' && celula.analistaAuto, true);
    const marca = editar(auto, { marcada: true }, null);
    assert.equal(marca.tipo === 'OK' && marca.analistaAuto, true);
  });

  it('NUEVA con yaAsignada: HDU_YA_ASIGNADA al asignar; no es marcable; CAMBIO y SIN_CAMBIOS siguen en FILA_NO_ASIGNABLE (E5-B07 #6, E5-B05-T11)', () => {
    const ya = { idHistoria: 'h1', qe: 'QE1', analista: null };
    const nueva: EstadoFila = { grupo: 'NUEVA', asignacion: COMPLETA, marcada: false, aplicada: false, yaAsignada: ya };
    assert.deepEqual(editar(nueva, { cambio: { qeId: 'q' } }, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'HDU_YA_ASIGNADA', campo: null } });
    assert.deepEqual([puedeAsignarse(nueva), esMarcable(nueva)], [false, false]);
    assert.equal(motivoNoMarcable(nueva)?.motivo, 'FILA_NO_MARCABLE');
    assert.deepEqual(editar(nueva, { marcada: true }, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_NO_MARCABLE', campo: null } });
    for (const grupo of ['CAMBIO', 'SIN_CAMBIOS'] as const) {
      assert.deepEqual(decidirEdicion({ ...nueva, grupo }, { cambio: { qeId: 'q' } }, null, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_NO_ASIGNABLE', campo: null } });
    }
    // Una CAMBIO con yaAsignada sigue marcándose como hoy.
    const cambio = decidirEdicion({ grupo: 'CAMBIO', asignacion: ASIGNACION_VACIA, marcada: false, aplicada: false, yaAsignada: ya }, { marcada: true }, null, null);
    assert.equal(cambio.tipo === 'OK' && cambio.marcada, true);
  });

  it('una fila aplicando rechaza cambio y marca con FILA_EN_CURSO; marcarListas la salta sin error (D202 f)', () => {
    const tomada: EstadoFila = { grupo: 'NUEVA', asignacion: COMPLETA, marcada: false, aplicada: false, aplicando: true };
    assert.deepEqual(editar(tomada, { cambio: { analistaId: 'a9' } }, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_EN_CURSO', campo: null } });
    assert.deepEqual(editar(tomada, { marcada: true }, null), { tipo: 'RECHAZADA', rechazo: { motivo: 'FILA_EN_CURSO', campo: null } });
    const listas = editar(tomada, { marcarListas: true }, null);
    assert.deepEqual(listas.tipo === 'OK' ? [listas.marcada, listas.incompleta] : null, [false, false]);
  });
});

describe('vida de la consulta (D134, D135, D148)', () => {
  const ahora = new Date('2026-11-02T12:00:00Z');
  const abierta = (venceEn: string) => ({ estado: 'ABIERTA' as const, venceEn: new Date(venceEn) });

  it('el vencimiento es la última llamada más la vigencia, y una abierta pasada de hora está vencida', () => {
    assert.equal(calcularVencimiento(ahora, 86_400_000).toISOString(), '2026-11-03T12:00:00.000Z');
    assert.equal(pasoSuVigencia(abierta('2026-11-02T11:59:59Z'), ahora), true);
    assert.equal(pasoSuVigencia(abierta('2026-11-02T12:00:01Z'), ahora), false);
    assert.equal(pasoSuVigencia({ estado: 'CONFIRMADA', venceEn: new Date(0) }, ahora), false);
  });

  it('consultar: sin abierta o vencida crea; vigente exige reemplazar', () => {
    assert.equal(decidirConsultar(null, false, ahora), 'CREAR');
    assert.equal(decidirConsultar(abierta('2026-11-02T11:00:00Z'), false, ahora), 'CREAR');
    assert.equal(decidirConsultar(abierta('2026-11-03T11:00:00Z'), false, ahora), 'CONFLICTO');
    assert.equal(decidirConsultar(abierta('2026-11-03T11:00:00Z'), true, ahora), 'REEMPLAZAR');
  });

  it('obstáculos de lectura: vencida 410, cerrada 409, abierta vigente ninguno', () => {
    assert.deepEqual(obstaculoDeLectura(abierta('2026-11-02T11:00:00Z'), ahora), { tipo: 'VENCIDA' });
    assert.deepEqual(obstaculoDeLectura({ estado: 'VENCIDA', venceEn: new Date(0) }, ahora), { tipo: 'VENCIDA' });
    for (const estado of ['CONFIRMADA', 'REEMPLAZADA', 'DESCARTADA'] as const) assert.deepEqual(obstaculoDeLectura({ estado, venceEn: new Date(0) }, ahora), { tipo: 'NO_ABIERTA' });
    assert.equal(obstaculoDeLectura(abierta('2026-11-03T11:00:00Z'), ahora), null);
  });

  it('tope de 500: cupo, llena y completa', () => {
    assert.equal(cupoRestante(480, 500), 20);
    assert.equal(cupoRestante(520, 500), 0);
    assert.equal(obstaculoDeContinuar({ leidas: 500, hayMas: true }, 500), 'CONSULTA_LLENA');
    assert.equal(obstaculoDeContinuar({ leidas: 230, hayMas: false }, 500), 'CONSULTA_COMPLETA');
    assert.equal(obstaculoDeContinuar({ leidas: 100, hayMas: true }, 500), null);
  });

  it('una issue ya leída no se duplica: gana la primera lectura, sin distinguir mayúsculas', () => {
    const r = sinRepetidos([{ codigo: 'BIG-1' }, { codigo: 'big-2' }, { codigo: 'BIG-2' }, { codigo: null }, { codigo: '' }, { codigo: '' }], new Set(['BIG-1']));
    assert.deepEqual(r.nuevas.map((f) => f.codigo), ['big-2', null, '', '']);
    assert.equal(r.repetidas, 2);
  });
});

describe('confirmación (D140, D141)', () => {
  const item = (posicion: number, parcial: Partial<ItemConsulta> = {}): ItemConsulta => ({
    id: `i${posicion}`,
    posicion,
    revision: 1,
    analistaAuto: false,
    aplicando: false,
    aplicacion: null,
    yaAsignada: null,
    grupo: 'NUEVA',
    codigo: `QTY-${posicion}`,
    titulo: `T${posicion}`,
    descripcion: null,
    prioridad: 'ALTA',
    sprintJira: null,
    referencia: { estado: 'To Do', responsable: null },
    advertencias: ['PRIORIDAD_AUSENTE'],
    motivo: null,
    idHistoria: null,
    origenHdu: null,
    estadoHdu: null,
    qeHduNombre: null,
    cambios: null,
    asignacion: COMPLETA,
    avisoSinLider: false,
    marcada: true,
    aplicada: false,
    asignadoPor: null,
    asignadoEn: null,
    ...parcial,
  });

  it('solo las marcadas sin aplicar de NUEVA y CAMBIO, por posición, en lotes de 25', () => {
    const items = [
      item(3),
      item(1),
      item(2, { marcada: false }),
      item(4, { aplicada: true }),
      item(5, { grupo: 'CAMBIO', asignacion: ASIGNACION_VACIA }),
      item(6, { grupo: 'SIN_CAMBIOS', marcada: false }),
      ...Array.from({ length: 30 }, (_, i) => item(10 + i)),
    ];
    const pasos = pasosPendientes(items);
    assert.deepEqual(pasos.slice(0, 4).map((p) => [p.item.posicion, p.operacion]), [[1, 'CREAR'], [3, 'CREAR'], [5, 'ACTUALIZAR'], [10, 'CREAR']]);
    assert.equal(pasos.length, 33);
    assert.deepEqual(planDeLotes(pasos).map((l) => l.length), [25, 8]);
  });

  it('el detalle de una fila creada lleva los nombres de la asignación; el de una omitida, el motivo fijo', () => {
    const paso = { item: item(1), operacion: 'CREAR' as const };
    const creada = detalleDeConfirmacion(paso, { resultado: 'CREADA', motivo: null, idHistoria: 'h1', advertencias: [], cambios: null });
    assert.deepEqual(creada.asignacion, { celula: 'CEL-C', qe: 'QE2', analista: 'ANA3', sprint: 'E5 Sprint 2' });
    assert.deepEqual([creada.fila, creada.codigo, creada.idHistoria, creada.advertencias], [1, 'QTY-1', 'h1', ['PRIORIDAD_AUSENTE']]);
    const omitida = detalleDeConfirmacion(paso, { resultado: 'OMITIDA', motivo: 'HDU_CREADA_DESPUES', idHistoria: 'h2', advertencias: [], cambios: null });
    assert.deepEqual([omitida.asignacion, omitida.motivo, omitida.mensaje], [null, 'HDU_CREADA_DESPUES', 'La HDU se creó mientras revisabas la consulta. No se modificó']);
    assert.equal(nombresDeAsignacion(item(1, { asignacion: ASIGNACION_VACIA })), null);
  });
});
