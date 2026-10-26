/**
 * E4-B7 · `SeguimientoHdu.certificacionId` es el ciclo activo, o `null` sin ciclo (D58, D86).
 * Impedimentos lo guarda al registrar un impedimento y nunca crea el ciclo.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '#prisma';

import { AlmacenEnMemoria, iniciarOrganizacionFalsa, tokenDe, type OrganizacionFalsa } from './ayudas.js';
import { crearAppDePrueba } from './ayudas-app.js';

let organizacion: OrganizacionFalsa;
let app: NestExpressApplication;
const prisma = new PrismaClient();

before(async () => {
  organizacion = await iniciarOrganizacionFalsa();
  app = await crearAppDePrueba(organizacion.url, new AlmacenEnMemoria());
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
  await prisma.$disconnect();
});

describe('E4-B7 · ciclo activo en el seguimiento', () => {
  it('[E4-B01#1] sin ciclo, certificacionId es null y no se crea ninguno; con el primer cambio, trae el id del ciclo activo', async () => {
    const hdu = organizacion.nuevaHdu();
    const estados = async () => {
      const r = await request(app.getHttpServer())
        .post('/v1/interno/checklist/estados')
        .set('authorization', `Bearer ${await tokenDe('qe')}`)
        .send({ hduIds: [hdu.id] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.items[0] as { certificacionId: string | null; aprobados: number };
    };

    const sinCiclo = await estados();
    assert.deepEqual([sinCiclo.certificacionId, sinCiclo.aprobados], [null, 0]);
    assert.equal(await prisma.certificacion.count({ where: { hduId: hdu.id } }), 0, 'consultar no crea el ciclo');

    const marca = await request(app.getHttpServer())
      .post(`/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`)
      .set('authorization', `Bearer ${await tokenDe('analista')}`)
      .send({ evidencia: { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/browse/PAG-1' } });
    assert.equal(marca.status, 200, JSON.stringify(marca.body));

    const ciclo = await prisma.certificacion.findFirstOrThrow({ where: { hduId: hdu.id, activo: true } });
    assert.equal((await estados()).certificacionId, ciclo.id);
  });

  it('[E4-B01#1] un lote mezcla HDU con y sin ciclo, cada una con su valor', async () => {
    const conCiclo = organizacion.nuevaHdu();
    const sinCiclo = organizacion.nuevaHdu();
    await request(app.getHttpServer())
      .post(`/v1/hdu/${conCiclo.id}/entregables/PLAN_PRUEBAS/marcar`)
      .set('authorization', `Bearer ${await tokenDe('analista')}`)
      .send({ evidencia: { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/browse/PAG-2' } })
      .expect(200);
    const r = await request(app.getHttpServer())
      .post('/v1/interno/checklist/estados')
      .set('authorization', `Bearer ${await tokenDe('admin')}`)
      .send({ hduIds: [sinCiclo.id, conCiclo.id] });
    assert.equal(r.status, 200);
    const ciclo = await prisma.certificacion.findFirstOrThrow({ where: { hduId: conCiclo.id, activo: true } });
    assert.deepEqual(r.body.items.map((i: { hduId: string; certificacionId: string | null }) => [i.hduId, i.certificacionId]), [[sinCiclo.id, null], [conCiclo.id, ciclo.id]]);
  });
});
