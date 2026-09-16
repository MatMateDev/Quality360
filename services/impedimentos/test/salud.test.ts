import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { crearAppDePrueba } from './ayudas-app.js';

let app: NestExpressApplication;

before(async () => {
  app = await crearAppDePrueba();
});

after(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('responde 200 sin autenticación (esqueleto E1/E2, sin modelos de negocio)', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });
});
