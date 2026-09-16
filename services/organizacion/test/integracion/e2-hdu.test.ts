/**
 * Integración E2 — Gestión de HDU (E2-B01 a B04) contra Postgres y Supabase
 * Auth locales reales. Certificaciones no está levantado en estas pruebas,
 * así que el cierre siempre debe rechazarse con CHECKLIST_NO_DISPONIBLE (D11).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  autorizacion,
  crearCelulaDePrueba,
  crearSprintDePrueba,
  crearUsuarioDePrueba,
  limpiarBaseDeDatos,
  prisma,
  type UsuarioDePrueba,
} from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

let app: NestExpressApplication;
let admin: UsuarioDePrueba;
let celula: { id: string };
let sprint: { id: string };

async function crearHdu(qe: UsuarioDePrueba, overrides: Partial<{ codigo: string; titulo: string; prioridad: string }> = {}) {
  const codigo = overrides.codigo ?? `HDU-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const respuesta = await request(app.getHttpServer())
    .post('/v1/hdu')
    .set('authorization', autorizacion(qe.token))
    .send({
      codigo,
      titulo: overrides.titulo ?? 'Historia de prueba',
      celulaId: celula.id,
      sprintId: sprint.id,
      prioridad: overrides.prioridad ?? 'MEDIA',
    });
  return respuesta;
}

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin E2' });
  celula = await crearCelulaDePrueba();
  sprint = await crearSprintDePrueba();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /v1/hdu [E2-B01]', () => {
  it('solo el QE puede registrar HDU (x-roles)', async () => {
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await crearHdu(analista);
    assert.equal(respuesta.status, 403);
  });

  it('crea la HDU en PENDIENTE con célula, sprint, prioridad y QE creador (E2-B01#1)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const respuesta = await crearHdu(qe);
    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.body.estado, 'PENDIENTE');
    assert.equal(respuesta.body.celula.id, celula.id);
    assert.equal(respuesta.body.sprint.id, sprint.id);
    assert.equal(respuesta.body.qeResponsable.id, qe.id);
    assert.equal(respuesta.body.analista, null);
    assert.equal(respuesta.headers.location, `/v1/hdu/${respuesta.body.id}`);
  });

  it('valida el esquema antes de crear (400, E2-B01#2)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const respuesta = await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe.token))
      .send({ codigo: '', titulo: '', celulaId: 'no-es-uuid', sprintId: sprint.id, prioridad: 'INVALIDA' });
    assert.equal(respuesta.status, 400);
  });

  it('rechaza el código duplicado sin distinguir mayúsculas (409, E2-B01#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const primera = await crearHdu(qe, { codigo: `DUP-${Date.now()}` });
    assert.equal(primera.status, 201);
    const segunda = await crearHdu(qe, { codigo: primera.body.codigo.toUpperCase() });
    assert.equal(segunda.status, 409);
    assert.equal(segunda.body.codigo, 'CODIGO_HDU_DUPLICADO');
  });

  it('rechaza célula o sprint inexistentes (422 CATALOGO_INVALIDO)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const respuesta = await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe.token))
      .send({ codigo: `SIN-CAT-${Date.now()}`, titulo: 'x', celulaId: '9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10', sprintId: sprint.id, prioridad: 'BAJA' });
    assert.equal(respuesta.status, 422);
    assert.equal(respuesta.body.codigo, 'CATALOGO_INVALIDO');
  });
});

describe('GET /v1/hdu — ámbito [E2-B03]', () => {
  it('un Analista QA solo ve sus HDU asignadas (E2-B03#1)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const otroAnalista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe.id })
      .expect(200);

    const mia = await crearHdu(qe);
    const ajena = await crearHdu(qe);
    await request(app.getHttpServer())
      .put(`/v1/hdu/${mia.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: analista.id })
      .expect(200);
    const rechazo = await request(app.getHttpServer())
      .put(`/v1/hdu/${ajena.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: otroAnalista.id });
    assert.equal(rechazo.status, 422); // otroAnalista no está en el equipo del QE (E2-F02#2)
    assert.equal(rechazo.body.codigo, 'ANALISTA_FUERA_DE_EQUIPO');

    const respuesta = await request(app.getHttpServer()).get('/v1/hdu').set('authorization', autorizacion(analista.token));
    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.body.items.every((item: { id: string }) => item.id === mia.body.id));
  });

  it('un QE ve las HDU donde es responsable o de sus analistas (E2-B03#2)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const otroQe = await crearUsuarioDePrueba('QE');
    const mia = await crearHdu(qe);
    await crearHdu(otroQe);

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/hdu?celulaId=${celula.id}`)
      .set('authorization', autorizacion(qe.token));
    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.body.items.some((item: { id: string }) => item.id === mia.body.id));
    assert.ok(!respuesta.body.items.some((item: { qeResponsable: { id: string } }) => item.qeResponsable?.id === otroQe.id));
  });

  it('el Administrador ve todas las HDU (E2-B03#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    await crearHdu(qe);
    const respuesta = await request(app.getHttpServer()).get('/v1/hdu').set('authorization', autorizacion(admin.token));
    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.body.total >= 1);
  });
});

describe('GET /v1/hdu/{id} — acceso fuera de ámbito (D12)', () => {
  it('un QE ajeno recibe 403 al abrir el detalle (E2-F04#2)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const otroQe = await crearUsuarioDePrueba('QE');
    const hdu = await crearHdu(qe);
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/hdu/${hdu.body.id}`)
      .set('authorization', autorizacion(otroQe.token));
    assert.equal(respuesta.status, 403);
  });
});

describe('PUT /v1/hdu/{id}/analista [E2-F02]', () => {
  it('primera asignación no exige motivo; reasignación sí (E2-F02#3)', async () => {
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
    const hdu = await crearHdu(qe);

    const primera = await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: a1.id });
    assert.equal(primera.status, 200);
    assert.equal(primera.body.cambio, true);
    assert.equal(primera.body.analistaAnterior, null);

    const sinMotivo = await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: a2.id });
    assert.equal(sinMotivo.status, 422);
    assert.equal(sinMotivo.body.codigo, 'MOTIVO_REQUERIDO');

    const conMotivo = await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: a2.id, motivo: 'Redistribución de carga' });
    assert.equal(conMotivo.status, 200);
    assert.equal(conMotivo.body.analistaAnterior.id, a1.id);
    assert.equal(conMotivo.body.analistaNuevo.id, a2.id);
  });

  it('el Administrador puede asignar cualquier analista', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const hdu = await crearHdu(qe);
    const respuesta = await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.body.id}/analista`)
      .set('authorization', autorizacion(admin.token))
      .send({ analistaId: analista.id });
    assert.equal(respuesta.status, 200);
  });
});

describe('POST /v1/hdu/{id}/estado [E2-B02]', () => {
  it('transición válida PENDIENTE -> DISENO_PRUEBAS (E2-B02#1)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const hdu = await crearHdu(qe);
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.body.id}/estado`)
      .set('authorization', autorizacion(qe.token))
      .send({ estado: 'DISENO_PRUEBAS' });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.estadoAnterior, 'PENDIENTE');
    assert.equal(respuesta.body.estadoNuevo, 'DISENO_PRUEBAS');
  });

  it('transición inválida: 409 con las transiciones permitidas (E2-B02#2)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const hdu = await crearHdu(qe);
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.body.id}/estado`)
      .set('authorization', autorizacion(qe.token))
      .send({ estado: 'CERRADA' });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'TRANSICION_INVALIDA');
    assert.deepEqual(respuesta.body.transicionesPermitidas, ['DISENO_PRUEBAS']);
  });

  it('cierre rechazado si el checklist no está disponible (D11, E2-B02#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const hdu = await crearHdu(qe);
    for (const estado of ['DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE']) {
      await request(app.getHttpServer())
        .post(`/v1/hdu/${hdu.body.id}/estado`)
        .set('authorization', autorizacion(qe.token))
        .send({ estado })
        .expect(200);
    }
    const respuesta = await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.body.id}/estado`)
      .set('authorization', autorizacion(qe.token))
      .send({ estado: 'CERRADA' });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'CHECKLIST_NO_DISPONIBLE');
    assert.equal(respuesta.body.checklist.estado, 'indisponible');
  });

  it('el analista asignado puede cambiar el estado; otro analista no (E2-F04#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    const otroAnalista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe.id })
      .expect(200);
    const hdu = await crearHdu(qe);
    await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: analista.id })
      .expect(200);

    const permitido = await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.body.id}/estado`)
      .set('authorization', autorizacion(analista.token))
      .send({ estado: 'DISENO_PRUEBAS' });
    assert.equal(permitido.status, 200);

    const denegado = await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.body.id}/estado`)
      .set('authorization', autorizacion(otroAnalista.token))
      .send({ estado: 'EN_EJECUCION' });
    assert.equal(denegado.status, 403);
  });
});

describe('GET /v1/hdu/{id}/historial [E2-B04]', () => {
  it('incluye creación, estado y asignación en orden cronológico', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe.id })
      .expect(200);
    const hdu = await crearHdu(qe);
    await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.body.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: analista.id })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.body.id}/estado`)
      .set('authorization', autorizacion(qe.token))
      .send({ estado: 'DISENO_PRUEBAS' })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/hdu/${hdu.body.id}/historial`)
      .set('authorization', autorizacion(qe.token));

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.items.length, 3);
    assert.equal(respuesta.body.items[0].tipo, 'ESTADO');
    assert.equal(respuesta.body.items[0].estadoAnterior, null);
    assert.equal(respuesta.body.items[0].estadoNuevo, 'PENDIENTE');
    const tipos = respuesta.body.items.map((item: { tipo: string }) => item.tipo);
    assert.ok(tipos.includes('ASIGNACION'));
    assert.ok(tipos.includes('ESTADO'));

    const fechas = respuesta.body.items.map((item: { fecha: string }) => new Date(item.fecha).getTime());
    const ordenadas = [...fechas].sort((a, b) => a - b);
    assert.deepEqual(fechas, ordenadas);
  });
});
