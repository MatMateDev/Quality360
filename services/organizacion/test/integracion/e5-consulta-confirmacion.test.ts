/**
 * Integración E5 consulta y asignación · OC2: `POST /v1/interno/integraciones/hdu/upsert` en modo confirmación
 * (`consultaId`, `operacion`, `asignacion`; D140, D141, D144, D151) contra Postgres y Supabase Auth locales reales.
 * IDs de `docs/backlog/e5-consulta-asignacion.md`: E5-B05-T13, T15, T16, T19, T20, T21.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

const UPSERT = '/v1/interno/integraciones/hdu/upsert';
const CONSULTA_ID = randomUUID();
const ACTOR = { actorTipo: 'USUARIO', actorId: '00000000-0000-4000-8000-000000000001', actorNombre: 'Admin' } as const;
const MOTIVO_INICIAL = 'Asignación inicial al confirmar la consulta de Jira';

let app: NestExpressApplication;
let admin: UsuarioDePrueba;
let qe1: UsuarioDePrueba;
let qe2: UsuarioDePrueba;
let ana3: UsuarioDePrueba;
let celulaC: { id: string };
let celulaA: { id: string };
let sprint2: { id: string };
let sprintDeA: { id: string };

const asignacion = (parcial: Record<string, string> = {}) => ({ celulaId: celulaC.id, qeResponsableId: qe2.id, analistaId: ana3.id, sprintId: sprint2.id, ...parcial });
const crear = (n: number, codigo: string, extra: Record<string, unknown> = {}) => ({
  fila: n,
  codigo,
  titulo: `Título de ${codigo}`,
  descripcion: 'Como usuario quiero algo',
  prioridad: 'ALTA',
  claveExterna: codigo,
  urlExterna: `https://jira.test/browse/${codigo}`,
  operacion: 'CREAR',
  asignacion: asignacion(),
  ...extra,
});
const actualizar = (n: number, codigo: string, extra: Record<string, unknown> = {}) => ({
  fila: n,
  codigo,
  titulo: `Título de ${codigo}`,
  claveExterna: codigo,
  urlExterna: `https://jira.test/browse/${codigo}`,
  operacion: 'ACTUALIZAR',
  ...extra,
});
const enviar = (filas: unknown[], extra: Record<string, unknown> = {}, quien: UsuarioDePrueba = admin) =>
  request(app.getHttpServer()).post(UPSERT).set('authorization', autorizacion(quien.token)).send({ origen: 'JIRA', consultaId: CONSULTA_ID, filas, ...extra });

async function hdu(codigo: string) {
  return prisma.hdu.findUnique({ where: { codigoNormalizado: codigo.toLowerCase() }, include: { historiaSprints: true } });
}

async function crearManual(codigo: string, parcial: Record<string, unknown> = {}) {
  return prisma.hdu.create({
    data: {
      codigo,
      codigoNormalizado: codigo.toLowerCase(),
      titulo: 'Título viejo',
      descripcion: 'Descripción vieja',
      celulaId: celulaA.id,
      historiaSprints: { create: { sprintId: sprintDeA.id } },
      prioridad: 'BAJA',
      qeResponsableId: qe1.id,
      analistaId: null,
      estado: 'EN_EJECUCION',
      creadoPorTipo: 'USUARIO',
      creadoPorId: qe1.id,
      creadoPorNombre: 'QE Uno',
      origen: 'MANUAL',
      ...parcial,
    },
  });
}

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin OC2' });
  qe1 = await crearUsuarioDePrueba('QE', { nombre: 'QE Uno' });
  qe2 = await crearUsuarioDePrueba('QE', { nombre: 'QE Dos' });
  ana3 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA3' });
  celulaC = await prisma.celula.create({ data: { nombre: 'CEL-C OC2' }, select: { id: true } });
  celulaA = await prisma.celula.create({ data: { nombre: 'CEL-A OC2' }, select: { id: true } });
  const inicio = new Date('2026-10-01');
  const fin = new Date('2026-10-14');
  sprint2 = await prisma.sprint.create({ data: { nombre: 'E5 Sprint 2', inicio, fin, celulaId: celulaC.id }, select: { id: true } });
  sprintDeA = await prisma.sprint.create({ data: { nombre: 'Sprint de CEL-A', inicio, fin, celulaId: celulaA.id }, select: { id: true } });
  await prisma.supervision.create({ data: { qeId: qe2.id, analistaId: ana3.id, ...ACTOR } });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('upsert en modo confirmación · CREAR [E5-B05-T13]', () => {
  it('crea en PENDIENTE con célula, sprint, QE y analista elegidos, historial de asignación inicial y auditoría con consultaId', async () => {
    const r = await enviar([crear(1, 'QTY-1'), crear(2, 'QTY-2')]);
    assert.equal(r.status, 200);
    assert.equal(r.body.simulado, false);
    assert.deepEqual(r.body.filas.map((f: { resultado: string; motivo: unknown }) => [f.resultado, f.motivo]), [['CREADA', null], ['CREADA', null]]);

    const creada = await hdu('QTY-1');
    assert.ok(creada);
    assert.deepEqual(
      [creada.estado, creada.celulaId, creada.qeResponsableId, creada.analistaId, creada.origen, creada.claveExterna, creada.creadoPorId, creada.prioridad],
      ['PENDIENTE', celulaC.id, qe2.id, ana3.id, 'JIRA', 'QTY-1', admin.id, 'ALTA'],
    );
    assert.deepEqual(creada.historiaSprints.map((s) => [s.sprintId, s.fechaRetiro]), [[sprint2.id, null]]);
    assert.equal(r.body.filas[0].idHistoria, creada.id);

    const historial = await prisma.hduHistorialAsignacion.findMany({ where: { hduId: creada.id } });
    assert.equal(historial.length, 1);
    assert.deepEqual([historial[0]?.analistaAnteriorId, historial[0]?.analistaNuevoId, historial[0]?.motivo, historial[0]?.actorId], [null, ana3.id, MOTIVO_INICIAL, admin.id]);

    const auditoria = await prisma.auditoria.findFirst({ where: { entidadId: creada.id, accion: 'CREAR_HDU' } });
    const despues = auditoria?.despues as Record<string, unknown>;
    assert.equal(despues.consultaId, CONSULTA_ID);
    assert.equal(despues.origen, 'JIRA');
    assert.deepEqual(despues.asignacion, asignacion());
  });

  it('el código existente (sin distinguir mayúsculas) se omite con HDU_CREADA_DESPUES y no se modifica [E5-B05-T19]', async () => {
    const manual = await crearManual('QTY-3');
    const r = await enviar([crear(1, 'qty-3', { titulo: 'No debe pisar' }), crear(2, 'QTY-4')]);
    assert.deepEqual(r.body.filas.map((f: { resultado: string; motivo: string | null }) => [f.resultado, f.motivo]), [['OMITIDA', 'HDU_CREADA_DESPUES'], ['CREADA', null]]);
    assert.equal(r.body.filas[0].idHistoria, manual.id);
    assert.deepEqual(r.body.filas[0].existente, { idHistoria: manual.id, qe: 'QE Uno', analista: null, creadaPorEstaConsulta: false, creadaPorActor: false });
    assert.equal(r.body.filas[1].existente, undefined);
    const igual = await hdu('QTY-3');
    assert.deepEqual([igual?.titulo, igual?.origen, igual?.qeResponsableId], ['Título viejo', 'MANUAL', qe1.id]);
  });

  it('existente: quién tiene la HDU y si la creó esta consulta y este actor; sin 409 [E5-B07-T04, T07, T08]', async () => {
    const otroAdmin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin Otro' });
    const primera = await enviar([crear(1, 'QTY-REP')]);
    assert.equal(primera.status, 200);
    assert.equal(primera.body.filas[0].resultado, 'CREADA');
    assert.equal(primera.body.filas[0].existente, undefined);
    const id = primera.body.filas[0].idHistoria;

    const mismo = await enviar([crear(1, 'QTY-REP')]);
    assert.equal(mismo.status, 200);
    assert.deepEqual(mismo.body.filas[0].existente, { idHistoria: id, qe: 'QE Dos', analista: 'ANA3', creadaPorEstaConsulta: true, creadaPorActor: true });

    const otroActor = await enviar([crear(1, 'QTY-REP')], {}, otroAdmin);
    assert.equal(otroActor.status, 200);
    assert.deepEqual([otroActor.body.filas[0].existente.creadaPorEstaConsulta, otroActor.body.filas[0].existente.creadaPorActor], [true, false]);

    const otraConsulta = await enviar([crear(1, 'QTY-REP')], { consultaId: randomUUID() });
    assert.deepEqual([otraConsulta.body.filas[0].existente.creadaPorEstaConsulta, otraConsulta.body.filas[0].existente.creadaPorActor], [false, true]);
    assert.equal(await prisma.hdu.count({ where: { codigoNormalizado: 'qty-rep' } }), 1);
  });

  it('dos solicitudes simultáneas con el mismo código: una crea y la otra responde OMITIDA con existente [E5-B07-T11]', async () => {
    const [a, b] = await Promise.all([enviar([crear(1, 'QTY-CARRERA')]), enviar([crear(1, 'QTY-CARRERA')])]);
    const filas = [a.body.filas[0], b.body.filas[0]];
    assert.deepEqual(filas.map((f: { resultado: string }) => f.resultado).sort(), ['CREADA', 'OMITIDA']);
    const omitida = filas.find((f: { resultado: string }) => f.resultado === 'OMITIDA');
    assert.equal(omitida.motivo, 'HDU_CREADA_DESPUES');
    assert.deepEqual([omitida.existente.qe, omitida.existente.analista, omitida.existente.creadaPorEstaConsulta, omitida.existente.creadaPorActor], ['QE Dos', 'ANA3', true, true]);
    assert.equal(await prisma.hdu.count({ where: { codigoNormalizado: 'qty-carrera' } }), 1);
  });

  it('una asignación que dejó de ser válida es ERROR ASIGNACION_INVALIDA con el campo y no crea nada; las demás sí', async () => {
    const r = await enviar([
      crear(1, 'QTY-5', { asignacion: asignacion({ analistaId: qe1.id }) }),
      crear(2, 'QTY-6', { asignacion: asignacion({ qeResponsableId: qe1.id }) }),
      crear(3, 'QTY-7', { asignacion: asignacion({ sprintId: sprintDeA.id }) }),
      crear(4, 'QTY-8'),
    ]);
    assert.deepEqual(
      r.body.filas.map((f: { resultado: string; motivo: string | null; errorAsignacion?: unknown }) => [f.resultado, f.motivo, f.errorAsignacion ?? null]),
      [
        ['ERROR', 'ASIGNACION_INVALIDA', { campo: 'analistaId', codigo: 'ANALISTA_INVALIDO' }],
        ['ERROR', 'ASIGNACION_INVALIDA', { campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' }],
        ['ERROR', 'ASIGNACION_INVALIDA', { campo: 'sprintId', codigo: 'CATALOGO_INVALIDO' }],
        ['CREADA', null, null],
      ],
    );
    for (const codigo of ['QTY-5', 'QTY-6', 'QTY-7']) assert.equal(await hdu(codigo), null);
    assert.ok(await hdu('QTY-8'));
  });

  it('las reglas de la fila siguen valiendo (título vacío) y no se escribe el analista cuando falla', async () => {
    const r = await enviar([crear(1, 'QTY-9', { titulo: '   ' })]);
    assert.deepEqual([r.body.filas[0].resultado, r.body.filas[0].motivo], ['ERROR', 'TITULO_VACIO']);
    assert.equal(await hdu('QTY-9'), null);
  });
});

describe('upsert en modo confirmación · ACTUALIZAR [E5-B05-T15, T16, T20]', () => {
  it('actualiza solo título, descripción y prioridad, vincula la manual y no toca estado, analista, QE, célula ni sprint', async () => {
    const manual = await crearManual('QTY-10');
    const antesHistorial = await prisma.hduHistorialEstado.count({ where: { hduId: manual.id } });
    const r = await enviar([actualizar(1, 'QTY-10', { titulo: 'Título nuevo', descripcion: 'Descripción nueva', prioridad: 'CRITICA' })]);
    assert.equal(r.status, 200);
    const fila = r.body.filas[0];
    assert.deepEqual([fila.resultado, fila.idHistoria], ['ACTUALIZADA', manual.id]);
    assert.deepEqual(Object.keys(fila.cambios).sort(), ['descripcion', 'prioridad', 'titulo']);
    const despues = await hdu('QTY-10');
    assert.deepEqual(
      [despues?.titulo, despues?.descripcion, despues?.prioridad, despues?.origen, despues?.claveExterna, despues?.urlExterna],
      ['Título nuevo', 'Descripción nueva', 'CRITICA', 'JIRA', 'QTY-10', 'https://jira.test/browse/QTY-10'],
    );
    assert.deepEqual(
      [despues?.estado, despues?.analistaId, despues?.qeResponsableId, despues?.celulaId, despues?.historiaSprints[0]?.sprintId],
      ['EN_EJECUCION', null, qe1.id, celulaA.id, sprintDeA.id],
    );
    assert.equal(await prisma.hduHistorialEstado.count({ where: { hduId: manual.id } }), antesHistorial);
    const auditoria = await prisma.auditoria.findFirst({ where: { entidadId: manual.id, accion: 'ACTUALIZAR_HDU' } });
    assert.equal((auditoria?.antes as Record<string, unknown>).titulo, 'Título viejo');
    assert.equal((auditoria?.despues as Record<string, unknown>).origen, 'JIRA');
  });

  it('una HDU cerrada se omite con HDU_CERRADA; sin diferencias, SIN_CAMBIOS; inexistente, ERROR_INTERNO', async () => {
    await crearManual('QTY-11', { estado: 'CERRADA' });
    await crearManual('QTY-12', { titulo: 'Igual', descripcion: 'Igual', prioridad: 'MEDIA', origen: 'JIRA', claveExterna: 'QTY-12', urlExterna: 'https://jira.test/browse/QTY-12' });
    const r = await enviar([
      actualizar(1, 'QTY-11', { titulo: 'Otro' }),
      actualizar(2, 'QTY-12', { titulo: 'Igual', descripcion: 'Igual', prioridad: 'MEDIA' }),
      actualizar(3, 'QTY-NO-EXISTE'),
    ]);
    assert.deepEqual(r.body.filas.map((f: { resultado: string; motivo: string | null }) => [f.resultado, f.motivo]), [['OMITIDA', 'HDU_CERRADA'], ['OMITIDA', 'SIN_CAMBIOS'], ['ERROR', 'ERROR_INTERNO']]);
    assert.equal((await hdu('QTY-11'))?.titulo, 'Título viejo');
  });
});

describe('upsert en modo confirmación · validación y permisos [E5-B05-T31, T32]', () => {
  it('operacion sin consultaId, asignación en ACTUALIZAR, falta de operacion o de asignación, destino y modos de archivo: 400', async () => {
    const sinConsulta = await request(app.getHttpServer())
      .post(UPSERT)
      .set('authorization', autorizacion(admin.token))
      .send({ origen: 'JIRA', destino: { celulaId: celulaC.id, qeResponsableId: qe2.id, sprintRespaldoId: sprint2.id }, sprintNoEncontrado: 'RESPALDO', filas: [{ fila: 1, codigo: 'X-1', titulo: 'x', operacion: 'CREAR' }] });
    assert.equal(sinConsulta.status, 400);
    assert.equal((await enviar([actualizar(1, 'X-1', { asignacion: asignacion() })])).status, 400);
    assert.equal((await enviar([{ fila: 1, codigo: 'X-1', titulo: 'x' }])).status, 400);
    assert.equal((await enviar([{ fila: 1, codigo: 'X-1', titulo: 'x', operacion: 'CREAR' }])).status, 400);
    assert.equal((await enviar([{ ...crear(1, 'X-1'), operacion: 'BORRAR' }])).status, 400);
    assert.equal((await enviar([crear(1, 'X-1', { asignacion: { ...asignacion(), extra: 1 } })])).status, 400);
    assert.equal((await enviar([crear(1, 'X-1')], { destino: { celulaId: celulaC.id, qeResponsableId: qe2.id, sprintRespaldoId: sprint2.id } })).status, 400);
    assert.equal((await enviar([crear(1, 'X-1')], { soloSimular: true })).status, 400);
    assert.equal((await enviar([crear(1, 'X-1')], { consultaId: 'no-uuid' })).status, 400);
    assert.equal(await hdu('X-1'), null);
  });

  it('solo el Administrador con sesión: QE 403', async () => {
    assert.equal((await enviar([crear(1, 'X-2')], {}, qe1)).status, 403);
    assert.equal(await hdu('X-2'), null);
  });
});
