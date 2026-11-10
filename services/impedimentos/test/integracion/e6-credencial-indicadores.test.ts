/**
 * C1 · credencial de Indicadores en Impedimentos (E6, D177): `POST /v1/interno/impedimentos/evaluacion` acepta la sesión
 * O `X-Q360-Servicio-Token` con `INDICADORES_SERVICIO_TOKEN`; ninguna otra ruta la acepta.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { iniciarFalsos, type Falsos, type HduFalsa } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { como, crearFixture, type FixtureE4 } from '../fixture-e4.js';

const TOKEN = 'token-indicadores-de-pruebas-0123456789';
let falsos: Falsos;
let app: NestExpressApplication;
let appSinCredencial: NestExpressApplication;
let f: FixtureE4;

before(async () => {
  falsos = await iniciarFalsos();
  app = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl, indicadoresServicioToken: TOKEN });
  appSinCredencial = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl, indicadoresServicioToken: null });
  f = await crearFixture(app, falsos);
});

after(async () => {
  await app.close();
  await appSinCredencial.close();
  await falsos.cerrar();
});

const lote = (...hdus: HduFalsa[]) => ({ hdu: hdus.map((h) => ({ hduId: h.id, estado: h.estado, sprintFin: h.sprintFin, avance: h.avance })) });
const evaluar = (servidor: NestExpressApplication, cabeceras: Record<string, string>, cuerpo: object) =>
  request(servidor.getHttpServer()).post('/v1/interno/impedimentos/evaluacion').set(cabeceras).send(cuerpo);

describe('C1 · POST /v1/interno/impedimentos/evaluacion con la credencial de Indicadores', () => {
  it('con la credencial es una lectura global: HDU de cualquier célula, sin consultar el ámbito en Organización', async () => {
    // H1 es de CEL-A y H4 de CEL-C: ningún usuario las ve juntas salvo el Auditor.
    const r = await evaluar(app, { 'x-q360-servicio-token': TOKEN }, { ...lote(f.h.H1, f.h.H4, f.h.H6), incluirImpedimentos: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [h1, h4, h6] = r.body.items;
    assert.deepEqual([h1.hduId, h1.bloqueada, h1.abiertos], [f.h.H1.id, true, 1]);
    assert.equal(h4.bloqueada, false);
    assert.deepEqual([h6.escalados, h6.riesgo.nivelVigente], [1, 'MEDIO']);
    assert.ok(r.body.impedimentos.length >= 2);
  });

  it('el resultado con la credencial coincide con el de la sesión del Auditor', async () => {
    const credencial = await evaluar(app, { 'x-q360-servicio-token': TOKEN }, lote(f.h.H1, f.h.H6));
    const sesion = await como(app, 'aud1', 'post', '/v1/interno/impedimentos/evaluacion', lote(f.h.H1, f.h.H6));
    assert.equal(sesion.status, 200);
    assert.deepEqual(credencial.body.items, sesion.body.items);
  });

  it('con otro valor, vacío o sin INDICADORES_SERVICIO_TOKEN configurada: 401', async () => {
    assert.equal((await evaluar(app, { 'x-q360-servicio-token': 'otro-valor' }, lote(f.h.H1))).status, 401);
    assert.equal((await evaluar(appSinCredencial, { 'x-q360-servicio-token': TOKEN }, lote(f.h.H1))).status, 401);
    assert.equal((await evaluar(appSinCredencial, { 'x-q360-servicio-token': 'x' }, lote(f.h.H1))).status, 401);
  });

  it('la credencial de la semilla no abre esta ruta', async () => {
    assert.equal((await evaluar(app, { 'x-q360-servicio-token': 'token-servicio-local-de-pruebas-0123456789' }, lote(f.h.H1))).status, 401);
  });

  it('sin credencial ni sesión: 401; con sesión de usuario sigue funcionando y exige ámbito (403 fuera de él)', async () => {
    assert.equal((await evaluar(app, {}, lote(f.h.H1))).status, 401);
    assert.equal((await como(app, 'qe1', 'post', '/v1/interno/impedimentos/evaluacion', lote(f.h.H1))).status, 200);
    assert.equal((await como(app, 'lid1', 'post', '/v1/interno/impedimentos/evaluacion', lote(f.h.H4))).status, 403);
  });

  it('un lote inválido sigue siendo 400 con la credencial', async () => {
    assert.equal((await evaluar(app, { 'x-q360-servicio-token': TOKEN }, { hdu: [] })).status, 400);
  });

  it('ninguna otra ruta acepta la credencial: listados, abiertos y escrituras responden 401', async () => {
    const cabecera = { 'x-q360-servicio-token': TOKEN };
    const servidor = request(app.getHttpServer());
    assert.equal((await servidor.get('/v1/impedimentos').set(cabecera)).status, 401);
    assert.equal((await servidor.get(`/v1/hdu/${f.h.H1.id}/impedimentos`).set(cabecera)).status, 401);
    assert.equal((await servidor.post(`/v1/impedimentos/${f.i.I2}/resolver`).set(cabecera).send({})).status, 401);
    assert.equal((await servidor.get(`/v1/interno/hdu/${f.h.H1.id}/impedimentos/abiertos`).set(cabecera)).status, 401);
    assert.equal((await servidor.post(`/v1/hdu/${f.h.H1.id}/impedimentos`).set(cabecera).send({})).status, 401);
    assert.equal((await servidor.post('/v1/interno/carga/impedimentos').set(cabecera).send({})).status, 401);
  });
});
