/**
 * Integración E5 consulta y asignación · OC1: lecturas internas (`hdu/estado-codigos`, `asignaciones/validar`) y
 * `GET /v1/catalogos/personas?supervisorId=` contra Postgres y Supabase Auth locales reales.
 * IDs de `docs/backlog/e5-consulta-asignacion.md`: E5-B02-T04, E5-B05-T04, T08, T09, T22.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

const TOKEN_SERVICIO = process.env.X_Q360_SERVICIO_TOKEN as string;
const ESTADOS = '/v1/interno/integraciones/hdu/estado-codigos';
const VALIDAR = '/v1/interno/integraciones/asignaciones/validar';
const ACTOR = { actorTipo: 'USUARIO', actorId: '00000000-0000-4000-8000-000000000001', actorNombre: 'Admin' } as const;

let app: NestExpressApplication;
let admin: UsuarioDePrueba;
let qe1: UsuarioDePrueba;
let qe2: UsuarioDePrueba;
let ana1: UsuarioDePrueba;
let ana3: UsuarioDePrueba;
let anaSinEquipo: UsuarioDePrueba;
let anaInactiva: UsuarioDePrueba;
let lider: UsuarioDePrueba;
let celulaC: { id: string; nombre: string };
let celulaA: { id: string; nombre: string };
let sprint1: { id: string; nombre: string };
let sprintDeA: { id: string; nombre: string };

const post = (ruta: string, cuerpo: unknown, quien: UsuarioDePrueba = admin) => request(app.getHttpServer()).post(ruta).set('authorization', autorizacion(quien.token)).send(cuerpo as object);

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin C' });
  qe1 = await crearUsuarioDePrueba('QE', { nombre: 'QE Uno' });
  qe2 = await crearUsuarioDePrueba('QE', { nombre: 'QE Dos' });
  ana1 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA1' });
  ana3 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA3' });
  anaSinEquipo = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA9' });
  anaInactiva = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA8', activo: false });
  lider = await crearUsuarioDePrueba('LIDER_QA', { nombre: 'Lider' });
  celulaC = await prisma.celula.create({ data: { nombre: 'CEL-C consulta' }, select: { id: true, nombre: true } });
  celulaA = await prisma.celula.create({ data: { nombre: 'CEL-A consulta' }, select: { id: true, nombre: true } });
  const inicio = new Date('2026-10-01');
  const fin = new Date('2026-10-14');
  sprint1 = await prisma.sprint.create({ data: { nombre: 'E5 Sprint 1', inicio, fin, celulaId: celulaC.id }, select: { id: true, nombre: true } });
  sprintDeA = await prisma.sprint.create({ data: { nombre: 'Sprint de CEL-A', inicio, fin, celulaId: celulaA.id }, select: { id: true, nombre: true } });
  // QE1 supervisa a ANA1 y a la inactiva; QE2 supervisa a ANA3. La célula C tiene Líder; la A, no.
  await prisma.supervision.create({ data: { qeId: qe1.id, analistaId: ana1.id, ...ACTOR } });
  await prisma.supervision.create({ data: { qeId: qe1.id, analistaId: anaInactiva.id, ...ACTOR } });
  await prisma.supervision.create({ data: { qeId: qe2.id, analistaId: ana3.id, ...ACTOR } });
  await prisma.celulaLider.create({ data: { usuarioId: lider.id, celulaId: celulaC.id, asignadoPorTipo: 'USUARIO', asignadoPorId: admin.id, asignadoPorNombre: 'Admin C' } });
  await prisma.hdu.create({
    data: {
      codigo: 'QTY-5',
      codigoNormalizado: 'qty-5',
      titulo: 'Creada a mano',
      descripcion: 'Descripcion vieja',
      celulaId: celulaC.id,
      historiaSprints: { create: { sprintId: sprint1.id } },
      prioridad: 'ALTA',
      qeResponsableId: qe1.id,
      estado: 'EN_EJECUCION',
      creadoPorTipo: 'USUARIO',
      creadoPorId: admin.id,
      creadoPorNombre: 'Admin C',
      origen: 'MANUAL',
    },
  });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /v1/interno/integraciones/hdu/estado-codigos [E5-B02-T04]', () => {
  it('devuelve existe/no existe por código, en el mismo orden y sin distinguir mayúsculas', async () => {
    const r = await post(ESTADOS, { codigos: ['qty-5', 'NUEVO-1', 'QTY-5'] });
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 3);
    assert.deepEqual(r.body.items[0], {
      codigo: 'qty-5',
      existe: true,
      idHistoria: r.body.items[0].idHistoria,
      estado: 'EN_EJECUCION',
      origen: 'MANUAL',
      titulo: 'Creada a mano',
      descripcion: 'Descripcion vieja',
      prioridad: 'ALTA',
      qeResponsable: 'QE Uno',
      analista: null,
    });
    assert.deepEqual(r.body.items[1], { codigo: 'NUEVO-1', existe: false, idHistoria: null, estado: null, origen: null, titulo: null, descripcion: null, prioridad: null, qeResponsable: null, analista: null });
    assert.equal(r.body.items[2].idHistoria, r.body.items[0].idHistoria);
  });

  it('trae el nombre del Analista asignado o null [E5-B02-T06, E5-B07-T06]', async () => {
    const asignada = await prisma.hdu.create({
      data: {
        codigo: 'QTY-ASIG', codigoNormalizado: 'qty-asig', titulo: 'Con analista', celulaId: celulaC.id,
        historiaSprints: { create: { sprintId: sprint1.id } }, prioridad: 'MEDIA', qeResponsableId: qe2.id, analistaId: ana3.id,
        estado: 'PENDIENTE', creadoPorTipo: 'USUARIO', creadoPorId: admin.id, creadoPorNombre: 'Admin C', origen: 'MANUAL',
      },
    });
    const r = await post(ESTADOS, { codigos: ['QTY-ASIG', 'QTY-5'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map((i: { analista: string | null; qeResponsable: string }) => [i.qeResponsable, i.analista]), [['QE Dos', 'ANA3'], ['QE Uno', null]]);
    assert.ok(asignada.id);
  });

  it('no escribe ni audita', async () => {
    const antes = await prisma.auditoria.count();
    await post(ESTADOS, { codigos: ['QTY-5'] });
    assert.equal(await prisma.auditoria.count(), antes);
  });

  it('101 códigos: 400; 100: 200; credencial de servicio y QE: 403; sin token: 401', async () => {
    const codigos = (n: number) => Array.from({ length: n }, (_, i) => `X-${i}`);
    assert.equal((await post(ESTADOS, { codigos: codigos(101) })).status, 400);
    assert.equal((await post(ESTADOS, { codigos: codigos(100) })).status, 200);
    assert.equal((await post(ESTADOS, { codigos: [] })).status, 400);
    assert.equal((await post(ESTADOS, { codigos: ['A'], otro: 1 })).status, 400);
    assert.equal((await post(ESTADOS, { codigos: ['A'] }, qe1)).status, 403);
    assert.equal((await request(app.getHttpServer()).post(ESTADOS).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ codigos: ['A'] })).status, 403);
    assert.equal((await request(app.getHttpServer()).post(ESTADOS).send({ codigos: ['A'] })).status, 401);
  });
});

describe('POST /v1/interno/integraciones/asignaciones/validar [E5-B05-T04, T08, T09]', () => {
  it('una combinación coherente es válida y trae los nombres y el aviso de Líder', async () => {
    const r = await post(VALIDAR, { asignaciones: [{ ref: 'a', celulaId: celulaC.id, qeResponsableId: qe1.id, analistaId: ana1.id, sprintId: sprint1.id }] });
    assert.equal(r.status, 200);
    const v = r.body.resultados[0];
    assert.deepEqual([v.ref, v.valida, v.errores], ['a', true, []]);
    assert.deepEqual([v.celula.nombre, v.qeResponsable.nombre, v.analista.nombre, v.sprint.nombre], [celulaC.nombre, 'QE Uno', 'ANA1', 'E5 Sprint 1']);
    assert.equal(v.celulaSinLiderActivo, false);
    assert.equal(v.sprintPropuesto, null);
  });

  it('las 4 reglas de D138 y el aviso de célula sin Líder, en el orden pedido', async () => {
    const r = await post(VALIDAR, {
      asignaciones: [
        { ref: 'fuera', celulaId: celulaA.id, qeResponsableId: qe1.id, analistaId: ana3.id },
        { ref: 'inactiva', qeResponsableId: qe1.id, analistaId: anaInactiva.id },
        { ref: 'noanalista', qeResponsableId: qe1.id, analistaId: qe2.id },
        { ref: 'sinqe', analistaId: ana1.id },
        { ref: 'qemal', qeResponsableId: ana1.id },
        { ref: 'sprintajeno', celulaId: celulaC.id, sprintId: sprintDeA.id },
        { ref: 'celulainexistente', celulaId: '00000000-0000-4000-8000-0000000000ff' },
        { ref: 'vacio' },
      ],
    });
    assert.equal(r.status, 200);
    const por = Object.fromEntries(r.body.resultados.map((x: { ref: string }) => [x.ref, x]));
    assert.deepEqual(r.body.resultados.map((x: { ref: string }) => x.ref), ['fuera', 'inactiva', 'noanalista', 'sinqe', 'qemal', 'sprintajeno', 'celulainexistente', 'vacio']);
    assert.deepEqual(por.fuera.errores, [{ campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' }]);
    assert.equal(por.fuera.celulaSinLiderActivo, true);
    assert.equal(por.fuera.analista, null);
    assert.deepEqual(por.inactiva.errores, [{ campo: 'analistaId', codigo: 'ANALISTA_INVALIDO' }]);
    assert.deepEqual(por.noanalista.errores, [{ campo: 'analistaId', codigo: 'ANALISTA_INVALIDO' }]);
    assert.deepEqual(por.sinqe.errores, [{ campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' }]);
    assert.deepEqual(por.qemal.errores, [{ campo: 'qeResponsableId', codigo: 'QE_INVALIDO' }]);
    assert.deepEqual(por.sprintajeno.errores, [{ campo: 'sprintId', codigo: 'CATALOGO_INVALIDO' }]);
    assert.deepEqual(por.celulainexistente.errores, [{ campo: 'celulaId', codigo: 'CATALOGO_INVALIDO' }]);
    assert.deepEqual([por.vacio.valida, por.vacio.errores], [true, []]);
  });

  it('propone el sprint: JIRA por nombre sin distinguir mayúsculas, RESPALDO si es de la célula, o ninguno', async () => {
    const r = await post(VALIDAR, {
      asignaciones: [
        { ref: 'jira', celulaId: celulaC.id, proponerSprint: { nombreJira: 'e5 sprint 1', respaldoId: null } },
        { ref: 'respaldo', celulaId: celulaC.id, proponerSprint: { nombreJira: 'No existe', respaldoId: sprint1.id } },
        { ref: 'ajeno', celulaId: celulaC.id, proponerSprint: { nombreJira: null, respaldoId: sprintDeA.id } },
        { ref: 'otracelula', celulaId: celulaA.id, proponerSprint: { nombreJira: 'E5 Sprint 1', respaldoId: sprint1.id } },
        { ref: 'explicito', celulaId: celulaC.id, sprintId: sprint1.id, proponerSprint: { nombreJira: 'x', respaldoId: null } },
        { ref: 'sincelula', proponerSprint: { nombreJira: 'E5 Sprint 1', respaldoId: null } },
      ],
    });
    const por = Object.fromEntries(r.body.resultados.map((x: { ref: string; sprintPropuesto: unknown }) => [x.ref, x.sprintPropuesto]));
    assert.deepEqual(por.jira, { sprint: { id: sprint1.id, nombre: 'E5 Sprint 1' }, origen: 'JIRA', sprintJiraNoEncontrado: false });
    assert.deepEqual(por.respaldo, { sprint: { id: sprint1.id, nombre: 'E5 Sprint 1' }, origen: 'RESPALDO', sprintJiraNoEncontrado: true });
    assert.deepEqual(por.ajeno, { sprint: null, origen: null, sprintJiraNoEncontrado: false });
    assert.deepEqual(por.otracelula, { sprint: null, origen: null, sprintJiraNoEncontrado: true });
    assert.equal(por.explicito, null);
    assert.equal(por.sincelula, null);
  });

  it('proponerAnalista: con un solo Analista activo lo propone; con 0 o 2+ no; el inactivo no cuenta [E5-B07-T01, T02, T03, T10]', async () => {
    const qeDos = await crearUsuarioDePrueba('QE', { nombre: 'QE Dos Ana' });
    const qeCero = await crearUsuarioDePrueba('QE', { nombre: 'QE Cero' });
    const qeSoloInactiva = await crearUsuarioDePrueba('QE', { nombre: 'QE Solo Inactiva' });
    const anaA = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA-A' });
    const anaB = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA-B' });
    const anaOff = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA-OFF', activo: false });
    await prisma.supervision.create({ data: { qeId: qeDos.id, analistaId: anaA.id, ...ACTOR } });
    await prisma.supervision.create({ data: { qeId: qeDos.id, analistaId: anaB.id, ...ACTOR } });
    await prisma.supervision.create({ data: { qeId: qeSoloInactiva.id, analistaId: anaOff.id, ...ACTOR } });
    const r = await post(VALIDAR, {
      asignaciones: [
        { ref: 'uno', qeResponsableId: qe1.id, proponerAnalista: true },
        { ref: 'dos', qeResponsableId: qeDos.id, proponerAnalista: true },
        { ref: 'cero', qeResponsableId: qeCero.id, proponerAnalista: true },
        { ref: 'soloinactiva', qeResponsableId: qeSoloInactiva.id, proponerAnalista: true },
        { ref: 'qemal', qeResponsableId: ana3.id, proponerAnalista: true },
        { ref: 'sinpedir', qeResponsableId: qe1.id },
        { ref: 'conanalista', qeResponsableId: qe1.id, analistaId: ana1.id, proponerAnalista: true },
        { ref: 'sinqe', proponerAnalista: true },
      ],
    });
    assert.equal(r.status, 200);
    const por = Object.fromEntries(r.body.resultados.map((x: { ref: string }) => [x.ref, x]));
    const resumen = (x: { analistasActivos: number | null; analistaPropuesto: { nombre: string } | null }) => [x.analistasActivos, x.analistaPropuesto?.nombre ?? null];
    assert.deepEqual(resumen(por.uno), [1, 'ANA1']);
    assert.equal(por.uno.analistaPropuesto.id, ana1.id);
    assert.deepEqual(resumen(por.dos), [2, null]);
    assert.deepEqual(resumen(por.cero), [0, null]);
    assert.deepEqual(resumen(por.soloinactiva), [0, null]);
    assert.deepEqual(resumen(por.qemal), [null, null]);
    assert.deepEqual(resumen(por.sinpedir), [null, null]);
    assert.deepEqual(resumen(por.conanalista), [1, null]);
    assert.deepEqual(resumen(por.sinqe), [null, null]);
    assert.equal((await post(VALIDAR, { asignaciones: [{ ref: 'a', proponerAnalista: 'si' }] })).status, 400);
  });

  it('el analista se valida contra el equipo vigente: reasignado a otro QE deja de ser válido', async () => {
    await prisma.supervision.updateMany({ where: { analistaId: ana1.id, hasta: null }, data: { hasta: new Date() } });
    await prisma.supervision.create({ data: { qeId: qe2.id, analistaId: ana1.id, ...ACTOR } });
    const r = await post(VALIDAR, { asignaciones: [{ ref: 'a', qeResponsableId: qe1.id, analistaId: ana1.id }, { ref: 'b', qeResponsableId: qe2.id, analistaId: ana1.id }] });
    assert.deepEqual(r.body.resultados.map((x: { valida: boolean }) => x.valida), [false, true]);
    await prisma.supervision.updateMany({ where: { analistaId: ana1.id, hasta: null }, data: { hasta: new Date() } });
    await prisma.supervision.create({ data: { qeId: qe1.id, analistaId: ana1.id, ...ACTOR } });
  });

  it('403 con QE y con la credencial de servicio, 401 sin token, 400 con 101 elementos o un campo desconocido', async () => {
    const una = { asignaciones: [{ ref: 'a' }] };
    assert.equal((await post(VALIDAR, una, qe1)).status, 403);
    assert.equal((await request(app.getHttpServer()).post(VALIDAR).set('x-q360-servicio-token', TOKEN_SERVICIO).send(una)).status, 403);
    assert.equal((await request(app.getHttpServer()).post(VALIDAR).send(una)).status, 401);
    assert.equal((await post(VALIDAR, { asignaciones: Array.from({ length: 101 }, (_, i) => ({ ref: `r${i}` })) })).status, 400);
    assert.equal((await post(VALIDAR, { asignaciones: [{ ref: 'a', origen: 'JIRA' }] })).status, 400);
    assert.equal((await post(VALIDAR, { asignaciones: [{ ref: 'a', celulaId: 'no-uuid' }] })).status, 400);
    assert.equal((await post(VALIDAR, { asignaciones: [{ celulaId: celulaC.id }] })).status, 400);
  });
});

describe('GET /v1/catalogos/personas?supervisorId= [D147]', () => {
  const personas = (query: string, quien: UsuarioDePrueba = admin) => request(app.getHttpServer()).get(`/v1/catalogos/personas?${query}`).set('authorization', autorizacion(quien.token));

  it('devuelve los Analistas QA activos del equipo vigente del QE, por nombre', async () => {
    const r = await personas(`supervisorId=${qe1.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map((p: { nombre: string; rol: string }) => [p.nombre, p.rol]), [['ANA1', 'ANALISTA_QA']]);
    assert.ok(typeof r.body.items[0].correo === 'string');
  });

  it('un QE sin analistas da items vacío; un supervisorId que no es QE activo, 422 QE_INVALIDO; rol incompatible, 400; QE como solicitante, 403', async () => {
    const qeSolo = await crearUsuarioDePrueba('QE', { nombre: 'QE Solo' });
    assert.deepEqual((await personas(`supervisorId=${qeSolo.id}`)).body.items, []);
    const inactivo = await crearUsuarioDePrueba('QE', { nombre: 'QE Baja', activo: false });
    for (const id of [ana3.id, inactivo.id, '00000000-0000-4000-8000-0000000000ff', anaSinEquipo.id]) {
      const r = await personas(`supervisorId=${id}`);
      assert.deepEqual([r.status, r.body.codigo], [422, 'QE_INVALIDO']);
    }
    assert.equal((await personas(`supervisorId=${qe1.id}&rol=QE`)).status, 400);
    assert.equal((await personas('supervisorId=no-uuid')).status, 400);
    assert.equal((await personas(`supervisorId=${qe1.id}`, qe1)).status, 403);
    // Sin supervisorId el catálogo no cambia.
    assert.ok((await personas('rol=QE')).body.items.length >= 3);
  });
});
