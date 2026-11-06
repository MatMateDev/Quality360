/**
 * Una HU sin sprint vigente (sin fila de `historia_sprint` con `fecha_retiro IS NULL`) es un dato inconsistente, p. ej.
 * restos de una prueba fallida. Antes `aHduDominio` lanzaba y respondían 500 el listado (`GET /v1/hdu`), el detalle,
 * el historial, las escrituras y `/acceso` (y por él, 503 en Certificaciones e Impedimentos).
 *
 * El contrato exige `HduResumen.sprint` no nulo y no tiene un código para «datos inconsistentes», así que Organización
 * trata esa HU como inexistente en toda lectura (lista, contadores, ámbito, lote, detalle → 404/403 por D12, `/acceso` →
 * `permitido:false`), pero su código sigue ocupado: `POST /v1/hdu` da 409 y E5 la ve como existente (DEF-SINSPRINT-01
 * a 03). La carga semilla puede repararla fijándole el sprint. La prueba borra en `after` todo lo que crea (DEF-04).
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
  borrarCreados,
  crearUsuarioDePrueba,
  limpiarBaseDeDatos,
  nuevosCreados,
  prisma,
  type UsuarioDePrueba,
} from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

const TOKEN_SERVICIO = process.env.X_Q360_SERVICIO_TOKEN as string;
const creados = nuevosCreados();

let app: NestExpressApplication;
let admin: UsuarioDePrueba;
let qe: UsuarioDePrueba;
let analista: UsuarioDePrueba;
let celulaId: string;
let sana: { id: string };
let rota: { id: string };
let retirada: { id: string };

const http = () => request(app.getHttpServer());
const como = (usuario: UsuarioDePrueba) => ({ authorization: autorizacion(usuario.token) });

async function crearUsuario(...args: Parameters<typeof crearUsuarioDePrueba>): ReturnType<typeof crearUsuarioDePrueba> {
  const usuario = await crearUsuarioDePrueba(...args);
  creados.usuarios.push(usuario.id);
  return usuario;
}

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuario('ADMINISTRADOR', { nombre: 'Admin sin sprint' });
  qe = await crearUsuario('QE', { nombre: 'QE sin sprint' });
  analista = await crearUsuario('ANALISTA_QA', { nombre: 'Analista sin sprint' });
  const celula = await prisma.celula.create({ data: { nombre: 'Célula sin sprint' } });
  celulaId = celula.id;
  creados.celulas.push(celula.id);
  const sprint = await prisma.sprint.create({ data: { nombre: 'Sprint sin sprint', inicio: new Date('2026-01-01'), fin: new Date('2026-01-14'), celulaId } });
  creados.sprints.push(sprint.id);

  const alta = await http()
    .post('/v1/hdu')
    .set(como(qe))
    .send({ codigo: 'SANA-1', titulo: 'HDU con sprint', celulaId, sprintId: sprint.id, prioridad: 'MEDIA' })
    .expect(201);
  sana = { id: alta.body.id };
  creados.hdus.push(sana.id);

  const base = {
    titulo: 'HDU sin sprint vigente',
    celulaId,
    prioridad: 'MEDIA' as const,
    qeResponsableId: qe.id,
    analistaId: analista.id,
    creadoPorTipo: 'USUARIO' as const,
    creadoPorId: admin.id,
    creadoPorNombre: admin.nombre,
  };
  // Sin ninguna fila de historia_sprint (lo que dejó la prueba DEF-E5C-05 al fallar).
  rota = await prisma.hdu.create({ data: { ...base, codigo: 'ROTA-1', codigoNormalizado: 'rota-1' } });
  creados.hdus.push(rota.id);
  // Con historia_sprint, pero solo retirada.
  retirada = await prisma.hdu.create({ data: { ...base, codigo: 'ROTA-2', codigoNormalizado: 'rota-2' } });
  creados.hdus.push(retirada.id);
  await prisma.historiaSprint.create({ data: { hduId: retirada.id, sprintId: sprint.id, fechaRetiro: new Date() } });
  await prisma.hdu.update({ where: { id: sana.id }, data: { analistaId: analista.id } });
});

after(async () => {
  try {
    await borrarCreados(creados);
    const restos = await prisma.hdu.count({ where: { codigoNormalizado: { in: ['sana-1', 'rota-1', 'rota-2'] } } });
    assert.equal(restos, 0, 'la prueba debe borrar sus HDU');
  } finally {
    await app?.close();
    await prisma.$disconnect();
  }
});

describe('HU sin sprint vigente · listados y contadores (DEF-SINSPRINT-02)', () => {
  for (const rol of ['ADMINISTRADOR', 'QE', 'ANALISTA_QA'] as const) {
    it(`GET /v1/hdu responde 200 al ${rol} y excluye las HU sin sprint vigente`, async () => {
      const quien = rol === 'ADMINISTRADOR' ? admin : rol === 'QE' ? qe : analista;
      const respuesta = await http().get('/v1/hdu').set(como(quien));
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
      assert.deepEqual(respuesta.body.items.map((item: { id: string }) => item.id), [sana.id]);
      assert.equal(respuesta.body.total, 1);
    });
  }

  it('los contadores del inicio cuadran con la lista (QE: hduEnAmbito; QA: hduAsignadas)', async () => {
    const delQe = await http().get('/v1/resumenes/qe/hdu').set(como(qe)).expect(200);
    assert.equal(delQe.body.hduEnAmbito, 1);
    assert.equal(delQe.body.porEstado.PENDIENTE, 1);
    const delQa = await http().get('/v1/resumenes/qa/hdu').set(como(analista)).expect(200);
    assert.equal(delQa.body.hduAsignadas, 1);
  });

  it('los listados del repositorio también las excluyen en vez de fallar', async () => {
    const servicio = new PrismaService();
    const repo = new HduPrismaRepositorio(servicio);
    try {
      assert.deepEqual((await repo.buscarPorIds([sana.id, rota.id, retirada.id])).map((h) => h.id), [sana.id]);
      assert.deepEqual((await repo.listarTodasPorAmbito({ tipo: 'TODAS' })).map((h) => h.id), [sana.id]);
      assert.deepEqual(await repo.listarIdsPorAmbito({ tipo: 'ANALISTA', analistaId: analista.id }), [sana.id]);
      assert.equal(await repo.contarTodas(), 1);
    } finally {
      await servicio.$disconnect();
    }
  });
});

describe('HU sin sprint vigente · lecturas y escrituras por id (DEF-SINSPRINT-01)', () => {
  for (const hdu of [() => rota, () => retirada]) {
    it('detalle e historial: 404 al Administrador, 403 genérico al QE (D12), nunca 500', async () => {
      const { id } = hdu();
      assert.equal((await http().get(`/v1/hdu/${id}`).set(como(admin))).status, 404);
      assert.equal((await http().get(`/v1/hdu/${id}/historial`).set(como(admin))).status, 404);
      assert.equal((await http().get(`/v1/hdu/${id}`).set(como(qe))).status, 403);
      assert.equal((await http().get(`/v1/hdu/${id}/historial`).set(como(analista))).status, 403);
    });
  }

  it('escrituras: cambio de estado, asignación de analista y reasignación de QE no responden 500', async () => {
    assert.equal((await http().post(`/v1/hdu/${rota.id}/estado`).set(como(qe)).send({ estado: 'DISENO_PRUEBAS' })).status, 403);
    assert.equal((await http().put(`/v1/hdu/${rota.id}/analista`).set(como(admin)).send({ analistaId: analista.id, motivo: 'Prueba' })).status, 404);
    assert.equal((await http().put(`/v1/hdu/${rota.id}/qe-responsable`).set(como(admin)).send({ qeResponsableId: qe.id, motivo: 'Prueba' })).status, 404);
    const estado = await prisma.hdu.findUniqueOrThrow({ where: { id: rota.id } });
    assert.equal(estado.estado, 'PENDIENTE');
  });

  it('/v1/interno/hdu/{id}/acceso responde 200 con permitido:false (Certificaciones e Impedimentos dan 403, no 503)', async () => {
    for (const quien of [admin, qe, analista]) {
      const acceso = await http().get(`/v1/interno/hdu/${rota.id}/acceso`).set(como(quien));
      assert.equal(acceso.status, 200, JSON.stringify(acceso.body));
      assert.equal(acceso.body.permitido, false);
    }
    const sanaAcceso = await http().get(`/v1/interno/hdu/${sana.id}/acceso`).set(como(qe)).expect(200);
    assert.equal(sanaAcceso.body.permitido, true);
  });
});

describe('HU sin sprint vigente · ámbito, lote y E5 coherentes (DEF-SINSPRINT-03)', () => {
  it('hdu/ambito no la incluye y el lote la trata como un id desconocido (403 restringido, omitida con ámbito total)', async () => {
    const ambito = await http().get('/v1/interno/hdu/ambito').set(como(qe)).expect(200);
    assert.deepEqual(ambito.body.hduIds, [sana.id]);
    assert.equal((await http().post('/v1/interno/hdu/consulta').set(como(qe)).send({ hduIds: [rota.id] })).status, 403);
    const lote = await http().post('/v1/interno/hdu/consulta').set(como(qe)).send({ hduIds: [sana.id] }).expect(200);
    assert.deepEqual(lote.body.items.map((item: { id: string }) => item.id), [sana.id]);
    const total = await http().post('/v1/interno/hdu/consulta').set(como(admin)).send({ hduIds: [sana.id, rota.id] }).expect(200);
    assert.deepEqual(total.body.items.map((item: { id: string }) => item.id), [sana.id]);
  });

  it('el código sigue ocupado: estado-codigos responde existe:true (como upsert) y POST /v1/hdu da 409', async () => {
    const estados = await http()
      .post('/v1/interno/integraciones/hdu/estado-codigos')
      .set(como(admin))
      .send({ codigos: ['ROTA-1', 'rota-2', 'SANA-1', 'NADA-9'] })
      .expect(200);
    assert.deepEqual(
      estados.body.items.map((item: { existe: boolean; idHistoria: string | null }) => [item.existe, item.idHistoria]),
      [[true, rota.id], [true, retirada.id], [true, sana.id], [false, null]],
    );
    const sprint = creados.sprints[0] as string;
    const duplicada = await http().post('/v1/hdu').set(como(qe)).send({ codigo: 'rota-1', titulo: 'Otra', celulaId, sprintId: sprint, prioridad: 'MEDIA' });
    assert.equal(duplicada.status, 409);
    assert.equal(duplicada.body.codigo, 'CODIGO_HDU_DUPLICADO');
  });
});

describe('HU sin sprint vigente · reparación', () => {
  it('la carga semilla le fija el sprint y vuelve a verse en el detalle y en la lista', async () => {
    const sprint = creados.sprints[0] as string;
    const reparada = await http().put(`/v1/interno/carga/hdu/${rota.id}/sprint`).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ sprintId: sprint });
    assert.equal(reparada.status, 200, JSON.stringify(reparada.body));
    assert.equal(reparada.body.cambio, true);
    const detalle = await http().get(`/v1/hdu/${rota.id}`).set(como(admin)).expect(200);
    assert.equal(detalle.body.sprint.id, sprint);
    const lista = await http().get('/v1/hdu').set(como(admin)).expect(200);
    assert.equal(lista.body.total, 2);
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
