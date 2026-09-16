/**
 * Sesión, enrutamiento a Organización, rutas aún no disponibles, límite de
 * tasa y cabeceras de seguridad.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  autorizacion,
  crearAppPrueba,
  firmarToken,
  iniciarServidorFalso,
  urlCaida,
  type ServidorFalso,
} from './ayudas-gateway.js';

const PERFIL = {
  id: '5b0c2f0e-8f1e-4c47-9a57-3a0f5d1e2b11',
  nombre: 'Ana Pérez',
  correo: 'ana.perez@quality360.local',
  rol: 'QE',
};

let organizacion: ServidorFalso;
let app: NestExpressApplication;

before(async () => {
  organizacion = await iniciarServidorFalso();
  app = await crearAppPrueba({ organizacionUrl: organizacion.url });
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
});

beforeEach(() => {
  organizacion.solicitudes.length = 0;
  organizacion.responder('GET /v1/me', { estado: 200, cuerpo: PERFIL });
});

describe('GET /health', () => {
  it('responde sin sesión', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });

  it('no consulta a los servicios', async () => {
    await request(app.getHttpServer()).get('/health');
    assert.equal(organizacion.solicitudes.length, 0);
  });
});

describe('Sesión', () => {
  it('sin token: 401 NO_AUTENTICADO', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/me');
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('token expirado: 401 SESION_EXPIRADA (E1-B11#1)', async () => {
    const token = await firmarToken({ vigenciaSegundos: -300 });
    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${token}`);

    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'SESION_EXPIRADA');
    assert.equal(respuesta.body.mensaje, 'Tu sesión expiró. Inicia sesión nuevamente.');
    assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
    assert.equal(organizacion.solicitudes.length, 0, 'un token vencido no debe llegar al servicio');
  });

  it('token con audiencia ajena: 401 NO_AUTENTICADO', async () => {
    const token = await firmarToken({ audiencia: 'otro-publico' });
    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${token}`);
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
  });

  it('token válido: reenvía y devuelve la respuesta de Organización', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, PERFIL);
    assert.equal(respuesta.headers['cache-control'], 'no-store');
  });
});

describe('Enrutamiento a Organización', () => {
  it('reenvía el cuerpo y el estado de una escritura', async () => {
    organizacion.responder('POST /v1/usuarios', {
      estado: 201,
      cuerpo: { id: '9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10' },
      cabeceras: { location: '/v1/usuarios/9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10' },
    });

    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', await autorizacion())
      .send({ nombre: 'Diego Soto', correo: 'diego.soto@quality360.local', rol: 'ANALISTA_QA' });

    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.headers.location, '/v1/usuarios/9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10');
    assert.deepEqual(JSON.parse(organizacion.solicitudes[0]?.cuerpo ?? '{}'), {
      nombre: 'Diego Soto',
      correo: 'diego.soto@quality360.local',
      rol: 'ANALISTA_QA',
    });
  });

  it('propaga la query string tal cual', async () => {
    organizacion.responder('GET /v1/usuarios', { estado: 200, cuerpo: { items: [], total: 0, pagina: 1, tamanoPagina: 20 } });
    await request(app.getHttpServer())
      .get('/v1/usuarios?q=ana&rol=QE&pagina=2')
      .set('authorization', await autorizacion());

    assert.equal(organizacion.solicitudes[0]?.url, '/v1/usuarios?q=ana&rol=QE&pagina=2');
  });

  it('devuelve tal cual el error del servicio', async () => {
    organizacion.responder('GET /v1/usuarios', {
      estado: 403,
      cuerpo: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes acceso a este recurso.', traceId: 'x', detalles: [] },
    });
    const respuesta = await request(app.getHttpServer())
      .get('/v1/usuarios')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });

  it('servicio caído: 503 SERVICIO_NO_DISPONIBLE', async () => {
    const caido = await crearAppPrueba({ organizacionUrl: await urlCaida() });
    const respuesta = await request(caido.getHttpServer())
      .get('/v1/me')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    assert.equal(respuesta.body.mensaje, 'El servicio no está disponible. Intenta nuevamente.');
    await caido.close();
  });

  it('servicio lento: 503 al agotarse el tiempo límite', async () => {
    const lento = await crearAppPrueba({ organizacionUrl: organizacion.url, tiempoLimiteServicioMs: 100 });
    organizacion.responder('GET /v1/me', { estado: 200, cuerpo: PERFIL, retrasoMs: 400 });

    const respuesta = await request(lento.getHttpServer())
      .get('/v1/me')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    await lento.close();
  });
});

describe('Capacidades y rutas desconocidas', () => {
  it('las rutas de otros servicios responden 501 CAPACIDAD_NO_DISPONIBLE', async () => {
    for (const ruta of ['/v1/certificaciones', '/v1/certificaciones/ciclos', '/v1/impedimentos/1', '/v1/integraciones/carga']) {
      const respuesta = await request(app.getHttpServer()).get(ruta).set('authorization', await autorizacion());
      assert.equal(respuesta.status, 501, `${ruta} debería responder 501`);
      assert.equal(respuesta.body.codigo, 'CAPACIDAD_NO_DISPONIBLE');
    }
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('una ruta inexistente responde 404 en el formato común', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/inventada')
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
  });

  it('un cuerpo JSON mal formado responde 400 VALIDACION, no una página de error', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', await autorizacion())
      .set('content-type', 'application/json')
      .send('{"nombre": ');

    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
  });
});

describe('Borde HTTP', () => {
  it('helmet fija las cabeceras de seguridad y oculta el motor', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.headers['x-content-type-options'], 'nosniff');
    assert.equal(respuesta.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(respuesta.headers['x-powered-by'], undefined);
  });

  it('CORS solo para el origen del portal', async () => {
    const permitido = await request(app.getHttpServer()).get('/health').set('origin', 'http://localhost:5173');
    assert.equal(permitido.headers['access-control-allow-origin'], 'http://localhost:5173');

    const ajeno = await request(app.getHttpServer()).get('/health').set('origin', 'http://atacante.local');
    assert.equal(ajeno.headers['access-control-allow-origin'], undefined);
  });

  it('el límite de tasa responde 429 con Retry-After', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      limiteTasa: { maximo: 2, maximoEscritura: 1000 },
    });
    const cabecera = await autorizacion();

    await request(limitada.getHttpServer()).get('/v1/me').set('authorization', cabecera);
    await request(limitada.getHttpServer()).get('/v1/me').set('authorization', cabecera);
    const tercera = await request(limitada.getHttpServer()).get('/v1/me').set('authorization', cabecera);

    assert.equal(tercera.status, 429);
    assert.equal(tercera.body.codigo, 'DEMASIADAS_SOLICITUDES');
    assert.ok(Number(tercera.headers['retry-after']) >= 1);
    await limitada.close();
  });

  it('las escrituras tienen un límite más estricto que las lecturas', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      limiteTasa: { maximo: 50, maximoEscritura: 1 },
    });
    const cabecera = await autorizacion();
    organizacion.responder('POST /v1/usuarios', { estado: 201, cuerpo: { id: 'x' } });

    const primera = await request(limitada.getHttpServer()).post('/v1/usuarios').set('authorization', cabecera).send({});
    const segunda = await request(limitada.getHttpServer()).post('/v1/usuarios').set('authorization', cabecera).send({});
    const lectura = await request(limitada.getHttpServer()).get('/v1/me').set('authorization', cabecera);

    assert.equal(primera.status, 201);
    assert.equal(segunda.status, 429);
    assert.equal(lectura.status, 200, 'la lectura no se ve afectada por el límite de escrituras');
    await limitada.close();
  });
});
