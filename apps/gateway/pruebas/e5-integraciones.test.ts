/**
 * Rutas de E5 en el gateway (G1, D127; GC1, D132 y D152): reenvío explícito de
 * las 18 rutas (20 operaciones) de `/v1/integraciones/*` a Integraciones
 * (`INTEGRACIONES_URL`), `jira/sincronizaciones` retirada (404), cubo de tasa
 * propio para `PATCH …/consultas/{id}/items` y `POST …/items/{itemId}/confirmaciones`
 * (GD1, ADR 0018, D202 g), 503 solo en esas
 * rutas si la URL falta o es inválida, cuerpo de 1,5 MB solo en `archivos/*`,
 * tiempo límite propio de 12 s (D115), rutas internas no publicadas, y los
 * cambios aditivos de E5 en Organización: `?celulaId` en sprints (D120) y los
 * campos nuevos del detalle de HDU (D108, D124).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';
import { LIMITE_CUERPO_ARCHIVOS_BYTES } from '../src/middlewares/cuerpo.js';
import {
  HDU_ID,
  autorizacion,
  configuracionPrueba,
  crearAppPrueba,
  iniciarServidorFalso,
  urlCaida,
  type ServidorFalso,
} from './ayudas-gateway.js';

let organizacion: ServidorFalso;
let certificaciones: ServidorFalso;
let impedimentos: ServidorFalso;
let integraciones: ServidorFalso;
let app: NestExpressApplication;

const EJECUCION_ID = '0b9a6a2e-7c6f-4d4b-9a3e-1f2d3c4b5a69';
const CELULA_ID = '3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607';
const CONSULTA_ID = '7d2e4f60-1a3b-4c5d-8e9f-a0b1c2d3e4f5';
const ITEM_ID = '9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0';
const CONSULTA = `/v1/integraciones/jira/consultas/${CONSULTA_ID}`;
const RUTA_EDICION = `${CONSULTA}/items`;
const RUTA_ITEM = `${CONSULTA}/items/${ITEM_ID}`;
const RUTA_CONFIRMACION_FILA = `${RUTA_ITEM}/confirmaciones`;

type Metodo = 'get' | 'post' | 'put' | 'patch';

interface Ruta {
  metodo: Metodo;
  ruta: string;
  ids: string;
  cuerpo?: Record<string, unknown>;
  /** Estado que responde Integraciones en el caso feliz. */
  estado?: number;
}

/** Las 20 operaciones de las 18 rutas de E5 (integraciones.v1.yaml). */
const RUTAS: Ruta[] = [
  { metodo: 'get', ruta: '/v1/integraciones/jira/configuracion', ids: 'E5-F01#3, E5-B01#1, E5-B01#3' },
  {
    metodo: 'put',
    ruta: '/v1/integraciones/jira/configuracion',
    ids: 'E5-F01#1, E5-F01#2, E5-B01#1, E5-B01#2',
    cuerpo: { sitio: 'equipo.atlassian.net', correo: 'qa@equipo.cl', token: 'tok-de-prueba', proyecto: 'Q360' },
  },
  { metodo: 'post', ruta: '/v1/integraciones/jira/configuracion/probar', ids: 'E5-F01#2, E5-B01#2, E5-B01#3', cuerpo: {} },
  { metodo: 'get', ruta: '/v1/integraciones/jira/configuracion/eventos', ids: 'E5-F01#1, E5-B01#1' },
  { metodo: 'post', ruta: '/v1/integraciones/jira/consultas', ids: 'E5-F02#1, E5-B02#1, E5-B04#1, E5-B05#2', cuerpo: { reemplazar: true }, estado: 201 },
  { metodo: 'get', ruta: '/v1/integraciones/jira/consultas/actual', ids: 'E5-F02#1, E5-F05#8, E5-B05#1' },
  { metodo: 'get', ruta: CONSULTA, ids: 'E5-F05#8, E5-F05#9, E5-B05#13' },
  { metodo: 'post', ruta: `${CONSULTA}/continuaciones`, ids: 'E5-F02#5, E5-B02#2, E5-B05#12', cuerpo: {}, estado: 200 },
  { metodo: 'get', ruta: `${CONSULTA}/items`, ids: 'E5-F05#1, E5-F05#2, E5-B05#1, E5-B05#3' },
  {
    metodo: 'patch',
    ruta: RUTA_EDICION,
    ids: 'E5-F05#3, E5-F05#4, E5-B05#4, E5-B05#5',
    cuerpo: { version: 3, itemIds: [ITEM_ID], asignacion: { celulaId: CELULA_ID }, marcarListas: true },
    estado: 200,
  },
  { metodo: 'get', ruta: RUTA_ITEM, ids: 'E5-F06#1, E5-B06#6, E5-B05#13' },
  { metodo: 'post', ruta: RUTA_CONFIRMACION_FILA, ids: 'E5-F07#1, E5-B07#1, E5-B07#14', cuerpo: { revision: 3 }, estado: 200 },
  { metodo: 'post', ruta: `${CONSULTA}/confirmaciones`, ids: 'E5-F05#5, E5-B05#6, E5-B04#4', cuerpo: { version: 4 }, estado: 200 },
  { metodo: 'post', ruta: `${CONSULTA}/descartes`, ids: 'E5-F05#8, E5-B05#10, E5-B05#11', cuerpo: { version: 4 }, estado: 200 },
  {
    metodo: 'post',
    ruta: '/v1/integraciones/archivos/vista-previa',
    ids: 'E5-F03#1, E5-F03#2, E5-B03#1',
    cuerpo: { nombre: 'hdu.csv', contenido: 'codigo,titulo\nQ-1,Uno\n' },
    estado: 200,
  },
  {
    metodo: 'post',
    ruta: '/v1/integraciones/archivos/importaciones',
    ids: 'E5-F03#3, E5-B03#1, E5-B03#2, E5-B04#1',
    cuerpo: { nombre: 'hdu.csv', contenido: 'codigo,titulo\nQ-1,Uno\n', estricto: true },
    estado: 200,
  },
  { metodo: 'get', ruta: '/v1/integraciones/ejecuciones', ids: 'E5-F04#2, E5-B04#2' },
  { metodo: 'get', ruta: `/v1/integraciones/ejecuciones/${EJECUCION_ID}`, ids: 'E5-F04#1, E5-F04#3, E5-B04#1, E5-B04#3' },
  { metodo: 'get', ruta: `/v1/integraciones/ejecuciones/${EJECUCION_ID}/detalle`, ids: 'E5-F02#1, E5-F03#3, E5-F04#3, E5-B04#2' },
  { metodo: 'get', ruta: '/v1/integraciones/estado', ids: 'E5-F04#1, E5-F02#1' },
];

before(async () => {
  organizacion = await iniciarServidorFalso();
  certificaciones = await iniciarServidorFalso();
  impedimentos = await iniciarServidorFalso();
  integraciones = await iniciarServidorFalso();
  app = await crearAppPrueba({
    organizacionUrl: organizacion.url,
    certificacionesUrl: certificaciones.url,
    impedimentosUrl: impedimentos.url,
    integracionesUrl: integraciones.url,
  });
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
  await certificaciones.cerrar();
  await impedimentos.cerrar();
  await integraciones.cerrar();
});

beforeEach(() => {
  for (const servidor of [organizacion, certificaciones, impedimentos, integraciones]) servidor.solicitudes.length = 0;
});

function totalOtros(): number {
  return organizacion.solicitudes.length + certificaciones.solicitudes.length + impedimentos.solicitudes.length;
}

function enviar(
  destino: NestExpressApplication,
  metodo: Metodo,
  ruta: string,
  token: string | null,
  cuerpo?: Record<string, unknown>,
): request.Test {
  let solicitud = request(destino.getHttpServer())[metodo](ruta);
  if (token !== null) solicitud = solicitud.set('authorization', token);
  if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
  return solicitud;
}

describe('Reenvío de las 18 rutas (20 operaciones) de E5 a Integraciones [D127, D132, GD1]', () => {
  it('la lista cubre 18 rutas y 20 operaciones, sin jira/sincronizaciones', () => {
    assert.equal(RUTAS.length, 20);
    assert.equal(new Set(RUTAS.map(({ ruta }) => ruta)).size, 18);
    assert.equal(RUTAS.some(({ ruta }) => ruta.endsWith('/sincronizaciones')), false);
  });

  for (const { metodo, ruta, ids, cuerpo, estado } of RUTAS) {
    const nombre = `${metodo.toUpperCase()} ${ruta}`;

    it(`${nombre} llega a Integraciones con sesión, traza${cuerpo ? ' y cuerpo' : ' y query'} [${ids}]`, async () => {
      const esperado = estado ?? 200;
      integraciones.responder(nombre, { estado: esperado, cuerpo: { ok: ruta } });
      const consulta = metodo === 'get' ? '?origen=JIRA&resultado=ERROR&pagina=2' : '?ignorada=1';
      let solicitud = request(app.getHttpServer())
        [metodo](`${ruta}${consulta}`)
        .set('authorization', await autorizacion())
        .set('x-trace-id', 'traza-e5');
      if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
      const respuesta = await solicitud;

      assert.equal(respuesta.status, esperado);
      assert.deepEqual(respuesta.body, { ok: ruta });
      const enviada = integraciones.solicitudes[0];
      assert.equal(integraciones.solicitudes.length, 1);
      assert.equal(enviada?.metodo, metodo.toUpperCase());
      assert.equal(enviada?.url, metodo === 'get' ? `${ruta}${consulta}` : ruta, 'las lecturas propagan la query; las escrituras no');
      assert.match(String(enviada?.cabeceras.authorization), /^Bearer /);
      assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-e5');
      assert.equal(enviada?.cabeceras['x-q360-servicio-token'], undefined);
      if (cuerpo !== undefined) assert.deepEqual(JSON.parse(enviada?.cuerpo ?? '{}'), cuerpo);
      assert.equal(totalOtros(), 0, 'no toca otros servicios (sin composición)');
    });

    it(`${nombre} sin token: 401 NO_AUTENTICADO y no se reenvía`, async () => {
      const respuesta = await enviar(app, metodo, ruta, null, cuerpo);
      assert.equal(respuesta.status, 401);
      assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
      assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
    });

    it(`${nombre}: el gateway no autoriza; el 403 de Integraciones llega tal cual [D126]`, async () => {
      const cuerpoError = { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes acceso a este recurso.', traceId: 'x', detalles: [] };
      integraciones.responder(nombre, { estado: 403, cuerpo: cuerpoError });
      const respuesta = await enviar(app, metodo, ruta, await autorizacion(), cuerpo);
      assert.equal(respuesta.status, 403);
      assert.deepEqual(respuesta.body, cuerpoError);
    });
  }
});

describe('Respuestas de Integraciones llegan tal cual', () => {
  it('409, 422 con ErrorArchivo, 404 y 503 LLAVE_CIFRADO_NO_DISPONIBLE se propagan con su cuerpo [E5-B03#2, E5-B04#3, D113, D128]', async () => {
    const casos: Array<[Metodo, string, number, Record<string, unknown>]> = [
      ['post', '/v1/integraciones/jira/consultas', 409, { codigo: 'INTEGRACION_EN_CURSO' }],
      ['post', '/v1/integraciones/archivos/importaciones', 422, { codigo: 'COLUMNAS_FALTANTES', ejecucionId: EJECUCION_ID, columnasFaltantes: ['titulo'] }],
      ['get', `/v1/integraciones/ejecuciones/${EJECUCION_ID}`, 404, { codigo: 'NO_ENCONTRADO' }],
      ['put', '/v1/integraciones/jira/configuracion', 503, { codigo: 'LLAVE_CIFRADO_NO_DISPONIBLE' }],
    ];
    for (const [metodo, ruta, estado, extra] of casos) {
      const cuerpo = { mensaje: 'm', traceId: 'x', detalles: [], ...extra };
      integraciones.responder(`${metodo.toUpperCase()} ${ruta}`, { estado, cuerpo });
      const respuesta = await enviar(app, metodo, ruta, await autorizacion(), {});
      assert.equal(respuesta.status, estado, ruta);
      assert.deepEqual(respuesta.body, cuerpo);
    }
  });

  it('409, 410 y 422 de la consulta llegan con su cuerpo extendido [E5-B05#4, E5-B05#10, E5-B05#12, D134, D139, D148]', async () => {
    const casos: Array<[Metodo, string, number, Record<string, unknown>]> = [
      ['post', '/v1/integraciones/jira/consultas', 409, { codigo: 'CONSULTA_ABIERTA', consulta: { id: CONSULTA_ID, version: 2 } }],
      ['get', `${CONSULTA}/items`, 410, { codigo: 'CONSULTA_VENCIDA' }],
      ['get', CONSULTA, 404, { codigo: 'CONSULTA_NO_ENCONTRADA' }],
      ['post', `${CONSULTA}/continuaciones`, 409, { codigo: 'CONSULTA_COMPLETA' }],
      ['patch', RUTA_EDICION, 409, { codigo: 'CONSULTA_MODIFICADA', version: 5 }],
      ['patch', RUTA_EDICION, 422, { codigo: 'FILA_NO_MARCABLE' }],
      ['post', `${CONSULTA}/confirmaciones`, 409, { codigo: 'ASIGNACIONES_INVALIDAS', filas: [{ id: ITEM_ID, motivo: 'ASIGNACION_INVALIDA' }] }],
      ['post', `${CONSULTA}/confirmaciones`, 422, { codigo: 'SIN_SELECCION' }],
      ['post', `${CONSULTA}/descartes`, 409, { codigo: 'CONSULTA_NO_ABIERTA', estado: 'CONFIRMADA' }],
    ];
    for (const [metodo, ruta, estado, extra] of casos) {
      const cuerpo = { mensaje: 'm', traceId: 'x', detalles: [], ...extra };
      integraciones.responder(`${metodo.toUpperCase()} ${ruta}`, { estado, cuerpo });
      const respuesta = await enviar(app, metodo, ruta, await autorizacion(), metodo === 'get' ? undefined : { version: 4 });
      assert.equal(respuesta.status, estado, `${metodo} ${ruta}`);
      assert.deepEqual(respuesta.body, cuerpo);
    }
  });

  it('detalle y confirmación de una HDU: 404, 409, 410 y 422 llegan con su cuerpo tal cual [E5-B07#14, E5-B05#13, ADR 0018]', async () => {
    const casos: Array<[Metodo, string, number, Record<string, unknown>]> = [
      ['get', RUTA_ITEM, 404, { codigo: 'CONSULTA_NO_ENCONTRADA' }],
      ['get', RUTA_ITEM, 410, { codigo: 'CONSULTA_VENCIDA' }],
      ['get', RUTA_ITEM, 409, { codigo: 'CONSULTA_NO_ABIERTA', estado: 'CONFIRMADA' }],
      ['post', RUTA_CONFIRMACION_FILA, 409, { codigo: 'FILA_MODIFICADA', item: { id: ITEM_ID, revision: 4 } }],
      ['post', RUTA_CONFIRMACION_FILA, 409, { codigo: 'FILA_EN_CURSO' }],
      [
        'post',
        RUTA_CONFIRMACION_FILA,
        409,
        { codigo: 'HDU_YA_ASIGNADA', existente: { idHistoria: HDU_ID, creadaPorEstaConsulta: true, creadaPorActor: { nombre: 'ADM2' } } },
      ],
      ['post', RUTA_CONFIRMACION_FILA, 410, { codigo: 'CONSULTA_VENCIDA' }],
      ['post', RUTA_CONFIRMACION_FILA, 422, { codigo: 'FILA_NO_ASIGNABLE', detalles: [{ campo: 'analistaId', codigo: 'FALTANTE' }] }],
      ['post', RUTA_CONFIRMACION_FILA, 503, { codigo: 'SERVICIO_NO_DISPONIBLE' }],
    ];
    for (const [metodo, ruta, estado, extra] of casos) {
      const cuerpo = { mensaje: 'm', traceId: 'x', detalles: [], ...extra };
      integraciones.responder(`${metodo.toUpperCase()} ${ruta}`, { estado, cuerpo });
      const respuesta = await enviar(app, metodo, ruta, await autorizacion(), metodo === 'get' ? undefined : { revision: 3 });
      assert.equal(respuesta.status, estado, `${metodo} ${ruta} ${String(extra.codigo)}`);
      assert.deepEqual(respuesta.body, cuerpo);
    }
  });

  it('el detalle de una fila no choca con consultas/actual ni con …/items: cada ruta llega a la suya', async () => {
    integraciones.responder('GET /v1/integraciones/jira/consultas/actual', { estado: 200, cuerpo: { de: 'actual' } });
    integraciones.responder(`GET ${RUTA_EDICION}`, { estado: 200, cuerpo: { de: 'items' } });
    integraciones.responder(`GET ${RUTA_ITEM}`, { estado: 200, cuerpo: { de: 'item' } });
    const token = await autorizacion();
    const servidor = app.getHttpServer();
    assert.deepEqual((await request(servidor).get('/v1/integraciones/jira/consultas/actual').set('authorization', token).expect(200)).body, { de: 'actual' });
    assert.deepEqual((await request(servidor).get(RUTA_EDICION).set('authorization', token).expect(200)).body, { de: 'items' });
    assert.deepEqual((await request(servidor).get(RUTA_ITEM).set('authorization', token).expect(200)).body, { de: 'item' });
    assert.deepEqual(
      integraciones.solicitudes.map((s) => s.url),
      ['/v1/integraciones/jira/consultas/actual', RUTA_EDICION, RUTA_ITEM],
    );
    // `actual` en el lugar del id de una fila no es un UUID: 400 y no se reenvía.
    const choque = await request(servidor).get(`/v1/integraciones/jira/consultas/actual/items/${ITEM_ID}`).set('authorization', token);
    assert.equal(choque.status, 400);
    assert.equal(choque.body.codigo, 'VALIDACION');
    assert.equal(integraciones.solicitudes.length, 3);
  });

  it('un id de ejecución o de consulta que no es UUID responde 400 VALIDACION y no llega a Integraciones', async () => {
    const token = await autorizacion();
    for (const [metodo, ruta] of [
      ['get', '/v1/integraciones/ejecuciones/xyz'],
      ['get', '/v1/integraciones/ejecuciones/xyz/detalle'],
      ['get', '/v1/integraciones/ejecuciones/..%2F..%2Finterno%2Facceso'],
      ['get', '/v1/integraciones/jira/consultas/xyz'],
      ['get', '/v1/integraciones/jira/consultas/xyz/items'],
      ['patch', '/v1/integraciones/jira/consultas/xyz/items'],
      ['post', '/v1/integraciones/jira/consultas/..%2F..%2F..%2Finterno%2Fintegraciones/confirmaciones'],
      ['post', '/v1/integraciones/jira/consultas/xyz/continuaciones'],
      ['post', '/v1/integraciones/jira/consultas/xyz/descartes'],
      ['get', `/v1/integraciones/jira/consultas/xyz/items/${ITEM_ID}`],
      ['get', `${CONSULTA}/items/xyz`],
      ['get', `${CONSULTA}/items/..%2F..%2F..%2F..%2Finterno%2Facceso`],
      ['post', `/v1/integraciones/jira/consultas/xyz/items/${ITEM_ID}/confirmaciones`],
      ['post', `${CONSULTA}/items/xyz/confirmaciones`],
      ['post', `${CONSULTA}/items/..%2F..%2Finterno%2Fintegraciones/confirmaciones`],
    ] as const) {
      const respuesta = await enviar(app, metodo, ruta, token, metodo === 'get' ? undefined : {});
      assert.equal(respuesta.status, 400, ruta);
      assert.equal(respuesta.body.codigo, 'VALIDACION', ruta);
    }
    assert.equal(integraciones.solicitudes.length, 0);
  });
});

describe('Rutas no publicadas [D127]', () => {
  it('/v1/interno/integraciones/* y rutas no declaradas bajo /v1/integraciones responden 404 y no llegan a ningún servicio', async () => {
    const token = await autorizacion();
    for (const [metodo, ruta] of [
      ['post', '/v1/interno/integraciones/hdu/upsert'],
      ['post', '/v1/interno/integraciones/destino'],
      ['get', '/v1/integraciones/carga'],
      ['get', '/v1/integraciones/jira'],
      ['delete', '/v1/integraciones/jira/configuracion'],
      ['post', '/v1/integraciones/archivos/plantilla'],
      ['post', '/v1/integraciones/estado'],
      ['post', '/v1/interno/integraciones/hdu/estado-codigos'],
      ['post', '/v1/interno/integraciones/asignaciones/validar'],
      ['put', RUTA_EDICION],
      ['delete', CONSULTA],
      ['get', `${CONSULTA}/confirmaciones`],
    ] as const) {
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('authorization', token).send({});
      assert.equal(respuesta.status, 404, `${metodo} ${ruta}`);
      assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    }
    assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
  });

  it('POST /v1/integraciones/jira/sincronizaciones se retiró: 404 NO_ENCONTRADO y no llega a Integraciones [D132]', async () => {
    integraciones.responder('POST /v1/integraciones/jira/sincronizaciones', { estado: 200, cuerpo: { ok: true } });
    const respuesta = await enviar(app, 'post', '/v1/integraciones/jira/sincronizaciones', await autorizacion(), {
      continuarDesde: 'Q360-100',
    });
    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
    assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
  });

  it('/v1/interno/integraciones/hdu/upsert sin token también responde 404 (no existe), no 401', async () => {
    const respuesta = await request(app.getHttpServer()).post('/v1/interno/integraciones/hdu/upsert').send({});
    assert.equal(respuesta.status, 404);
    assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
  });
});

describe('INTEGRACIONES_URL ausente o inválida: solo esas rutas dan 503 [D127]', () => {
  it('cada una de las 20 operaciones responde 503 SERVICIO_NO_DISPONIBLE sin llamar a nadie; sin token sigue dando 401', async () => {
    const sinIntegraciones = await crearAppPrueba({ organizacionUrl: organizacion.url, integracionesUrl: null });
    try {
      const token = await autorizacion();
      for (const { metodo, ruta, cuerpo } of RUTAS) {
        const respuesta = await enviar(sinIntegraciones, metodo, ruta, token, cuerpo);
        assert.equal(respuesta.status, 503, ruta);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE', ruta);
        assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
        assert.equal(JSON.stringify(respuesta.body).includes('INTEGRACIONES_URL'), false, 'no expone la configuración');

        const sinToken = await enviar(sinIntegraciones, metodo, ruta, null, cuerpo);
        assert.equal(sinToken.status, 401, ruta);
      }
      assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
    } finally {
      await sinIntegraciones.close();
    }
  });

  it('en producción, sin INTEGRACIONES_URL ni IMPEDIMENTOS_URL, el gateway arranca: /health y /v1/me funcionan, Integraciones e Impedimentos dan 503 [D127, D129]', async () => {
    const entorno = { NODE_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', ORGANIZACION_URL: organizacion.url };
    const cargada = cargarConfiguracion(entorno);
    assert.equal(cargada.integracionesUrl, null);
    assert.equal(cargada.impedimentosUrl, null);
    // Se reemplaza solo el verificador, para firmar tokens locales; el resto es lo que arrancaría en la nube.
    const produccion = await crearApp(
      { ...cargada, verificador: configuracionPrueba({ organizacionUrl: organizacion.url }).verificador },
      { registro: false },
    );
    try {
      const token = await autorizacion();
      await request(produccion.getHttpServer()).get('/health').expect(200, { estado: 'ok' });

      organizacion.responder('GET /v1/me', { estado: 200, cuerpo: { id: 'yo' } });
      const yo = await request(produccion.getHttpServer()).get('/v1/me').set('authorization', token);
      assert.equal(yo.status, 200);
      assert.deepEqual(yo.body, { id: 'yo' });

      for (const ruta of ['/v1/integraciones/estado', '/v1/impedimentos']) {
        const respuesta = await request(produccion.getHttpServer()).get(ruta).set('authorization', token);
        assert.equal(respuesta.status, 503, ruta);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE', ruta);
      }
    } finally {
      await produccion.close();
    }
  });

  it('con una URL inválida el gateway arranca y /v1/integraciones/estado da 503', async () => {
    const cargada = cargarConfiguracion({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      ORGANIZACION_URL: organizacion.url,
      INTEGRACIONES_URL: 'no es una url',
    });
    assert.equal(cargada.integracionesUrl, null);
    const invalida = await crearApp(
      { ...cargada, verificador: configuracionPrueba({ organizacionUrl: organizacion.url }).verificador },
      { registro: false },
    );
    try {
      const respuesta = await request(invalida.getHttpServer()).get('/v1/integraciones/estado').set('authorization', await autorizacion());
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    } finally {
      await invalida.close();
    }
  });

  it('si Integraciones no responde: 503 SERVICIO_NO_DISPONIBLE', async () => {
    const caida = await crearAppPrueba({ organizacionUrl: organizacion.url, integracionesUrl: await urlCaida() });
    try {
      for (const [metodo, ruta] of [
        ['get', '/v1/integraciones/estado'],
        ['post', '/v1/integraciones/jira/consultas'],
      ] as const) {
        const respuesta = await enviar(caida, metodo, ruta, await autorizacion(), {});
        assert.equal(respuesta.status, 503, ruta);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      }
    } finally {
      await caida.close();
    }
  });
});

describe('Configuración INTEGRACIONES_URL e INTEGRACIONES_TIMEOUT_MS [D127]', () => {
  it('en desarrollo cae en http://localhost:3004 y el tiempo límite es 12000 ms', () => {
    const configuracion = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321' });
    assert.equal(configuracion.integracionesUrl, 'http://localhost:3004');
    assert.equal(configuracion.tiempoLimiteIntegracionesMs, 12_000);
    assert.deepEqual(configuracion.avisos, []);
  });

  it('respeta los valores dados y quita la barra final', () => {
    const configuracion = cargarConfiguracion({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      INTEGRACIONES_URL: 'https://quality360-integraciones.vercel.app/',
      INTEGRACIONES_TIMEOUT_MS: '15000',
    });
    assert.equal(configuracion.integracionesUrl, 'https://quality360-integraciones.vercel.app');
    assert.equal(configuracion.tiempoLimiteIntegracionesMs, 15_000);
  });

  it('sin la variable en producción, o con un valor inválido, no lanza: null y un aviso que no incluye el valor', () => {
    const produccion = cargarConfiguracion({ SUPABASE_URL: 'https://x.supabase.co', NODE_ENV: 'production', IMPEDIMENTOS_URL: 'https://imp.example' });
    assert.equal(produccion.integracionesUrl, null);
    assert.deepEqual(produccion.avisos, ['INTEGRACIONES_URL no configurada o inválida']);

    for (const invalida of ['ftp://secreto.example', 'no es una url', 'https://']) {
      const configuracion = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', INTEGRACIONES_URL: invalida });
      assert.equal(configuracion.integracionesUrl, null, invalida);
      assert.deepEqual(configuracion.avisos, ['INTEGRACIONES_URL no configurada o inválida']);
    }
  });

  it('LIMITE_TASA_CONSULTA_MAX: 120 por defecto, respeta un valor válido y uno inválido usa 120 con un aviso sin el valor [D152]', () => {
    const base = { SUPABASE_URL: 'http://127.0.0.1:54321' };
    assert.equal(cargarConfiguracion(base).limiteTasa.maximoConsulta, 120);
    assert.equal(cargarConfiguracion({ ...base, LIMITE_TASA_CONSULTA_MAX: '200' }).limiteTasa.maximoConsulta, 200);
    for (const invalido of ['0', '-5', 'abc', '1.5']) {
      const configuracion = cargarConfiguracion({ ...base, LIMITE_TASA_CONSULTA_MAX: invalido });
      assert.equal(configuracion.limiteTasa.maximoConsulta, 120, invalido);
      assert.deepEqual(configuracion.avisos, ['LIMITE_TASA_CONSULTA_MAX inválido: se usa 120']);
    }
    assert.equal(cargarConfiguracion(base).limiteTasa.maximoEscritura, 30, 'el cubo de escritura no cambia');
    assert.equal(cargarConfiguracion(base).limiteTasa.maximo, 300, 'el límite general no cambia');
  });

  it('un INTEGRACIONES_TIMEOUT_MS inválido impide arrancar (no es una URL de servicio)', () => {
    assert.throws(
      () => cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', INTEGRACIONES_TIMEOUT_MS: '0' }),
      (error: unknown) => /INTEGRACIONES_TIMEOUT_MS/.test(String((error as { motivo?: string }).motivo ?? '')),
    );
  });
});

describe('Tiempo límite propio de Integraciones [D115]', () => {
  it('consultar Jira e importar esperan más que el tiempo general de servicio: no se corta antes que Integraciones', async () => {
    const lenta = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      tiempoLimiteServicioMs: 100,
      tiempoLimiteIntegracionesMs: 3000,
    });
    try {
      for (const ruta of ['/v1/integraciones/jira/consultas', '/v1/integraciones/archivos/importaciones']) {
        integraciones.responder(`POST ${ruta}`, { estado: 200, cuerpo: { id: EJECUCION_ID, resultado: 'EXITOSA' }, retrasoMs: 400 });
        const respuesta = await enviar(lenta, 'post', ruta, await autorizacion(), { nombre: 'a.csv', contenido: 'codigo,titulo\n' });
        assert.equal(respuesta.status, 200, ruta);
        assert.equal(respuesta.body.id, EJECUCION_ID);
      }
    } finally {
      await lenta.close();
    }
  });

  it('al vencer INTEGRACIONES_TIMEOUT_MS responde 503 SERVICIO_NO_DISPONIBLE', async () => {
    const corta = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      tiempoLimiteServicioMs: 5000,
      tiempoLimiteIntegracionesMs: 150,
    });
    try {
      integraciones.responder('POST /v1/integraciones/jira/consultas', { estado: 200, cuerpo: {}, retrasoMs: 600 });
      const inicio = Date.now();
      const respuesta = await enviar(corta, 'post', '/v1/integraciones/jira/consultas', await autorizacion(), {});
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.ok(Date.now() - inicio < 2000, 'corta en el tiempo de Integraciones, no en el general');
    } finally {
      await corta.close();
    }
  });
});

describe('Límite de cuerpo de 1,5 MB solo en archivos/* [D127, E5-F03#2]', () => {
  const contenidoDe = (bytes: number): string => 'x'.repeat(bytes);

  for (const ruta of ['/v1/integraciones/archivos/vista-previa', '/v1/integraciones/archivos/importaciones']) {
    it(`${ruta}: un archivo de ~1,2 MB se reenvía completo`, async () => {
      integraciones.responder(`POST ${ruta}`, { estado: 200, cuerpo: { ok: true } });
      const cuerpo = { nombre: 'grande.csv', contenido: contenidoDe(1_200_000) };
      const respuesta = await enviar(app, 'post', ruta, await autorizacion(), cuerpo);
      assert.equal(respuesta.status, 200);
      assert.equal(JSON.parse(integraciones.solicitudes[0]?.cuerpo ?? '{}').contenido.length, 1_200_000);
    });

    it(`${ruta}: más de 1,5 MB responde 413 ARCHIVO_MUY_GRANDE con ErrorArchivo y no llega a Integraciones`, async () => {
      const cuerpo = { nombre: 'enorme.csv', contenido: contenidoDe(LIMITE_CUERPO_ARCHIVOS_BYTES + 1) };
      const respuesta = await request(app.getHttpServer())
        .post(ruta)
        .set('authorization', await autorizacion())
        .set('x-trace-id', 'traza-413')
        .send(cuerpo);
      assert.equal(respuesta.status, 413);
      assert.deepEqual(respuesta.body, {
        codigo: 'ARCHIVO_MUY_GRANDE',
        mensaje: 'El archivo supera el máximo de 1 MB.',
        traceId: 'traza-413',
        detalles: [],
        ejecucionId: null,
        columnasFaltantes: [],
      });
      assert.equal(respuesta.headers['x-trace-id'], 'traza-413');
      assert.equal(integraciones.solicitudes.length, 0);
    });
  }

  it('el resto de las rutas conserva su límite: 200 KB en la configuración o en Organización da 400 VALIDACION', async () => {
    const token = await autorizacion();
    for (const [metodo, ruta] of [
      ['put', '/v1/integraciones/jira/configuracion'],
      ['post', '/v1/integraciones/jira/consultas'],
      ['post', '/v1/hdu'],
    ] as const) {
      const respuesta = await enviar(app, metodo, ruta, token, { relleno: contenidoDe(200_000) });
      assert.equal(respuesta.status, 400, ruta);
      assert.equal(respuesta.body.codigo, 'VALIDACION', ruta);
    }
    assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
  });

  it('un JSON mal formado en archivos/* sigue respondiendo 400 VALIDACION', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/integraciones/archivos/importaciones')
      .set('authorization', await autorizacion())
      .set('content-type', 'application/json')
      .send('{"nombre": ');
    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.equal(integraciones.solicitudes.length, 0);
  });
});

describe('Límite de tasa estricto en las escrituras de E5', () => {
  it('superado el máximo de escrituras responde 429; las lecturas no cuentan', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: { maximoEscritura: 1 },
    });
    try {
      integraciones.responder('POST /v1/integraciones/jira/consultas', { estado: 200, cuerpo: {} });
      integraciones.responder('GET /v1/integraciones/estado', { estado: 200, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 3; i += 1) await request(servidor).get('/v1/integraciones/estado').set('authorization', token).expect(200);
      await request(servidor).post('/v1/integraciones/jira/consultas').set('authorization', token).send({}).expect(200);
      const segunda = await request(servidor).post('/v1/integraciones/archivos/importaciones').set('authorization', token).send({});
      assert.equal(segunda.status, 429);
      assert.equal(segunda.body.codigo, 'DEMASIADAS_SOLICITUDES');
    } finally {
      await limitada.close();
    }
  });
});

describe('Cubo de tasa propio de la edición de la consulta [D152]', () => {
  const cuerpoEdicion = { version: 1, itemIds: [ITEM_ID], asignacion: { celulaId: CELULA_ID } };

  it('con los valores por defecto (escritura 30, consulta 120), 31 PATCH seguidos no dan 429 y no gastan el cubo de escritura', async () => {
    const porDefecto = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321' }).limiteTasa;
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: porDefecto,
    });
    try {
      integraciones.responder(`PATCH ${RUTA_EDICION}`, { estado: 200, cuerpo: { ok: true } });
      integraciones.responder('POST /v1/integraciones/jira/consultas', { estado: 201, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 31; i += 1) {
        const respuesta = await request(servidor).patch(RUTA_EDICION).set('authorization', token).send(cuerpoEdicion);
        assert.equal(respuesta.status, 200, `PATCH n.º ${i + 1}`);
      }
      // El cubo de escritura sigue intacto: otra escritura pasa.
      await request(servidor).post('/v1/integraciones/jira/consultas').set('authorization', token).send({}).expect(201);
      assert.equal(integraciones.solicitudes.filter((s) => s.metodo === 'PATCH').length, 31);
    } finally {
      await limitada.close();
    }
  });

  it('superado LIMITE_TASA_CONSULTA_MAX el PATCH responde 429 con Retry-After y no se reenvía; las demás escrituras siguen', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: { maximoEscritura: 2, maximoConsulta: 2 },
    });
    try {
      integraciones.responder(`PATCH ${RUTA_EDICION}`, { estado: 200, cuerpo: {} });
      integraciones.responder(`POST ${CONSULTA}/confirmaciones`, { estado: 200, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 2; i += 1) await request(servidor).patch(RUTA_EDICION).set('authorization', token).send(cuerpoEdicion).expect(200);
      const tercera = await request(servidor).patch(RUTA_EDICION).set('authorization', token).send(cuerpoEdicion);
      assert.equal(tercera.status, 429);
      assert.equal(tercera.body.codigo, 'DEMASIADAS_SOLICITUDES');
      assert.ok(Number(tercera.headers['retry-after']) >= 1);
      assert.equal(integraciones.solicitudes.filter((s) => s.metodo === 'PATCH').length, 2);

      await request(servidor).post(`${CONSULTA}/confirmaciones`).set('authorization', token).send({ version: 1 }).expect(200);
      await request(servidor).post(`${CONSULTA}/confirmaciones`).set('authorization', token).send({ version: 1 }).expect(200);
      const escritura = await request(servidor).post(`${CONSULTA}/confirmaciones`).set('authorization', token).send({ version: 1 });
      assert.equal(escritura.status, 429, 'el cubo de escritura cuenta aparte');
    } finally {
      await limitada.close();
    }
  });

  it('la confirmación de una HDU usa el cubo de la consulta: 31 seguidas no dan 429 ni gastan el de escritura [D202 g, E5-B07#14]', async () => {
    const porDefecto = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321' }).limiteTasa;
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: porDefecto,
    });
    try {
      integraciones.responder(`POST ${RUTA_CONFIRMACION_FILA}`, { estado: 200, cuerpo: { resultado: 'CREADA' } });
      integraciones.responder('POST /v1/integraciones/jira/consultas', { estado: 201, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 31; i += 1) {
        const respuesta = await request(servidor).post(RUTA_CONFIRMACION_FILA).set('authorization', token).send({ revision: 1 });
        assert.equal(respuesta.status, 200, `confirmación n.º ${i + 1}`);
      }
      await request(servidor).post('/v1/integraciones/jira/consultas').set('authorization', token).send({}).expect(201);
    } finally {
      await limitada.close();
    }
  });

  it('superado LIMITE_TASA_CONSULTA_MAX, PATCH y confirmación de una HDU comparten el cubo: la tercera da 429 y no se reenvía', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: { maximoEscritura: 1, maximoConsulta: 2 },
    });
    try {
      integraciones.responder(`PATCH ${RUTA_EDICION}`, { estado: 200, cuerpo: {} });
      integraciones.responder(`POST ${RUTA_CONFIRMACION_FILA}`, { estado: 200, cuerpo: {} });
      integraciones.responder(`POST ${CONSULTA}/confirmaciones`, { estado: 200, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      await request(servidor).patch(RUTA_EDICION).set('authorization', token).send(cuerpoEdicion).expect(200);
      await request(servidor).post(RUTA_CONFIRMACION_FILA).set('authorization', token).send({ revision: 1 }).expect(200);
      const tercera = await request(servidor).post(RUTA_CONFIRMACION_FILA).set('authorization', token).send({ revision: 1 });
      assert.equal(tercera.status, 429);
      assert.equal(tercera.body.codigo, 'DEMASIADAS_SOLICITUDES');
      assert.ok(Number(tercera.headers['retry-after']) >= 1);
      assert.equal(integraciones.solicitudes.filter((s) => s.url === RUTA_CONFIRMACION_FILA).length, 1);
      // El lote sigue en el cubo de escritura, que estaba intacto.
      await request(servidor).post(`${CONSULTA}/confirmaciones`).set('authorization', token).send({ version: 1 }).expect(200);
    } finally {
      await limitada.close();
    }
  });

  it('el GET de las filas no consume el cubo de la edición', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: { maximoConsulta: 1 },
    });
    try {
      integraciones.responder(`GET ${RUTA_EDICION}`, { estado: 200, cuerpo: { items: [] } });
      integraciones.responder(`PATCH ${RUTA_EDICION}`, { estado: 200, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 3; i += 1) await request(servidor).get(RUTA_EDICION).set('authorization', token).expect(200);
      await request(servidor).patch(RUTA_EDICION).set('authorization', token).send(cuerpoEdicion).expect(200);
    } finally {
      await limitada.close();
    }
  });
});

describe('Cambios aditivos de E5 en rutas de Organización', () => {
  it('GET /v1/catalogos/sprints propaga ?celulaId y devuelve celulaId en cada sprint [E5-F01#1, D120]', async () => {
    const cuerpo = [{ id: HDU_ID, nombre: 'E5 Sprint 1', celulaId: CELULA_ID }];
    organizacion.responder('GET /v1/catalogos/sprints', { estado: 200, cuerpo });
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/catalogos/sprints?celulaId=${CELULA_ID}`)
      .set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, cuerpo);
    assert.equal(organizacion.solicitudes[0]?.url, `/v1/catalogos/sprints?celulaId=${CELULA_ID}`);
    assert.equal(integraciones.solicitudes.length, 0);
  });

  it('GET /v1/hdu/{id} conserva descripcion, origen, claveExterna y urlExterna junto al checklist [E5-F02#1, E5-B02#1, D108, D124]', async () => {
    const detalle = {
      id: HDU_ID,
      codigo: 'Q360-7',
      descripcion: 'Texto plano desde Jira',
      origen: 'JIRA',
      claveExterna: 'Q360-7',
      urlExterna: 'https://equipo.atlassian.net/browse/Q360-7',
    };
    organizacion.responder(`GET /v1/hdu/${HDU_ID}`, { estado: 200, cuerpo: detalle });
    certificaciones.responder(`GET /v1/hdu/${HDU_ID}/checklist`, { estado: 200, cuerpo: { items: [] } });
    const respuesta = await request(app.getHttpServer()).get(`/v1/hdu/${HDU_ID}`).set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    for (const [campo, valor] of Object.entries(detalle)) assert.equal(respuesta.body[campo], valor, campo);
    assert.ok('checklist' in respuesta.body);
    assert.equal(integraciones.solicitudes.length, 0, 'el detalle no consulta Integraciones');
  });

  it('una HDU manual llega con origen MANUAL y los campos externos en null', async () => {
    const detalle = { id: HDU_ID, descripcion: null, origen: 'MANUAL', claveExterna: null, urlExterna: null };
    organizacion.responder(`GET /v1/hdu/${HDU_ID}`, { estado: 200, cuerpo: detalle });
    const respuesta = await request(app.getHttpServer()).get(`/v1/hdu/${HDU_ID}`).set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.origen, 'MANUAL');
    assert.equal(respuesta.body.claveExterna, null);
    assert.equal(respuesta.body.urlExterna, null);
    assert.equal(respuesta.body.descripcion, null);
  });
});
