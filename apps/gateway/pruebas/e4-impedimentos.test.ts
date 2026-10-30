/**
 * Rutas de E4 en el gateway (G1, D85): reenvío explícito a Impedimentos
 * (`IMPEDIMENTOS_URL`), sin comodín bajo `/v1/hdu/**`, CSV transmitido tal cual
 * y reenvío del 409 `HDU_BLOQUEADA` / 503 del cierre que responde Organización.
 * El gateway no autoriza: el 403 lo decide Impedimentos (D89) y llega tal cual.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion } from '../src/configuracion.js';
import { HDU_ID, autorizacion, crearAppPrueba, iniciarServidorFalso, urlCaida, type ServidorFalso } from './ayudas-gateway.js';

let organizacion: ServidorFalso;
let certificaciones: ServidorFalso;
let impedimentos: ServidorFalso;
let app: NestExpressApplication;

const IMP_ID = '7c6f1a52-2f0e-4b8e-9b44-0d2f8a1c9e31';
const BOM = '﻿';

type Metodo = 'get' | 'post' | 'put';

interface Ruta {
  metodo: Metodo;
  ruta: string;
  ids: string;
  /** Cuerpo de ejemplo para las escrituras. */
  cuerpo?: Record<string, unknown>;
}

/** Las 19 operaciones de las 16 rutas de E4 (gateway.v1.yaml, sección E4). */
const RUTAS: Ruta[] = [
  { metodo: 'get', ruta: '/v1/catalogos/tipos-impedimento', ids: 'E4-F01#1, E4-B01#1' },
  { metodo: 'get', ruta: `/v1/hdu/${HDU_ID}/impedimentos`, ids: 'E4-F01#1, E4-B01#2' },
  {
    metodo: 'post',
    ruta: `/v1/hdu/${HDU_ID}/impedimentos`,
    ids: 'E4-B01#1, E4-B01#3',
    cuerpo: { titulo: 'Faltan cuentas de prueba', tipo: 'DATOS_PRUEBA', descripcion: 'Sin saldo', responsableId: IMP_ID },
  },
  { metodo: 'get', ruta: `/v1/hdu/${HDU_ID}/impedimentos/responsables`, ids: 'E4-F01#1, E4-B02#1' },
  { metodo: 'get', ruta: `/v1/hdu/${HDU_ID}/riesgo`, ids: 'E4-F04#1, E4-B03#1' },
  { metodo: 'put', ruta: `/v1/hdu/${HDU_ID}/riesgo`, ids: 'E4-F04#2, E4-B03#3', cuerpo: { nivel: 'ALTO', motivo: 'Ajuste manual' } },
  { metodo: 'get', ruta: `/v1/hdu/${HDU_ID}/gestion-impedimentos`, ids: 'E4-B04#1, E4-B04#3' },
  { metodo: 'get', ruta: '/v1/impedimentos', ids: 'E4-F02#1, E4-F02#2' },
  { metodo: 'get', ruta: `/v1/impedimentos/${IMP_ID}`, ids: 'E4-F03#1, E4-B04#2' },
  { metodo: 'post', ruta: `/v1/impedimentos/${IMP_ID}/resolver`, ids: 'E4-F03#1, E4-B02#1', cuerpo: { comentario: 'Cuentas creadas' } },
  { metodo: 'post', ruta: `/v1/impedimentos/${IMP_ID}/escalar`, ids: 'E4-F03#2, E4-B02#3', cuerpo: { responsableId: HDU_ID, motivo: 'Sin respuesta' } },
  { metodo: 'post', ruta: `/v1/impedimentos/${IMP_ID}/reabrir`, ids: 'E4-F03#3, E4-B04#3', cuerpo: { motivo: 'Volvió a fallar' } },
  { metodo: 'post', ruta: `/v1/impedimentos/${IMP_ID}/seguimiento`, ids: 'E4-F03#1, E4-B02#3', cuerpo: { comentario: 'Se pidió a DBA' } },
  { metodo: 'get', ruta: '/v1/riesgo/hdu', ids: 'E4-F04#3, E4-F02#1' },
  { metodo: 'get', ruta: '/v1/auditor/impedimentos', ids: 'E4-B04#2' },
  { metodo: 'get', ruta: '/v1/auditor/gestion-impedimentos', ids: 'E4-B04#2, E4-B04#3' },
  { metodo: 'get', ruta: '/v1/auditor/exportaciones/impedimentos', ids: 'E4-B04#2' },
  { metodo: 'get', ruta: '/v1/auditor/exportaciones/gestion-impedimentos', ids: 'E4-B04#2, E4-B04#3' },
];

before(async () => {
  organizacion = await iniciarServidorFalso();
  certificaciones = await iniciarServidorFalso();
  impedimentos = await iniciarServidorFalso();
  app = await crearAppPrueba({
    organizacionUrl: organizacion.url,
    certificacionesUrl: certificaciones.url,
    impedimentosUrl: impedimentos.url,
  });
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
  await certificaciones.cerrar();
  await impedimentos.cerrar();
});

beforeEach(() => {
  organizacion.solicitudes.length = 0;
  certificaciones.solicitudes.length = 0;
  impedimentos.solicitudes.length = 0;
});

function totalOtros(): number {
  return organizacion.solicitudes.length + certificaciones.solicitudes.length;
}

describe('Reenvío de las 16 rutas de E4 a Impedimentos [D85]', () => {
  for (const { metodo, ruta, ids, cuerpo } of RUTAS) {
    it(`${metodo.toUpperCase()} ${ruta} llega a Impedimentos con sesión, traza${cuerpo ? ' y cuerpo' : ' y query'} [${ids}]`, async () => {
      impedimentos.responder(`${metodo.toUpperCase()} ${ruta}`, { estado: metodo === 'post' ? 201 : 200, cuerpo: { ok: ruta } });
      const consulta = metodo === 'get' ? '?celulaId=c1&orden=diasAbierto:desc&pagina=2' : '?ignorada=1';
      let solicitud = request(app.getHttpServer())
        [metodo](`${ruta}${consulta}`)
        .set('authorization', await autorizacion())
        .set('x-trace-id', 'traza-e4');
      if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
      const respuesta = await solicitud;

      assert.equal(respuesta.status, metodo === 'post' ? 201 : 200);
      assert.deepEqual(respuesta.body, { ok: ruta });
      const enviada = impedimentos.solicitudes[0];
      assert.equal(enviada?.metodo, metodo.toUpperCase());
      assert.equal(enviada?.url, metodo === 'get' ? `${ruta}${consulta}` : ruta, 'las lecturas propagan la query; las escrituras no');
      assert.match(String(enviada?.cabeceras.authorization), /^Bearer /);
      assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-e4');
      if (cuerpo !== undefined) assert.deepEqual(JSON.parse(enviada?.cuerpo ?? '{}'), cuerpo);
      assert.equal(totalOtros(), 0, 'no toca Organización ni Certificaciones (sin composición)');
    });

    it(`${metodo.toUpperCase()} ${ruta} sin token: 401 NO_AUTENTICADO y no se reenvía`, async () => {
      let solicitud = request(app.getHttpServer())[metodo](ruta);
      if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
      const respuesta = await solicitud;
      assert.equal(respuesta.status, 401);
      assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
      assert.equal(impedimentos.solicitudes.length + totalOtros(), 0);
    });

    it(`${metodo.toUpperCase()} ${ruta}: el gateway no autoriza; el 403 de Impedimentos llega tal cual [D89]`, async () => {
      impedimentos.responder(`${metodo.toUpperCase()} ${ruta}`, {
        estado: 403,
        cuerpo: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes acceso a este recurso.', traceId: 'x', detalles: [] },
      });
      let solicitud = request(app.getHttpServer())[metodo](ruta).set('authorization', await autorizacion());
      if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
      const respuesta = await solicitud;
      assert.equal(respuesta.status, 403);
      assert.deepEqual(respuesta.body, { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes acceso a este recurso.', traceId: 'x', detalles: [] });
      assert.equal(impedimentos.solicitudes.length, 1);
    });
  }
});

describe('Respuestas de Impedimentos llegan tal cual', () => {
  it('409 TRANSICION_INVALIDA, 422 RESPONSABLE_INVALIDO, 409 HDU_CERRADA y 404 se propagan con su cuerpo [E4-B02#1, E4-B02#3, D92]', async () => {
    const casos: Array<[Metodo, string, number, Record<string, unknown>]> = [
      ['post', `/v1/impedimentos/${IMP_ID}/resolver`, 409, { codigo: 'TRANSICION_INVALIDA', estadoActual: 'RESUELTO' }],
      ['post', `/v1/impedimentos/${IMP_ID}/escalar`, 422, { codigo: 'RESPONSABLE_INVALIDO' }],
      ['post', `/v1/hdu/${HDU_ID}/impedimentos`, 409, { codigo: 'HDU_CERRADA' }],
      ['get', `/v1/impedimentos/${IMP_ID}`, 404, { codigo: 'NO_ENCONTRADO' }],
    ];
    for (const [metodo, ruta, estado, extra] of casos) {
      const cuerpo = { mensaje: 'm', traceId: 'x', detalles: [], ...extra };
      impedimentos.responder(`${metodo.toUpperCase()} ${ruta}`, { estado, cuerpo });
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('authorization', await autorizacion()).send({});
      assert.equal(respuesta.status, estado, ruta);
      assert.deepEqual(respuesta.body, cuerpo);
    }
  });

  it('un 503 del servicio (Organización o Certificaciones caídas detrás) llega como 503 con su cuerpo [D92]', async () => {
    const cuerpo = { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'm', traceId: 'x', detalles: [] };
    impedimentos.responder('GET /v1/riesgo/hdu', { estado: 503, cuerpo });
    const respuesta = await request(app.getHttpServer()).get('/v1/riesgo/hdu?riesgo=ALTO').set('authorization', await autorizacion());
    assert.equal(respuesta.status, 503);
    assert.deepEqual(respuesta.body, cuerpo);
  });
});

describe('Validación de ids antes de reenviar', () => {
  it('un hduId o id que no es UUID responde 400 VALIDACION y no llega a Impedimentos', async () => {
    const token = await autorizacion();
    for (const [metodo, ruta] of [
      ['get', '/v1/hdu/xyz/impedimentos'],
      ['post', '/v1/hdu/xyz/impedimentos'],
      ['get', '/v1/hdu/xyz/impedimentos/responsables'],
      ['get', '/v1/hdu/xyz/riesgo'],
      ['put', '/v1/hdu/xyz/riesgo'],
      ['get', '/v1/hdu/xyz/gestion-impedimentos'],
      ['get', '/v1/impedimentos/xyz'],
      ['post', '/v1/impedimentos/xyz/resolver'],
      ['post', '/v1/impedimentos/xyz/escalar'],
      ['post', '/v1/impedimentos/xyz/reabrir'],
      ['post', '/v1/impedimentos/xyz/seguimiento'],
      ['get', '/v1/impedimentos/..%2Finterno%2Fimpedimentos%2Fevaluacion'],
      ['get', '/v1/hdu/..%2Finterno%2Fhdu%2Fambito/impedimentos'],
    ] as const) {
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('authorization', token).send({});
      assert.equal(respuesta.status, 400, ruta);
      assert.equal(respuesta.body.codigo, 'VALIDACION', ruta);
    }
    assert.equal(impedimentos.solicitudes.length + totalOtros(), 0);
  });

  it('una acción desconocida sobre un impedimento responde 404 y no se reenvía', async () => {
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/impedimentos/${IMP_ID}/borrar`)
      .set('authorization', await autorizacion())
      .send({});
    assert.equal(respuesta.status, 404);
    assert.equal(impedimentos.solicitudes.length, 0);
  });
});

describe('Impedimentos caído o lento [D85]', () => {
  it('si Impedimentos no responde: 503 SERVICIO_NO_DISPONIBLE en lecturas, escrituras y exportaciones', async () => {
    const caida = await crearAppPrueba({ organizacionUrl: organizacion.url, impedimentosUrl: await urlCaida() });
    try {
      for (const [metodo, ruta] of [
        ['get', '/v1/catalogos/tipos-impedimento'],
        ['post', `/v1/hdu/${HDU_ID}/impedimentos`],
        ['get', '/v1/auditor/exportaciones/impedimentos'],
      ] as const) {
        const respuesta = await request(caida.getHttpServer())[metodo](ruta).set('authorization', await autorizacion()).send({});
        assert.equal(respuesta.status, 503, ruta);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      }
      assert.equal(organizacion.solicitudes.length, 0);
    } finally {
      await caida.close();
    }
  });

  it('respeta su propio tiempo límite (IMPEDIMENTOS_TIMEOUT_MS): 503 al vencer', async () => {
    const lenta = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      impedimentosUrl: impedimentos.url,
      tiempoLimiteServicioMs: 5000,
      tiempoLimiteImpedimentosMs: 150,
    });
    try {
      impedimentos.responder('GET /v1/impedimentos', { estado: 200, cuerpo: { items: [] }, retrasoMs: 600 });
      const inicio = Date.now();
      const respuesta = await request(lenta.getHttpServer()).get('/v1/impedimentos').set('authorization', await autorizacion());
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.ok(Date.now() - inicio < 2000, 'corta en el tiempo límite de Impedimentos, no en el general');
    } finally {
      await lenta.close();
    }
  });
});

describe('Exportaciones CSV del Auditor [E4-B04#2, E4-B04#3, D48]', () => {
  for (const recurso of ['impedimentos', 'gestion-impedimentos']) {
    it(`exportar ${recurso} transmite el CSV con BOM, Content-Disposition y X-Q360-Filas sin convertirlo a JSON`, async () => {
      const contenido = `${BOM}Código;Título;Días\r\nH1;Cuentas sin saldo ñ;6\r\n`;
      impedimentos.responder(`GET /v1/auditor/exportaciones/${recurso}`, {
        estado: 200,
        texto: contenido,
        tipoContenido: 'text/csv; charset=utf-8',
        cabeceras: { 'content-disposition': `attachment; filename="quality360-${recurso}-2026-10-26.csv"`, 'x-q360-filas': '1' },
      });
      const respuesta = await request(app.getHttpServer())
        .get(`/v1/auditor/exportaciones/${recurso}?celulaId=${HDU_ID}&estado=ABIERTO`)
        .set('authorization', await autorizacion())
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      assert.equal(respuesta.status, 200);
      assert.match(respuesta.headers['content-type'] ?? '', /^text\/csv/);
      assert.equal(respuesta.headers['content-disposition'], `attachment; filename="quality360-${recurso}-2026-10-26.csv"`);
      assert.equal(respuesta.headers['x-q360-filas'], '1');
      const bytes = respuesta.body as unknown as Buffer;
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'conserva el BOM UTF-8');
      assert.equal(bytes.toString('utf8'), contenido);
      assert.equal(impedimentos.solicitudes[0]?.url, `/v1/auditor/exportaciones/${recurso}?celulaId=${HDU_ID}&estado=ABIERTO`);
    });
  }

  it('el 422 EXPORTACION_EXCEDE_LIMITE llega como JSON', async () => {
    const cuerpo = { codigo: 'EXPORTACION_EXCEDE_LIMITE', mensaje: 'La exportación supera las 50.000 filas. Acota los filtros.', traceId: 'x', detalles: [] };
    impedimentos.responder('GET /v1/auditor/exportaciones/impedimentos', { estado: 422, cuerpo });
    const respuesta = await request(app.getHttpServer()).get('/v1/auditor/exportaciones/impedimentos').set('authorization', await autorizacion());
    assert.equal(respuesta.status, 422);
    assert.deepEqual(respuesta.body, cuerpo);
  });
});

describe('Convivencia con las rutas de Organización y Certificaciones bajo /v1/hdu/:id [D85]', () => {
  it('detalle, analista, qe-responsable, estado e historial siguen yendo a Organización; nada llega a Impedimentos', async () => {
    organizacion.responder(`GET /v1/hdu/${HDU_ID}`, { estado: 200, cuerpo: { id: HDU_ID } });
    organizacion.responder(`PUT /v1/hdu/${HDU_ID}/analista`, { estado: 200, cuerpo: { ok: 'analista' } });
    organizacion.responder(`PUT /v1/hdu/${HDU_ID}/qe-responsable`, { estado: 200, cuerpo: { ok: 'qe' } });
    organizacion.responder(`POST /v1/hdu/${HDU_ID}/estado`, { estado: 200, cuerpo: { ok: 'estado' } });
    organizacion.responder(`GET /v1/hdu/${HDU_ID}/historial`, { estado: 200, cuerpo: { items: [] } });
    const token = await autorizacion();
    const servidor = app.getHttpServer();
    assert.equal((await request(servidor).get(`/v1/hdu/${HDU_ID}`).set('authorization', token)).body.id, HDU_ID);
    assert.equal((await request(servidor).put(`/v1/hdu/${HDU_ID}/analista`).set('authorization', token).send({})).body.ok, 'analista');
    assert.equal((await request(servidor).put(`/v1/hdu/${HDU_ID}/qe-responsable`).set('authorization', token).send({})).body.ok, 'qe');
    assert.equal((await request(servidor).post(`/v1/hdu/${HDU_ID}/estado`).set('authorization', token).send({ estado: 'CERRADA' })).body.ok, 'estado');
    assert.equal((await request(servidor).get(`/v1/hdu/${HDU_ID}/historial`).set('authorization', token)).status, 200);
    assert.equal(impedimentos.solicitudes.length, 0);
  });

  it('entregables, bitácora y certificado siguen yendo a Certificaciones', async () => {
    certificaciones.responder(`GET /v1/hdu/${HDU_ID}/entregables`, { estado: 200, cuerpo: { items: [] } });
    certificaciones.responder(`GET /v1/hdu/${HDU_ID}/entregables/bitacora`, { estado: 200, cuerpo: { items: [] } });
    certificaciones.responder(`GET /v1/hdu/${HDU_ID}/certificado`, { estado: 200, cuerpo: { folio: 'Q360-1' } });
    const token = await autorizacion();
    const servidor = app.getHttpServer();
    assert.equal((await request(servidor).get(`/v1/hdu/${HDU_ID}/entregables`).set('authorization', token)).status, 200);
    assert.equal((await request(servidor).get(`/v1/hdu/${HDU_ID}/entregables/bitacora`).set('authorization', token)).status, 200);
    assert.equal((await request(servidor).get(`/v1/hdu/${HDU_ID}/certificado`).set('authorization', token)).body.folio, 'Q360-1');
    assert.equal(impedimentos.solicitudes.length, 0);
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('no hay comodín: un sufijo desconocido bajo /v1/hdu/:id y /v1/riesgo responde 404', async () => {
    const token = await autorizacion();
    for (const ruta of [`/v1/hdu/${HDU_ID}/impedimentos/${IMP_ID}`, `/v1/hdu/${HDU_ID}/riesgos`, `/v1/hdu/${HDU_ID}/otra`, '/v1/riesgo/celula']) {
      assert.equal((await request(app.getHttpServer()).get(ruta).set('authorization', token)).status, 404, ruta);
    }
    assert.equal(impedimentos.solicitudes.length + totalOtros(), 0);
  });

  it('las consultas del Auditor de E7 siguen yendo a su servicio', async () => {
    certificaciones.responder('GET /v1/auditor/bitacora', { estado: 200, cuerpo: { items: [] } });
    organizacion.responder('GET /v1/auditor/auditoria-usuarios', { estado: 200, cuerpo: { items: [] } });
    const token = await autorizacion();
    await request(app.getHttpServer()).get('/v1/auditor/bitacora').set('authorization', token).expect(200);
    await request(app.getHttpServer()).get('/v1/auditor/auditoria-usuarios').set('authorization', token).expect(200);
    assert.equal(impedimentos.solicitudes.length, 0);
  });

  it('/v1/impedimentos ya no responde 501: sin token da 401 y con token llega a Impedimentos', async () => {
    assert.equal((await request(app.getHttpServer()).get('/v1/impedimentos')).status, 401);
    impedimentos.responder('GET /v1/impedimentos', { estado: 200, cuerpo: { items: [], total: 0 } });
    const respuesta = await request(app.getHttpServer()).get('/v1/impedimentos').set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
  });
});

describe('Cierre de HDU con impedimentos (Organización responde; el gateway reenvía) [E4-B02#2, D60]', () => {
  it('409 HDU_BLOQUEADA llega con el bloque impedimentos intacto', async () => {
    const cuerpo = {
      codigo: 'HDU_BLOQUEADA',
      mensaje: 'No se puede cerrar la HDU: tiene impedimentos abiertos o escalados.',
      traceId: 'x',
      detalles: [],
      impedimentos: {
        total: 1,
        items: [{ id: IMP_ID, titulo: 'Faltan cuentas de prueba con saldo', tipo: 'DATOS_PRUEBA', estado: 'ABIERTO', diasAbierto: 6 }],
      },
    };
    organizacion.responder(`POST /v1/hdu/${HDU_ID}/estado`, { estado: 409, cuerpo });
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/hdu/${HDU_ID}/estado`)
      .set('authorization', await autorizacion())
      .send({ estado: 'CERRADA' });
    assert.equal(respuesta.status, 409);
    assert.deepEqual(respuesta.body, cuerpo);
    assert.equal(impedimentos.solicitudes.length, 0, 'el gateway no consulta Impedimentos: lo hace Organización');
  });

  it('503 con impedimentos.estado indisponible llega tal cual (no se reemplaza por un 503 genérico)', async () => {
    const cuerpo = {
      codigo: 'SERVICIO_NO_DISPONIBLE',
      mensaje: 'No pudimos verificar los impedimentos de la HDU.',
      traceId: 'x',
      detalles: [],
      impedimentos: { fuente: 'impedimentos', estado: 'indisponible' },
    };
    organizacion.responder(`POST /v1/hdu/${HDU_ID}/estado`, { estado: 503, cuerpo });
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/hdu/${HDU_ID}/estado`)
      .set('authorization', await autorizacion())
      .send({ estado: 'CERRADA' });
    assert.equal(respuesta.status, 503);
    assert.deepEqual(respuesta.body, cuerpo);
  });
});

describe('Rutas internas de E4 no publicadas [D86]', () => {
  it('/v1/interno/* de Impedimentos responde 404 desde afuera y no llega a ningún servicio', async () => {
    const token = await autorizacion();
    for (const [metodo, ruta] of [
      ['post', '/v1/interno/impedimentos/evaluacion'],
      ['get', `/v1/interno/hdu/${HDU_ID}/impedimentos/abiertos`],
      ['post', '/v1/interno/carga/impedimentos'],
      ['post', '/v1/interno/carga/riesgo'],
      ['get', '/v1/interno/hdu/ambito/detalle'],
    ] as const) {
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('authorization', token).send({});
      assert.equal(respuesta.status, 404, ruta);
    }
    assert.equal(impedimentos.solicitudes.length + totalOtros(), 0);
  });
});

describe('Límite de tasa estricto en las escrituras de E4', () => {
  it('superado el máximo de escrituras responde 429; las lecturas no cuentan', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      impedimentosUrl: impedimentos.url,
      limiteTasa: { maximoEscritura: 2 },
    });
    try {
      impedimentos.responder(`POST /v1/impedimentos/${IMP_ID}/seguimiento`, { estado: 201, cuerpo: {} });
      impedimentos.responder('GET /v1/impedimentos', { estado: 200, cuerpo: { items: [] } });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 3; i += 1) await request(servidor).get('/v1/impedimentos').set('authorization', token).expect(200);
      await request(servidor).post(`/v1/impedimentos/${IMP_ID}/seguimiento`).set('authorization', token).send({}).expect(201);
      await request(servidor).post(`/v1/impedimentos/${IMP_ID}/seguimiento`).set('authorization', token).send({}).expect(201);
      const tercera = await request(servidor).post(`/v1/impedimentos/${IMP_ID}/seguimiento`).set('authorization', token).send({});
      assert.equal(tercera.status, 429);
      assert.equal(tercera.body.codigo, 'DEMASIADAS_SOLICITUDES');
    } finally {
      await limitada.close();
    }
  });
});

/** El mensaje público de `errorInterno` es genérico; la causa viaja en `motivo`. */
function conMotivo(patron: RegExp): (error: unknown) => boolean {
  return (error) => patron.test(String((error as { motivo?: string }).motivo ?? ''));
}

describe('Configuración IMPEDIMENTOS_URL e IMPEDIMENTOS_TIMEOUT_MS', () => {
  it('en local cae en http://localhost:3003 y el tiempo límite en TIEMPO_LIMITE_SERVICIO_MS', () => {
    const configuracion = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', TIEMPO_LIMITE_SERVICIO_MS: '7000' });
    assert.equal(configuracion.impedimentosUrl, 'http://localhost:3003');
    assert.equal(configuracion.tiempoLimiteImpedimentosMs, 7000);
  });

  it('respeta los valores dados y quita la barra final', () => {
    const configuracion = cargarConfiguracion({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      IMPEDIMENTOS_URL: 'https://quality360-impedimentos.vercel.app/',
      IMPEDIMENTOS_TIMEOUT_MS: '2500',
    });
    assert.equal(configuracion.impedimentosUrl, 'https://quality360-impedimentos.vercel.app');
    assert.equal(configuracion.tiempoLimiteImpedimentosMs, 2500);
  });

  it('D129: sin IMPEDIMENTOS_URL en producción, o con una URL inválida, NO impide arrancar: queda null con un aviso sin el valor', () => {
    const sinUrl = cargarConfiguracion({ SUPABASE_URL: 'https://x.supabase.co', NODE_ENV: 'production' });
    assert.equal(sinUrl.impedimentosUrl, null);
    assert.ok(sinUrl.avisos.includes('IMPEDIMENTOS_URL no configurada o inválida'));

    for (const invalida of ['ftp://x', 'no es una url']) {
      const configuracion = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', IMPEDIMENTOS_URL: invalida });
      assert.equal(configuracion.impedimentosUrl, null, invalida);
      assert.ok(configuracion.avisos.every((aviso) => !aviso.includes(invalida)), 'el aviso no incluye el valor');
    }
  });

  it('un tiempo límite inválido sigue impidiendo arrancar', () => {
    assert.throws(() => cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', IMPEDIMENTOS_TIMEOUT_MS: '0' }), conMotivo(/IMPEDIMENTOS_TIMEOUT_MS/));
  });
});

describe('D129: Impedimentos no configurado solo apaga sus rutas', () => {
  it('con impedimentosUrl null, las rutas de E4 responden 503 sin llamar a nadie; sin token, 401', async () => {
    const sinImpedimentos = await crearAppPrueba({ organizacionUrl: organizacion.url, impedimentosUrl: null });
    try {
      const token = await autorizacion();
      for (const { metodo, ruta, cuerpo } of RUTAS) {
        let solicitud = request(sinImpedimentos.getHttpServer())[metodo](ruta).set('authorization', token);
        if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
        const respuesta = await solicitud;
        assert.equal(respuesta.status, 503, ruta);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE', ruta);
        assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
      }
      assert.equal((await request(sinImpedimentos.getHttpServer()).get('/v1/impedimentos')).status, 401);
      assert.equal(impedimentos.solicitudes.length + totalOtros(), 0);

      organizacion.responder(`POST /v1/hdu/${HDU_ID}/estado`, { estado: 200, cuerpo: { ok: 'estado' } });
      const cierre = await request(sinImpedimentos.getHttpServer())
        .post(`/v1/hdu/${HDU_ID}/estado`)
        .set('authorization', token)
        .send({ estado: 'EN_PRUEBAS' });
      assert.equal(cierre.status, 200, 'las rutas de Organización siguen funcionando');
    } finally {
      await sinImpedimentos.close();
    }
  });
});
