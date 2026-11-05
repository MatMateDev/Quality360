/**
 * Una HU sin sprint vigente (sin fila de `historia_sprint` con `fecha_retiro IS NULL`) es un dato inconsistente, p. ej.
 * restos de una prueba fallida. Antes `aHduDominio` fallaba y `GET /v1/hdu` respondía 500 ERROR_INTERNO a todos los
 * usuarios. El contrato exige `HduResumen.sprint` no nulo, así que los listados la excluyen (con aviso en el registro)
 * y `total` sigue cuadrando con los ítems.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { HduPrismaRepositorio } from '../../src/infraestructura/repositorios/hdu.prisma.repositorio.js';
import { aHdusDominio, type HduConSprint } from '../../src/infraestructura/prisma/mapeadores.js';
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
let qe: UsuarioDePrueba;
let sana: { id: string };
let rota: { id: string };
let retirada: { id: string };

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin sin sprint' });
  qe = await crearUsuarioDePrueba('QE', { nombre: 'QE sin sprint' });
  const celula = await crearCelulaDePrueba();
  const sprint = await crearSprintDePrueba();

  const alta = await request(app.getHttpServer())
    .post('/v1/hdu')
    .set('authorization', autorizacion(qe.token))
    .send({ codigo: 'SANA-1', titulo: 'HDU con sprint', celulaId: celula.id, sprintId: sprint.id, prioridad: 'MEDIA' })
    .expect(201);
  sana = { id: alta.body.id };

  const base = {
    titulo: 'HDU sin sprint vigente',
    celulaId: celula.id,
    prioridad: 'MEDIA' as const,
    qeResponsableId: qe.id,
    creadoPorTipo: 'USUARIO' as const,
    creadoPorId: admin.id,
    creadoPorNombre: admin.nombre,
  };
  // Sin ninguna fila de historia_sprint (lo que dejó la prueba DEF-E5C-05 al fallar).
  rota = await prisma.hdu.create({ data: { ...base, codigo: 'ROTA-1', codigoNormalizado: 'rota-1' } });
  // Con historia_sprint, pero solo retirada.
  retirada = await prisma.hdu.create({ data: { ...base, codigo: 'ROTA-2', codigoNormalizado: 'rota-2' } });
  await prisma.historiaSprint.create({ data: { hduId: retirada.id, sprintId: sprint.id, fechaRetiro: new Date() } });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('HU sin sprint vigente', () => {
  for (const rol of ['ADMINISTRADOR', 'QE'] as const) {
    it(`GET /v1/hdu responde 200 al ${rol} y excluye las HU sin sprint vigente`, async () => {
      const token = rol === 'ADMINISTRADOR' ? admin.token : qe.token;
      const respuesta = await request(app.getHttpServer()).get('/v1/hdu').set('authorization', autorizacion(token));
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      const ids = respuesta.body.items.map((item: { id: string }) => item.id);
      assert.deepEqual(ids, [sana.id]);
      assert.equal(respuesta.body.total, 1);
      assert.ok(respuesta.body.items.every((item: { sprint: { id: string } | null }) => item.sprint !== null));
    });
  }

  it('los listados del repositorio también las excluyen en vez de fallar', async () => {
    const servicio = new PrismaService();
    const repo = new HduPrismaRepositorio(servicio);
    try {
      const porIds = await repo.buscarPorIds([sana.id, rota.id, retirada.id]);
      assert.deepEqual(porIds.map((h) => h.id), [sana.id]);
      const todas = await repo.listarTodasPorAmbito({ tipo: 'TODAS' });
      assert.deepEqual(todas.map((h) => h.id), [sana.id]);
      const porCodigo = await repo.buscarPorCodigosNormalizados(['sana-1', 'rota-1', 'rota-2']);
      assert.deepEqual(porCodigo.map((h) => h.id), [sana.id]);
    } finally {
      await servicio.$disconnect();
    }
  });
});

describe('aHdusDominio', () => {
  it('descarta las filas sin sprint vigente y avisa con su código', () => {
    const fila = (codigo: string, sprintId: string | null | undefined): HduConSprint =>
      ({
        id: `id-${codigo}`,
        codigo,
        historiaSprints: sprintId === undefined ? [] : [{ sprintId }],
        creadoPorTipo: 'USUARIO',
        creadoPorId: 'x',
        creadoPorNombre: 'x',
      }) as unknown as HduConSprint;
    const avisos: string[] = [];
    const hdus = aHdusDominio([fila('A-1', 's1'), fila('B-1', undefined), fila('C-1', null)], (m) => avisos.push(m));
    assert.deepEqual(hdus.map((h) => h.codigo), ['A-1']);
    assert.equal(hdus[0]?.sprintId, 's1');
    assert.equal(avisos.length, 1);
    assert.match(avisos[0] ?? '', /B-1.*C-1/);
  });
});
