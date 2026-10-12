/**
 * Modelo de datos (D23–D27): el checklist se guarda como Certificacion →
 * ItemChecklist / Entregable → Evidencia, con AsignacionCertificacion del analista.
 * Se verifica directo en Postgres local (esquema `certificaciones`).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '#prisma';

import { CLAVES_ENTREGABLE, NOMBRES_ENTREGABLE } from '../src/dominio/entregables.js';
import { AlmacenEnMemoria, PERSONAS, iniciarOrganizacionFalsa, tokenDe, type ClavePersona, type OrganizacionFalsa } from './ayudas.js';
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

async function llamar(persona: ClavePersona, ruta: string, cuerpo?: object) {
  const token = await tokenDe(persona);
  return request(app.getHttpServer()).post(ruta).set('authorization', `Bearer ${token}`).send(cuerpo ?? {});
}

const enlace = (n: number) => ({ evidencia: { tipo: 'ENLACE', url: `https://jira.ejemplo.cl/browse/PAG-${n}` } });

describe('Modelo de datos de Certificaciones', () => {
  it('sin cambios no hay certificación; el primer cambio crea el ciclo 1 con 10 ítems y 10 entregables', async () => {
    const hdu = organizacion.nuevaHdu();
    assert.equal(await prisma.certificacion.count({ where: { hduId: hdu.id } }), 0);

    const marca = await llamar('analista', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace(1));
    assert.equal(marca.status, 200, JSON.stringify(marca.body));

    const certificacion = await prisma.certificacion.findFirstOrThrow({
      where: { hduId: hdu.id },
      include: { items: { orderBy: { orden: 'asc' } }, entregables: true, asignaciones: true },
    });
    assert.equal(certificacion.numeroCiclo, 1);
    assert.equal(certificacion.activo, true);
    assert.equal(certificacion.estado, 'EN_CURSO');
    assert.deepEqual(
      certificacion.items.map((item) => [item.orden, item.clave, item.nombre]),
      CLAVES_ENTREGABLE.map((clave, indice) => [indice + 1, clave, NOMBRES_ENTREGABLE[clave]]),
    );
    assert.equal(certificacion.entregables.length, 10);
    for (const entregable of certificacion.entregables) {
      const item = certificacion.items.find((i) => i.id === entregable.itemChecklistId);
      assert.equal(item?.clave, entregable.clave, 'cada entregable apunta a su ítem del checklist');
    }
    assert.deepEqual(
      certificacion.asignaciones.map((a) => [a.usuarioId, a.fechaHasta]),
      [[PERSONAS.analista.id, null]],
      'el analista que marca queda asignado al ciclo',
    );
  });

  it('cada marca agrega una evidencia; al rechazar deja de estar vigente pero queda en el historial', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace(1));
    const rechazo = await llamar('qe', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Falta el alcance' });
    assert.equal(rechazo.status, 200);
    assert.equal(rechazo.body.evidencia, null);
    const segunda = await llamar('analista', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace(2));
    assert.equal(segunda.body.evidencia.url, 'https://jira.ejemplo.cl/browse/PAG-2');

    const evidencias = await prisma.evidencia.findMany({
      where: { entregable: { clave: 'PLAN_PRUEBAS', certificacion: { hduId: hdu.id } } },
      orderBy: { fechaCarga: 'asc' },
    });
    assert.deepEqual(
      evidencias.map((e) => [e.tipo, e.referencia]),
      [
        ['ENLACE', 'https://jira.ejemplo.cl/browse/PAG-1'],
        ['ENLACE', 'https://jira.ejemplo.cl/browse/PAG-2'],
      ],
    );
  });

  it('con los 10 entregables aprobados el ciclo queda COMPLETADA con fecha de fin y el certificado ligado', async () => {
    const hdu = organizacion.nuevaHdu();
    for (const [indice, clave] of CLAVES_ENTREGABLE.entries()) {
      if (clave === 'CERTIFICADO') {
        const certificado = await llamar('qe', `/v1/hdu/${hdu.id}/certificado`);
        assert.equal(certificado.status, 201, JSON.stringify(certificado.body));
        continue;
      }
      const marca = await llamar('analista', `/v1/hdu/${hdu.id}/entregables/${clave}/marcar`, enlace(indice));
      assert.equal(marca.status, 200, JSON.stringify(marca.body));
      const aprobacion = await llamar('qe', `/v1/hdu/${hdu.id}/entregables/${clave}/aprobar`);
      assert.equal(aprobacion.status, 200, JSON.stringify(aprobacion.body));
    }

    const certificacion = await prisma.certificacion.findFirstOrThrow({ where: { hduId: hdu.id }, include: { certificado: true } });
    assert.equal(certificacion.estado, 'COMPLETADA');
    assert.ok(certificacion.fechaFin !== null);
    assert.equal(certificacion.certificado?.hduId, hdu.id);
    const evidenciaPdf = await prisma.evidencia.findFirstOrThrow({ where: { tipo: 'CERTIFICADO', entregable: { certificacionId: certificacion.id } } });
    assert.equal(evidenciaPdf.folio, certificacion.certificado?.folio);
  });
});
