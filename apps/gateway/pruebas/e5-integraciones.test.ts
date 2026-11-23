/**
 * Rutas de E5 en el gateway (G1, D127; GC1, D132 y D152; GO1, ADR 0019):
 * reenvío explícito de las 22 rutas (24 operaciones) de `/v1/integraciones/*`
 * a Integraciones (`INTEGRACIONES_URL`), `jira/sincronizaciones` retirada
 * (404), cubo de tasa propio para `PATCH …/consultas/{id}/items` y
 * `POST …/items/{itemId}/confirmaciones` (GD1, ADR 0018, D202 g), las 4 rutas
 * de la conexión por OAuth (sesión, sin query, 204 sin cuerpo, cubo de
 * escritura general y ningún `code`, `state` ni URL de autorización en los
 * registros), 503 solo en esas rutas si la URL falta o es inválida, cuerpo de
 * 1,5 MB solo en `archivos/*`, tiempo límite propio de 12 s (D115), rutas
 * internas no publicadas, y los cambios aditivos de E5 en Organización:
 * `?celulaId` en sprints (D120) y los campos nuevos del detalle de HDU (D108,
 * D124).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { inspect } from 'node:util';
import { Logger, RequestMethod, type LoggerService } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { IntegracionesController } from '../src/api/integraciones.controller.js';
import { cargarConfiguracion } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';
import { LIMITE_CUERPO_ARCHIVOS_BYTES } from '../src/middlewares/cuerpo.js';
import {
  HDU_ID,
  autorizacion,
  configuracionPrueba,
  crearAppPrueba,
  firmarToken,
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
const SITIO_ID = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const RUTA_OAUTH = '/v1/integraciones/jira/oauth';
const RUTA_OAUTH_INICIAR = `${RUTA_OAUTH}/iniciar`;
const RUTA_OAUTH_RETORNO = `${RUTA_OAUTH}/retorno`;
const RUTA_OAUTH_SITIO = `${RUTA_OAUTH}/sitio`;
// Secretos de un retorno de Atlassian (D211): aleatorios, para que buscarlos en
// los registros no dé falsos positivos.
const CODIGO_OAUTH = `codigo-${randomBytes(24).toString('base64url')}`;
const ESTADO_OAUTH = randomBytes(32).toString('base64url');

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Ruta {
  metodo: Metodo;
  ruta: string;
  ids: string;
  cuerpo?: Record<string, unknown>;
  /** Estado que responde Integraciones en el caso feliz. */
  estado?: number;
}

/** Las 24 operaciones de las 22 rutas de E5 (integraciones.v1.yaml). */
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
  // Conexión por OAuth 2.0 (ADR 0019): `iniciar` no lleva cuerpo y el `DELETE` responde 204 sin cuerpo.
  { metodo: 'post', ruta: RUTA_OAUTH_INICIAR, ids: 'E5-F08#1, E5-F08#12, E5-B08#1, E5-B08#13' },
  {
    metodo: 'post',
    ruta: RUTA_OAUTH_RETORNO,
    ids: 'E5-F08#2, E5-F08#12, E5-B08#2, E5-B08#13',
    cuerpo: { code: CODIGO_OAUTH, state: ESTADO_OAUTH },
  },
  { metodo: 'post', ruta: RUTA_OAUTH_SITIO, ids: 'E5-F08#4, E5-F08#12, E5-B08#5, E5-B08#13', cuerpo: { sitioId: SITIO_ID } },
  { metodo: 'delete', ruta: RUTA_OAUTH, ids: 'E5-F08#11, E5-F08#12, E5-B08#12, E5-B08#13', estado: 204 },
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

/** Las 4 operaciones de la conexión por OAuth (ADR 0019). */
const RUTAS_OAUTH = RUTAS.filter(({ ruta }) => ruta.startsWith(RUTA_OAUTH));

/** Respuesta de `oauth/iniciar` (`InicioAutorizacionOauthJira`): la URL lleva el `state` en claro. */
function inicioAutorizacion(estado: string): { urlAutorizacion: string; expiraEn: string } {
  const retorno = encodeURIComponent('https://quality360-one.vercel.app/admin/integraciones/jira/oauth/retorno');
  return {
    urlAutorizacion:
      'https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=CLIENTE' +
      `&scope=read%3Ajira-work%20read%3Ajira-user%20offline_access&redirect_uri=${retorno}` +
      `&state=${estado}&response_type=code&prompt=consent`,
    expiraEn: '2026-11-22T13:25:00Z',
  };
}

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

/** Operaciones que declara `IntegracionesController`, como `"<MÉTODO> <ruta>"` con sus parámetros (`:id`). */
function operacionesDeclaradas(): string[] {
  const prototipo = IntegracionesController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototipo)
    .filter((nombre) => nombre !== 'constructor')
    .map((nombre) => prototipo[nombre])
    .filter((manejador): manejador is object => typeof manejador === 'function' && Reflect.hasMetadata(PATH_METADATA, manejador))
    .map((manejador) => {
      const metodo = RequestMethod[Reflect.getMetadata(METHOD_METADATA, manejador) as RequestMethod];
      return `${metodo} /v1/integraciones/${String(Reflect.getMetadata(PATH_METADATA, manejador))}`;
    });
}

/** Una entrada de `RUTAS` con los parámetros de ruta en lugar de los UUID de prueba. */
function comoPatron({ metodo, ruta }: Ruta): string {
  const patron = ruta.replace(CONSULTA_ID, ':id').replace(EJECUCION_ID, ':id').replace(ITEM_ID, ':itemId');
  return `${metodo.toUpperCase()} ${patron}`;
}

function aTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  return inspect(valor, { depth: null, maxArrayLength: null, maxStringLength: null, breakLength: Infinity });
}

/** Registro en memoria: guarda cada línea completa, en todos los niveles (también `debug`, que lleva la pila). */
class RegistroCapturado implements LoggerService {
  readonly lineas: string[] = [];

  guardar(nivel: string, argumentos: unknown[]): void {
    this.lineas.push(`${nivel} ${argumentos.map(aTexto).join(' ')}`);
  }

  log(mensaje: unknown, ...resto: unknown[]): void {
    this.guardar('log', [mensaje, ...resto]);
  }

  error(mensaje: unknown, ...resto: unknown[]): void {
    this.guardar('error', [mensaje, ...resto]);
  }

  warn(mensaje: unknown, ...resto: unknown[]): void {
    this.guardar('warn', [mensaje, ...resto]);
  }

  debug(mensaje: unknown, ...resto: unknown[]): void {
    this.guardar('debug', [mensaje, ...resto]);
  }

  verbose(mensaje: unknown, ...resto: unknown[]): void {
    this.guardar('verbose', [mensaje, ...resto]);
  }

  fatal(mensaje: unknown, ...resto: unknown[]): void {
    this.guardar('fatal', [mensaje, ...resto]);
  }
}

const METODOS_CONSOLA = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

/**
 * Ejecuta `accion` con el `Logger` de Nest y la consola capturados en memoria.
 * Las apps que `accion` crea con `crearApp(…)` sin `registro: false` registran
 * como en producción (`main.ts` y `api/index.mjs`).
 */
async function conRegistroCapturado(accion: () => Promise<void>): Promise<RegistroCapturado> {
  const registro = new RegistroCapturado();
  const consola = METODOS_CONSOLA.map((metodo) => [metodo, console[metodo]] as const);
  Logger.overrideLogger(registro);
  for (const metodo of METODOS_CONSOLA) {
    console[metodo] = (...argumentos: unknown[]) => registro.guardar(`console.${metodo}`, argumentos);
  }
  try {
    await accion();
  } finally {
    // Como estaba: el resto del archivo crea sus apps con `registro: false`.
    Logger.overrideLogger(false);
    for (const [metodo, original] of consola) console[metodo] = original;
  }
  return registro;
}

describe('Reenvío de las 22 rutas (24 operaciones) de E5 a Integraciones [D127, D132, GD1, GO1]', () => {
  it('la lista cubre 22 rutas y 24 operaciones, con las 4 de OAuth y sin jira/sincronizaciones', () => {
    assert.equal(RUTAS.length, 24);
    assert.equal(new Set(RUTAS.map(({ ruta }) => ruta)).size, 22);
    assert.equal(new Set(RUTAS.map(({ metodo, ruta }) => `${metodo} ${ruta}`)).size, 24, 'sin operaciones repetidas');
    assert.deepEqual(
      RUTAS.filter(({ ruta }) => ruta.startsWith(RUTA_OAUTH)).map(({ metodo, ruta }) => `${metodo.toUpperCase()} ${ruta}`),
      [`POST ${RUTA_OAUTH_INICIAR}`, `POST ${RUTA_OAUTH_RETORNO}`, `POST ${RUTA_OAUTH_SITIO}`, `DELETE ${RUTA_OAUTH}`],
    );
    assert.equal(RUTAS.some(({ ruta }) => ruta.endsWith('/sincronizaciones')), false);
  });

  it('IntegracionesController declara exactamente esas 24 operaciones en 22 rutas, ni una más', () => {
    const declaradas = operacionesDeclaradas();
    assert.equal(declaradas.length, 24);
    assert.equal(new Set(declaradas.map((operacion) => operacion.split(' ')[1])).size, 22);
    assert.deepEqual([...declaradas].sort(), RUTAS.map(comoPatron).sort());
  });

  for (const { metodo, ruta, ids, cuerpo, estado } of RUTAS) {
    const nombre = `${metodo.toUpperCase()} ${ruta}`;
    const detalle = cuerpo !== undefined ? ' y cuerpo' : metodo === 'get' ? ' y query' : ', sin cuerpo ni query';

    it(`${nombre} llega a Integraciones con sesión, traza${detalle} [${ids}]`, async () => {
      const esperado = estado ?? 200;
      // Un 204 no lleva cuerpo (DELETE oauth, D217).
      integraciones.responder(nombre, esperado === 204 ? { estado: 204 } : { estado: esperado, cuerpo: { ok: ruta } });
      const consulta = metodo === 'get' ? '?origen=JIRA&resultado=ERROR&pagina=2' : '?ignorada=1';
      let solicitud = request(app.getHttpServer())
        [metodo](`${ruta}${consulta}`)
        .set('authorization', await autorizacion())
        .set('x-trace-id', 'traza-e5');
      if (cuerpo !== undefined) solicitud = solicitud.send(cuerpo);
      const respuesta = await solicitud;

      assert.equal(respuesta.status, esperado);
      if (esperado === 204) {
        assert.equal(respuesta.text, '', 'el 204 sale sin cuerpo');
        assert.equal(respuesta.headers['x-trace-id'], 'traza-e5');
      } else {
        assert.deepEqual(respuesta.body, { ok: ruta });
      }
      const enviada = integraciones.solicitudes[0];
      assert.equal(integraciones.solicitudes.length, 1);
      assert.equal(enviada?.metodo, metodo.toUpperCase());
      assert.equal(enviada?.url, metodo === 'get' ? `${ruta}${consulta}` : ruta, 'las lecturas propagan la query; las escrituras no');
      assert.match(String(enviada?.cabeceras.authorization), /^Bearer /);
      assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-e5');
      assert.equal(enviada?.cabeceras['x-q360-servicio-token'], undefined);
      if (cuerpo !== undefined) assert.deepEqual(JSON.parse(enviada?.cuerpo ?? '{}'), cuerpo);
      else assert.equal(enviada?.cuerpo, '', 'sin cuerpo de entrada no se inventa uno');
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
      // OAuth (ADR 0019): solo las 4 operaciones declaradas; nada de canje ni de token.
      ['get', RUTA_OAUTH],
      ['post', RUTA_OAUTH],
      ['get', RUTA_OAUTH_INICIAR],
      ['put', RUTA_OAUTH_SITIO],
      ['delete', RUTA_OAUTH_RETORNO],
      ['post', `${RUTA_OAUTH}/token`],
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
  it('cada una de las 24 operaciones responde 503 SERVICIO_NO_DISPONIBLE sin llamar a nadie; sin token sigue dando 401', async () => {
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

describe('Conexión por OAuth 2.0: sin query y con el cuerpo tal cual [ADR 0019, GO1]', () => {
  it('POST oauth/iniciar no manda cuerpo ni query (la redirect_uri la arma el servidor) y la URL de autorización vuelve tal cual [E5-F08#1, E5-B08#1, D210]', async () => {
    const inicio = inicioAutorizacion(randomBytes(32).toString('base64url'));
    integraciones.responder(`POST ${RUTA_OAUTH_INICIAR}`, { estado: 200, cuerpo: inicio });
    const respuesta = await request(app.getHttpServer())
      .post(`${RUTA_OAUTH_INICIAR}?redirect_uri=${encodeURIComponent('https://otro.example/retorno')}`)
      .set('authorization', await autorizacion());

    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, inicio);
    const enviada = integraciones.solicitudes[0];
    assert.equal(integraciones.solicitudes.length, 1);
    assert.equal(enviada?.url, RUTA_OAUTH_INICIAR, 'la query no viaja');
    assert.equal(enviada?.cuerpo, '');
    assert.equal(enviada?.cabeceras['content-type'], undefined);
  });

  it('POST oauth/retorno reenvía tal cual code y state, o error y state, y nunca la query [E5-F08#2, E5-F08#3, E5-B08#2, E5-B08#4]', async () => {
    const rechazado = {
      resultado: 'ERROR',
      oauth: null,
      error: {
        codigo: 'JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO',
        mensaje: 'No aceptaste los permisos en Atlassian. No se conectó nada.',
        sugerencias: ['REINTENTAR'],
      },
    };
    integraciones.responder(`POST ${RUTA_OAUTH_RETORNO}`, { estado: 200, cuerpo: rechazado });
    const token = await autorizacion();
    for (const cuerpo of [{ code: CODIGO_OAUTH, state: ESTADO_OAUTH }, { error: 'access_denied', state: ESTADO_OAUTH }]) {
      integraciones.solicitudes.length = 0;
      const respuesta = await request(app.getHttpServer())
        .post(`${RUTA_OAUTH_RETORNO}?code=de-la-direccion&state=de-la-direccion`)
        .set('authorization', token)
        .send(cuerpo);

      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.body, rechazado, 'el 200 con error llega tal cual (D105)');
      const enviada = integraciones.solicitudes[0];
      assert.equal(enviada?.url, RUTA_OAUTH_RETORNO, 'la query no viaja');
      assert.deepEqual(JSON.parse(enviada?.cuerpo ?? '{}'), cuerpo);
      assert.equal(enviada?.cabeceras['content-type'], 'application/json');
    }
  });

  it('DELETE oauth: 204 sin cuerpo y con x-trace-id; no reenvía cuerpo aunque el cliente lo mande [E5-F08#11, E5-B08#12, D217]', async () => {
    integraciones.responder(`DELETE ${RUTA_OAUTH}`, { estado: 204 });
    const respuesta = await request(app.getHttpServer())
      .delete(RUTA_OAUTH)
      .set('authorization', await autorizacion())
      .set('x-trace-id', 'traza-desconexion')
      .send({ borrarHdu: true });

    assert.equal(respuesta.status, 204);
    assert.equal(respuesta.text, '');
    assert.equal(respuesta.headers['x-trace-id'], 'traza-desconexion');
    assert.equal(respuesta.headers['content-type'], undefined);
    const enviada = integraciones.solicitudes[0];
    assert.equal(enviada?.metodo, 'DELETE');
    assert.equal(enviada?.url, RUTA_OAUTH);
    assert.equal(enviada?.cuerpo, '', 'un DELETE no lleva cuerpo');
    assert.equal(enviada?.cabeceras['content-type'], undefined);
    assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-desconexion');
  });

  it('es el primer DELETE del gateway: la verificación previa de CORS lo admite desde el portal, con authorization, y no llega a Integraciones [E5-F08#11]', async () => {
    const previa = await request(app.getHttpServer())
      .options(RUTA_OAUTH)
      .set('origin', 'http://localhost:5173')
      .set('access-control-request-method', 'DELETE')
      .set('access-control-request-headers', 'authorization');
    assert.equal(previa.status, 204);
    assert.equal(previa.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.match(String(previa.headers['access-control-allow-methods']), /\bDELETE\b/);
    assert.match(String(previa.headers['access-control-allow-headers']), /\bauthorization\b/);

    const ajena = await request(app.getHttpServer())
      .options(RUTA_OAUTH)
      .set('origin', 'http://atacante.local')
      .set('access-control-request-method', 'DELETE');
    assert.equal(ajena.headers['access-control-allow-origin'], undefined);
    assert.equal(integraciones.solicitudes.length, 0);
  });

  it('los errores de Integraciones llegan tal cual: 400, 409 y 503 con su código y su cuerpo [E5-B08#3, E5-B08#5, E5-B08#11, E5-B08#12]', async () => {
    const casos: Array<[Metodo, string, number, string]> = [
      ['post', RUTA_OAUTH_INICIAR, 503, 'JIRA_OAUTH_NO_CONFIGURADO'],
      ['post', RUTA_OAUTH_INICIAR, 503, 'LLAVE_CIFRADO_NO_DISPONIBLE'],
      ['post', RUTA_OAUTH_RETORNO, 400, 'JIRA_OAUTH_ESTADO_INVALIDO'],
      ['post', RUTA_OAUTH_RETORNO, 400, 'VALIDACION'],
      ['post', RUTA_OAUTH_RETORNO, 503, 'JIRA_OAUTH_NO_CONFIGURADO'],
      ['post', RUTA_OAUTH_SITIO, 400, 'JIRA_OAUTH_SITIO_NO_VALIDO'],
      ['post', RUTA_OAUTH_SITIO, 409, 'JIRA_OAUTH_SIN_CONEXION'],
      ['post', RUTA_OAUTH_SITIO, 409, 'TOKEN_NO_DESCIFRABLE'],
      ['delete', RUTA_OAUTH, 409, 'JIRA_OAUTH_SIN_CONEXION'],
    ];
    const token = await autorizacion();
    for (const [metodo, ruta, estado, codigo] of casos) {
      const cuerpoError = { codigo, mensaje: 'm', traceId: 'x', detalles: [] };
      integraciones.responder(`${metodo.toUpperCase()} ${ruta}`, { estado, cuerpo: cuerpoError });
      const cuerpo = RUTAS_OAUTH.find((oauth) => oauth.metodo === metodo && oauth.ruta === ruta)?.cuerpo;
      const respuesta = await enviar(app, metodo, ruta, token, cuerpo);
      assert.equal(respuesta.status, estado, `${metodo} ${ruta} ${codigo}`);
      assert.deepEqual(respuesta.body, cuerpoError);
    }
  });

  it('ninguna es pública: con un token vencido responden 401 SESION_EXPIRADA, con otra audiencia 401 NO_AUTENTICADO, y no se reenvían [E5-B08#13, E1-B11#1]', async () => {
    const vencido = `Bearer ${await firmarToken({ vigenciaSegundos: -300 })}`;
    const ajeno = `Bearer ${await firmarToken({ audiencia: 'otro-publico' })}`;
    for (const { metodo, ruta, cuerpo } of RUTAS_OAUTH) {
      const expirada = await enviar(app, metodo, ruta, vencido, cuerpo);
      assert.equal(expirada.status, 401, ruta);
      assert.equal(expirada.body.codigo, 'SESION_EXPIRADA', ruta);
      const otraAudiencia = await enviar(app, metodo, ruta, ajeno, cuerpo);
      assert.equal(otraAudiencia.status, 401, ruta);
      assert.equal(otraAudiencia.body.codigo, 'NO_AUTENTICADO', ruta);
    }
    assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
  });

  it('el gateway no tiene callback público: GET …/oauth/retorno con code y state responde 404, con o sin token [ADR 0019]', async () => {
    const ruta = `${RUTA_OAUTH_RETORNO}?code=${CODIGO_OAUTH}&state=${ESTADO_OAUTH}`;
    for (const token of [null, await autorizacion()]) {
      const respuesta = await enviar(app, 'get', ruta, token);
      assert.equal(respuesta.status, 404);
      assert.equal(respuesta.body.codigo, 'NO_ENCONTRADO');
    }
    assert.equal(integraciones.solicitudes.length + totalOtros(), 0);
  });
});

describe('Conexión por OAuth 2.0: cubo de escritura general [GO1]', () => {
  it('las 4 gastan el cubo de escritura y no el de la consulta: agotado, responden 429 con Retry-After y no se reenvían', async () => {
    const limitada = await crearAppPrueba({
      organizacionUrl: organizacion.url,
      integracionesUrl: integraciones.url,
      limiteTasa: { maximoEscritura: RUTAS_OAUTH.length, maximoConsulta: 1 },
    });
    try {
      for (const { metodo, ruta, estado } of RUTAS_OAUTH) {
        integraciones.responder(`${metodo.toUpperCase()} ${ruta}`, estado === 204 ? { estado: 204 } : { estado: 200, cuerpo: { ok: true } });
      }
      integraciones.responder(`PATCH ${RUTA_EDICION}`, { estado: 200, cuerpo: { ok: true } });
      const token = await autorizacion();

      // Una vez cada una: gastan las 4 escrituras de la ventana.
      for (const { metodo, ruta, cuerpo, estado } of RUTAS_OAUTH) {
        const respuesta = await enviar(limitada, metodo, ruta, token, cuerpo);
        assert.equal(respuesta.status, estado ?? 200, ruta);
      }
      // Con el cubo agotado, cada una responde 429 y no llega a Integraciones.
      for (const { metodo, ruta, cuerpo } of RUTAS_OAUTH) {
        const respuesta = await enviar(limitada, metodo, ruta, token, cuerpo);
        assert.equal(respuesta.status, 429, ruta);
        assert.equal(respuesta.body.codigo, 'DEMASIADAS_SOLICITUDES', ruta);
        assert.ok(Number(respuesta.headers['retry-after']) >= 1, ruta);
      }
      assert.equal(integraciones.solicitudes.length, RUTAS_OAUTH.length);

      // Es el mismo cubo que el resto de las escrituras de E5…
      const guardar = await enviar(limitada, 'put', '/v1/integraciones/jira/configuracion', token, {});
      assert.equal(guardar.status, 429);
      // …y el de la consulta (máximo 1) sigue intacto.
      await request(limitada.getHttpServer())
        .patch(RUTA_EDICION)
        .set('authorization', token)
        .send({ version: 1, itemIds: [ITEM_ID], asignacion: { celulaId: CELULA_ID } })
        .expect(200);
    } finally {
      await limitada.close();
    }
  });
});

describe('Conexión por OAuth 2.0: sin code, state ni URL de autorización en los registros [E5-B08#14, GO1]', () => {
  it('ni el cuerpo de oauth/retorno ni la respuesta de oauth/iniciar quedan en los registros, con éxito ni con error', async () => {
    const estadoInicio = randomBytes(32).toString('base64url');
    const inicio = inicioAutorizacion(estadoInicio);
    const retorno = { code: CODIGO_OAUTH, state: ESTADO_OAUTH };
    const vigente = await firmarToken();
    const vencido = await firmarToken({ vigenciaSegundos: -300 });
    const ajeno = await firmarToken({ audiencia: 'otro-publico' });
    const base = { organizacionUrl: organizacion.url, integracionesUrl: integraciones.url };
    const conectada = { resultado: 'CONECTADA', oauth: null, error: null };

    const registro = await conRegistroCapturado(async () => {
      // Sin `registro: false`: registran como en producción.
      const normal = await crearApp(configuracionPrueba(base));
      const caida = await crearApp(configuracionPrueba({ ...base, integracionesUrl: await urlCaida() }));
      const lenta = await crearApp(configuracionPrueba({ ...base, tiempoLimiteIntegracionesMs: 150 }));
      const sinUrl = await crearApp(configuracionPrueba({ ...base, integracionesUrl: null }));
      const limitada = await crearApp(configuracionPrueba({ ...base, limiteTasa: { maximoEscritura: 1 } }));

      const retornar = (
        destino: NestExpressApplication,
        traza: string,
        token: string | null,
        cuerpo: string | Record<string, unknown> = retorno,
      ): request.Test => {
        let solicitud = request(destino.getHttpServer())
          .post(RUTA_OAUTH_RETORNO)
          .set('x-trace-id', traza)
          .set('content-type', 'application/json');
        if (token !== null) solicitud = solicitud.set('authorization', `Bearer ${token}`);
        return solicitud.send(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
      };
      const iniciar = (destino: NestExpressApplication, traza: string): request.Test =>
        request(destino.getHttpServer()).post(RUTA_OAUTH_INICIAR).set('authorization', `Bearer ${vigente}`).set('x-trace-id', traza);

      try {
        // Éxito: la URL con el state vuelve tal cual al portal y el cuerpo del retorno llega tal cual.
        integraciones.responder(`POST ${RUTA_OAUTH_INICIAR}`, { estado: 200, cuerpo: inicio });
        const iniciada = await iniciar(normal, 'traza-oauth-iniciar');
        assert.equal(iniciada.status, 200);
        assert.deepEqual(iniciada.body, inicio);
        integraciones.responder(`POST ${RUTA_OAUTH_RETORNO}`, { estado: 200, cuerpo: conectada });
        assert.equal((await retornar(normal, 'traza-oauth-retorno', vigente)).status, 200);
        assert.deepEqual(JSON.parse(integraciones.solicitudes.at(-1)?.cuerpo ?? '{}'), retorno);

        // Integraciones rechaza el state: su 400 llega tal cual.
        integraciones.responder(`POST ${RUTA_OAUTH_RETORNO}`, {
          estado: 400,
          cuerpo: { codigo: 'JIRA_OAUTH_ESTADO_INVALIDO', mensaje: 'm', traceId: 'x', detalles: [] },
        });
        assert.equal((await retornar(normal, 'traza-oauth-estado', vigente)).status, 400);

        // Sin sesión válida: IdentidadGuard y el filtro registran código, ruta y traza.
        assert.equal((await retornar(normal, 'traza-oauth-sin-token', null)).status, 401);
        assert.equal((await retornar(normal, 'traza-oauth-vencido', vencido)).status, 401);
        assert.equal((await retornar(normal, 'traza-oauth-audiencia', ajeno)).status, 401);

        // JSON mal formado (el error de JSON.parse cita el texto) y cuerpo de más de 100 KB: 400 VALIDACION.
        const truncado = `{"code":"${CODIGO_OAUTH}","state":"${ESTADO_OAUTH}"`;
        assert.equal((await retornar(normal, 'traza-oauth-json', vigente, truncado)).status, 400);
        assert.equal((await retornar(normal, 'traza-oauth-grande', vigente, { ...retorno, relleno: 'x'.repeat(200_000) })).status, 400);

        // Integraciones responde algo que no es JSON y repite los secretos: 503, sin copiarlo al registro.
        integraciones.responder(`POST ${RUTA_OAUTH_RETORNO}`, {
          estado: 502,
          texto: `<p>${CODIGO_OAUTH} ${ESTADO_OAUTH}</p>`,
          tipoContenido: 'text/html',
        });
        assert.equal((await retornar(normal, 'traza-oauth-html', vigente)).status, 503);
        integraciones.responder(`POST ${RUTA_OAUTH_INICIAR}`, { estado: 200, texto: inicio.urlAutorizacion, tipoContenido: 'text/plain' });
        assert.equal((await iniciar(normal, 'traza-oauth-iniciar-texto')).status, 503);

        // Integraciones caída, lenta o sin configurar: 503, y el filtro registra el motivo y la pila.
        assert.equal((await retornar(caida, 'traza-oauth-caida', vigente)).status, 503);
        assert.equal((await iniciar(caida, 'traza-oauth-iniciar-caida')).status, 503);
        integraciones.responder(`POST ${RUTA_OAUTH_RETORNO}`, { estado: 200, cuerpo: conectada, retrasoMs: 600 });
        assert.equal((await retornar(lenta, 'traza-oauth-lenta', vigente)).status, 503);
        assert.equal((await retornar(sinUrl, 'traza-oauth-sin-url', vigente)).status, 503);

        // Límite de tasa: el segundo retorno da 429.
        integraciones.responder(`POST ${RUTA_OAUTH_RETORNO}`, { estado: 200, cuerpo: conectada });
        assert.equal((await retornar(limitada, 'traza-oauth-tasa-1', vigente)).status, 200);
        assert.equal((await retornar(limitada, 'traza-oauth-tasa-2', vigente)).status, 429);
      } finally {
        for (const destino of [normal, caida, lenta, sinUrl, limitada]) await destino.close();
      }
    });

    const texto = registro.lineas.join('\n');
    // La captura funciona: están las líneas reales de los errores, con código, ruta y traza.
    for (const esperada of [
      `NO_AUTENTICADO 401 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-sin-token`,
      `SESION_EXPIRADA 401 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-vencido`,
      `NO_AUTENTICADO 401 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-audiencia`,
      `SERVICIO_NO_DISPONIBLE 503 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-html`,
      `SERVICIO_NO_DISPONIBLE 503 en POST ${RUTA_OAUTH_INICIAR} · traceId=traza-oauth-iniciar-texto`,
      `SERVICIO_NO_DISPONIBLE 503 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-caida`,
      `SERVICIO_NO_DISPONIBLE 503 en POST ${RUTA_OAUTH_INICIAR} · traceId=traza-oauth-iniciar-caida`,
      `SERVICIO_NO_DISPONIBLE 503 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-lenta`,
      `SERVICIO_NO_DISPONIBLE 503 en POST ${RUTA_OAUTH_RETORNO} · traceId=traza-oauth-sin-url`,
    ]) {
      assert.ok(texto.includes(esperada), `el registro debía tener: ${esperada}`);
    }
    assert.ok(registro.lineas.some((linea) => linea.startsWith('debug ')), 'también se capturan las pilas (debug)');

    // Y ningún secreto, en ningún nivel.
    for (const [nombre, secreto] of [
      ['el code', CODIGO_OAUTH],
      ['el state del retorno', ESTADO_OAUTH],
      ['el state de la URL de autorización', estadoInicio],
      ['la URL de autorización', 'auth.atlassian.com/authorize'],
      ['el access token vigente', vigente],
      ['el access token vencido', vencido],
      ['el access token de otra audiencia', ajeno],
    ] as const) {
      assert.equal(texto.includes(secreto), false, `el registro contiene ${nombre}`);
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
