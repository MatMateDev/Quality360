/**
 * Rutas nuevas de E7 en el gateway (B6): bandejas, roles, células del líder, consultas y
 * exportaciones del Auditor, catálogo de personas y reasignación del QE responsable (D54).
 * Son reenvíos declarados uno por uno; el gateway no autoriza (cada servicio lo hace por sí mismo).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { HDU_ID, autorizacion, crearAppPrueba, iniciarServidorFalso, urlCaida, type ServidorFalso } from './ayudas-gateway.js';

let organizacion: ServidorFalso;
let certificaciones: ServidorFalso;
let app: NestExpressApplication;

const USUARIO_ID = '3f2a8c1e-5b7d-4e90-9a12-7c6d5e4f3a21';
const BOM = '﻿';

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

describe('Bandejas por rol [E7-B03]', () => {
  for (const rol of ['analista', 'qe', 'lider', 'admin', 'auditor']) {
    it(`GET /v1/bandeja/${rol} se reenvía a Organización con la sesión, la traza y la query`, async () => {
      organizacion.responder(`GET /v1/bandeja/${rol}`, { estado: 200, cuerpo: { rol, contadores: {} } });
      const respuesta = await request(app.getHttpServer())
        .get(`/v1/bandeja/${rol}?estado=CERRADA&pagina=2&tamanoPagina=50`)
        .set('authorization', await autorizacion())
        .set('x-trace-id', 'traza-e7');
      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.body, { rol, contadores: {} });
      const enviada = organizacion.solicitudes[0];
      assert.equal(enviada?.url, `/v1/bandeja/${rol}?estado=CERRADA&pagina=2&tamanoPagina=50`);
      assert.match(String(enviada?.cabeceras.authorization), /^Bearer /);
      assert.equal(enviada?.cabeceras['x-trace-id'], 'traza-e7');
      assert.equal(certificaciones.solicitudes.length, 0, 'el gateway no compone: Organización lo hace (D46)');
    });
  }

  it('el 403 genérico del servicio dueño llega tal cual (D33): el gateway no autoriza', async () => {
    organizacion.responder('GET /v1/bandeja/lider', {
      estado: 403,
      cuerpo: { codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes acceso a este recurso.', traceId: 'x', detalles: [] },
    });
    const respuesta = await request(app.getHttpServer()).get('/v1/bandeja/lider').set('authorization', await autorizacion());
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });

  it('sin sesión: 401 y no reenvía; una bandeja inexistente da 404', async () => {
    assert.equal((await request(app.getHttpServer()).get('/v1/bandeja/admin')).status, 401);
    assert.equal((await request(app.getHttpServer()).get('/v1/bandeja/otro').set('authorization', await autorizacion())).status, 404);
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('si Organización no responde: 503 SERVICIO_NO_DISPONIBLE', async () => {
    const caida = await crearAppPrueba({ organizacionUrl: await urlCaida() });
    try {
      const respuesta = await request(caida.getHttpServer()).get('/v1/bandeja/admin').set('authorization', await autorizacion());
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    } finally {
      await caida.close();
    }
  });
});

describe('Roles y células del líder [E7-B01]', () => {
  it('GET /v1/roles, GET /v1/usuarios/{id} y GET|PUT /v1/usuarios/{id}/celulas-lider se reenvían con su cuerpo', async () => {
    organizacion.responder('GET /v1/roles', { estado: 200, cuerpo: { items: [] } });
    organizacion.responder(`GET /v1/usuarios/${USUARIO_ID}`, { estado: 200, cuerpo: { id: USUARIO_ID } });
    organizacion.responder(`GET /v1/usuarios/${USUARIO_ID}/celulas-lider`, { estado: 200, cuerpo: { vigentes: [], historial: [] } });
    organizacion.responder(`PUT /v1/usuarios/${USUARIO_ID}/celulas-lider`, {
      estado: 409,
      cuerpo: { codigo: 'ROL_INCOMPATIBLE', mensaje: 'El usuario no tiene el rol Líder QA.', traceId: 'x', detalles: [] },
    });
    const token = await autorizacion();
    assert.equal((await request(app.getHttpServer()).get('/v1/roles').set('authorization', token)).status, 200);
    assert.equal((await request(app.getHttpServer()).get(`/v1/usuarios/${USUARIO_ID}`).set('authorization', token)).body.id, USUARIO_ID);
    assert.equal((await request(app.getHttpServer()).get(`/v1/usuarios/${USUARIO_ID}/celulas-lider`).set('authorization', token)).status, 200);
    const cuerpo = { celulaIds: [HDU_ID] };
    const put = await request(app.getHttpServer()).put(`/v1/usuarios/${USUARIO_ID}/celulas-lider`).set('authorization', token).send(cuerpo);
    assert.equal(put.status, 409);
    assert.equal(put.body.codigo, 'ROL_INCOMPATIBLE');
    assert.deepEqual(JSON.parse(organizacion.solicitudes.at(-1)?.cuerpo ?? '{}'), cuerpo);
  });

  it('un id que no es UUID no llega al servicio', async () => {
    const token = await autorizacion();
    assert.equal((await request(app.getHttpServer()).get('/v1/usuarios/xyz').set('authorization', token)).status, 400);
    assert.equal((await request(app.getHttpServer()).put('/v1/usuarios/xyz/celulas-lider').set('authorization', token).send({ celulaIds: [] })).status, 400);
    assert.equal(organizacion.solicitudes.length, 0);
  });

  it('el rol y las células viajan juntos en PUT /v1/usuarios/{id}/rol (D42)', async () => {
    organizacion.responder(`PUT /v1/usuarios/${USUARIO_ID}/rol`, { estado: 200, cuerpo: { id: USUARIO_ID, rol: 'LIDER_QA' } });
    const cuerpo = { rol: 'LIDER_QA', celulaIds: [HDU_ID] };
    await request(app.getHttpServer()).put(`/v1/usuarios/${USUARIO_ID}/rol`).set('authorization', await autorizacion()).send(cuerpo).expect(200);
    assert.deepEqual(JSON.parse(organizacion.solicitudes[0]?.cuerpo ?? '{}'), cuerpo);
  });
});

describe('Reasignación del QE responsable y catálogo de personas [E7-B05, D54]', () => {
  it('PUT /v1/hdu/{id}/qe-responsable se reenvía a Organización con el cuerpo y propaga su respuesta', async () => {
    organizacion.responder(`PUT /v1/hdu/${HDU_ID}/qe-responsable`, { estado: 200, cuerpo: { cambio: true } });
    const cuerpo = { qeResponsableId: USUARIO_ID, motivo: 'Traspaso de cartera' };
    const respuesta = await request(app.getHttpServer()).put(`/v1/hdu/${HDU_ID}/qe-responsable`).set('authorization', await autorizacion()).send(cuerpo);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(JSON.parse(organizacion.solicitudes[0]?.cuerpo ?? '{}'), cuerpo);
    assert.equal((await request(app.getHttpServer()).put('/v1/hdu/xyz/qe-responsable').set('authorization', await autorizacion()).send(cuerpo)).status, 400);
  });

  it('GET /v1/catalogos/personas propaga la query a Organización', async () => {
    organizacion.responder('GET /v1/catalogos/personas', { estado: 200, cuerpo: { items: [] } });
    await request(app.getHttpServer()).get('/v1/catalogos/personas?rol=QE').set('authorization', await autorizacion()).expect(200);
    assert.equal(organizacion.solicitudes[0]?.url, '/v1/catalogos/personas?rol=QE');
  });
});

describe('Consultas y exportaciones del Auditor [E7-B04]', () => {
  it('auditoría de usuarios va a Organización; bitácora y certificados, a Certificaciones; todo con la query', async () => {
    organizacion.responder('GET /v1/auditor/auditoria-usuarios', { estado: 200, cuerpo: { items: [], total: 0, pagina: 1, tamanoPagina: 25 } });
    certificaciones.responder('GET /v1/auditor/bitacora', { estado: 200, cuerpo: { items: [], total: 0, pagina: 1, tamanoPagina: 25 } });
    certificaciones.responder('GET /v1/auditor/certificados', { estado: 200, cuerpo: { items: [], total: 0, pagina: 1, tamanoPagina: 25 } });
    const token = await autorizacion();
    await request(app.getHttpServer()).get('/v1/auditor/auditoria-usuarios?operacion=CAMBIAR_ROL').set('authorization', token).expect(200);
    await request(app.getHttpServer()).get(`/v1/auditor/bitacora?hduId=${HDU_ID}&accion=APROBAR`).set('authorization', token).expect(200);
    await request(app.getHttpServer()).get('/v1/auditor/certificados?q=Q360').set('authorization', token).expect(200);
    assert.equal(organizacion.solicitudes[0]?.url, '/v1/auditor/auditoria-usuarios?operacion=CAMBIAR_ROL');
    assert.equal(certificaciones.solicitudes[0]?.url, `/v1/auditor/bitacora?hduId=${HDU_ID}&accion=APROBAR`);
    assert.equal(certificaciones.solicitudes[1]?.url, '/v1/auditor/certificados?q=Q360');
    assert.equal(organizacion.solicitudes.length, 1);
  });

  const exportaciones: Array<['organizacion' | 'certificaciones', string]> = [
    ['organizacion', 'hdu'],
    ['organizacion', 'auditoria-usuarios'],
    ['certificaciones', 'bitacora'],
    ['certificaciones', 'certificados'],
  ];
  for (const [servicio, recurso] of exportaciones) {
    it(`exportar ${recurso} transmite el CSV con BOM, Content-Disposition y X-Q360-Filas sin convertirlo a JSON (D48)`, async () => {
      const destino = servicio === 'organizacion' ? organizacion : certificaciones;
      const contenido = `${BOM}Código;Título\r\nH1;Historia ñandú\r\n`;
      destino.responder(`GET /v1/auditor/exportaciones/${recurso}`, {
        estado: 200,
        texto: contenido,
        tipoContenido: 'text/csv; charset=utf-8',
        cabeceras: { 'content-disposition': `attachment; filename="quality360-${recurso}-2026-10-21.csv"`, 'x-q360-filas': '1' },
      });
      const respuesta = await request(app.getHttpServer())
        .get(`/v1/auditor/exportaciones/${recurso}?celulaId=${HDU_ID}`)
        .set('authorization', await autorizacion())
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      assert.equal(respuesta.status, 200);
      assert.match(respuesta.headers['content-type'] ?? '', /^text\/csv/);
      assert.equal(respuesta.headers['content-disposition'], `attachment; filename="quality360-${recurso}-2026-10-21.csv"`);
      assert.equal(respuesta.headers['x-q360-filas'], '1');
      const bytes = respuesta.body as unknown as Buffer;
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'conserva el BOM UTF-8');
      assert.equal(bytes.toString('utf8'), contenido);
      assert.equal(destino.solicitudes[0]?.url, `/v1/auditor/exportaciones/${recurso}?celulaId=${HDU_ID}`);
    });
  }

  it('los errores de una exportación (422 por límite, 503 por fuente caída) llegan como JSON', async () => {
    organizacion.responder('GET /v1/auditor/exportaciones/hdu', {
      estado: 422,
      cuerpo: { codigo: 'EXPORTACION_EXCEDE_LIMITE', mensaje: 'La exportación supera las 50.000 filas. Acota los filtros.', traceId: 'x', detalles: [] },
    });
    const limite = await request(app.getHttpServer()).get('/v1/auditor/exportaciones/hdu').set('authorization', await autorizacion());
    assert.equal(limite.status, 422);
    assert.equal(limite.body.codigo, 'EXPORTACION_EXCEDE_LIMITE');

    const caida = await crearAppPrueba({ organizacionUrl: organizacion.url, certificacionesUrl: await urlCaida() });
    try {
      const respuesta = await request(caida.getHttpServer()).get('/v1/auditor/exportaciones/bitacora').set('authorization', await autorizacion());
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    } finally {
      await caida.close();
    }
  });

  it('sin sesión: 401; una consulta del Auditor que no existe da 404', async () => {
    assert.equal((await request(app.getHttpServer()).get('/v1/auditor/bitacora')).status, 401);
    assert.equal((await request(app.getHttpServer()).get('/v1/auditor/exportaciones/otra').set('authorization', await autorizacion())).status, 404);
    assert.equal(organizacion.solicitudes.length + certificaciones.solicitudes.length, 0);
  });
});

describe('Rutas internas no publicadas [E7, D47, D48]', () => {
  it('/v1/interno/* no se publica: responde 404 y no llega a ningún servicio', async () => {
    const token = await autorizacion();
    for (const [metodo, ruta] of [
      ['get', '/v1/interno/hdu/ambito'],
      ['post', '/v1/interno/hdu/consulta'],
      ['post', '/v1/interno/checklist/estados'],
      ['get', '/v1/interno/resumen-auditoria'],
      ['post', '/v1/interno/auditoria/exportaciones'],
    ] as const) {
      const respuesta = await request(app.getHttpServer())[metodo](ruta).set('authorization', token);
      assert.equal(respuesta.status, 404, ruta);
    }
    assert.equal(organizacion.solicitudes.length + certificaciones.solicitudes.length, 0);
  });
});
