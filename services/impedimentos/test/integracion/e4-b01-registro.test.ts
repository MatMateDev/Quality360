/** E4-B01 · Registro de impedimentos. Contra el Postgres local y Organización/Certificaciones simuladas. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '#prisma';

import { PERSONAS, iniciarFalsos, type Falsos } from '../ayudas.js';
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

const nuevo = (cambios: object = {}) => ({ tipo: 'RECURSOS', titulo: 'Falta de personas', descripcion: 'No hay personas disponibles para probar.', responsableId: PERSONAS.qe1.id, ...cambios });
const filas = (hduId: string) => prisma.impedimento.count({ where: { historiaId: hduId } });

describe('E4-B01 · registro', () => {
  it('[E4-B01#1] T01: el QE registra en una HDU sin ciclo (certificacionId null, diasAbierto 0)', async () => {
    const r = await como(app, 'qe1', 'post', `/v1/hdu/${f.h.H5.id}/impedimentos`, nuevo());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.estado, 'ABIERTO');
    assert.equal(r.body.certificacionId, null);
    assert.deepEqual(r.body.creadoPor, { id: PERSONAS.qe1.id, nombre: PERSONAS.qe1.nombre, rol: 'QE' });
    assert.equal(r.body.diasAbierto, 0);
    assert.equal(r.body.abiertoDesde, r.body.fechaRegistro);
    assert.equal(r.body.hduCerrada, false);
    assert.equal(r.body.responsable.externo, false);
  });

  let idT02 = '';
  it('[E4-B01#1] T02: el analista registra con un tercero y se guarda el ciclo activo', async () => {
    const r = await como(app, 'ana1', 'post', `/v1/hdu/${f.h.H1.id}/impedimentos`, nuevo({ tipo: 'AMBIENTE', responsableId: undefined, responsableNombre: 'Equipo de Infraestructura' }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.certificacionId, f.h.H1.certificacionId);
    assert.deepEqual(r.body.responsable, { id: null, nombre: 'Equipo de Infraestructura', externo: true });
    assert.equal(r.body.creadoPor.rol, 'ANALISTA_QA');
    assert.deepEqual(r.body.operacionesPermitidas, []);
    idT02 = r.body.id as string;
  });

  it('[E4-B01#1] si Certificaciones no responde el registro se acepta con certificacionId null', async () => {
    falsos.certificacionesCaida = true;
    try {
      const r = await como(app, 'ana1', 'post', `/v1/hdu/${f.h.H1.id}/impedimentos`, nuevo({ titulo: 'Con Certificaciones caída' }));
      assert.equal(r.status, 201);
      assert.equal(r.body.certificacionId, null);
    } finally {
      falsos.certificacionesCaida = false;
    }
  });

  it('[E4-B01#1] T03: el historial tiene una acción REGISTRAR', async () => {
    const r = await como(app, 'ana1', 'get', `/v1/impedimentos/${idT02}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.acciones.length, 1);
    const [accion] = r.body.acciones;
    assert.deepEqual([accion.tipo, accion.estadoAnterior, accion.estado, accion.actor.id], ['REGISTRAR', null, 'ABIERTO', PERSONAS.ana1.id]);
  });

  it('[E4-B01#2] T04: la HDU queda bloqueada y la evaluación interna lo informa', async () => {
    const lista = await como(app, 'qe1', 'get', `/v1/hdu/${f.h.H5.id}/impedimentos`);
    assert.deepEqual([lista.body.bloqueada, lista.body.abiertos, lista.body.permisos.puedeGestionar], [true, 1, true]);
    const evaluacion = await como(app, 'qe1', 'post', '/v1/interno/impedimentos/evaluacion', {
      hdu: [f.h.H5, f.h.H8].map((h) => ({ hduId: h.id, estado: h.estado, sprintFin: h.sprintFin, avance: h.avance })),
    });
    assert.equal(evaluacion.status, 200, JSON.stringify(evaluacion.body));
    assert.deepEqual([evaluacion.body.items[0].bloqueada, evaluacion.body.items[0].abiertos], [true, 1]);
    assert.deepEqual([evaluacion.body.items[1].bloqueada, evaluacion.body.items[1].abiertos], [false, 0]);
    const fuera = await como(app, 'qe2', 'post', '/v1/interno/impedimentos/evaluacion', { hdu: [{ hduId: f.h.H5.id, estado: 'PENDIENTE', sprintFin: null, avance: null }] });
    assert.equal(fuera.status, 403);
  });

  it('[E4-B01#1] T05: validación de esquema (400 con el campo) sin crear filas', async () => {
    const antes = await filas(f.h.H4.id);
    const casos: Array<[object, string]> = [
      [nuevo({ titulo: undefined }), 'titulo'],
      [nuevo({ descripcion: undefined }), 'descripcion'],
      [nuevo({ descripcion: '123456789' }), 'descripcion'],
      [nuevo({ descripcion: 'x'.repeat(1001) }), 'descripcion'],
      [nuevo({ tipo: 'INVENTADO' }), 'tipo'],
      [nuevo({ responsableId: undefined }), 'responsableNombre'],
      [nuevo({ tipo: 'OTRO', descripcion: 'x'.repeat(19) }), 'descripcion'],
    ];
    for (const [cuerpo, campo] of casos) {
      const r = await como(app, 'ana3', 'post', `/v1/hdu/${f.h.H4.id}/impedimentos`, cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
      assert.equal(r.body.codigo, 'VALIDACION');
      assert.ok((r.body.detalles as Array<{ campo: string }>).some((d) => d.campo === campo), `${campo}: ${JSON.stringify(r.body.detalles)}`);
    }
    const inventado = await como(app, 'ana3', 'post', `/v1/hdu/${f.h.H4.id}/impedimentos`, nuevo({ tipo: 'INVENTADO' }));
    assert.equal(inventado.body.detalles[0].codigo, 'VALOR_NO_PERMITIDO');
    assert.equal(await filas(f.h.H4.id), antes);
  });

  it('[E4-B01#1] T06: responsable fuera de los candidatos (422) o nombre corto (400)', async () => {
    const antes = await filas(f.h.H4.id);
    for (const cuerpo of [nuevo({ responsableId: PERSONAS.ana1.id }), nuevo({ responsableId: '11111111-1111-4111-8111-111111111111' })]) {
      const r = await como(app, 'ana3', 'post', `/v1/hdu/${f.h.H4.id}/impedimentos`, cuerpo);
      assert.equal(r.status, 422);
      assert.equal(r.body.codigo, 'RESPONSABLE_INVALIDO');
    }
    const corto = await como(app, 'ana3', 'post', `/v1/hdu/${f.h.H4.id}/impedimentos`, nuevo({ responsableId: undefined, responsableNombre: 'ab' }));
    assert.equal(corto.status, 400);
    const ambos = await como(app, 'ana3', 'post', `/v1/hdu/${f.h.H4.id}/impedimentos`, nuevo({ responsableNombre: 'Equipo Pagos' }));
    assert.equal(ambos.status, 400);
    assert.equal(await filas(f.h.H4.id), antes);
  });

  it('[E4-B01#3] T07: analista ajeno o sin HDU, 403 con cuerpo idéntico', async () => {
    const cuerpos: unknown[] = [];
    for (const [persona, hdu] of [['ana1', f.h.H3], ['ana3', f.h.H5], ['ana4', f.h.H1]] as const) {
      const antes = await filas(hdu.id);
      const r = await como(app, persona, 'post', `/v1/hdu/${hdu.id}/impedimentos`, nuevo());
      assert.equal(r.status, 403);
      assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
      cuerpos.push({ ...r.body, traceId: '' });
      assert.equal(await filas(hdu.id), antes);
    }
    assert.equal(new Set(cuerpos.map((c) => JSON.stringify(c))).size, 1);
  });

  it('[E4-B01#3] T08: QE ajeno, Líder, Auditor y Administrador, 403; sin token, 401', async () => {
    const antes = await filas(f.h.H1.id);
    for (const persona of ['qe2', 'lid1', 'aud1', 'adm1'] as const) {
      const r = await como(app, persona, 'post', `/v1/hdu/${f.h.H1.id}/impedimentos`, nuevo());
      assert.equal(r.status, 403, persona);
    }
    const sinToken = await como(app, null, 'post', `/v1/hdu/${f.h.H1.id}/impedimentos`, nuevo());
    assert.equal(sinToken.status, 401);
    assert.equal(sinToken.body.codigo, 'NO_AUTENTICADO');
    assert.equal(await filas(f.h.H1.id), antes);
  });

  it('[E4-B01#3] T09: HDU cerrada, 409 HDU_CERRADA; HDU inexistente, 403', async () => {
    const antes = await filas(f.h.H7.id);
    const cerrada = await como(app, 'ana3', 'post', `/v1/hdu/${f.h.H7.id}/impedimentos`, nuevo());
    assert.equal(cerrada.status, 409);
    assert.equal(cerrada.body.codigo, 'HDU_CERRADA');
    const inexistente = await como(app, 'ana3', 'post', '/v1/hdu/22222222-2222-4222-8222-222222222222/impedimentos', nuevo());
    assert.equal(inexistente.status, 403);
    assert.equal(await filas(f.h.H7.id), antes);
  });

  it('[E4-B01#1] T10: sin llaves foráneas a otros esquemas y los CHECK rechazan datos inválidos', async () => {
    const foraneas = await prisma.$queryRaw<Array<{ esquema: string }>>`
      SELECT nsp_ref.nspname AS esquema FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace nsp ON nsp.oid = cl.relnamespace
        JOIN pg_class ref ON ref.oid = c.confrelid JOIN pg_namespace nsp_ref ON nsp_ref.oid = ref.relnamespace
       WHERE c.contype = 'f' AND nsp.nspname = 'impedimentos'`;
    assert.deepEqual(foraneas.filter((fila) => fila.esquema !== 'impedimentos'), []);

    const insertar = (tipo: string, estado: string, resolucion: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO impedimento (id_impedimento, titulo, tipo, estado, fecha_resolucion, id_historia, responsable_nombre, creado_por_id, creado_por_nombre, creado_por_rol)
         VALUES (gen_random_uuid(), 'Título', '${tipo}', '${estado}', ${resolucion}, gen_random_uuid(), 'R', gen_random_uuid(), 'N', 'QE')`,
      );
    await assert.rejects(insertar('INVENTADO', 'ABIERTO', 'NULL'), /impedimento_tipo_ck/);
    await assert.rejects(insertar('AMBIENTE', 'RESUELTO', 'NULL'), /impedimento_resolucion_ck/);
    await assert.rejects(insertar('AMBIENTE', 'ABIERTO', 'now()'), /impedimento_resolucion_ck/);
  });
});
