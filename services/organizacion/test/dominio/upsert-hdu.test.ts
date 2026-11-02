/**
 * E5 (D97, D98, D100, D120) · algoritmo por fila del upsert de HDU. Unitarias del dominio, sin base de datos.
 * Cubren E5-B03#2 (upsert sin tocar estado, analista, QE, checklist ni impedimentos) a nivel de reglas.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { codigoHduValido, esQeResponsableValido, normalizarCodigoHdu, sprintEsDeCelula } from '../../src/dominio/reglas/alta-hdu.js';
import {
  decidirSobreExistente,
  elegirSprint,
  recortarCambio,
  validarReglasDeFila,
  type HduExistente,
} from '../../src/dominio/reglas/upsert-hdu.js';

const existente = (cambios: Partial<HduExistente> = {}): HduExistente => ({
  estado: 'PENDIENTE',
  origen: 'JIRA',
  titulo: 'Titulo actual',
  descripcion: 'Descripcion actual',
  prioridad: 'ALTA',
  ...cambios,
});
const fila = (cambios: Partial<{ titulo: string | null; descripcion: string | null; prioridad: string | null }> = {}) => ({
  titulo: 'Titulo actual',
  descripcion: 'Descripcion actual',
  prioridad: 'ALTA',
  ...cambios,
});

describe('E5 · reglas de la fila', () => {
  it('el código sigue la regla de E2: 1 a 40 caracteres, letras, números, punto, guion y guion bajo', () => {
    assert.equal(codigoHduValido('QTY-12'), true);
    assert.equal(codigoHduValido('a.b_c-1'), true);
    assert.equal(codigoHduValido(''), false);
    assert.equal(codigoHduValido('con espacio'), false);
    assert.equal(codigoHduValido('-empieza'), false);
    assert.equal(codigoHduValido('X'.repeat(40)), true);
    assert.equal(codigoHduValido('X'.repeat(41)), false);
    assert.equal(normalizarCodigoHdu('  QTY-1 '), 'qty-1');
  });

  it('CODIGO_INVALIDO, TITULO_VACIO, TITULO_LARGO y PRIORIDAD_INVALIDA, en ese orden', () => {
    assert.equal(validarReglasDeFila({ codigo: 'con espacio', titulo: '', prioridad: 'x' }), 'CODIGO_INVALIDO');
    assert.equal(validarReglasDeFila({ codigo: 'A-1', titulo: '   ', prioridad: 'x' }), 'TITULO_VACIO');
    assert.equal(validarReglasDeFila({ codigo: 'A-1', titulo: null, prioridad: null }), 'TITULO_VACIO');
    assert.equal(validarReglasDeFila({ codigo: 'A-1', titulo: 'x'.repeat(201), prioridad: 'x' }), 'TITULO_LARGO');
    assert.equal(validarReglasDeFila({ codigo: 'A-1', titulo: 'x'.repeat(200), prioridad: 'urgente' }), 'PRIORIDAD_INVALIDA');
    assert.equal(validarReglasDeFila({ codigo: 'A-1', titulo: 'x'.repeat(200), prioridad: 'CRITICA' }), null);
    assert.equal(validarReglasDeFila({ codigo: 'A-1', titulo: 'Titulo', prioridad: null }), null);
  });

  it('el QE responsable debe ser QE y estar activo', () => {
    assert.equal(esQeResponsableValido({ rol: 'QE', activo: true }), true);
    assert.equal(esQeResponsableValido({ rol: 'QE', activo: false }), false);
    assert.equal(esQeResponsableValido({ rol: 'ANALISTA_QA', activo: true }), false);
    assert.equal(esQeResponsableValido(null), false);
  });

  it('recortarCambio deja los valores en 200 caracteres', () => {
    assert.equal(recortarCambio('y'.repeat(300))?.length, 200);
    assert.equal(recortarCambio(null), null);
  });
});

describe('E5 · decidirSobreExistente (D97, D98)', () => {
  it('SIN_CAMBIOS cuando título, descripción y prioridad no difieren', () => {
    assert.deepEqual(decidirSobreExistente(existente(), fila(), { vincularExistentes: false }), { tipo: 'OMITIR', motivo: 'SIN_CAMBIOS' });
  });

  it('SIN_CAMBIOS con un valor vacío o null: nunca borra', () => {
    const decision = decidirSobreExistente(existente(), fila({ descripcion: '   ', prioridad: null }), { vincularExistentes: false });
    assert.deepEqual(decision, { tipo: 'OMITIR', motivo: 'SIN_CAMBIOS' });
    assert.deepEqual(decidirSobreExistente(existente(), fila({ descripcion: null }), { vincularExistentes: false }), { tipo: 'OMITIR', motivo: 'SIN_CAMBIOS' });
  });

  it('HDU_CERRADA: una HDU cerrada no se modifica, aunque cambien los tres campos ni con vincular', () => {
    const cambiada = fila({ titulo: 'Otro', descripcion: 'Otra', prioridad: 'BAJA' });
    assert.deepEqual(decidirSobreExistente(existente({ estado: 'CERRADA' }), cambiada, { vincularExistentes: false }), { tipo: 'OMITIR', motivo: 'HDU_CERRADA' });
    assert.deepEqual(decidirSobreExistente(existente({ estado: 'CERRADA', origen: 'MANUAL' }), cambiada, { vincularExistentes: true }), { tipo: 'OMITIR', motivo: 'HDU_CERRADA' });
  });

  it('HDU_MANUAL_EXISTENTE sin vincular, aunque haya diferencias', () => {
    const decision = decidirSobreExistente(existente({ origen: 'MANUAL' }), fila({ titulo: 'Otro' }), { vincularExistentes: false });
    assert.deepEqual(decision, { tipo: 'OMITIR', motivo: 'HDU_MANUAL_EXISTENTE' });
  });

  it('vincular una manual la actualiza y marca la vinculación (su origen pasa al de la solicitud)', () => {
    const decision = decidirSobreExistente(existente({ origen: 'MANUAL' }), fila({ titulo: 'Otro' }), { vincularExistentes: true });
    assert.equal(decision.tipo, 'ACTUALIZAR');
    if (decision.tipo === 'ACTUALIZAR') {
      assert.equal(decision.vincula, true);
      assert.deepEqual(decision.cambios, { titulo: { antes: 'Titulo actual', despues: 'Otro' } });
    }
  });

  it('vincular una manual sin diferencias de contenido igual es una actualización (cambia el origen)', () => {
    const decision = decidirSobreExistente(existente({ origen: 'MANUAL' }), fila(), { vincularExistentes: true });
    assert.equal(decision.tipo, 'ACTUALIZAR');
    if (decision.tipo === 'ACTUALIZAR') assert.deepEqual(decision.cambios, {});
  });

  it('una HDU de origen no manual se actualiza desde cualquier fuente sin vincular', () => {
    const decision = decidirSobreExistente(existente({ origen: 'CSV' }), fila({ prioridad: 'CRITICA' }), { vincularExistentes: false });
    assert.equal(decision.tipo, 'ACTUALIZAR');
    if (decision.tipo === 'ACTUALIZAR') {
      assert.equal(decision.vincula, false);
      assert.deepEqual(decision.cambios, { prioridad: { antes: 'ALTA', despues: 'CRITICA' } });
      assert.deepEqual(decision.datos, { prioridad: 'CRITICA' });
    }
  });

  it('solo cambian título, descripción y prioridad, con valores recortados a 200 caracteres', () => {
    const decision = decidirSobreExistente(existente({ descripcion: null }), fila({ titulo: 'T'.repeat(150), descripcion: 'D'.repeat(500) }), { vincularExistentes: false });
    assert.equal(decision.tipo, 'ACTUALIZAR');
    if (decision.tipo === 'ACTUALIZAR') {
      assert.deepEqual(Object.keys(decision.cambios).sort(), ['descripcion', 'titulo']);
      assert.equal(decision.cambios.descripcion?.antes, null);
      assert.equal(decision.cambios.descripcion?.despues?.length, 200);
      assert.deepEqual(Object.keys(decision.datos).sort(), ['descripcion', 'titulo']);
    }
  });

  it('una descripción en blanco sobre una HDU sin descripción tampoco es un cambio', () => {
    assert.deepEqual(decidirSobreExistente(existente({ descripcion: null }), fila({ descripcion: '' }), { vincularExistentes: false }), { tipo: 'OMITIR', motivo: 'SIN_CAMBIOS' });
  });
});

describe('E5 · elegirSprint (D120)', () => {
  const respaldoDeCelula = { id: 'sprint-respaldo', celulaId: 'celula-1' };
  const respaldoAjeno = { id: 'sprint-ajeno', celulaId: 'celula-2' };

  it('el sprint de la fila, buscado en la célula, gana sin advertencia', () => {
    const r = elegirSprint({ nombreEnFila: 'E5 Sprint 2', sprintDeLaCelula: { id: 's2' }, respaldo: respaldoDeCelula, celulaId: 'celula-1', sprintNoEncontrado: 'ERROR' });
    assert.deepEqual(r, { ok: true, sprintId: 's2', advertencia: null });
  });

  it('Jira: sin coincidencia usa el respaldo con la advertencia SPRINT_NO_ENCONTRADO', () => {
    const r = elegirSprint({ nombreEnFila: 'Sprint fantasma', sprintDeLaCelula: null, respaldo: respaldoDeCelula, celulaId: 'celula-1', sprintNoEncontrado: 'RESPALDO' });
    assert.deepEqual(r, { ok: true, sprintId: 'sprint-respaldo', advertencia: 'SPRINT_NO_ENCONTRADO' });
  });

  it('archivo: un sprint informado y no encontrado es error SPRINT_NO_ENCONTRADO', () => {
    const r = elegirSprint({ nombreEnFila: 'Sprint fantasma', sprintDeLaCelula: null, respaldo: respaldoDeCelula, celulaId: 'celula-1', sprintNoEncontrado: 'ERROR' });
    assert.deepEqual(r, { ok: false, motivo: 'SPRINT_NO_ENCONTRADO' });
  });

  it('sin sprint en la fila usa el respaldo, sin advertencia, si es de la célula', () => {
    const r = elegirSprint({ nombreEnFila: null, sprintDeLaCelula: null, respaldo: respaldoDeCelula, celulaId: 'celula-1', sprintNoEncontrado: 'ERROR' });
    assert.deepEqual(r, { ok: true, sprintId: 'sprint-respaldo', advertencia: null });
  });

  it('SPRINT_REQUERIDO: el respaldo es de otra célula y la fila no trae sprint', () => {
    const r = elegirSprint({ nombreEnFila: null, sprintDeLaCelula: null, respaldo: respaldoAjeno, celulaId: 'celula-1', sprintNoEncontrado: 'ERROR' });
    assert.deepEqual(r, { ok: false, motivo: 'SPRINT_REQUERIDO' });
  });

  it('SPRINT_REQUERIDO también en Jira si el respaldo no es de la célula y el nombre no existe', () => {
    const r = elegirSprint({ nombreEnFila: 'otro', sprintDeLaCelula: null, respaldo: respaldoAjeno, celulaId: 'celula-1', sprintNoEncontrado: 'RESPALDO' });
    assert.deepEqual(r, { ok: false, motivo: 'SPRINT_REQUERIDO' });
  });

  it('sprintEsDeCelula', () => {
    assert.equal(sprintEsDeCelula({ celulaId: 'a' }, 'a'), true);
    assert.equal(sprintEsDeCelula({ celulaId: 'a' }, 'b'), false);
    assert.equal(sprintEsDeCelula(null, 'a'), false);
  });
});
