import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { firmarToken, iniciarOrganizacionFalsa, type OrganizacionFalsa } from './ayudas.js';
import { crearAppDePrueba } from './ayudas-app.js';

let organizacion: OrganizacionFalsa;
let app: NestExpressApplication;

before(async () => {
  organizacion = await iniciarOrganizacionFalsa();
  app = await crearAppDePrueba(organizacion.url);
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
});

describe('GET /health', () => {
  it('responde 200 sin autenticación', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });
});

describe('GET /v1/hdu/{hduId}/checklist (D11)', () => {
  it('sin sesión: 401', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/hdu/9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10/checklist');
    assert.equal(respuesta.status, 401);
  });

  it('con sesión válida: 501 CAPACIDAD_NO_DISPONIBLE (hace fallar el cierre de HDU en Organización)', async () => {
    const token = await firmarToken();
    const respuesta = await request(app.getHttpServer())
      .get('/v1/hdu/9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10/checklist')
      .set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 501);
    assert.equal(respuesta.body.codigo, 'CAPACIDAD_NO_DISPONIBLE');
  });

  it('usuario inactivo en Organización: 403 (D4, no confía en el rol del token)', async () => {
    organizacion.responder({ usuarioId: '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11', rol: 'QE', activo: false, ambito: { qeSupervisorId: null, analistasSupervisadosIds: [] } });
    const token = await firmarToken();
    const respuesta = await request(app.getHttpServer())
      .get('/v1/hdu/9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10/checklist')
      .set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 403);
  });
});
