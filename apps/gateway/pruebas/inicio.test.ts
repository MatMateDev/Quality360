/**
 * Composición de `/v1/inicio/*` con una fuente por bloque.
 *
 * Escenarios del contrato: E1-B03#3 y E1-F06#3 (fuente de HDU caída),
 * E1-F08#2 (una fuente del panel administrativo no responde) y E1-B03#2
 * (0 significa consulta exitosa sin registros, no fuente caída).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  autorizacion,
  crearAppPrueba,
  iniciarServidorFalso,
  urlCaida,
  type ServidorFalso,
} from './ayudas-gateway.js';

const RESUMEN_EQUIPO = { analistasVigentes: 3 };
const RESUMEN_HDU_QE = {
  hduEnAmbito: 2,
  porEstado: { PENDIENTE: 1, DISENO_PRUEBAS: 1, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 },
};

let organizacion: ServidorFalso;
let fuenteHduCaida: string;
let app: NestExpressApplication;
let appConHduCaida: NestExpressApplication;

before(async () => {
  organizacion = await iniciarServidorFalso();
  fuenteHduCaida = await urlCaida();
  app = await crearAppPrueba({ organizacionUrl: organizacion.url });
  appConHduCaida = await crearAppPrueba({
    organizacionUrl: organizacion.url,
    fuentes: { hdu: fuenteHduCaida },
  });
});

after(async () => {
  await app.close();
  await appConHduCaida.close();
  await organizacion.cerrar();
});

beforeEach(() => {
  organizacion.solicitudes.length = 0;
  organizacion.responder('GET /v1/resumenes/qe/equipo', { estado: 200, cuerpo: RESUMEN_EQUIPO });
  organizacion.responder('GET /v1/resumenes/qe/hdu', { estado: 200, cuerpo: RESUMEN_HDU_QE });
  organizacion.responder('GET /v1/resumenes/admin/usuarios', {
    estado: 200,
    cuerpo: { total: 10, activos: 9, inactivos: 1, porRol: { ADMINISTRADOR: 1, QE: 3, ANALISTA_QA: 6 } },
  });
  organizacion.responder('GET /v1/resumenes/admin/supervision', {
    estado: 200,
    cuerpo: { relacionesVigentes: 4, analistasSinSupervisor: 1, qeSinAnalistas: 1 },
  });
  organizacion.responder('GET /v1/resumenes/qa/supervisor', { estado: 200, cuerpo: { supervisor: null } });
  organizacion.responder('GET /v1/resumenes/qa/hdu', {
    estado: 200,
    cuerpo: { hduAsignadas: 0, porEstado: { PENDIENTE: 0, DISENO_PRUEBAS: 0, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 } },
  });
});

describe('GET /v1/inicio/qe', () => {
  it('ambas fuentes responden: dos bloques ok', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/inicio/qe')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, {
      equipo: { fuente: 'organizacion.supervision', estado: 'ok', datos: RESUMEN_EQUIPO },
      hdu: { fuente: 'organizacion.hdu', estado: 'ok', datos: RESUMEN_HDU_QE },
    });
  });

  it('con la fuente de HDU caída, ese bloque queda indisponible y el resto sigue ok (E1-B03#3)', async () => {
    const respuesta = await request(appConHduCaida.getHttpServer())
      .get('/v1/inicio/qe')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200, 'la respuesta compuesta sigue siendo 200');
    assert.deepEqual(respuesta.body.equipo, {
      fuente: 'organizacion.supervision',
      estado: 'ok',
      datos: RESUMEN_EQUIPO,
    });
    assert.deepEqual(respuesta.body.hdu, { fuente: 'organizacion.hdu', estado: 'indisponible' });
    assert.equal(
      Object.prototype.hasOwnProperty.call(respuesta.body.hdu, 'datos'),
      false,
      'un bloque indisponible nunca trae datos, ceros ni listas vacías',
    );
  });

  it('una fuente lenta agota su tiempo límite y queda indisponible, sin arrastrar a la otra', async () => {
    const lenta = await crearAppPrueba({ organizacionUrl: organizacion.url, tiempoLimiteFuenteMs: 120 });
    organizacion.responder('GET /v1/resumenes/qe/hdu', { estado: 200, cuerpo: RESUMEN_HDU_QE, retrasoMs: 400 });

    const respuesta = await request(lenta.getHttpServer())
      .get('/v1/inicio/qe')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.equipo.estado, 'ok');
    assert.deepEqual(respuesta.body.hdu, { fuente: 'organizacion.hdu', estado: 'indisponible' });
    await lenta.close();
  });

  it('conteos en 0 se devuelven como ok, no como indisponible (E1-B03#2)', async () => {
    const vacio = {
      hduEnAmbito: 0,
      porEstado: { PENDIENTE: 0, DISENO_PRUEBAS: 0, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 },
    };
    organizacion.responder('GET /v1/resumenes/qe/hdu', { estado: 200, cuerpo: vacio });

    const respuesta = await request(app.getHttpServer())
      .get('/v1/inicio/qe')
      .set('authorization', await autorizacion());

    assert.deepEqual(respuesta.body.hdu, { fuente: 'organizacion.hdu', estado: 'ok', datos: vacio });
  });

  it('un 403 de una fuente se devuelve completo', async () => {
    const error = {
      codigo: 'ACCESO_DENEGADO',
      mensaje: 'No tienes acceso a este recurso.',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      detalles: [],
    };
    organizacion.responder('GET /v1/resumenes/qe/equipo', { estado: 403, cuerpo: error });

    const respuesta = await request(app.getHttpServer())
      .get('/v1/inicio/qe')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });

  it('propaga Authorization y x-trace-id a cada fuente', async () => {
    await request(app.getHttpServer())
      .get('/v1/inicio/qe')
      .set('authorization', await autorizacion())
      .set('x-trace-id', '4bf92f3577b34da6a3ce929d0e0e4736');

    assert.equal(organizacion.solicitudes.length, 2);
    for (const solicitud of organizacion.solicitudes) {
      assert.match(String(solicitud.cabeceras.authorization), /^Bearer /);
      assert.equal(solicitud.cabeceras['x-trace-id'], '4bf92f3577b34da6a3ce929d0e0e4736');
    }
  });
});

describe('GET /v1/inicio/admin', () => {
  it('compone usuarios y supervisión', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/inicio/admin')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.usuarios.fuente, 'organizacion.usuarios');
    assert.equal(respuesta.body.usuarios.estado, 'ok');
    assert.equal(respuesta.body.supervision.estado, 'ok');
  });

  it('si la fuente de supervisión falla, solo ese bloque queda indisponible (E1-F08#2)', async () => {
    organizacion.responder('GET /v1/resumenes/admin/supervision', { estado: 500, cuerpo: { codigo: 'ERROR_INTERNO' } });

    const respuesta = await request(app.getHttpServer())
      .get('/v1/inicio/admin')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.usuarios.estado, 'ok');
    assert.deepEqual(respuesta.body.supervision, { fuente: 'organizacion.supervision', estado: 'indisponible' });
  });
});

describe('GET /v1/inicio/qa', () => {
  it('propaga analistaId a las dos fuentes', async () => {
    await request(app.getHttpServer())
      .get('/v1/inicio/qa?analistaId=9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10')
      .set('authorization', await autorizacion());

    assert.equal(organizacion.solicitudes.length, 2);
    for (const solicitud of organizacion.solicitudes) {
      assert.match(solicitud.url, /analistaId=9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10/);
    }
  });

  it('con la fuente de HDU caída deja hdu indisponible y supervisor ok (E1-F06#3)', async () => {
    const respuesta = await request(appConHduCaida.getHttpServer())
      .get('/v1/inicio/qa')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.supervisor.estado, 'ok');
    assert.deepEqual(respuesta.body.hdu, { fuente: 'organizacion.hdu', estado: 'indisponible' });
  });
});
