/** Listados (E4-F02, E4-F04#3), evaluación para las bandejas (D69, D87), carga semilla y catálogo. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { CELULA_A, PERSONAS, TOKEN_SERVICIO, iniciarFalsos, type Falsos, type HduFalsa } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { como, crearFixture, type FixtureE4 } from '../fixture-e4.js';

let falsos: Falsos;
let app: NestExpressApplication;
let f: FixtureE4;

before(async () => {
  falsos = await iniciarFalsos();
  app = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl });
  f = await crearFixture(app, falsos);
});

after(async () => {
  await app.close();
  await falsos.cerrar();
});

const ids = (cuerpo: { items: Array<{ id: string }> }) => cuerpo.items.map((i) => i.id);
const lote = (...hdus: HduFalsa[]) => ({ hdu: hdus.map((h) => ({ hduId: h.id, estado: h.estado, sprintFin: h.sprintFin, avance: h.avance })) });

describe('GET /v1/impedimentos', () => {
  it('[E4-F02#1] el QE ve su ámbito priorizado por riesgo y luego por días, sin resueltos', async () => {
    const r = await como(app, 'qe1', 'get', '/v1/impedimentos');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // I2 (H1, ALTO, 6 días) antes que I3 (H6, MEDIO fijado, 3 días); I4 resuelto no aparece.
    assert.deepEqual(ids(r.body), [f.i.I2, f.i.I3]);
    assert.deepEqual(r.body.contadores, { abiertos: 2, escalados: 1, nuevos: 0 });
    assert.equal(r.body.orden, 'riesgo:desc');
    assert.deepEqual([r.body.items[0].riesgo.nivelVigente, r.body.items[0].soloLectura, r.body.items[0].operacionesPermitidas.length], ['ALTO', false, 3]);
    assert.equal(r.body.items[0].hdu.id, f.h.H1.id);
    assert.equal(r.body.items[0].celula.id, CELULA_A.id);
  });

  it('[E4-F02#1] incluirResueltos suma el resuelto y un estado explícito manda', async () => {
    assert.ok(ids((await como(app, 'qe1', 'get', '/v1/impedimentos?incluirResueltos=true')).body).includes(f.i.I4));
    assert.deepEqual(ids((await como(app, 'qe1', 'get', '/v1/impedimentos?estado=RESUELTO')).body), [f.i.I4]);
  });

  it('[E4-F02#3] filtro por célula, tipo y búsqueda; un Líder no filtra por una célula ajena', async () => {
    assert.deepEqual(ids((await como(app, 'qe1', 'get', `/v1/impedimentos?celulaId=${CELULA_A.id}`)).body), [f.i.I2]);
    assert.deepEqual(ids((await como(app, 'qe1', 'get', '/v1/impedimentos?tipo=DEPENDENCIA')).body), [f.i.I3]);
    assert.deepEqual(ids((await como(app, 'qe1', 'get', '/v1/impedimentos?q=sandbox')).body), [f.i.I3]);
    assert.deepEqual((await como(app, 'qe1', 'get', '/v1/impedimentos?q=zzzz')).body.items, []);
    assert.equal((await como(app, 'lid1', 'get', '/v1/impedimentos?celulaId=0ce00000-0000-4000-8000-0000000000ff')).status, 403);
    assert.equal((await como(app, 'qe1', 'get', '/v1/impedimentos?orden=color:asc')).status, 400);
  });

  it('[E4-F02#1] el ámbito: QE ajeno, Líder, Administrador y Auditor; el Analista, 403', async () => {
    assert.deepEqual(ids((await como(app, 'qe2', 'get', '/v1/impedimentos')).body), [f.i.I1]);
    assert.equal((await como(app, 'qe2', 'get', '/v1/impedimentos')).body.contadores.nuevos, 1);
    const lider = await como(app, 'lid1', 'get', '/v1/impedimentos');
    assert.deepEqual(ids(lider.body).sort(), [f.i.I1, f.i.I2, f.i.I3].sort());
    assert.ok(lider.body.items.every((i: { soloLectura: boolean; operacionesPermitidas: unknown[] }) => i.soloLectura && i.operacionesPermitidas.length === 0));
    for (const persona of ['adm1', 'aud1'] as const) assert.equal((await como(app, persona, 'get', '/v1/impedimentos')).status, 200);
    assert.equal((await como(app, 'ana1', 'get', '/v1/impedimentos')).status, 403);
    assert.equal((await como(app, null, 'get', '/v1/impedimentos')).status, 401);
  });

  it('[E4-F02#2] sin impedimentos en el ámbito: lista vacía con contadores en 0', async () => {
    const r = await como(app, 'lid2', 'get', '/v1/impedimentos');
    assert.deepEqual([r.status, r.body.items, r.body.contadores], [200, [], { abiertos: 0, escalados: 0, nuevos: 0 }]);
  });

  it('[E4-F02#1] con Certificaciones caída el riesgo cae a días, se informa y filtrar por riesgo da 503', async () => {
    falsos.certificacionesCaida = true;
    try {
      const r = await como(app, 'qe1', 'get', '/v1/impedimentos');
      assert.equal(r.status, 200);
      // H1 ya llega a ALTO con el impedimento antiguo: cálculo parcial, no indisponible.
      const i2 = r.body.items.find((i: { id: string }) => i.id === f.i.I2);
      assert.deepEqual([i2.riesgo.estado, i2.riesgo.nivelVigente, i2.riesgo.calculoParcial], ['ok', 'ALTO', true]);
      const i3 = r.body.items.find((i: { id: string }) => i.id === f.i.I3);
      assert.deepEqual([i3.riesgo.estado, i3.riesgo.nivelVigente, i3.riesgo.origen], ['ok', 'MEDIO', 'MANUAL']);
      // H3 (QE2) no llega a ALTO sin el avance: el riesgo queda indisponible y el orden cae a días.
      const qe2 = await como(app, 'qe2', 'get', '/v1/impedimentos');
      assert.equal(qe2.body.orden, 'diasAbierto:desc');
      assert.deepEqual([qe2.body.items[0].riesgo.estado, qe2.body.items[0].riesgo.nivelVigente], ['indisponible', null]);
      assert.equal((await como(app, 'qe2', 'get', '/v1/impedimentos?riesgo=ALTO')).status, 503);
    } finally {
      falsos.certificacionesCaida = false;
    }
  });
});

describe('GET /v1/riesgo/hdu', () => {
  it('[E4-F04#3] lista las HDU no cerradas del ámbito con Alto primero', async () => {
    const r = await como(app, 'qe1', 'get', '/v1/riesgo/hdu');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const codigos = (r.body.items as Array<{ hdu: { id: string }; riesgo: { nivelVigente: string }; bloqueada: boolean }>).map((i) => i.hdu.id);
    assert.deepEqual(new Set(codigos), new Set([f.h.H1.id, f.h.H2.id, f.h.H5.id, f.h.H6.id, f.h.H8.id]));
    assert.equal(r.body.items[0].riesgo.nivelVigente, 'ALTO');
    const h6 = r.body.items.find((i: { hdu: { id: string } }) => i.hdu.id === f.h.H6.id);
    assert.deepEqual([h6.riesgo.nivelVigente, h6.riesgo.origen, h6.avance, h6.bloqueada, h6.soloLectura], ['MEDIO', 'MANUAL', 80, true, false]);
    assert.ok(h6.actualizadoEn);
  });

  it('[E4-F04#3] filtros por nivel, solo bloqueadas y orden; Analista 403', async () => {
    const altos = await como(app, 'qe1', 'get', '/v1/riesgo/hdu?nivel=ALTO');
    assert.ok(altos.body.items.every((i: { riesgo: { nivelVigente: string } }) => i.riesgo.nivelVigente === 'ALTO'));
    const bloqueadas = await como(app, 'qe1', 'get', '/v1/riesgo/hdu?soloBloqueadas=true');
    assert.ok(bloqueadas.body.items.every((i: { bloqueada: boolean }) => i.bloqueada));
    assert.equal((await como(app, 'qe1', 'get', '/v1/riesgo/hdu?orden=codigo:asc')).body.orden, 'codigo:asc');
    assert.equal((await como(app, 'qe1', 'get', '/v1/riesgo/hdu?orden=x:asc')).status, 400);
    assert.equal((await como(app, 'qe1', 'get', '/v1/riesgo/hdu?estado=CERRADA')).body.items.length, 0, 'H7 es de qe2');
    const cerradas = await como(app, 'qe2', 'get', '/v1/riesgo/hdu?estado=CERRADA');
    assert.deepEqual([cerradas.body.items.length, cerradas.body.items[0].riesgo.nivelVigente, cerradas.body.items[0].riesgo.estado], [1, null, 'ok']);
    assert.equal((await como(app, 'ana1', 'get', '/v1/riesgo/hdu')).status, 403);
  });

  it('[E4-F04#3] con Certificaciones caída: nivel fijado visible, el resto indisponible y filtrar por nivel, 503', async () => {
    falsos.certificacionesCaida = true;
    try {
      const r = await como(app, 'qe1', 'get', '/v1/riesgo/hdu');
      assert.equal(r.status, 200);
      const porHdu = new Map<string, { riesgo: { estado: string; nivelVigente: string | null }; avance: number | null }>(r.body.items.map((i: { hdu: { id: string } }) => [i.hdu.id, i]));
      assert.deepEqual([porHdu.get(f.h.H6.id)?.riesgo.estado, porHdu.get(f.h.H6.id)?.riesgo.nivelVigente], ['ok', 'MEDIO']);
      assert.deepEqual([porHdu.get(f.h.H8.id)?.riesgo.estado, porHdu.get(f.h.H8.id)?.avance], ['indisponible', null]);
      assert.equal((await como(app, 'qe1', 'get', '/v1/riesgo/hdu?nivel=BAJO')).status, 503);
    } finally {
      falsos.certificacionesCaida = false;
    }
  });
});

describe('POST /v1/interno/impedimentos/evaluacion', () => {
  it('[E4-B01#2] el lote con una HDU fuera de ámbito es 403 completo; dentro, datos y lista', async () => {
    const fuera = await como(app, 'lid1', 'post', '/v1/interno/impedimentos/evaluacion', lote(f.h.H1, f.h.H4));
    assert.equal(fuera.status, 403);
    const r = await como(app, 'lid1', 'post', '/v1/interno/impedimentos/evaluacion', { ...lote(f.h.H1, f.h.H6, f.h.H3), incluirImpedimentos: true });
    assert.equal(r.status, 200);
    const [h1, h6, h3] = r.body.items;
    assert.deepEqual([h1.hduId, h1.bloqueada, h1.abiertos, h1.nivelSugerido], [f.h.H1.id, true, 1, 'ALTO']);
    assert.deepEqual([h6.escalados, h6.nivelFijado, h6.nivelSugerido, h6.riesgo.nivelVigente], [1, 'MEDIO', 'ALTO', 'MEDIO']);
    assert.deepEqual([h3.nuevos, h3.abiertos], [1, 1]);
    assert.deepEqual(ids({ items: r.body.impedimentos }).sort(), [f.i.I1, f.i.I2, f.i.I3].sort());
    assert.match(r.body.fechaReferencia, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('[E4-B03#2] con avance desconocido el riesgo no es BAJO', async () => {
    const r = await como(app, 'qe1', 'post', '/v1/interno/impedimentos/evaluacion', { hdu: [{ hduId: f.h.H8.id, estado: 'PENDIENTE_CIERRE', sprintFin: f.h.H8.sprintFin, avance: null }] });
    assert.deepEqual([r.body.items[0].riesgo.estado, r.body.items[0].nivelSugerido], ['indisponible', null]);
  });

  it('[E4-B01#1] valida el lote (400) y exige sesión (401)', async () => {
    assert.equal((await como(app, 'qe1', 'post', '/v1/interno/impedimentos/evaluacion', { hdu: [] })).status, 400);
    assert.equal((await como(app, 'qe1', 'post', '/v1/interno/impedimentos/evaluacion', { hdu: [{ hduId: 'x', estado: 'PENDIENTE', sprintFin: null, avance: null }] })).status, 400);
    assert.equal((await como(app, null, 'post', '/v1/interno/impedimentos/evaluacion', lote(f.h.H1))).status, 401);
  });
});

describe('catálogo y carga semilla', () => {
  it('[E4-B01#1] el catálogo trae los 9 tipos con la descripción mínima', async () => {
    const r = await como(app, 'ana1', 'get', '/v1/catalogos/tipos-impedimento');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 9);
    assert.deepEqual(r.body.items.find((t: { codigo: string }) => t.codigo === 'OTRO'), { codigo: 'OTRO', etiqueta: 'Otro', descripcionMinima: 20 });
    assert.equal((await como(app, null, 'get', '/v1/catalogos/tipos-impedimento')).status, 401);
  });

  it('[E4-B01#1] los candidatos de registro y escalamiento salen de Organización', async () => {
    const registro = await como(app, 'ana1', 'get', `/v1/hdu/${f.h.H1.id}/impedimentos/responsables?proposito=REGISTRO`);
    assert.deepEqual([registro.body.items.map((p: { id: string }) => p.id), registro.body.preseleccionadoId], [[PERSONAS.qe1.id], PERSONAS.qe1.id]);
    const escalamiento = await como(app, 'qe1', 'get', `/v1/hdu/${f.h.H1.id}/impedimentos/responsables?proposito=ESCALAMIENTO`);
    assert.deepEqual([escalamiento.body.items.map((p: { id: string }) => p.id), escalamiento.body.preseleccionadoId], [[PERSONAS.lid1.id, PERSONAS.adm1.id], null]);
    assert.equal((await como(app, 'ana1', 'get', `/v1/hdu/${f.h.H1.id}/impedimentos/responsables?proposito=ESCALAMIENTO`)).status, 403);
    assert.equal((await como(app, 'qe1', 'get', `/v1/hdu/${f.h.H1.id}/impedimentos/responsables`)).status, 400);
  });

  it('la carga semilla es idempotente y exige la credencial de servicio', async () => {
    const cuerpo = (hduId: string) => ({
      hduId,
      tipo: 'OTRO',
      titulo: 'Impedimento idempotente',
      descripcion: 'Descripción de al menos veinte caracteres.',
      responsableInicial: { id: null, nombre: 'Tercero' },
      creadoPor: { id: PERSONAS.qe1.id, nombre: PERSONAS.qe1.nombre, rol: 'QE' },
      acciones: [{ tipo: 'REGISTRAR', estado: 'ABIERTO', actor: { id: PERSONAS.qe1.id, nombre: PERSONAS.qe1.nombre, rol: 'QE' }, fecha: new Date().toISOString(), comentario: 'Registro del impedimento' }],
    });
    const h = falsos.nuevaHdu();
    const una = await request(app.getHttpServer()).post('/v1/interno/carga/impedimentos').set('x-q360-servicio-token', TOKEN_SERVICIO).send(cuerpo(h.id));
    const dos = await request(app.getHttpServer()).post('/v1/interno/carga/impedimentos').set('x-q360-servicio-token', TOKEN_SERVICIO).send(cuerpo(h.id));
    assert.deepEqual([una.status, una.body.creado, dos.status, dos.body.creado, dos.body.id], [201, true, 200, false, una.body.id]);
    assert.equal((await request(app.getHttpServer()).post('/v1/interno/carga/impedimentos').send(cuerpo(h.id))).status, 401);
    assert.equal((await request(app.getHttpServer()).post('/v1/interno/carga/impedimentos').set('x-q360-servicio-token', TOKEN_SERVICIO).send({ ...cuerpo(h.id), acciones: [] })).status, 400);

    const apagada = await crearAppDePrueba(falsos.organizacionUrl, { permitirCargaSemilla: false });
    try {
      assert.equal((await request(apagada.getHttpServer()).post('/v1/interno/carga/impedimentos').set('x-q360-servicio-token', TOKEN_SERVICIO).send(cuerpo(h.id))).status, 403);
    } finally {
      await apagada.close();
    }
  });
});
