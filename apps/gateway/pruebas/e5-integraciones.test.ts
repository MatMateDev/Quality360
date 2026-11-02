/**
 * Rutas de E5 en el gateway (G1, D127): reenvío explícito de las 10 rutas de
 * `/v1/integraciones/*` a Integraciones (`INTEGRACIONES_URL`), 503 solo en esas
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

type Metodo = 'get' | 'post' | 'put';

interface Ruta {
  metodo: Metodo;
  ruta: string;
  ids: string;
  cuerpo?: Record<string, unknown>;
  /** Estado que responde Integraciones en el caso feliz. */
  estado?: number;
}

/** Las 11 operaciones de las 10 rutas de E5 (integraciones.v1.yaml). */
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
  { metodo: 'post', ruta: '/v1/integraciones/jira/sincronizaciones', ids: 'E5-F02#1, E5-B02#1, E5-B04#1', cuerpo: { continuarDesde: 'Q360-100' }, estado: 200 },
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

describe('Reenvío de las 10 rutas de E5 a Integraciones [D127]', () => {
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
      ['post', '/v1/integraciones/jira/sincronizaciones', 409, { codigo: 'INTEGRACION_EN_CURSO' }],
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

  it('un id de ejecución que no es UUID responde 400 VALIDACION y no llega a Integraciones', async () => {
    const token = await autorizacion();
    for (const ruta of [
      '/v1/integraciones/ejecuciones/xyz',
      '/v1/integraciones/ejecuciones/xyz/detalle',
      '/v1/integraciones/ejecuciones/..%2F..%2Finterno%2Facceso',
    ]) {
      const respuesta = await enviar(app, 'get', ruta, token);
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
    ] as const) {
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('authorization', token).send({});
      assert.equal(respuesta.status, 404, `${metodo} ${ruta}`);
      assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    }
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
  it('cada una de las 11 operaciones responde 503 SERVICIO_NO_DISPONIBLE sin llamar a nadie; sin token sigue dando 401', async () => {
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
        ['post', '/v1/integraciones/jira/sincronizaciones'],
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

  it('un INTEGRACIONES_TIMEOUT_MS inválido impide arrancar (no es una URL de servicio)', () => {
    assert.throws(
      () => cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', INTEGRACIONES_TIMEOUT_MS: '0' }),
      (error: unknown) => /INTEGRACIONES_TIMEOUT_MS/.test(String((error as { motivo?: string }).motivo ?? '')),
    );
  });
});

describe('Tiempo límite propio de Integraciones [D115]', () => {
  it('sincronizar e importar esperan más que el tiempo general de servicio: no se corta antes que Integraciones', async () => {
    const lenta = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      tiempoLimiteServicioMs: 100,
      tiempoLimiteIntegracionesMs: 3000,
    });
    try {
      for (const ruta of ['/v1/integraciones/jira/sincronizaciones', '/v1/integraciones/archivos/importaciones']) {
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
      integraciones.responder('POST /v1/integraciones/jira/sincronizaciones', { estado: 200, cuerpo: {}, retrasoMs: 600 });
      const inicio = Date.now();
      const respuesta = await enviar(corta, 'post', '/v1/integraciones/jira/sincronizaciones', await autorizacion(), {});
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
      ['post', '/v1/integraciones/jira/sincronizaciones'],
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
      integraciones.responder('POST /v1/integraciones/jira/sincronizaciones', { estado: 200, cuerpo: {} });
      integraciones.responder('GET /v1/integraciones/estado', { estado: 200, cuerpo: {} });
      const token = await autorizacion();
      const servidor = limitada.getHttpServer();
      for (let i = 0; i < 3; i += 1) await request(servidor).get('/v1/integraciones/estado').set('authorization', token).expect(200);
      await request(servidor).post('/v1/integraciones/jira/sincronizaciones').set('authorization', token).send({}).expect(200);
      const segunda = await request(servidor).post('/v1/integraciones/archivos/importaciones').set('authorization', token).send({});
      assert.equal(segunda.status, 429);
      assert.equal(segunda.body.codigo, 'DEMASIADAS_SOLICITUDES');
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
