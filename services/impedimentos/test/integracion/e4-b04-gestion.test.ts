/** E4-B04 · Historial de gestión, solo inserción y vistas del Auditor. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '#prisma';

import { PERSONAS, haceDias, iniciarFalsos, tokenDe, type Falsos } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { como, crearFixture, type FixtureE4 } from '../fixture-e4.js';

let falsos: Falsos;
let app: NestExpressApplication;
let f: FixtureE4;
const prisma = new PrismaClient();

before(async () => {
  falsos = await iniciarFalsos();
  app = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl });
  f = await crearFixture(app, falsos);
});

after(async () => {
  await app.close();
  await falsos.cerrar();
  await prisma.$disconnect();
});

const historial = (persona: Parameters<typeof como>[1], hduId: string, consulta = '') => como(app, persona, 'get', `/v1/hdu/${hduId}/gestion-impedimentos${consulta}`);
const acciones = (cuerpo: { items: Array<{ accion: string }> }) => cuerpo.items.map((e) => e.accion);

describe('E4-B04 · gestión', () => {
  it('[E4-B04#2] T03: H6 en estado base, 3 entradas cronológicas (REGISTRAR, riesgo, ESCALAR)', async () => {
    const r = await historial('qe1', f.h.H6.id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(acciones(r.body), ['REGISTRAR', 'FIJAR_RIESGO', 'ESCALAR']);
    assert.equal(r.body.orden, 'fecha:asc');
    assert.deepEqual(r.body.items.map((e: { tipo: string }) => e.tipo), ['IMPEDIMENTO', 'RIESGO', 'IMPEDIMENTO']);
  });

  it('[E4-B04#2] T04: orden inverso y filtros desde/hasta', async () => {
    const desc = await historial('qe1', f.h.H6.id, '?orden=fecha:desc');
    assert.deepEqual(acciones(desc.body), ['ESCALAR', 'FIJAR_RIESGO', 'REGISTRAR']);
    const desde = await historial('qe1', f.h.H6.id, `?desde=${encodeURIComponent(haceDias(2, 1).toISOString())}`);
    assert.deepEqual(acciones(desde.body), ['FIJAR_RIESGO', 'ESCALAR']);
    const hasta = await historial('qe1', f.h.H6.id, `?hasta=${encodeURIComponent(haceDias(2, 12).toISOString())}`);
    assert.deepEqual(acciones(hasta.body), ['REGISTRAR']);
    assert.equal((await historial('qe1', f.h.H6.id, '?desde=hoy')).status, 400);
  });

  it('[E4-B04#2] T05: el analista asignado no ve el riesgo; otro analista 403; Líder, Auditor y Administrador ven todo', async () => {
    assert.deepEqual(acciones((await historial('ana1', f.h.H6.id)).body), ['REGISTRAR', 'ESCALAR']);
    assert.deepEqual((await historial('ana1', f.h.H6.id, '?tipo=RIESGO')).body.items, []);
    assert.equal((await historial('ana3', f.h.H6.id)).status, 403);
    for (const persona of ['lid1', 'aud1', 'adm1'] as const) assert.equal((await historial(persona, f.h.H6.id)).body.items.length, 3, persona);
    assert.equal((await historial(null, f.h.H6.id)).status, 401);
    assert.deepEqual(acciones((await historial('qe1', f.h.H6.id, '?tipo=RIESGO')).body), ['FIJAR_RIESGO']);
  });

  it('[E4-B04#1] T01: resolver deja la entrada con actor, rol, anterior y nuevo', async () => {
    assert.equal((await como(app, 'qe1', 'post', `/v1/impedimentos/${f.i.I2}/resolver`, { comentario: 'Cuentas entregadas' })).status, 200);
    const ultima = (await historial('qe1', f.h.H1.id)).body.items.at(-1);
    assert.deepEqual([ultima.accion, ultima.actor.id, ultima.actor.rol, ultima.anterior, ultima.nuevo, ultima.comentario], ['RESOLVER', PERSONAS.qe1.id, 'QE', 'ABIERTO', 'RESUELTO', 'Cuentas entregadas']);
    assert.ok(ultima.fecha);
  });

  it('[E4-B04#1] T02: fijar el riesgo deja una entrada RIESGO con anterior, nuevo y sugerido', async () => {
    const put = await como(app, 'qe1', 'put', `/v1/hdu/${f.h.H6.id}/riesgo`, { nivel: 'ALTO', justificacion: 'La dependencia sigue sin fecha' });
    assert.equal(put.status, 200);
    const ultima = (await historial('qe1', f.h.H6.id)).body.items.at(-1);
    assert.deepEqual([ultima.tipo, ultima.anterior, ultima.nuevo, ultima.sugeridoAlFijar, ultima.actor.id, ultima.comentario, ultima.impedimento], ['RIESGO', 'MEDIO', 'ALTO', 'ALTO', PERSONAS.qe1.id, 'La dependencia sigue sin fecha', null]);
  });

  it('[E4-B04#3] T06: el historial de una HDU cerrada se conserva íntegro', async () => {
    const r = await historial('aud1', f.h.H7.id);
    assert.deepEqual(acciones(r.body), ['REGISTRAR', 'RESOLVER']);
    assert.deepEqual(r.body.items.map((e: { actor: { id: string } }) => e.actor.id), [PERSONAS.ana3.id, PERSONAS.qe2.id]);
  });

  it('[E4-B04#3] T07: UPDATE y DELETE sobre el historial fallan por permisos (42501) y no hay rutas de edición', async () => {
    const intentos = [
      `UPDATE accion_impedimento SET descripcion = 'x'`,
      'DELETE FROM accion_impedimento',
      `UPDATE riesgo_hdu SET justificacion = 'x'`,
      'DELETE FROM riesgo_hdu',
      'DELETE FROM impedimento',
    ];
    for (const sentencia of intentos) {
      await assert.rejects(prisma.$executeRawUnsafe(sentencia), (error: Error) => /42501|permission denied|permiso/i.test(error.message) || /42501/.test(JSON.stringify(error)), sentencia);
    }
    for (const metodo of ['put', 'delete'] as const) {
      const r = await request(app.getHttpServer())[metodo](`/v1/impedimentos/${f.i.I1}/acciones/1`).set('authorization', `Bearer ${await tokenDe('qe2')}`);
      assert.ok([404, 405].includes(r.status), `${metodo} ${r.status}`);
    }
  });

  it('[E4-B04#1] T08: los intentos rechazados no dejan entradas', async () => {
    const antes = (await historial('qe2', f.h.H3.id)).body.items.length;
    assert.equal((await como(app, 'ana3', 'post', `/v1/impedimentos/${f.i.I1}/resolver`, { comentario: 'Intento' })).status, 403);
    assert.equal((await como(app, 'qe2', 'post', `/v1/impedimentos/${f.i.I1}/reabrir`, { motivo: 'Intento' })).status, 409);
    assert.equal((await como(app, 'qe1', 'put', `/v1/hdu/${f.h.H3.id}/riesgo`, { nivel: 'ALTO', justificacion: 'Intento' })).status, 403);
    assert.equal((await historial('qe2', f.h.H3.id)).body.items.length, antes);
  });

  it('[E4-B04#2] T09: el Auditor ve todos los impedimentos y la gestión, con filtros', async () => {
    const r = await como(app, 'aud1', 'get', `/v1/auditor/impedimentos?hduId=${f.h.H7.id}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.total, 1);
    assert.equal(r.body.items[0].id, f.i.I5);
    assert.equal(r.body.items[0].hdu.id, f.h.H7.id);
    const porTipo = await como(app, 'aud1', 'get', `/v1/auditor/impedimentos?hduId=${f.h.H6.id}&tipo=DEPENDENCIA`);
    assert.deepEqual(porTipo.body.items.map((i: { id: string }) => i.id), [f.i.I3]);
    const gestion = await como(app, 'aud1', 'get', `/v1/auditor/gestion-impedimentos?hduId=${f.h.H7.id}`);
    assert.equal(gestion.body.total, 2);
    assert.deepEqual(gestion.body.items.map((e: { accion: string }) => e.accion), ['RESOLVER', 'REGISTRAR'], 'del más reciente al más antiguo');
    const riesgo = await como(app, 'aud1', 'get', `/v1/auditor/gestion-impedimentos?hduId=${f.h.H6.id}&accion=FIJAR_RIESGO`);
    assert.ok(riesgo.body.total >= 1);
    assert.ok(riesgo.body.items.every((e: { tipo: string }) => e.tipo === 'RIESGO'));
  });

  it('[E4-B04#2] T10: Administrador, QE, Líder y Analista reciben 403 en las 4 rutas del Auditor; sin token, 401', async () => {
    const rutas = ['/v1/auditor/impedimentos', '/v1/auditor/gestion-impedimentos', '/v1/auditor/exportaciones/impedimentos', '/v1/auditor/exportaciones/gestion-impedimentos'];
    for (const persona of ['adm1', 'qe1', 'lid1', 'ana1'] as const) {
      for (const ruta of rutas) assert.equal((await como(app, persona, 'get', ruta)).status, 403, `${persona} ${ruta}`);
    }
    for (const ruta of rutas) assert.equal((await como(app, null, 'get', ruta)).status, 401, ruta);
    assert.equal(falsos.exportaciones.length, 0);
  });

  it('[E4-B04#2] T11: la exportación es un CSV con BOM y ; y queda registrada en la auditoría antes de entregarse', async () => {
    const ruta = `/v1/auditor/exportaciones/impedimentos?hduId=${f.h.H6.id}`;
    const r = await request(app.getHttpServer()).get(ruta).set('authorization', `Bearer ${await tokenDe('aud1')}`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (parte: Buffer) => partes.push(parte));
      res.on('end', () => cb(null, Buffer.concat(partes).toString('utf8')));
    });
    assert.equal(r.status, 200);
    const csv = r.body as unknown as string;
    assert.ok(csv.startsWith('﻿'));
    const lineas = csv.trim().split('\r\n');
    assert.equal(lineas.length, 2, 'encabezado y la fila de I3');
    assert.ok((lineas[0] ?? '').includes(';'));
    assert.equal(r.headers['x-q360-filas'], '1');
    assert.match(String(r.headers['content-disposition']), /quality360-impedimentos-\d{4}-\d{2}-\d{2}\.csv/);
    const registro = falsos.exportaciones.at(-1);
    assert.deepEqual([registro?.recurso, registro?.filas, registro?.sub, registro?.filtros], ['IMPEDIMENTOS', 1, PERSONAS.aud1.id, { hduId: f.h.H6.id }]);

    const gestion = await como(app, 'aud1', 'get', `/v1/auditor/exportaciones/gestion-impedimentos?hduId=${f.h.H7.id}`);
    assert.equal(gestion.status, 200);
    assert.equal(falsos.exportaciones.at(-1)?.recurso, 'GESTION_IMPEDIMENTOS');

    // Si el registro falla no hay archivo (D48).
    falsos.fallarRegistroExportacion = true;
    try {
      const caida = await como(app, 'aud1', 'get', ruta);
      assert.equal(caida.status, 503);
      assert.ok(!String(caida.headers['content-type']).includes('csv'));
    } finally {
      falsos.fallarRegistroExportacion = false;
    }
  });
});
