/** X0 · esqueleto: `/health`, arranque sin variables propias y configuración no fatal. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion } from '../src/configuracion.js';
import { crearAppDePrueba } from './ayudas-app.js';

let app: NestExpressApplication;
let appSinOrganizacion: NestExpressApplication;

before(async () => {
  app = await crearAppDePrueba();
  appSinOrganizacion = await crearAppDePrueba({ organizacionUrl: null, produccion: true });
});

after(async () => {
  await app.close();
  await appSinOrganizacion.close();
});

describe('GET /health', () => {
  it('responde 200 sin autenticación y sin consultar otros servicios', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });

  it('sin ORGANIZACION_URL (producción) /health sigue en 200 y /v1/* responde 503', async () => {
    assert.equal((await request(appSinOrganizacion.getHttpServer()).get('/health')).status, 200);
    const respuesta = await request(appSinOrganizacion.getHttpServer()).get('/v1/indicadores/cumplimiento');
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
  });

  it('una ruta de /v1 sin sesión no se resuelve como pública', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/indicadores/cumplimiento');
    assert.ok([401, 404].includes(respuesta.status));
  });
});

describe('configuración no fatal', () => {
  const minimo = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_JWT_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv;

  it('sin ninguna variable propia arranca: sin DATABASE_URL, sin CRON_SECRET y sin credencial', () => {
    const c = cargarConfiguracion(minimo);
    assert.equal(c.cronSecret, null);
    assert.equal(c.servicioToken, null);
    assert.equal(c.puerto, 3005);
    assert.equal(c.organizacionUrl, 'http://localhost:3001');
  });

  it('valores por defecto de D172 y D178', () => {
    const c = cargarConfiguracion(minimo);
    assert.deepEqual(
      [c.umbralDefecto, c.umbralMin, c.umbralMax, c.topeHdu, c.pdfLimiteFilas, c.csvLimiteFilas, c.fuenteTimeoutMs, c.snapshotTimeoutMs],
      [5, 1, 50, 1000, 200, 50_000, 2000, 8000],
    );
  });

  it('valores inválidos vuelven al defecto en lugar de impedir el arranque', () => {
    const c = cargarConfiguracion({ ...minimo, INDICADORES_TOPE_HDU: 'mucho', PORT: '-3', INDICADORES_FUENTE_TIMEOUT_MS: '0', ORGANIZACION_URL: 'no es url' });
    assert.equal(c.topeHdu, 1000);
    assert.equal(c.puerto, 3005);
    assert.equal(c.fuenteTimeoutMs, 2000);
    assert.equal(c.organizacionUrl, 'http://localhost:3001');
  });

  it('en producción las URL ausentes o inválidas quedan en null y Q360_FECHA_REFERENCIA se ignora (D172)', () => {
    const produccion = { ...minimo, NODE_ENV: 'production', Q360_FECHA_REFERENCIA: '2026-07-01T02:30:00Z' };
    const c = cargarConfiguracion(produccion);
    assert.equal(c.organizacionUrl, null);
    assert.equal(c.certificacionesUrl, null);
    assert.equal(c.impedimentosUrl, null);
    assert.equal(c.fechaReferencia, null);
    assert.equal(cargarConfiguracion({ ...produccion, ORGANIZACION_URL: 'https://org.example/' }).organizacionUrl, 'https://org.example');
    assert.equal(cargarConfiguracion({ ...minimo, Q360_FECHA_REFERENCIA: '2026-07-01T02:30:00Z' }).fechaReferencia?.toISOString(), '2026-07-01T02:30:00.000Z');
  });

  it('los secretos vacíos o en blanco cuentan como ausentes', () => {
    const c = cargarConfiguracion({ ...minimo, CRON_SECRET: '   ', INDICADORES_SERVICIO_TOKEN: '' });
    assert.equal(c.cronSecret, null);
    assert.equal(c.servicioToken, null);
  });

  it('el umbral por defecto se acota al rango configurado', () => {
    const c = cargarConfiguracion({ ...minimo, INDICADORES_UMBRAL_DEFECTO: '90', INDICADORES_UMBRAL_MAX: '20' });
    assert.equal(c.umbralDefecto, 20);
  });
});
