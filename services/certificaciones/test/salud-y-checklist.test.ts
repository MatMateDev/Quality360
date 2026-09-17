import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { firmarToken, iniciarOrganizacionFalsa, tokenDe, type OrganizacionFalsa } from './ayudas.js';
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

  it('con acceso: 200 con el resumen que usa Organización para el cierre', async () => {
    const hdu = organizacion.nuevaHdu();
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/hdu/${hdu.id}/checklist`)
      .set('authorization', `Bearer ${await tokenDe('qe')}`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { hduId: hdu.id, totalEntregables: 10, completados: 0, porcentajeCumplimiento: 0, completo: false });
  });

  it('usuario inactivo en Organización: 403 (D4, no confía en el rol del token)', async () => {
    organizacion.responder({ usuarioId: '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11', rol: 'QE', activo: false, ambito: { qeSupervisorId: null, analistasSupervisadosIds: [] } });
    try {
      const respuesta = await request(app.getHttpServer())
        .get('/v1/hdu/9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10/checklist')
        .set('authorization', `Bearer ${await firmarToken()}`);
      assert.equal(respuesta.status, 403);
    } finally {
      organizacion.responder(null);
    }
  });
});
