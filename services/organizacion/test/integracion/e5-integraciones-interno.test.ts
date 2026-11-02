/**
 * Integración E5 · internos de Organización (O1–O3) contra Postgres y Supabase Auth locales reales:
 * `POST /v1/interno/integraciones/{destino, hdu/upsert}` (D100, D120, D124), los campos nuevos de
 * `GET /v1/hdu/{id}` (D108) y `GET /v1/catalogos/sprints?celulaId=` (D120).
 * Los IDs son los de `docs/backlog/e5-integracion-jira.md`: E5-B03-T05, T07, T08, T10 y T13.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

const TOKEN_SERVICIO = process.env.X_Q360_SERVICIO_TOKEN as string;
const UPSERT = '/v1/interno/integraciones/hdu/upsert';
const DESTINO = '/v1/interno/integraciones/destino';

let app: NestExpressApplication;
let admin: UsuarioDePrueba;
let qe1: UsuarioDePrueba;
let qe2: UsuarioDePrueba;
let analista: UsuarioDePrueba;
let inactivo: UsuarioDePrueba;
let celulaC: { id: string; nombre: string };
let celulaA: { id: string; nombre: string };
let sprint1: { id: string; nombre: string };
let sprint2: { id: string; nombre: string };
let sprintDeA: { id: string; nombre: string };

const destino = () => ({ celulaId: celulaC.id, qeResponsableId: qe2.id, sprintRespaldoId: sprint1.id });
const fila = (n: number, codigo: string, extra: Record<string, unknown> = {}) => ({ fila: n, codigo, titulo: `Título de ${codigo}`, ...extra });

function enviar(filas: unknown[], extra: Record<string, unknown> = {}, quien: UsuarioDePrueba = admin) {
  return request(app.getHttpServer())
    .post(UPSERT)
    .set('authorization', autorizacion(quien.token))
    .send({ origen: 'CSV', destino: destino(), sprintNoEncontrado: 'ERROR', filas, ...extra });
}

async function hduPorCodigo(codigo: string) {
  return prisma.hdu.findUnique({ where: { codigoNormalizado: codigo.toLowerCase() } });
}

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin E5' });
  qe1 = await crearUsuarioDePrueba('QE', { nombre: 'QE Uno' });
  qe2 = await crearUsuarioDePrueba('QE', { nombre: 'QE Dos' });
  analista = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'Analista Tres' });
  inactivo = await crearUsuarioDePrueba('QE', { nombre: 'QE Inactivo', activo: false });
  celulaC = await prisma.celula.create({ data: { nombre: 'CEL-C E5' }, select: { id: true, nombre: true } });
  celulaA = await prisma.celula.create({ data: { nombre: 'CEL-A E5' }, select: { id: true, nombre: true } });
  const inicio = new Date('2026-10-01');
  const fin = new Date('2026-10-14');
  sprint1 = await prisma.sprint.create({ data: { nombre: 'E5 Sprint 1', inicio, fin, celulaId: celulaC.id }, select: { id: true, nombre: true } });
  sprint2 = await prisma.sprint.create({ data: { nombre: 'E5 Sprint 2', inicio, fin, celulaId: celulaC.id }, select: { id: true, nombre: true } });
  sprintDeA = await prisma.sprint.create({ data: { nombre: 'Sprint de CEL-A', inicio, fin, celulaId: celulaA.id }, select: { id: true, nombre: true } });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /v1/interno/integraciones/hdu/upsert · acceso [E5-B03-T13]', () => {
  it('QE: 403; credencial de servicio: 403 aunque PERMITIR_CARGA_SEMILLA sea true; sin token: 401', async () => {
    assert.equal((await enviar([fila(1, 'ACC-1')], {}, qe1)).status, 403);
    const servicio = await request(app.getHttpServer())
      .post(UPSERT)
      .set('x-q360-servicio-token', TOKEN_SERVICIO)
      .send({ origen: 'CSV', destino: destino(), sprintNoEncontrado: 'ERROR', filas: [fila(1, 'ACC-1')] });
    assert.equal(servicio.status, 403);
    assert.equal(servicio.body.codigo, 'ACCESO_DENEGADO');
    const sinToken = await request(app.getHttpServer()).post(UPSERT).send({});
    assert.equal(sinToken.status, 401);
    assert.equal(await hduPorCodigo('ACC-1'), null);
  });

  it('el Analista tampoco puede', async () => {
    assert.equal((await enviar([fila(1, 'ACC-2')], {}, analista)).status, 403);
  });

  it('un lote de 26 filas es 400 VALIDACION y uno de 25 válidas es 200', async () => {
    const veintiseis = Array.from({ length: 26 }, (_, i) => fila(i + 1, `LOTE-${i}`));
    const rechazado = await enviar(veintiseis);
    assert.equal(rechazado.status, 400);
    assert.equal(rechazado.body.codigo, 'VALIDACION');
    assert.equal(rechazado.body.detalles[0].campo, 'filas');
    assert.equal(await hduPorCodigo('LOTE-0'), null);

    const veinticinco = await enviar(veintiseis.slice(0, 25));
    assert.equal(veinticinco.status, 200);
    assert.equal(veinticinco.body.simulado, false);
    assert.equal(veinticinco.body.filas.length, 25);
    assert.ok(veinticinco.body.filas.every((f: { resultado: string }) => f.resultado === 'CREADA'));
  });

  it('un lote vacío, un campo desconocido y un destino que no es UUID son 400 con el campo', async () => {
    assert.equal((await enviar([])).status, 400);
    const extra = await enviar([{ ...fila(1, 'VAL-1'), sorpresa: true }]);
    assert.equal(extra.status, 400);
    assert.equal(extra.body.detalles[0].campo, 'filas[0].sorpresa');
    const malDestino = await request(app.getHttpServer())
      .post(UPSERT)
      .set('authorization', autorizacion(admin.token))
      .send({ origen: 'CSV', destino: { ...destino(), celulaId: 'no-es-uuid' }, sprintNoEncontrado: 'ERROR', filas: [fila(1, 'VAL-2')] });
    assert.equal(malDestino.status, 400);
    assert.equal(malDestino.body.detalles[0].campo, 'destino.celulaId');
  });
});

describe('upsert · crear [E5-B03#2, E2-B01]', () => {
  it('crea en PENDIENTE sin analista, con el QE del destino, creado_por el Administrador, origen y auditoría CREAR_HDU con origen', async () => {
    const r = await enviar([fila(1, 'CRE-1', { descripcion: 'Una descripción', prioridad: 'ALTA', sprint: 'E5 Sprint 2' })], { origen: 'JSON' });
    assert.equal(r.status, 200);
    assert.equal(r.body.filas[0].resultado, 'CREADA');
    const hdu = await hduPorCodigo('CRE-1');
    assert.ok(hdu);
    assert.equal(hdu.estado, 'PENDIENTE');
    assert.equal(hdu.analistaId, null);
    assert.equal(hdu.qeResponsableId, qe2.id);
    assert.equal(hdu.celulaId, celulaC.id);
    assert.equal(hdu.creadoPorId, admin.id);
    assert.equal(hdu.origen, 'JSON');
    assert.equal(hdu.descripcion, 'Una descripción');
    assert.equal(hdu.prioridad, 'ALTA');
    const vigente = await prisma.historiaSprint.findMany({ where: { hduId: hdu.id, fechaRetiro: null } });
    assert.equal(vigente.length, 1);
    assert.equal(vigente[0]?.sprintId, sprint2.id);
    const auditoria = await prisma.auditoria.findMany({ where: { entidadId: hdu.id } });
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0]?.accion, 'CREAR_HDU');
    assert.equal(auditoria[0]?.actorId, admin.id);
    assert.equal((auditoria[0]?.despues as { origen?: string }).origen, 'JSON');
  });

  it('sin prioridad queda MEDIA; con origen JIRA guarda la clave y el enlace; el sprint de respaldo con advertencia', async () => {
    const r = await enviar(
      [fila(1, 'CRE-2', { sprint: 'Sprint inexistente', claveExterna: 'CRE-2', urlExterna: 'https://x.atlassian.net/browse/CRE-2' })],
      { origen: 'JIRA', sprintNoEncontrado: 'RESPALDO' },
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.filas[0].advertencias, ['SPRINT_NO_ENCONTRADO']);
    const hdu = await hduPorCodigo('CRE-2');
    assert.equal(hdu?.prioridad, 'MEDIA');
    assert.equal(hdu?.origen, 'JIRA');
    assert.equal(hdu?.claveExterna, 'CRE-2');
    assert.equal(hdu?.urlExterna, 'https://x.atlassian.net/browse/CRE-2');
    const vigente = await prisma.historiaSprint.findFirst({ where: { hduId: hdu?.id, fechaRetiro: null } });
    assert.equal(vigente?.sprintId, sprint1.id);
  });

  it('errores de fila sin abortar el lote: código, título, prioridad, célula, sprint, QE y SPRINT_REQUERIDO', async () => {
    const r = await enviar([
      fila(1, 'con espacio'),
      { fila: 2, codigo: 'ERR-2', titulo: '   ' },
      fila(3, 'ERR-3', { titulo: 'x'.repeat(201) }),
      fila(4, 'ERR-4', { prioridad: 'urgente' }),
      fila(5, 'ERR-5', { celula: 'No existe' }),
      fila(6, 'ERR-6', { sprint: 'No existe' }),
      fila(7, 'ERR-7', { qeCorreo: analista.correo }),
      fila(8, 'ERR-8', { qeCorreo: inactivo.correo }),
      fila(9, 'ERR-9', { celula: celulaA.nombre }),
      fila(10, 'ERR-10', { celula: celulaA.nombre, sprint: sprintDeA.nombre }),
    ]);
    assert.equal(r.status, 200);
    const motivos = r.body.filas.map((f: { motivo: string | null; resultado: string }) => f.motivo ?? f.resultado);
    assert.deepEqual(motivos, [
      'CODIGO_INVALIDO',
      'TITULO_VACIO',
      'TITULO_LARGO',
      'PRIORIDAD_INVALIDA',
      'CELULA_NO_ENCONTRADA',
      'SPRINT_NO_ENCONTRADO',
      'QE_INVALIDO',
      'QE_INVALIDO',
      'SPRINT_REQUERIDO',
      'CREADA',
    ]);
    assert.equal((await hduPorCodigo('ERR-10'))?.celulaId, celulaA.id);
    assert.equal(await hduPorCodigo('ERR-2'), null);
  });

  it('el QE por defecto desactivado deja las filas en QE_INVALIDO sin 5xx (E5-B03-T12, lado Organización)', async () => {
    const r = await request(app.getHttpServer())
      .post(UPSERT)
      .set('authorization', autorizacion(admin.token))
      .send({ origen: 'CSV', destino: { ...destino(), qeResponsableId: inactivo.id }, sprintNoEncontrado: 'ERROR', filas: [fila(1, 'QEI-1'), fila(2, 'QEI-2', { qeCorreo: qe1.correo })] });
    assert.equal(r.status, 200);
    assert.equal(r.body.filas[0].motivo, 'QE_INVALIDO');
    assert.equal(r.body.filas[1].resultado, 'CREADA');
    assert.equal((await hduPorCodigo('QEI-2'))?.qeResponsableId, qe1.id);
  });
});

describe('upsert · actualizar y no tocar [E5-B03-T05, T07, T08]', () => {
  it('E5-B03-T07: el código no distingue mayúsculas; arc-1 actualiza ARC-1 y ARC-9/arc-9 en el mismo lote crea una sola', async () => {
    await enviar([fila(1, 'ARC-1', { prioridad: 'ALTA' })]);
    const antes = await prisma.hdu.count();
    const r = await enviar([fila(1, 'arc-1', { titulo: 'Título nuevo' })]);
    assert.equal(r.body.filas[0].resultado, 'ACTUALIZADA');
    assert.equal(await prisma.hdu.count(), antes);
    assert.equal((await hduPorCodigo('arc-1'))?.titulo, 'Título nuevo');
    assert.equal((await hduPorCodigo('arc-1'))?.codigo, 'ARC-1');

    // La duplicación dentro del archivo la detecta Integraciones (CODIGO_DUPLICADO_EN_ARCHIVO); aquí, si llegan las dos,
    // la segunda ve a la primera y no crea otra.
    const dos = await enviar([fila(1, 'ARC-9'), fila(2, 'arc-9', { titulo: 'Título de ARC-9' })]);
    assert.deepEqual(dos.body.filas.map((f: { resultado: string }) => f.resultado), ['CREADA', 'OMITIDA']);
    assert.equal(await prisma.hdu.count({ where: { codigoNormalizado: 'arc-9' } }), 1);
  });

  it('E5-B03-T07: crear a mano "qty-1" cuando existe QTY-1 importada da 409 CODIGO_HDU_DUPLICADO', async () => {
    await enviar([fila(1, 'QTY-1')], { origen: 'JIRA', sprintNoEncontrado: 'RESPALDO' });
    const manual = await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe1.token))
      .send({ codigo: 'qty-1', titulo: 'a mano', celulaId: celulaC.id, sprintId: sprint1.id, prioridad: 'BAJA' });
    assert.equal(manual.status, 409);
    assert.equal(manual.body.codigo, 'CODIGO_HDU_DUPLICADO');
  });

  it('E5-B03-T05 (lado Organización): actualizar no toca estado, analista, QE, célula, sprint ni el historial de estado', async () => {
    await enviar([fila(1, 'NT-1', { prioridad: 'ALTA' })]);
    const creada = await hduPorCodigo('NT-1');
    assert.ok(creada);
    await prisma.supervision.create({ data: { qeId: qe2.id, analistaId: analista.id, actorTipo: 'USUARIO', actorId: admin.id, actorNombre: 'Admin' } });
    await request(app.getHttpServer()).put(`/v1/hdu/${creada.id}/analista`).set('authorization', autorizacion(qe2.token)).send({ analistaId: analista.id }).expect(200);
    await request(app.getHttpServer()).post(`/v1/hdu/${creada.id}/estado`).set('authorization', autorizacion(qe2.token)).send({ estado: 'DISENO_PRUEBAS' }).expect(200);
    const historialAntes = await prisma.hduHistorialEstado.count({ where: { hduId: creada.id } });
    const asignacionesAntes = await prisma.hduHistorialAsignacion.count({ where: { hduId: creada.id } });

    const r = await enviar([fila(1, 'NT-1', { titulo: 'Título nuevo', prioridad: 'CRITICA', qeCorreo: qe1.correo, celula: celulaA.nombre, sprint: sprint2.nombre })]);
    assert.equal(r.status, 200);
    assert.equal(r.body.filas[0].resultado, 'ACTUALIZADA');
    assert.deepEqual(Object.keys(r.body.filas[0].cambios).sort(), ['prioridad', 'titulo']);

    const despues = await hduPorCodigo('NT-1');
    assert.equal(despues?.estado, 'DISENO_PRUEBAS');
    assert.equal(despues?.analistaId, analista.id);
    assert.equal(despues?.qeResponsableId, qe2.id);
    assert.equal(despues?.celulaId, celulaC.id);
    assert.equal(despues?.titulo, 'Título nuevo');
    assert.equal(despues?.prioridad, 'CRITICA');
    const vigente = await prisma.historiaSprint.findMany({ where: { hduId: creada.id, fechaRetiro: null } });
    assert.deepEqual(vigente.map((s) => s.sprintId), [sprint1.id]);
    assert.equal(await prisma.hduHistorialEstado.count({ where: { hduId: creada.id } }), historialAntes);
    assert.equal(await prisma.hduHistorialAsignacion.count({ where: { hduId: creada.id } }), asignacionesAntes);
  });

  it('E5-B03-T06 (lado Organización): repetir el mismo lote deja SIN_CAMBIOS y no suma auditoría', async () => {
    const lote = [fila(1, 'REP-1', { descripcion: 'D', prioridad: 'BAJA' }), fila(2, 'REP-2')];
    const primera = await enviar(lote);
    assert.deepEqual(primera.body.filas.map((f: { resultado: string }) => f.resultado), ['CREADA', 'CREADA']);
    const auditoriasAntes = await prisma.auditoria.count();
    const segunda = await enviar(lote);
    assert.deepEqual(segunda.body.filas.map((f: { resultado: string; motivo: string }) => [f.resultado, f.motivo]), [['OMITIDA', 'SIN_CAMBIOS'], ['OMITIDA', 'SIN_CAMBIOS']]);
    assert.equal(await prisma.auditoria.count(), auditoriasAntes);
  });

  it('la actualización audita ACTUALIZAR_HDU con antes y después, y una descripción vacía no borra', async () => {
    await enviar([fila(1, 'AUD-1', { descripcion: 'Original', prioridad: 'ALTA' })]);
    const r = await enviar([fila(1, 'AUD-1', { titulo: 'Otro título', descripcion: '  ', prioridad: 'BAJA' })]);
    assert.equal(r.body.filas[0].resultado, 'ACTUALIZADA');
    const hdu = await hduPorCodigo('AUD-1');
    assert.equal(hdu?.descripcion, 'Original');
    const entrada = await prisma.auditoria.findFirst({ where: { entidadId: hdu?.id, accion: 'ACTUALIZAR_HDU' } });
    assert.ok(entrada);
    assert.equal(entrada.actorId, admin.id);
    assert.deepEqual(entrada.antes, { titulo: 'Título de AUD-1', prioridad: 'ALTA' });
    assert.deepEqual(entrada.despues, { titulo: 'Otro título', prioridad: 'BAJA' });
  });

  it('E5-B03-T08: una HDU manual y una cerrada se omiten; con vincular, la manual pasa a CSV y la cerrada sigue igual', async () => {
    const manual = await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe1.token))
      .send({ codigo: 'H1-MANUAL', titulo: 'Creada a mano', celulaId: celulaC.id, sprintId: sprint1.id, prioridad: 'BAJA' })
      .expect(201);
    assert.equal(manual.body.origen, 'MANUAL');
    const cerrada = await enviar([fila(1, 'H7-CERRADA')]);
    assert.equal(cerrada.status, 200);
    await prisma.hdu.update({ where: { codigoNormalizado: 'h7-cerrada' }, data: { estado: 'CERRADA' } });

    const lote = [fila(1, 'H1-MANUAL', { titulo: 'Título importado' }), fila(2, 'H7-CERRADA', { titulo: 'Otro' })];
    const sinVincular = await enviar(lote);
    assert.deepEqual(sinVincular.body.filas.map((f: { motivo: string }) => f.motivo), ['HDU_MANUAL_EXISTENTE', 'HDU_CERRADA']);
    assert.equal((await hduPorCodigo('H1-MANUAL'))?.titulo, 'Creada a mano');

    const conVincular = await enviar(lote, { vincularExistentes: true });
    assert.deepEqual(conVincular.body.filas.map((f: { resultado: string }) => f.resultado), ['ACTUALIZADA', 'OMITIDA']);
    assert.equal(conVincular.body.filas[1].motivo, 'HDU_CERRADA');
    const h1 = await hduPorCodigo('H1-MANUAL');
    assert.equal(h1?.origen, 'CSV');
    assert.equal(h1?.titulo, 'Título importado');
    assert.equal((await hduPorCodigo('H7-CERRADA'))?.titulo, 'Título de H7-CERRADA');
  });

  it('vincular una manual desde Jira guarda la clave y el enlace; el CHECK impide enlazar otra fuente', async () => {
    await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe1.token))
      .send({ codigo: 'JV-1', titulo: 'Manual', celulaId: celulaC.id, sprintId: sprint1.id, prioridad: 'BAJA' })
      .expect(201);
    const r = await enviar([fila(1, 'JV-1', { claveExterna: 'JV-1', urlExterna: 'https://x.atlassian.net/browse/JV-1' })], { origen: 'JIRA', vincularExistentes: true });
    assert.equal(r.body.filas[0].resultado, 'ACTUALIZADA');
    const hdu = await hduPorCodigo('JV-1');
    assert.equal(hdu?.origen, 'JIRA');
    assert.equal(hdu?.claveExterna, 'JV-1');
    await assert.rejects(prisma.hdu.update({ where: { id: hdu?.id }, data: { origen: 'CSV' } }), /historia_usuario_externa_ck|violates check constraint/);
  });
});

describe('upsert · simulación y modo estricto [E5-B03-T09, T10, D125]', () => {
  it('soloSimular no escribe ni audita y devuelve lo que haría', async () => {
    await enviar([fila(1, 'SIM-EXISTE', { prioridad: 'ALTA' })]);
    const hdus = await prisma.hdu.count();
    const auditorias = await prisma.auditoria.count();
    const r = await enviar([fila(1, 'SIM-NUEVA'), fila(2, 'SIM-EXISTE', { prioridad: 'BAJA' }), fila(3, 'sim-error', { titulo: '' })], { soloSimular: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.simulado, true);
    assert.deepEqual(r.body.filas.map((f: { resultado: string }) => f.resultado), ['CREADA', 'ACTUALIZADA', 'ERROR']);
    assert.equal(r.body.filas[0].idHistoria, null);
    assert.ok(r.body.filas[1].idHistoria);
    assert.equal(await prisma.hdu.count(), hdus);
    assert.equal(await prisma.auditoria.count(), auditorias);
    assert.equal((await hduPorCodigo('SIM-EXISTE'))?.prioridad, 'ALTA');
  });

  it('estricto con una fila con error: no se escribe nada del lote (simulado true)', async () => {
    const hdus = await prisma.hdu.count();
    const r = await enviar([fila(1, 'EST-1'), fila(2, 'EST-2', { titulo: '' }), fila(3, 'EST-3')], { estricto: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.simulado, true);
    assert.deepEqual(r.body.filas.map((f: { resultado: string }) => f.resultado), ['CREADA', 'ERROR', 'CREADA']);
    assert.ok(r.body.filas.every((f: { idHistoria: string | null }) => f.idHistoria === null));
    assert.equal(await prisma.hdu.count(), hdus);
    assert.equal(await hduPorCodigo('EST-1'), null);
  });

  it('estricto sin errores: se escribe todo en una transacción', async () => {
    const r = await enviar([fila(1, 'EST-OK-1'), fila(2, 'EST-OK-2')], { estricto: true });
    assert.equal(r.body.simulado, false);
    assert.deepEqual(r.body.filas.map((f: { resultado: string }) => f.resultado), ['CREADA', 'CREADA']);
    assert.ok(await hduPorCodigo('EST-OK-1'));
    assert.ok(await hduPorCodigo('EST-OK-2'));
  });

  it('E5-B03-T10: una HDU creada a mano entre la vista previa y la confirmación queda omitida; las demás se crean completas', async () => {
    const lote = [fila(1, 'CAR-1'), fila(2, 'CAR-2'), fila(3, 'CAR-3')];
    const previa = await enviar(lote, { soloSimular: true });
    assert.deepEqual(previa.body.filas.map((f: { resultado: string }) => f.resultado), ['CREADA', 'CREADA', 'CREADA']);
    await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe1.token))
      .send({ codigo: 'CAR-2', titulo: 'a mano', celulaId: celulaC.id, sprintId: sprint1.id, prioridad: 'BAJA' })
      .expect(201);
    const confirmada = await enviar(lote);
    assert.deepEqual(confirmada.body.filas.map((f: { resultado: string; motivo: string | null }) => [f.resultado, f.motivo]), [
      ['CREADA', null],
      ['OMITIDA', 'HDU_MANUAL_EXISTENTE'],
      ['CREADA', null],
    ]);
    for (const codigo of ['CAR-1', 'CAR-3']) {
      const hdu = await hduPorCodigo(codigo);
      assert.ok(hdu);
      assert.equal(await prisma.historiaSprint.count({ where: { hduId: hdu.id, fechaRetiro: null } }), 1);
      assert.equal(await prisma.auditoria.count({ where: { entidadId: hdu.id, accion: 'CREAR_HDU' } }), 1);
    }
  });
});

describe('POST /v1/interno/integraciones/destino [E5-B01#1, D120]', () => {
  it('un destino válido devuelve los nombres y errores vacíos', async () => {
    const r = await request(app.getHttpServer()).post(DESTINO).set('authorization', autorizacion(admin.token)).send(destino());
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.celula, { id: celulaC.id, nombre: celulaC.nombre });
    assert.deepEqual(r.body.qeResponsable, { id: qe2.id, nombre: 'QE Dos' });
    assert.deepEqual(r.body.sprintRespaldo, { id: sprint1.id, nombre: 'E5 Sprint 1' });
    assert.deepEqual(r.body.errores, []);
  });

  it('el sprint de respaldo de otra célula es NO_PERMITIDO; el inexistente, NO_EXISTE; el QE que no es QE activo, NO_PERMITIDO', async () => {
    const otraCelula = await request(app.getHttpServer()).post(DESTINO).set('authorization', autorizacion(admin.token)).send({ ...destino(), sprintRespaldoId: sprintDeA.id });
    assert.deepEqual(otraCelula.body.errores.map((e: { campo: string; codigo: string }) => [e.campo, e.codigo]), [['sprintRespaldoId', 'NO_PERMITIDO']]);
    const inexistentes = await request(app.getHttpServer())
      .post(DESTINO)
      .set('authorization', autorizacion(admin.token))
      .send({ celulaId: randomUUID(), sprintRespaldoId: randomUUID(), qeResponsableId: randomUUID() });
    assert.deepEqual(inexistentes.body.errores.map((e: { campo: string; codigo: string }) => [e.campo, e.codigo]), [
      ['celulaId', 'NO_EXISTE'],
      ['sprintRespaldoId', 'NO_EXISTE'],
      ['qeResponsableId', 'NO_EXISTE'],
    ]);
    assert.equal(inexistentes.body.celula, null);
    const noQe = await request(app.getHttpServer()).post(DESTINO).set('authorization', autorizacion(admin.token)).send({ ...destino(), qeResponsableId: analista.id });
    assert.deepEqual(noQe.body.errores.map((e: { campo: string; codigo: string }) => [e.campo, e.codigo]), [['qeResponsableId', 'NO_PERMITIDO']]);
    assert.deepEqual(noQe.body.qeResponsable, { id: analista.id, nombre: 'Analista Tres' });
    const desactivado = await request(app.getHttpServer()).post(DESTINO).set('authorization', autorizacion(admin.token)).send({ ...destino(), qeResponsableId: inactivo.id });
    assert.equal(desactivado.body.errores[0].campo, 'qeResponsableId');
  });

  it('solo el Administrador: QE y servicio 403, sin token 401', async () => {
    assert.equal((await request(app.getHttpServer()).post(DESTINO).set('authorization', autorizacion(qe1.token)).send(destino())).status, 403);
    assert.equal((await request(app.getHttpServer()).post(DESTINO).set('x-q360-servicio-token', TOKEN_SERVICIO).send(destino())).status, 403);
    assert.equal((await request(app.getHttpServer()).post(DESTINO).send(destino())).status, 401);
    assert.equal((await request(app.getHttpServer()).post(DESTINO).set('authorization', autorizacion(admin.token)).send({ celulaId: 'x' })).status, 400);
  });
});

describe('lecturas de E5 [D108, D120]', () => {
  it('GET /v1/hdu/{id} suma descripcion, origen, claveExterna y urlExterna; el listado no cambia', async () => {
    const jira = await hduPorCodigo('CRE-2');
    const detalle = await request(app.getHttpServer()).get(`/v1/hdu/${jira?.id}`).set('authorization', autorizacion(admin.token));
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.origen, 'JIRA');
    assert.equal(detalle.body.claveExterna, 'CRE-2');
    assert.equal(detalle.body.urlExterna, 'https://x.atlassian.net/browse/CRE-2');
    assert.equal(detalle.body.descripcion, null);

    const conTexto = await hduPorCodigo('CRE-1');
    const otro = await request(app.getHttpServer()).get(`/v1/hdu/${conTexto?.id}`).set('authorization', autorizacion(admin.token));
    assert.equal(otro.body.descripcion, 'Una descripción');
    assert.equal(otro.body.origen, 'JSON');
    assert.equal(otro.body.claveExterna, null);

    const listado = await request(app.getHttpServer()).get('/v1/hdu').set('authorization', autorizacion(admin.token));
    assert.equal(listado.status, 200);
    for (const item of listado.body.items) {
      for (const campo of ['descripcion', 'origen', 'claveExterna', 'urlExterna']) assert.equal(campo in item, false, `${campo} no debe estar en el listado`);
    }
  });

  it('una HDU de E2 queda con origen MANUAL y sin enlace', async () => {
    const manual = await hduPorCodigo('H1-MANUAL');
    assert.ok(manual);
    const creada = await request(app.getHttpServer())
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe1.token))
      .send({ codigo: 'MAN-E2', titulo: 'Manual', celulaId: celulaC.id, sprintId: sprint1.id, prioridad: 'BAJA' })
      .expect(201);
    assert.equal(creada.body.origen, 'MANUAL');
    assert.equal(creada.body.claveExterna, null);
    const auditoria = await prisma.auditoria.findFirst({ where: { entidadId: creada.body.id, accion: 'CREAR_HDU' } });
    assert.equal('origen' in (auditoria?.despues as object), false);
  });

  it('GET /v1/catalogos/sprints trae celulaId y filtra por célula', async () => {
    const todos = await request(app.getHttpServer()).get('/v1/catalogos/sprints').set('authorization', autorizacion(qe1.token));
    assert.equal(todos.status, 200);
    assert.ok(todos.body.items.length >= 3);
    for (const sprint of todos.body.items) assert.match(sprint.celulaId, /^[0-9a-f-]{36}$/);
    const deC = await request(app.getHttpServer()).get(`/v1/catalogos/sprints?celulaId=${celulaC.id}`).set('authorization', autorizacion(qe1.token));
    assert.deepEqual(deC.body.items.map((s: { nombre: string }) => s.nombre).sort(), ['E5 Sprint 1', 'E5 Sprint 2']);
    const invalido = await request(app.getHttpServer()).get('/v1/catalogos/sprints?celulaId=no-es-uuid').set('authorization', autorizacion(qe1.token));
    assert.equal(invalido.status, 400);
  });
});
