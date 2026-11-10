/**
 * Rutas de E6 en el gateway (G1, D178 y D179): reenvío explícito de las 11
 * rutas (12 operaciones) de `/v1/indicadores/*` y del cron a Indicadores
 * (`INDICADORES_URL`), cron público que reenvía `Authorization` tal cual y usa
 * el cubo de escritura, exportación CSV y PDF en bytes, 503 solo en esas rutas
 * si la URL falta o es inválida, cuerpo de 4 KB, tiempo límite de 25 s y rutas
 * internas no publicadas.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';
import { LIMITE_CUERPO_INDICADORES_BYTES } from '../src/middlewares/cuerpo.js';
import {
  autorizacion,
  configuracionPrueba,
  crearAppPrueba,
  iniciarServidorFalso,
  urlCaida,
  type ServidorFalso,
} from './ayudas-gateway.js';

let organizacion: ServidorFalso;
let indicadores: ServidorFalso;
let app: NestExpressApplication;

const CELULA_ID = '3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607';
const CRON = '/v1/cron/indicadores/snapshot';
const SECRETO_CRON = 'Bearer secreto-de-cron-de-prueba-0123456789abcdef';

type Metodo = 'get' | 'post' | 'put';

interface Ruta {
  metodo: Metodo;
  ruta: string;
  roles: string;
  ids: string;
  cuerpo?: Record<string, unknown>;
}

/** Las 12 operaciones de las 11 rutas de `/v1/indicadores/*` (indicadores.v1.yaml), con su `x-roles`. */
const RUTAS: Ruta[] = [
  { metodo: 'get', ruta: '/v1/indicadores/filtros', roles: 'QE, LIDER_QA, AUDITOR', ids: 'E6-F01#2' },
  {
    metodo: 'get',
    ruta: '/v1/indicadores/cumplimiento',
    roles: 'QE, LIDER_QA, AUDITOR',
    ids: 'E6-F01#1, E6-F01#2, E6-F01#3, E6-B01#1, E6-B01#2, E6-B01#3, E6-B05#3',
  },
  { metodo: 'get', ruta: '/v1/indicadores/semaforo', roles: 'QE, LIDER_QA, AUDITOR', ids: 'E6-F02#1, E6-F02#3, E6-B02#1' },
  { metodo: 'get', ruta: `/v1/indicadores/semaforo/${CELULA_ID}/hdu`, roles: 'QE, LIDER_QA, AUDITOR', ids: 'E6-F02#2, E6-B02#1' },
  { metodo: 'get', ruta: '/v1/indicadores/carga', roles: 'QE, LIDER_QA, AUDITOR', ids: 'E6-F03#1, E6-F03#2, E6-F03#3, E6-B02#2, E6-B02#3' },
  { metodo: 'get', ruta: '/v1/indicadores/umbral-carga', roles: 'QE, LIDER_QA, AUDITOR', ids: 'E6-F03#2, E6-B02#3' },
  { metodo: 'put', ruta: '/v1/indicadores/umbral-carga', roles: 'QE', ids: 'E6-F03#2, E6-B02#3', cuerpo: { valor: 7 } },
  { metodo: 'get', ruta: '/v1/indicadores/umbral-carga/historial', roles: 'QE, AUDITOR', ids: 'E6-B02#3' },
  { metodo: 'get', ruta: '/v1/indicadores/tendencia', roles: 'QE, LIDER_QA, AUDITOR', ids: 'E6-F04#1, E6-F04#3, E6-B03#3' },
  {
    metodo: 'get',
    ruta: '/v1/indicadores/exportacion',
    roles: 'QE, LIDER_QA, AUDITOR',
    ids: 'E6-F04#2, E6-B04#1, E6-B04#2, E6-B04#3',
  },
  { metodo: 'post', ruta: '/v1/indicadores/snapshots', roles: 'ADMINISTRADOR', ids: 'E6-B03#1, E6-B03#2' },
  { metodo: 'get', ruta: '/v1/indicadores/snapshots/ejecuciones', roles: 'ADMINISTRADOR', ids: 'E6-B03#1' },
];

before(async () => {
  organizacion = await iniciarServidorFalso();
  indicadores = await iniciarServidorFalso();
  app = await crearAppPrueba({
    organizacionUrl: organizacion.url,
    certificacionesUrl: organizacion.url,
    impedimentosUrl: organizacion.url,
    integracionesUrl: organizacion.url,
    indicadoresUrl: indicadores.url,
  });
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
  await indicadores.cerrar();
});

beforeEach(() => {
  organizacion.solicitudes.length = 0;
  indicadores.solicitudes.length = 0;
});

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

async function appCon(opciones: Parameters<typeof crearAppPrueba>[0]): Promise<NestExpressApplication> {
  return crearAppPrueba(opciones);
}

describe('Reenvío de las 12 operaciones de /v1/indicadores/* a Indicadores [D179]', () => {
  it('la lista cubre 11 rutas y 12 operaciones', () => {
    assert.equal(RUTAS.length, 12);
    assert.equal(new Set(RUTAS.map(({ ruta }) => ruta)).size, 11);
  });

  for (const { metodo, ruta, roles, ids, cuerpo } of RUTAS) {
    const nombre = `${metodo.toUpperCase()} ${ruta}`;

    it(`${nombre} (x-roles: ${roles}) llega a Indicadores con sesión, traza${cuerpo ? ' y cuerpo' : ' y query'} [${ids}]`, async () => {
      indicadores.responder(`${metodo.toUpperCase()} ${ruta}`, { estado: 200, cuerpo: { ok: ruta } });
      const consulta = metodo === 'get' ? `?celulaId=${CELULA_ID}&sprintId=SIN_SPRINT&pagina=2` : '?ignorada=1';
      let solicitud = request(app.getHttpServer())
        [metodo](`${ruta}${consulta}`)
        .set('authorization', await autorizacion())
        .set('x-trace-id', 'traza-e6')
        .set('x-q360-servicio-token', 'intento-de-suplantar');
      if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
      const respuesta = await solicitud;

      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.body, { ok: ruta });
      assert.equal(indicadores.solicitudes.length, 1);
      const enviada = indicadores.solicitudes[0];
      assert.equal(enviada?.metodo, metodo.toUpperCase());
      assert.equal(enviada?.url, metodo === 'get' ? `${ruta}${consulta}` : ruta, 'las lecturas propagan la query; las escrituras no');
      assert.match(String(enviada?.cabeceras.authorization), /^Bearer ey/);
      assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-e6');
      assert.equal(enviada?.cabeceras['x-q360-servicio-token'], undefined, 'la credencial de servicio se descarta (D126, D177)');
      if (cuerpo !== undefined) assert.deepEqual(JSON.parse(enviada?.cuerpo ?? '{}'), cuerpo);
      assert.equal(organizacion.solicitudes.length, 0, 'sin composición: no toca a Organización');
    });

    it(`${nombre} sin token: 401 NO_AUTENTICADO y no se reenvía`, async () => {
      const respuesta = await enviar(app, metodo, ruta, null, cuerpo);
      assert.equal(respuesta.status, 401);
      assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
      assert.equal(indicadores.solicitudes.length + organizacion.solicitudes.length, 0);
    });

    it(`${nombre} con token vencido: 401 SESION_EXPIRADA y no se reenvía`, async () => {
      const respuesta = await enviar(app, metodo, ruta, await autorizacion({ vigenciaSegundos: -120 }), cuerpo);
      assert.equal(respuesta.status, 401);
      assert.equal(respuesta.body.codigo, 'SESION_EXPIRADA');
      assert.equal(indicadores.solicitudes.length, 0);
    });

    it(`${nombre}: el gateway no autoriza; el 403 de Indicadores (rol fuera de x-roles) llega tal cual [D4, D126]`, async () => {
      const cuerpoError = { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes acceso a este recurso.', traceId: 'x', detalles: [] };
      indicadores.responder(nombre, { estado: 403, cuerpo: cuerpoError });
      const respuesta = await enviar(app, metodo, ruta, await autorizacion(), cuerpo);
      assert.equal(respuesta.status, 403);
      assert.deepEqual(respuesta.body, cuerpoError);
    });
  }

  it('drill-down con un celulaId que no es UUID: 400 VALIDACION sin llamar a Indicadores [E6-B02#1]', async () => {
    for (const ruta of ['/v1/indicadores/semaforo/no-es-uuid/hdu', '/v1/indicadores/semaforo/..%2F..%2Finterno%2Facceso/hdu']) {
      const respuesta = await request(app.getHttpServer()).get(ruta).set('authorization', await autorizacion());
      assert.equal(respuesta.status, 400, ruta);
      assert.equal(respuesta.body.codigo, 'VALIDACION');
    }
    assert.equal(indicadores.solicitudes.length, 0);
  });
});

describe('Respuestas de Indicadores llegan tal cual [D183, D186, D187]', () => {
  it('400 VALOR_FUERA_DE_RANGO, 404, 409 EJECUCION_EN_CURSO, 422 EXPORTACION_EXCEDE_LIMITE y 503 INDICADORES_NO_DISPONIBLES [E6-B02#3, E6-B03#2, E6-B04#2, E6-B04#3]', async () => {
    const casos: Array<[Metodo, string, number, Record<string, unknown>]> = [
      ['put', '/v1/indicadores/umbral-carga', 400, { codigo: 'VALOR_FUERA_DE_RANGO', detalles: [{ campo: 'valor' }] }],
      ['get', `/v1/indicadores/semaforo/${CELULA_ID}/hdu`, 404, { codigo: 'NO_ENCONTRADO' }],
      ['post', '/v1/indicadores/snapshots', 409, { codigo: 'EJECUCION_EN_CURSO' }],
      ['get', '/v1/indicadores/exportacion', 422, { codigo: 'EXPORTACION_EXCEDE_LIMITE' }],
      ['get', '/v1/indicadores/exportacion', 503, { codigo: 'INDICADORES_NO_DISPONIBLES' }],
    ];
    for (const [metodo, ruta, estado, extra] of casos) {
      const cuerpo = { mensaje: 'm', traceId: 'x', detalles: [], ...extra };
      indicadores.responder(`${metodo.toUpperCase()} ${ruta}`, { estado, cuerpo });
      const respuesta = await enviar(app, metodo, ruta, await autorizacion(), metodo === 'put' ? { valor: 99 } : undefined);
      assert.equal(respuesta.status, estado, `${ruta} ${estado}`);
      assert.deepEqual(respuesta.body, cuerpo);
    }
  });

  it('bloques indisponibles con valor null llegan sin convertirse en 0 [E6-B01#3, D187]', async () => {
    const cuerpo = {
      generadoEn: '2026-11-04T12:00:00Z',
      sinDatos: null,
      indicadores: { avance: { estado: 'indisponible', valor: null } },
    };
    indicadores.responder('GET /v1/indicadores/cumplimiento', { estado: 200, cuerpo });
    const respuesta = await request(app.getHttpServer()).get('/v1/indicadores/cumplimiento').set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, cuerpo);
  });
});

describe('Exportación en bytes [D186, E6-B04#1]', () => {
  it('el CSV llega con BOM, separador ;, Content-Type, Content-Disposition y X-Q360-Filas [E6-B04#1, E6-F04#2]', async () => {
    const csv = '﻿Reporte;Quality360 · Indicadores\r\nIndicador;Valor\r\nAvance;50\r\n';
    const disposicion = 'attachment; filename="quality360-indicadores-cumplimiento-20261104.csv"';
    indicadores.responder('GET /v1/indicadores/exportacion', {
      estado: 200,
      texto: csv,
      tipoContenido: 'text/csv; charset=utf-8',
      cabeceras: { 'content-disposition': disposicion, 'x-q360-filas': '1' },
    });
    const respuesta = await request(app.getHttpServer())
      .get('/v1/indicadores/exportacion?vista=cumplimiento&formato=csv')
      .set('authorization', await autorizacion())
      .buffer(true)
      .parse((res, fin) => {
        const trozos: Buffer[] = [];
        res.on('data', (trozo: Buffer) => trozos.push(trozo));
        res.on('end', () => fin(null, Buffer.concat(trozos)));
      });

    assert.equal(respuesta.status, 200);
    assert.match(String(respuesta.headers['content-type']), /^text\/csv/);
    assert.equal(respuesta.headers['content-disposition'], disposicion);
    assert.equal(respuesta.headers['x-q360-filas'], '1');
    assert.equal((respuesta.body as Buffer).toString('utf8'), csv, 'conserva el BOM y el CRLF');
    assert.equal(indicadores.solicitudes[0]?.url, '/v1/indicadores/exportacion?vista=cumplimiento&formato=csv');
  });

  it('CORS expone Content-Disposition y X-Q360-Filas al origen del portal [E6-F04#2]', async () => {
    indicadores.responder('GET /v1/indicadores/exportacion', {
      estado: 200,
      texto: 'a;b\r\n',
      tipoContenido: 'text/csv; charset=utf-8',
      cabeceras: { 'content-disposition': 'attachment; filename="x.csv"', 'x-q360-filas': '0' },
    });
    const respuesta = await request(app.getHttpServer())
      .get('/v1/indicadores/exportacion?vista=carga&formato=csv')
      .set('origin', 'http://localhost:5173')
      .set('authorization', await autorizacion());
    assert.equal(respuesta.status, 200);
    const expuestas = String(respuesta.headers['access-control-expose-headers']).toLowerCase().split(',').map((c) => c.trim());
    assert.ok(expuestas.includes('content-disposition'));
    assert.ok(expuestas.includes('x-q360-filas'));
  });

  it('el PDF llega en bytes, sin pasar por JSON [E6-B04#1, E6-F04#2]', async () => {
    // Bytes no UTF-8 válidos: si el gateway los convirtiera a texto, se corromperían.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x81, 0x0a]), Buffer.from('%%EOF\n')]);
    const disposicion = 'attachment; filename="quality360-indicadores-semaforo-20261104.pdf"';
    const falso = await iniciarServidorPdf(pdf, disposicion);
    const conPdf = await appCon({ organizacionUrl: organizacion.url, indicadoresUrl: falso.url });
    try {
      const respuesta = await request(conPdf.getHttpServer())
        .get('/v1/indicadores/exportacion?vista=semaforo&formato=pdf')
        .set('authorization', await autorizacion())
        .buffer(true)
        .parse((res, fin) => {
          const trozos: Buffer[] = [];
          res.on('data', (trozo: Buffer) => trozos.push(trozo));
          res.on('end', () => fin(null, Buffer.concat(trozos)));
        });
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.headers['content-type'], 'application/pdf');
      assert.equal(respuesta.headers['content-disposition'], disposicion);
      assert.equal(respuesta.headers['x-q360-filas'], '3');
      assert.equal(Buffer.compare(respuesta.body as Buffer, pdf), 0, 'los bytes llegan idénticos');
    } finally {
      await conPdf.close();
      await falso.cerrar();
    }
  });
});

describe('Cron público del snapshot [D178, E6-B03#1]', () => {
  it('sin sesión ni Authorization llega a Indicadores sin cabecera, y su 401 vuelve tal cual [E6-B03#1]', async () => {
    const cuerpoError = { codigo: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión.', traceId: 'x', detalles: [] };
    indicadores.responder(`GET ${CRON}`, { estado: 401, cuerpo: cuerpoError });
    const respuesta = await request(app.getHttpServer()).get(CRON);
    assert.equal(respuesta.status, 401);
    assert.deepEqual(respuesta.body, cuerpoError);
    assert.equal(indicadores.solicitudes.length, 1, 'el gateway no lo rechaza: decide Indicadores');
    assert.equal(indicadores.solicitudes[0]?.cabeceras.authorization, undefined);
  });

  it('reenvía Authorization tal cual, sin verificarla como sesión, y devuelve la ejecución [E6-B03#1, E6-B03#2]', async () => {
    const ejecucion = { id: 'e1', origen: 'CRON', resultado: 'EXITOSA', actor: { nombre: 'SISTEMA' } };
    indicadores.responder(`GET ${CRON}`, { estado: 200, cuerpo: ejecucion });
    const respuesta = await request(app.getHttpServer())
      .get(`${CRON}?x=1`)
      .set('authorization', SECRETO_CRON)
      .set('x-trace-id', 'traza-cron')
      .set('x-q360-servicio-token', 'intento');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, ejecucion);
    const enviada = indicadores.solicitudes[0];
    assert.equal(enviada?.url, CRON, 'sin query');
    assert.equal(enviada?.cabeceras.authorization, SECRETO_CRON, 'el secreto viaja intacto');
    assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-cron');
    assert.equal(enviada?.cabeceras['x-q360-servicio-token'], undefined);
  });

  it('un JWT de sesión también se reenvía tal cual: Indicadores responde 401 (D178)', async () => {
    const token = await autorizacion();
    indicadores.responder(`GET ${CRON}`, { estado: 401, cuerpo: { codigo: 'NO_AUTENTICADO', mensaje: 'm', traceId: 'x', detalles: [] } });
    const respuesta = await request(app.getHttpServer()).get(CRON).set('authorization', token);
    assert.equal(respuesta.status, 401);
    assert.equal(indicadores.solicitudes[0]?.cabeceras.authorization, token);
  });

  it('el 409 EJECUCION_EN_CURSO del cron llega tal cual [E6-B03#2]', async () => {
    indicadores.responder(`GET ${CRON}`, { estado: 409, cuerpo: { codigo: 'EJECUCION_EN_CURSO', mensaje: 'm', traceId: 'x', detalles: [] } });
    const respuesta = await request(app.getHttpServer()).get(CRON).set('authorization', SECRETO_CRON);
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'EJECUCION_EN_CURSO');
  });

  it('usa el cubo de escritura: superado el máximo, 429 sin llegar a Indicadores; las lecturas siguen', async () => {
    const limitada = await appCon({ organizacionUrl: organizacion.url, indicadoresUrl: indicadores.url, limiteTasa: { maximoEscritura: 2 } });
    try {
      indicadores.responder(`GET ${CRON}`, { estado: 401, cuerpo: { codigo: 'NO_AUTENTICADO' } });
      indicadores.responder('GET /v1/indicadores/filtros', { estado: 200, cuerpo: { ok: true } });
      await request(limitada.getHttpServer()).get(CRON).expect(401);
      await request(limitada.getHttpServer()).get(CRON).expect(401);
      const tercera = await request(limitada.getHttpServer()).get(CRON);
      assert.equal(tercera.status, 429);
      assert.equal(tercera.body.codigo, 'DEMASIADAS_SOLICITUDES');
      assert.ok(tercera.headers['retry-after']);
      assert.equal(indicadores.solicitudes.filter(({ url }) => url === CRON).length, 2);

      // Un GET autenticado de indicadores no consume ese cubo.
      const lectura = await request(limitada.getHttpServer()).get('/v1/indicadores/filtros').set('authorization', await autorizacion());
      assert.equal(lectura.status, 200);
    } finally {
      await limitada.close();
    }
  });
});

describe('Rutas internas no publicadas [D126, D177, D184]', () => {
  for (const [metodo, ruta] of [
    ['get', '/v1/interno/indicadores/ambito'],
    ['get', '/v1/interno/indicadores/snapshot'],
    ['post', '/v1/interno/carga/snapshots'],
    ['get', '/v1/indicadores/no-existe'],
    ['delete', '/v1/indicadores/umbral-carga'],
    ['post', '/v1/cron/indicadores/snapshot'],
  ] as const) {
    it(`${metodo.toUpperCase()} ${ruta}: 404 con o sin sesión, sin llegar a ningún servicio`, async () => {
      for (const token of [null, await autorizacion()]) {
        let solicitud = request(app.getHttpServer())[metodo](ruta).set('x-q360-servicio-token', 'intento');
        if (token !== null) solicitud = solicitud.set('authorization', token);
        const respuesta = await solicitud;
        assert.equal(respuesta.status, 404, `${ruta} ${token === null ? 'sin' : 'con'} sesión`);
      }
      assert.equal(indicadores.solicitudes.length + organizacion.solicitudes.length, 0);
    });
  }
});

describe('Límite de cuerpo en /v1/indicadores/* (4 KB)', () => {
  it('un cuerpo mayor a 4 KB en PUT umbral-carga da 400 VALIDACION sin llegar a Indicadores', async () => {
    const respuesta = await request(app.getHttpServer())
      .put('/v1/indicadores/umbral-carga')
      .set('authorization', await autorizacion())
      .send({ valor: 5, relleno: 'x'.repeat(LIMITE_CUERPO_INDICADORES_BYTES) });
    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.equal(indicadores.solicitudes.length, 0);
  });

  it('JSON mal formado da 400 VALIDACION sin llegar a Indicadores', async () => {
    const respuesta = await request(app.getHttpServer())
      .put('/v1/indicadores/umbral-carga')
      .set('authorization', await autorizacion())
      .set('content-type', 'application/json')
      .send('{"valor":');
    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.equal(indicadores.solicitudes.length, 0);
  });

  it('el resto del gateway conserva su límite: 10 KB siguen llegando a Organización', async () => {
    organizacion.responder('POST /v1/usuarios', { estado: 201, cuerpo: { ok: true } });
    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', await autorizacion())
      .send({ relleno: 'x'.repeat(10_000) });
    assert.equal(respuesta.status, 201);
  });
});

describe('INDICADORES_URL opcional y no fatal [D179]', () => {
  it('sin INDICADORES_URL: las 12 operaciones y el cron dan 503 SERVICIO_NO_DISPONIBLE sin llamar a nadie; sin token, 401', async () => {
    const sinIndicadores = await appCon({ organizacionUrl: organizacion.url, indicadoresUrl: null });
    try {
      const token = await autorizacion();
      for (const { metodo, ruta, cuerpo } of RUTAS) {
        const respuesta = await enviar(sinIndicadores, metodo, ruta, token, cuerpo);
        assert.equal(respuesta.status, 503, ruta);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE', ruta);
        assert.equal(respuesta.body.traceId, respuesta.headers['x-trace-id']);
        assert.equal(JSON.stringify(respuesta.body).includes('INDICADORES_URL'), false, 'no expone la configuración');
        const sinToken = await enviar(sinIndicadores, metodo, ruta, null, cuerpo);
        assert.equal(sinToken.status, 401, ruta);
      }
      const cron = await request(sinIndicadores.getHttpServer()).get(CRON).set('authorization', SECRETO_CRON);
      assert.equal(cron.status, 503);
      assert.equal(cron.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.equal(indicadores.solicitudes.length + organizacion.solicitudes.length, 0);
    } finally {
      await sinIndicadores.close();
    }
  });

  it('en producción sin INDICADORES_URL el gateway arranca: /health y /v1/me funcionan y /v1/indicadores/cumplimiento da 503', async () => {
    const entorno = {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://x.supabase.co',
      ORGANIZACION_URL: organizacion.url,
      IMPEDIMENTOS_URL: organizacion.url,
      INTEGRACIONES_URL: organizacion.url,
    };
    const cargada = cargarConfiguracion(entorno);
    assert.equal(cargada.indicadoresUrl, null);
    assert.deepEqual(cargada.avisos, ['INDICADORES_URL no configurada o inválida'], 'un solo aviso, sin el valor');
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

      const cumplimiento = await request(produccion.getHttpServer()).get('/v1/indicadores/cumplimiento').set('authorization', token);
      assert.equal(cumplimiento.status, 503);
      assert.equal(cumplimiento.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      const sinSesion = await request(produccion.getHttpServer()).get('/v1/indicadores/cumplimiento');
      assert.equal(sinSesion.status, 401);
    } finally {
      await produccion.close();
    }
  });

  it('con una URL inválida no lanza en ningún entorno: null y aviso sin el valor', () => {
    for (const NODE_ENV of ['production', 'development']) {
      const cargada = cargarConfiguracion({
        NODE_ENV,
        SUPABASE_URL: 'http://127.0.0.1:54321',
        IMPEDIMENTOS_URL: 'http://localhost:3003',
        INTEGRACIONES_URL: 'http://localhost:3004',
        INDICADORES_URL: 'ftp://secreto-en-la-url',
      });
      assert.equal(cargada.indicadoresUrl, null, NODE_ENV);
      assert.deepEqual(cargada.avisos, ['INDICADORES_URL no configurada o inválida']);
      assert.equal(cargada.avisos.join(' ').includes('secreto'), false);
    }
  });

  it('en desarrollo cae en http://localhost:3005 y el tiempo límite es 25000 ms', () => {
    const configuracion = cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321' });
    assert.equal(configuracion.indicadoresUrl, 'http://localhost:3005');
    assert.equal(configuracion.tiempoLimiteIndicadoresMs, 25_000);
    assert.deepEqual(configuracion.avisos, []);
  });

  it('respeta los valores dados y quita la barra final; un INDICADORES_TIMEOUT_MS inválido impide arrancar (D129)', () => {
    const configuracion = cargarConfiguracion({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      INDICADORES_URL: 'https://quality360-indicadores.vercel.app/',
      INDICADORES_TIMEOUT_MS: '28000',
    });
    assert.equal(configuracion.indicadoresUrl, 'https://quality360-indicadores.vercel.app');
    assert.equal(configuracion.tiempoLimiteIndicadoresMs, 28_000);
    assert.throws(() => cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321', INDICADORES_TIMEOUT_MS: 'abc' }));
  });

  it('si Indicadores no responde o excede su tiempo límite: 503 SERVICIO_NO_DISPONIBLE', async () => {
    const caida = await appCon({ organizacionUrl: organizacion.url, indicadoresUrl: await urlCaida() });
    const lenta = await appCon({ organizacionUrl: organizacion.url, indicadoresUrl: indicadores.url, tiempoLimiteIndicadoresMs: 100 });
    indicadores.responder('GET /v1/indicadores/semaforo', { estado: 200, cuerpo: { ok: true }, retrasoMs: 400 });
    try {
      for (const destino of [caida, lenta]) {
        const respuesta = await request(destino.getHttpServer()).get('/v1/indicadores/semaforo').set('authorization', await autorizacion());
        assert.equal(respuesta.status, 503);
        assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      }
      const cron = await request(caida.getHttpServer()).get(CRON).set('authorization', SECRETO_CRON);
      assert.equal(cron.status, 503);
    } finally {
      await caida.close();
      await lenta.close();
    }
  });
});

/** Servicio falso que responde un PDF binario en `/v1/indicadores/exportacion`. */
async function iniciarServidorPdf(pdf: Buffer, disposicion: string): Promise<{ url: string; cerrar(): Promise<void> }> {
  const { createServer } = await import('node:http');
  const servidor = createServer((_peticion, respuesta) => {
    respuesta.writeHead(200, {
      'content-type': 'application/pdf',
      'content-disposition': disposicion,
      'x-q360-filas': '3',
    });
    respuesta.end(pdf);
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const direccion = servidor.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('no se pudo abrir el servicio PDF');
  return {
    url: `http://127.0.0.1:${direccion.port}`,
    cerrar: () => new Promise<void>((resolver, rechazar) => servidor.close((error) => (error ? rechazar(error) : resolver()))),
  };
}
