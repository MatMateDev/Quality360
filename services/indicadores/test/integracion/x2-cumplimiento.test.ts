/** X2 · filtros y cumplimiento (E6-B01) con el fixture de la sección 8 del backlog y fuentes simuladas. */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { cerrarBases } from '../ayudas-bd.js';
import { montar, type Montaje } from '../montaje.js';
import { CELULAS, crearHdus, Mundo, PERSONAS, SPRINTS, SUPERVISION_BASE } from '../mundo.js';

let m: Montaje;
const mundo = new Mundo();

before(async () => {
  await mundo.iniciar();
  m = await montar({ mundo });
});
after(async () => {
  await m.cerrar();
  await mundo.cerrar();
  await cerrarBases();
});
beforeEach(() => {
  mundo.hdus = crearHdus();
  mundo.supervision = { ...SUPERVISION_BASE };
  mundo.caida = { org: false, cert: false, imp: false };
  mundo.llamadas = [];
  for (const clave of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) mundo.personas[clave] = { ...PERSONAS[clave] };
});

const cumplimiento = (persona: Parameters<Montaje['pedir']>[2], consulta = '') => m.pedir('get', `/v1/indicadores/cumplimiento${consulta}`, persona);
const valores = (c: Record<string, { estado: string; valor: number | null }>) => ({
  hduTotales: c.hduTotales?.valor,
  certificadas: c.certificadas?.valor,
  cerradasConExcepcion: c.cerradasConExcepcion?.valor,
  enCurso: c.enCurso?.valor,
  sinIniciar: c.sinIniciar?.valor,
  bloqueadas: c.bloqueadas?.valor,
  cumplimientoPromedio: c.cumplimientoPromedio?.valor,
});

describe('E6-B01 · cumplimiento', () => {
  it('[E6-B01-T01] QE1: totales 5, certificadas 1, en curso 3, sin iniciar 1, bloqueadas 2, cumplimiento 44.0', async () => {
    const r = await cumplimiento('qe1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(valores(r.body), { hduTotales: 5, certificadas: 1, cerradasConExcepcion: 0, enCurso: 3, sinIniciar: 1, bloqueadas: 2, cumplimientoPromedio: 44 });
    assert.equal(r.body.sinDatos, false);
    assert.equal(r.body.motivoSinDatos, null);
    assert.deepEqual(r.body.filtros, { celulaId: null, sprintId: null });
    for (const clave of ['hduTotales', 'certificadas', 'cerradasConExcepcion', 'enCurso', 'sinIniciar', 'bloqueadas', 'cumplimientoPromedio']) assert.equal(r.body[clave].estado, 'ok');
    assert.ok(!Number.isNaN(Date.parse(r.body.generadoEn)));
  });

  it('[E6-B01-T02] QE2: 3 HDU y 33.3; QE1 filtrado a CEL-B ve solo H6 (1 HDU, 80.0) y no H3', async () => {
    assert.deepEqual(valores((await cumplimiento('qe2')).body), { hduTotales: 3, certificadas: 1, cerradasConExcepcion: 0, enCurso: 1, sinIniciar: 1, bloqueadas: 1, cumplimientoPromedio: 33.3 });
    const cel = await cumplimiento('qe1', `?celulaId=${CELULAS.B.id}`);
    assert.equal(cel.status, 200);
    assert.deepEqual([cel.body.hduTotales.valor, cel.body.cumplimientoPromedio.valor, cel.body.bloqueadas.valor], [1, 80, 1]);
  });

  it('[E6-B01-T03] ANA1 y ADM1 reciben 403 ACCESO_DENEGADO; sin sesión 401 NO_AUTENTICADO', async () => {
    for (const persona of ['ana1', 'adm1'] as const) {
      const r = await cumplimiento(persona);
      assert.equal(r.status, 403, persona);
      assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
    }
    const sin = await cumplimiento(null);
    assert.equal(sin.status, 401);
    assert.equal(sin.body.codigo, 'NO_AUTENTICADO');
  });

  it('[E6-B01-T04] filtros CEL-A: 3 HDU y 13.3; SP-PROX: 2 HDU y 55.0; ambos: 1 HDU (H1) y 30.0', async () => {
    const a = await cumplimiento('qe1', `?celulaId=${CELULAS.A.id}`);
    assert.deepEqual([a.body.hduTotales.valor, a.body.cumplimientoPromedio.valor, a.body.enCurso.valor, a.body.sinIniciar.valor, a.body.bloqueadas.valor, a.body.certificadas.valor], [3, 13.3, 2, 1, 1, 0]);
    const p = await cumplimiento('qe1', `?sprintId=${SPRINTS.PROX.id}`);
    assert.deepEqual([p.body.hduTotales.valor, p.body.cumplimientoPromedio.valor, p.body.enCurso.valor, p.body.bloqueadas.valor], [2, 55, 2, 2]);
    const ambos = await cumplimiento('qe1', `?celulaId=${CELULAS.A.id}&sprintId=${SPRINTS.PROX.id}`);
    assert.deepEqual([ambos.body.hduTotales.valor, ambos.body.cumplimientoPromedio.valor], [1, 30]);
    assert.deepEqual(ambos.body.filtros, { celulaId: CELULAS.A.id, sprintId: SPRINTS.PROX.id });
  });

  it('[E6-B01-T05] un UUID válido inexistente da 200 con sinDatos y null (no 0); un UUID mal formado, 400 VALIDACION con campo', async () => {
    const inexistente = await cumplimiento('qe2', '?celulaId=11111111-1111-4111-8111-111111111111');
    assert.equal(inexistente.status, 200);
    assert.equal(inexistente.body.sinDatos, true);
    assert.equal(inexistente.body.motivoSinDatos, 'FILTRO_SIN_COINCIDENCIAS');
    assert.equal(inexistente.body.cumplimientoPromedio.valor, null);
    assert.equal(inexistente.body.hduTotales.valor, null);
    assert.equal(inexistente.body.bloqueadas.valor, null);
    const malo = await cumplimiento('qe2', '?celulaId=abc');
    assert.equal(malo.status, 400);
    assert.equal(malo.body.codigo, 'VALIDACION');
    assert.equal(malo.body.detalles[0].campo, 'celulaId');
    const sprintMalo = await cumplimiento('qe2', '?sprintId=abc');
    assert.equal(sprintMalo.status, 400);
    assert.equal(sprintMalo.body.detalles[0].campo, 'sprintId');
  });

  it('[E6-B01-T05] una célula de otro ámbito no revela existencia: 200 con sinDatos igual que una inexistente', async () => {
    const ajena = await cumplimiento('qe2', `?celulaId=${CELULAS.D.id}`);
    assert.equal(ajena.status, 200);
    assert.equal(ajena.body.sinDatos, true);
  });

  it('SIN_SPRINT es un filtro válido (sin HDU sin sprint: sinDatos); el ámbito vacío da AMBITO_VACIO', async () => {
    const sin = await cumplimiento('qe1', '?sprintId=SIN_SPRINT');
    assert.equal(sin.status, 200);
    assert.equal(sin.body.sinDatos, true);
    assert.equal(sin.body.motivoSinDatos, 'FILTRO_SIN_COINCIDENCIAS');
    assert.equal((await cumplimiento('qe3')).body.motivoSinDatos, 'AMBITO_VACIO', 'QE3 no tiene HDU ni analistas');
    const vacio = await cumplimiento('lid2');
    assert.equal(vacio.status, 200);
    assert.equal(vacio.body.motivoSinDatos, 'AMBITO_VACIO');
    assert.equal(vacio.body.cumplimientoPromedio.valor, null, 'sin HDU nunca es 0');
  });

  it('[E6-B01-T06] sin caché: tras aprobar el entregable 4 de H1 la misma consulta da 46.0 en lugar de 44.0', async () => {
    assert.equal((await cumplimiento('qe1')).body.cumplimientoPromedio.valor, 44);
    const h1 = mundo.hdus.find((h) => h.codigo === 'H1');
    assert.ok(h1);
    h1.aprobados = 4;
    assert.equal((await cumplimiento('qe1')).body.cumplimientoPromedio.valor, 46);
  });

  it('[E6-B01-T07] LID1: 6 HDU y 36.7; AUD1: 8 HDU y 40.0; las cuatro categorías suman el total', async () => {
    const lid = await cumplimiento('lid1');
    assert.deepEqual([lid.body.hduTotales.valor, lid.body.cumplimientoPromedio.valor, lid.body.certificadas.valor, lid.body.enCurso.valor, lid.body.sinIniciar.valor, lid.body.bloqueadas.valor], [6, 36.7, 1, 3, 2, 3]);
    const aud = await cumplimiento('aud1');
    assert.deepEqual([aud.body.hduTotales.valor, aud.body.cumplimientoPromedio.valor, aud.body.certificadas.valor, aud.body.enCurso.valor, aud.body.sinIniciar.valor, aud.body.bloqueadas.valor], [8, 40, 2, 4, 2, 3]);
    for (const r of [lid, aud]) {
      const b = r.body;
      assert.equal(b.certificadas.valor + b.cerradasConExcepcion.valor + b.enCurso.valor + b.sinIniciar.valor, b.hduTotales.valor);
    }
  });

  it('[E6-B01-T08] con Certificaciones detenido: totales, cerradas con excepción y bloqueadas siguen ok; el resto indisponible con null (no 0)', async () => {
    mundo.caida.cert = true;
    const r = await cumplimiento('qe1');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.hduTotales, r.body.cerradasConExcepcion, r.body.bloqueadas], [{ estado: 'ok', valor: 5 }, { estado: 'ok', valor: 0 }, { estado: 'ok', valor: 2 }]);
    for (const clave of ['certificadas', 'enCurso', 'sinIniciar', 'cumplimientoPromedio']) assert.deepEqual(r.body[clave], { estado: 'indisponible', valor: null }, clave);
  });

  it('[E6-B01-T09] con Organización detenida: 503 SERVICIO_NO_DISPONIBLE y ninguna cifra', async () => {
    mundo.caida.org = true;
    const r = await cumplimiento('qe1');
    assert.equal(r.status, 503);
    assert.equal(r.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    assert.equal(r.body.hduTotales, undefined);
  });

  it('[E6-B01-T10] con Impedimentos detenido: bloqueadas indisponible y el resto con valor', async () => {
    mundo.caida.imp = true;
    const r = await cumplimiento('qe1');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.bloqueadas, { estado: 'indisponible', valor: null });
    assert.deepEqual(valores({ ...r.body, bloqueadas: { estado: 'ok', valor: null } }), { hduTotales: 5, certificadas: 1, cerradasConExcepcion: 0, enCurso: 3, sinIniciar: 1, bloqueadas: null, cumplimientoPromedio: 44 });
  });

  it('[E6-B01-T11] tras cerrar H2 con excepción (1 aprobado): certificadas 1, cerradas con excepción 1, en curso 2, sin iniciar 1 y 44.0 (H2 aporta 10, no 100)', async () => {
    const h2 = mundo.hdus.find((h) => h.codigo === 'H2');
    assert.ok(h2);
    h2.estado = 'CERRADA';
    h2.cierreParcial = true;
    const r = await cumplimiento('qe1');
    assert.deepEqual(valores(r.body), { hduTotales: 5, certificadas: 1, cerradasConExcepcion: 1, enCurso: 2, sinIniciar: 1, bloqueadas: 2, cumplimientoPromedio: 44 });
    const celda = await cumplimiento('qe1', `?celulaId=${CELULAS.A.id}`);
    assert.deepEqual([celda.body.hduTotales.valor, celda.body.cerradasConExcepcion.valor, celda.body.cumplimientoPromedio.valor], [3, 1, 13.3]);
    for (const b of [r.body, celda.body]) assert.equal(b.certificadas.valor + b.cerradasConExcepcion.valor + b.enCurso.valor + b.sinIniciar.valor, b.hduTotales.valor);
  });

  it('una cerrada con excepción no es «certificada» aunque Certificaciones tenga datos; una cerrada normal sí (10 aprobados)', async () => {
    const h7 = mundo.hdus.find((h) => h.codigo === 'H7');
    assert.ok(h7);
    h7.cierreParcial = true;
    h7.aprobados = 4;
    h7.certificado = false;
    const r = await cumplimiento('qe2');
    assert.deepEqual([r.body.certificadas.valor, r.body.cerradasConExcepcion.valor, r.body.hduTotales.valor], [0, 1, 3]);
  });

  it('el rol sale de Organización y no del token: un QE desactivado después de iniciar sesión recibe 403', async () => {
    mundo.personas.qe1 = { ...PERSONAS.qe1, activo: false };
    assert.equal((await cumplimiento('qe1')).status, 403);
  });

  it('llama a Organización una vez por consulta (más la resolución de acceso) y no usa caché', async () => {
    mundo.llamadas = [];
    await cumplimiento('qe1');
    await cumplimiento('qe1');
    assert.equal(mundo.contar('ORG', '/v1/interno/indicadores/ambito'), 2);
    assert.equal(mundo.contar('CERT', '/v1/interno/checklist/estados'), 2);
    assert.equal(mundo.contar('IMP', '/v1/interno/impedimentos/evaluacion'), 2);
  });
});

describe('GET /v1/indicadores/filtros [D180]', () => {
  it('QE1: células y sprints con HDU en su ámbito, sprints por inicio descendente y marca de cerrados', async () => {
    const r = await m.pedir('get', '/v1/indicadores/filtros', 'qe1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.celulas.map((c: { nombre: string }) => c.nombre), ['CEL-A', 'CEL-B', 'CEL-C']);
    assert.deepEqual(r.body.sprints.map((s: { nombre: string }) => s.nombre), ['SP-LEJ', 'SP-MED', 'SP-PROX', 'SP-VENC']);
    assert.equal(r.body.hduSinSprint, 0);
    const venc = r.body.sprints.find((s: { nombre: string }) => s.nombre === 'SP-VENC');
    assert.equal(venc.cerrado, true);
    assert.equal(r.body.sprints.find((s: { nombre: string }) => s.nombre === 'SP-PROX').cerrado, false);
  });

  it('el Líder ve sus células aunque no tengan HDU (LID2: CEL-D) y el resto de roles recibe 403', async () => {
    const r = await m.pedir('get', '/v1/indicadores/filtros', 'lid2');
    assert.deepEqual(r.body.celulas.map((c: { nombre: string }) => c.nombre), ['CEL-D']);
    assert.deepEqual(r.body.sprints, []);
    assert.equal((await m.pedir('get', '/v1/indicadores/filtros', 'adm1')).status, 403);
    assert.equal((await m.pedir('get', '/v1/indicadores/filtros', null)).status, 401);
  });
});
