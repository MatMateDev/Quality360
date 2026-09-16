/**
 * El gateway no deja pasar la credencial de servicio ni expone las rutas
 * internas de Organización.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { HDU_ID, autorizacion, crearAppPrueba, iniciarServidorFalso, type ServidorFalso } from './ayudas-gateway.js';

const CABECERA_SERVICIO = 'X-Q360-Servicio-Token';

let organizacion: ServidorFalso;
let app: NestExpressApplication;

before(async () => {
  organizacion = await iniciarServidorFalso();
  app = await crearAppPrueba({ organizacionUrl: organizacion.url });
  organizacion.responder('GET /v1/me', {
    estado: 200,
    cuerpo: { id: '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11', nombre: 'Ana', correo: 'ana.perez@quality360.local', rol: 'QE' },
  });
  organizacion.responder('GET /v1/interno/acceso', { estado: 200, cuerpo: { usuarioId: 'x', rol: 'ADMINISTRADOR', activo: true } });
  organizacion.responder('POST /v1/interno/carga/usuarios', { estado: 201, cuerpo: { creado: true } });
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
});

beforeEach(() => {
  organizacion.solicitudes.length = 0;
});

describe('Credencial de servicio', () => {
  it('elimina X-Q360-Servicio-Token de una solicitud del navegador', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/me')
      .set('authorization', await autorizacion())
      .set(CABECERA_SERVICIO, 'secreto-de-integraciones');

    assert.equal(respuesta.status, 200);
    assert.equal(organizacion.solicitudes.length, 1);
    assert.equal(
      organizacion.solicitudes[0]?.cabeceras['x-q360-servicio-token'],
      undefined,
      'la credencial de servicio no debe llegar nunca a Organización desde el gateway',
    );
  });

  it('tampoco la agrega por su cuenta', async () => {
    await request(app.getHttpServer()).get('/v1/me').set('authorization', await autorizacion());
    const cabeceras = organizacion.solicitudes[0]?.cabeceras ?? {};
    assert.equal(cabeceras['x-q360-servicio-token'], undefined);
  });

  it('solo propaga las cabeceras de la lista blanca', async () => {
    await request(app.getHttpServer())
      .get('/v1/me')
      .set('authorization', await autorizacion())
      .set('x-cabecera-inventada', 'valor')
      .set('cookie', 'sesion=galleta');

    const cabeceras = organizacion.solicitudes[0]?.cabeceras ?? {};
    assert.equal(cabeceras['x-cabecera-inventada'], undefined);
    assert.equal(cabeceras.cookie, undefined);
    assert.match(String(cabeceras.authorization), /^Bearer /);
  });
});

describe('Rutas internas', () => {
  it('GET /v1/interno/acceso no está expuesto y no llega a Organización', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/interno/acceso')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('POST /v1/interno/carga/usuarios con credencial de servicio tampoco pasa', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA_SERVICIO, 'secreto-de-integraciones')
      .send({ nombre: 'Intruso' });

    // La ruta no existe en el gateway: 404 igual que cualquier otra ruta
    // inexistente, sin revelar que Organización sí la tiene.
    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('no se alcanza /v1/interno/* con un id de ruta manipulado', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/hdu/..%2Finterno%2Facceso')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('un id válido sí llega a la ruta esperada', async () => {
    organizacion.responder(`GET /v1/hdu/${HDU_ID}`, { estado: 200, cuerpo: { id: HDU_ID, codigo: 'PAGOS-1042' } });
    organizacion.responder(`GET /v1/hdu/${HDU_ID}/checklist`, { estado: 503, cuerpo: { codigo: 'CAPACIDAD_NO_DISPONIBLE' } });

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/hdu/${HDU_ID}`)
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.id, HDU_ID);
    assert.deepEqual(respuesta.body.checklist, { fuente: 'certificaciones.checklist', estado: 'indisponible' });
  });
});
