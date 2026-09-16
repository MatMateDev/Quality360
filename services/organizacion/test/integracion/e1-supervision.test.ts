/**
 * Integración: supervisión, equipo y resúmenes (E1-B03, B04, B05, B06, B09,
 * B12) — supervisión única vigente y ámbito de QE/QA con datos reales.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

let app: NestExpressApplication;
let admin: UsuarioDePrueba;

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin de prueba' });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('PUT /v1/analistas/{id}/supervisor [E1-B09]', () => {
  it('rechaza si el supervisor no es QE o el supervisado no es Analista QA (422, E1-B09#1)', async () => {
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const otroAnalista = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: otroAnalista.id });
    assert.equal(respuesta.status, 422);
    assert.equal(respuesta.body.codigo, 'SUPERVISION_INVALIDA');
  });

  it('primera asignación: no exige motivo y queda vigente (E1-B09#1,2)', async () => {
    const qe1 = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe1.id });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.cambio, true);
    assert.equal(respuesta.body.vigente.qe.id, qe1.id);
    assert.equal(respuesta.body.vigente.hasta, null);
    assert.equal(respuesta.body.anterior, null);
  });

  it('cambiar de QE sin motivo: 422 MOTIVO_REQUERIDO (E1-B12#2)', async () => {
    const qe1 = await crearUsuarioDePrueba('QE');
    const qe2 = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe1.id })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe2.id });
    assert.equal(respuesta.status, 422);
    assert.equal(respuesta.body.codigo, 'MOTIVO_REQUERIDO');
  });

  it('máximo un QE vigente por analista: cierra el anterior y conserva el motivo (E1-B09#2, E1-B12#2)', async () => {
    const qe1 = await crearUsuarioDePrueba('QE');
    const qe2 = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe1.id })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe2.id, motivo: 'Reorganización del equipo' });

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.cambio, true);
    assert.equal(respuesta.body.vigente.qe.id, qe2.id);
    assert.equal(respuesta.body.vigente.motivo, 'Reorganización del equipo');
    assert.ok(respuesta.body.anterior !== null);
    assert.equal(respuesta.body.anterior.qe.id, qe1.id);
    assert.ok(respuesta.body.anterior.hasta !== null);

    const vigentesEnBase = await prisma.supervision.count({ where: { analistaId: analista.id, hasta: null } });
    assert.equal(vigentesEnBase, 1, 'el índice único parcial garantiza una sola relación vigente');
  });

  it('un QE puede supervisar a varios analistas (E1-B09#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const a1 = await crearUsuarioDePrueba('ANALISTA_QA');
    const a2 = await crearUsuarioDePrueba('ANALISTA_QA');
    for (const analista of [a1, a2]) {
      await request(app.getHttpServer())
        .put(`/v1/analistas/${analista.id}/supervisor`)
        .set('authorization', autorizacion(admin.token))
        .send({ qeId: qe.id })
        .expect(200);
    }
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/qe/analistas?qeId=${qe.id}`)
      .set('authorization', autorizacion(admin.token));
    assert.equal(respuesta.body.total, 2);
  });

  it('el historial conserva relaciones anteriores con fechas y motivos, en orden cronológico (E1-F10#3)', async () => {
    const qe1 = await crearUsuarioDePrueba('QE');
    const qe2 = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe1.id })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe2.id, motivo: 'Cambio de célula' })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/analistas/${analista.id}/supervision/historial`)
      .set('authorization', autorizacion(admin.token));

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.items.length, 2);
    assert.equal(respuesta.body.items[0].qe.id, qe1.id);
    assert.equal(respuesta.body.items[1].qe.id, qe2.id);
    assert.equal(respuesta.body.items[1].motivo, 'Cambio de célula');
  });
});

describe('GET /v1/qe/analistas — equipo vigente [E1-F04, E1-B04]', () => {
  it('excluye analistas reasignados a otro QE (E1-F04#2)', async () => {
    const qe1 = await crearUsuarioDePrueba('QE');
    const qe2 = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe1.id })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe2.id, motivo: 'Reasignación' })
      .expect(200);

    const respuesta = await request(app.getHttpServer()).get('/v1/qe/analistas').set('authorization', autorizacion(qe1.token));
    assert.equal(respuesta.body.total, 0);
  });

  it('un QE no ve el equipo de otro QE (403, E1-B04#2, D12)', async () => {
    const qe1 = await crearUsuarioDePrueba('QE');
    const qe2 = await crearUsuarioDePrueba('QE');
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/qe/analistas?qeId=${qe2.id}`)
      .set('authorization', autorizacion(qe1.token));
    assert.equal(respuesta.status, 403);
  });

  it('el Administrador sí puede consultar el equipo de cualquier QE (E1-B04#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/qe/analistas?qeId=${qe.id}`)
      .set('authorization', autorizacion(admin.token));
    assert.equal(respuesta.status, 200);
  });
});

describe('Resúmenes de /v1/inicio/* [E1-B03, B05, B06]', () => {
  it('resumen de equipo del QE: cero solo cuando la consulta no encuentra registros (E1-B03#2)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const respuesta = await request(app.getHttpServer())
      .get('/v1/resumenes/qe/equipo')
      .set('authorization', autorizacion(qe.token));
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.analistasVigentes, 0);
  });

  it('resumen de supervisor de un Analista QA sin QE vigente: null explícito (E1-B05#2)', async () => {
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await request(app.getHttpServer())
      .get('/v1/resumenes/qa/supervisor')
      .set('authorization', autorizacion(analista.token));
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.supervisor, null);
  });

  it('un Analista QA no puede pedir el resumen de otro (403, E1-B05#3)', async () => {
    const a1 = await crearUsuarioDePrueba('ANALISTA_QA');
    const a2 = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/resumenes/qa/supervisor?analistaId=${a2.id}`)
      .set('authorization', autorizacion(a1.token));
    assert.equal(respuesta.status, 403);
  });

  it('el Administrador debe indicar analistaId (400 si falta, E1-B05)', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/v1/resumenes/qa/supervisor')
      .set('authorization', autorizacion(admin.token));
    assert.equal(respuesta.status, 400);
  });

  it('resumen administrativo de usuarios: solo Administrador y refleja altas recientes (E1-B06#1,2,3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const rechazo = await request(app.getHttpServer())
      .get('/v1/resumenes/admin/usuarios')
      .set('authorization', autorizacion(qe.token));
    assert.equal(rechazo.status, 403);

    const respuesta = await request(app.getHttpServer())
      .get('/v1/resumenes/admin/usuarios')
      .set('authorization', autorizacion(admin.token));
    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.body.total >= 2);
  });
});
