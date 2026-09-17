/**
 * Rutas de Certificaciones (E3): reenvío a CERTIFICACIONES_URL con la sesión,
 * validación de ruta y verificación pública sin `Authorization`.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { HDU_ID, autorizacion, crearAppPrueba, iniciarServidorFalso, type ServidorFalso } from './ayudas-gateway.js';

let organizacion: ServidorFalso;
let certificaciones: ServidorFalso;
let app: NestExpressApplication;

before(async () => {
  organizacion = await iniciarServidorFalso();
  certificaciones = await iniciarServidorFalso();
  app = await crearAppPrueba({ organizacionUrl: organizacion.url, certificacionesUrl: certificaciones.url });
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
  await certificaciones.cerrar();
});

beforeEach(() => {
  organizacion.solicitudes.length = 0;
  certificaciones.solicitudes.length = 0;
});

describe('Checklist (E3) en el gateway', () => {
  it('reenvía GET entregables a Certificaciones con la sesión y devuelve la respuesta tal cual', async () => {
    certificaciones.responder(`GET /v1/hdu/${HDU_ID}/entregables`, { estado: 200, cuerpo: { hduId: HDU_ID, entregables: [] } });
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/hdu/${HDU_ID}/entregables`)
      .set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { hduId: HDU_ID, entregables: [] });
    assert.equal(organizacion.solicitudes.length, 0);
    assert.match(String(certificaciones.solicitudes[0]?.cabeceras.authorization), /^Bearer /);
  });

  it('reenvía marcar con el cuerpo y propaga el 409 del servicio', async () => {
    certificaciones.responder(`POST /v1/hdu/${HDU_ID}/entregables/DASHBOARD/marcar`, {
      estado: 409,
      cuerpo: { codigo: 'ORDEN_ENTREGABLES', mensaje: 'Completa «Plan de pruebas» antes.', traceId: 'x', detalles: [] },
    });
    const cuerpo = { evidencia: { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/PAG-1' } };
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/hdu/${HDU_ID}/entregables/DASHBOARD/marcar`)
      .set('authorization', await autorizacion())
      .send(cuerpo);
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'ORDEN_ENTREGABLES');
    assert.deepEqual(JSON.parse(certificaciones.solicitudes[0]?.cuerpo ?? '{}'), cuerpo);
  });

  it('clave o acción desconocidas no llegan al servicio', async () => {
    const token = await autorizacion();
    const clave = await request(app.getHttpServer()).post(`/v1/hdu/${HDU_ID}/entregables/OTRA/marcar`).set('authorization', token).send({});
    assert.equal(clave.status, 400);
    const accion = await request(app.getHttpServer()).post(`/v1/hdu/${HDU_ID}/entregables/PLAN_PRUEBAS/borrar`).set('authorization', token).send({});
    assert.equal(accion.status, 404);
    assert.equal(certificaciones.solicitudes.length, 0);
  });

  it('sin sesión: 401 y no reenvía', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/qe/aprobaciones-pendientes');
    assert.equal(respuesta.status, 401);
    assert.equal(certificaciones.solicitudes.length, 0);
  });

  it('verificación de folio: pública y sin Authorization hacia el servicio (D21)', async () => {
    certificaciones.responder('GET /v1/certificados/Q360-2026-ABCDEFGH/verificacion', {
      estado: 200,
      cuerpo: { folio: 'Q360-2026-ABCDEFGH', valido: true },
    });
    const respuesta = await request(app.getHttpServer()).get('/v1/certificados/Q360-2026-ABCDEFGH/verificacion');
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.valido, true);
    assert.equal(certificaciones.solicitudes[0]?.cabeceras.authorization, undefined);
  });
});
