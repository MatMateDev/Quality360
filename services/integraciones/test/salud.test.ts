import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion, leerLlaveCifrado } from '../src/configuracion.js';
import { crearAppDePrueba } from './ayudas-app.js';

let app: NestExpressApplication;
let appSinOrganizacion: NestExpressApplication;

before(async () => {
  app = await crearAppDePrueba();
  appSinOrganizacion = await crearAppDePrueba(null);
});

after(async () => {
  await app.close();
  await appSinOrganizacion.close();
});

describe('GET /health', () => {
  it('responde 200 sin autenticación', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });

  it('sin ORGANIZACION_URL (producción) /health sigue en 200 y /v1/* responde 503 (D128)', async () => {
    assert.equal((await request(appSinOrganizacion.getHttpServer()).get('/health')).status, 200);
    const respuesta = await request(appSinOrganizacion.getHttpServer()).get('/v1/integraciones/estado');
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
  });
});

describe('configuración', () => {
  const base = { DATABASE_URL: 'postgresql://x', SUPABASE_URL: 'http://127.0.0.1:54321' } as NodeJS.ProcessEnv;

  it('solo DATABASE_URL ausente tumba el arranque, y el mensaje no trae valores', () => {
    assert.throws(() => cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321' }), (error: Error & { motivo?: string }) => /DATABASE_URL/.test(error.motivo ?? ''));
  });

  it('sin llave, con llave inválida o de otro tamaño arranca con llaveCifrado null (D128)', () => {
    assert.equal(cargarConfiguracion(base).llaveCifrado, null);
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_LLAVE_CIFRADO: 'no-es-base64!' }).llaveCifrado, null);
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_LLAVE_CIFRADO: Buffer.alloc(16).toString('base64') }).llaveCifrado, null);
    assert.equal(leerLlaveCifrado(Buffer.alloc(32, 1).toString('base64'))?.length, 32);
  });

  it('en producción: organizacionUrl null si falta o es inválida, y INTEGRACIONES_PERMITIR_HOST_PRUEBA se ignora (D95)', () => {
    const produccion = { ...base, NODE_ENV: 'production', INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' };
    assert.equal(cargarConfiguracion(produccion).organizacionUrl, null);
    assert.equal(cargarConfiguracion({ ...produccion, ORGANIZACION_URL: 'no es url' }).organizacionUrl, null);
    assert.equal(cargarConfiguracion({ ...produccion, ORGANIZACION_URL: 'https://org.example/' }).organizacionUrl, 'https://org.example');
    assert.equal(cargarConfiguracion(produccion).permitirHostPrueba, false);
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).permitirHostPrueba, true);
  });

  it('los valores por defecto son los de D96 y D114', () => {
    const c = cargarConfiguracion(base);
    assert.deepEqual([c.presupuestoMs, c.tiempoLimiteJiraMs, c.esperaMax429Ms, c.topeIssues, c.enCursoMaxMs, c.tiempoLimiteOrganizacionMs], [8000, 3000, 3000, 100, 300_000, 5000]);
  });
});
