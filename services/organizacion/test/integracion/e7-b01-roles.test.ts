/**
 * E7-B01 · Rol Auditor y cambio de rol (D28, D31, D40, D42, D43) tras el retiro del rol
 * Líder QA (D208), contra Postgres y Supabase Auth locales reales. Fixture de la sección 3
 * del backlog E7.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { crearFixtureE7, type FixtureE7 } from '../fixture-e7.js';

let app: NestExpressApplication;
let f: FixtureE7;

const http = (): ReturnType<typeof request> => request(app.getHttpServer());
const como = (usuario: UsuarioDePrueba) => ({ authorization: autorizacion(usuario.token) });
const SIN_CELULAS = ['analistasVigentes', 'hduAbiertas', 'supervisorVigente'];

async function auditoriaDe(entidadId: string) {
  return prisma.auditoria.findMany({ where: { entidadId }, orderBy: { fecha: 'asc' } });
}

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  f = await crearFixtureE7();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /v1/roles [E7-B01#1]', () => {
  it('[E7-B01-T01] ofrece los 4 roles en el orden del selector, con AUDITOR de solo lectura (D208)', async () => {
    const respuesta = await http().get('/v1/roles').set(como(f.adm1)).expect(200);
    assert.deepEqual(
      respuesta.body.items.map((rol: { codigo: string }) => rol.codigo),
      ['ANALISTA_QA', 'QE', 'ADMINISTRADOR', 'AUDITOR'],
    );
    assert.deepEqual(
      respuesta.body.items.map((rol: { nombre: string }) => rol.nombre),
      ['Analista QA', 'QE', 'Administrador', 'Auditor'],
    );
    const soloLectura = respuesta.body.items.filter((rol: { soloLectura: boolean }) => rol.soloLectura).map((rol: { codigo: string }) => rol.codigo);
    assert.deepEqual(soloLectura, ['AUDITOR']);
  });

  it('el catálogo de la base tiene las 4 filas y celula_lider ya no existe (migración 20261118000000, D208)', async () => {
    const nombres = (await prisma.rol.findMany({ select: { nombre: true } })).map((fila) => fila.nombre).sort();
    assert.deepEqual(nombres, ['ADMINISTRADOR', 'ANALISTA_QA', 'AUDITOR', 'QE']);
    const [tabla] = await prisma.$queryRaw<Array<{ tabla: string | null }>>`SELECT to_regclass('organizacion.celula_lider')::text AS tabla`;
    assert.equal(tabla?.tabla, null);
  });
});

describe('Asignar el rol Auditor [E7-B01#1]', () => {
  it('[E7-B01-T02] cambia ANA4 (sin QE ni HDU) a AUDITOR y audita CAMBIAR_ROL con actor ADM1', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.ana4.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(200);
    assert.equal(respuesta.body.rol, 'AUDITOR');
    const registros = (await auditoriaDe(f.ana4.id)).filter((fila) => fila.accion === 'CAMBIAR_ROL');
    assert.equal(registros.length, 1);
    assert.equal(registros[0]?.actorId, f.adm1.id);
    assert.deepEqual(registros[0]?.antes, { rol: 'ANALISTA_QA' });
    assert.deepEqual(registros[0]?.despues, { rol: 'AUDITOR' });
  });

  it('el usuario ya no trae células vigentes en el detalle ni en el listado (D208)', async () => {
    const uno = await http().get(`/v1/usuarios/${f.ana1.id}`).set(como(f.adm1)).expect(200);
    assert.equal('celulasVigentes' in uno.body, false);
    const lista = await http().get('/v1/usuarios?tamanoPagina=100').set(como(f.adm1)).expect(200);
    assert.ok(lista.body.items.every((usuario: Record<string, unknown>) => !('celulasVigentes' in usuario)));
    await http().get('/v1/usuarios/00000000-0000-4000-8000-000000000000').set(como(f.adm1)).expect(404);
  });

  it('LIDER_QA ya no es un rol: el alta y el cambio de rol responden 400 VALOR_NO_PERMITIDO y nada cambia', async () => {
    const correo = `lider.${Date.now()}@quality360.local`;
    const alta = await http().post('/v1/usuarios').set(como(f.adm1)).send({ nombre: 'Líder', correo, rol: 'LIDER_QA' }).expect(400);
    assert.ok(alta.body.detalles.some((detalle: { campo: string; codigo: string }) => detalle.campo === 'rol' && detalle.codigo === 'VALOR_NO_PERMITIDO'));
    assert.equal(await prisma.usuario.count({ where: { correo } }), 0);

    const cambio = await http().put(`/v1/usuarios/${f.inact1.id}/rol`).set(como(f.adm1)).send({ rol: 'LIDER_QA' }).expect(400);
    assert.equal(cambio.body.codigo, 'VALIDACION');
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: f.inact1.id }, include: { rol: true } })).rol.nombre, 'QE');
  });

  it('celulaIds ya no es un campo del alta ni del cambio de rol: 400 VALIDACION', async () => {
    const correo = `celulas.${Date.now()}@quality360.local`;
    const alta = await http().post('/v1/usuarios').set(como(f.adm1)).send({ nombre: 'Con células', correo, rol: 'AUDITOR', celulaIds: [f.celdaA.id] }).expect(400);
    assert.ok(alta.body.detalles.some((detalle: { campo: string }) => detalle.campo === 'celulaIds'));
    const cambio = await http().put(`/v1/usuarios/${f.inact1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR', celulaIds: [] }).expect(400);
    assert.ok(cambio.body.detalles.some((detalle: { campo: string }) => detalle.campo === 'celulaIds'));
  });

  it('las rutas de células del Líder ya no existen (D208)', async () => {
    await http().get(`/v1/usuarios/${f.qe1.id}/celulas-lider`).set(como(f.adm1)).expect(404);
    await http().put(`/v1/usuarios/${f.qe1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [] }).expect(404);
  });
});

describe('Reglas de integridad [E7-B01#2]', () => {
  it('[E7-B01-T03] un rol fuera del catálogo se rechaza con 400 VALIDACION y VALOR_NO_PERMITIDO', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.ana1.id}/rol`).set(como(f.adm1)).send({ rol: 'SUPERVISOR' }).expect(400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.ok(respuesta.body.detalles.some((detalle: { campo: string; codigo: string }) => detalle.campo === 'rol' && detalle.codigo === 'VALOR_NO_PERMITIDO'));
  });

  it('[E7-B01-T08] el único administrador no puede cambiar su propio rol (E1-B08#2)', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.adm1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    assert.equal(respuesta.body.codigo, 'ULTIMO_ADMINISTRADOR');
  });

  it('el último administrador se valida antes que las relaciones (D43)', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.adm1.id}/rol`).set(como(f.adm1)).send({ rol: 'QE' }).expect(409);
    assert.equal(respuesta.body.codigo, 'ULTIMO_ADMINISTRADOR');
  });
});

describe('Relaciones incompatibles al cambiar de rol (D40, D43)', () => {
  it('un QE con analistas y HDU abiertas recibe las 3 claves a la vez, con a quiénes reasignar', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.qe1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    assert.equal(respuesta.body.codigo, 'RELACIONES_INCOMPATIBLES');
    const { relaciones } = respuesta.body;
    assert.deepEqual(Object.keys(relaciones).sort(), SIN_CELULAS);
    assert.deepEqual(relaciones.analistasVigentes.map((usuario: { nombre: string }) => usuario.nombre), ['ANA1', 'ANA2']);
    assert.equal(relaciones.supervisorVigente, null);
    assert.equal(relaciones.hduAbiertas.total, 5);
    assert.deepEqual(relaciones.hduAbiertas.items.map((hdu: { codigo: string }) => hdu.codigo), ['H1', 'H2', 'H5', 'H6', 'H8']);
    assert.match(respuesta.body.mensaje, /ANA1, ANA2/);
    assert.match(respuesta.body.mensaje, /5 HDU abiertas/);
  });

  it('un QE sin analistas pero con HDU abiertas como responsable tampoco puede cambiar de rol (D40)', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.qe2.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    const { relaciones } = respuesta.body;
    assert.deepEqual(relaciones.analistasVigentes.map((usuario: { nombre: string }) => usuario.nombre), ['ANA3']);
    assert.equal(relaciones.hduAbiertas.total, 2, 'H3 y H4; H7 está cerrada');
  });

  it('un analista con supervisor vigente y HDU abiertas informa ambas cosas', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.ana1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    const { relaciones } = respuesta.body;
    assert.equal(relaciones.supervisorVigente.nombre, 'QE1');
    assert.deepEqual(relaciones.hduAbiertas.items.map((hdu: { codigo: string }) => hdu.codigo), ['H1', 'H6']);
  });

  it('hduAbiertas.items trae como máximo 20 y total las cuenta todas', async () => {
    const qe = await prisma.usuario.create({
      data: { id: '5e000000-0000-4000-8000-000000000001', nombre: 'QE masivo', correo: 'qe.masivo@quality360.local', rol: { connect: { nombre: 'QE' } } },
    });
    for (let i = 1; i <= 22; i += 1) {
      const codigo = `M-${String(i).padStart(2, '0')}`;
      await prisma.hdu.create({
        data: {
          codigo,
          codigoNormalizado: codigo.toLowerCase(),
          titulo: codigo,
          celulaId: f.celdaA.id,
          historiaSprints: { create: { sprintId: f.sprint.id } },
          prioridad: 'BAJA',
          qeResponsableId: qe.id,
          creadoPorTipo: 'SERVICIO',
          creadoPorId: 'prueba',
          creadoPorNombre: 'prueba',
        },
      });
    }
    const respuesta = await http().put(`/v1/usuarios/${qe.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    assert.equal(respuesta.body.relaciones.hduAbiertas.total, 22);
    assert.equal(respuesta.body.relaciones.hduAbiertas.items.length, 20);
    // Cerradas, ya no impiden el cambio.
    await prisma.hdu.updateMany({ where: { qeResponsableId: qe.id }, data: { estado: 'CERRADA' } });
    await http().put(`/v1/usuarios/${qe.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(200);
  });

  it('desactivar conserva la regla de E1-B07: solo un QE con analistas vigentes lo impide, y el 409 trae las 3 claves', async () => {
    const respuesta = await http().patch(`/v1/usuarios/${f.qe1.id}`).set(como(f.adm1)).send({ activo: false }).expect(409);
    assert.deepEqual(Object.keys(respuesta.body.relaciones).sort(), SIN_CELULAS);
    assert.equal(respuesta.body.relaciones.hduAbiertas.total, 0);
    // Un analista con HDU abiertas sí se puede desactivar (no cambia).
    await http().patch(`/v1/usuarios/${f.ana2.id}`).set(como(f.adm1)).send({ activo: false }).expect(200);
    await http().patch(`/v1/usuarios/${f.ana2.id}`).set(como(f.adm1)).send({ activo: true }).expect(200);
  });

  it('dos cambios de rol simultáneos del mismo usuario se serializan: ambos responden y queda un solo cambio auditado', async () => {
    const usuario = await prisma.usuario.create({
      data: { id: '5e000000-0000-4000-8000-000000000002', nombre: 'Concurrente', correo: 'concurrente@quality360.local', rol: { connect: { nombre: 'ANALISTA_QA' } } },
    });
    const respuestas = await Promise.all([
      http().put(`/v1/usuarios/${usuario.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }),
      http().put(`/v1/usuarios/${usuario.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }),
    ]);
    assert.deepEqual(respuestas.map((respuesta) => respuesta.status), [200, 200]);
    assert.equal(await prisma.auditoria.count({ where: { entidadId: usuario.id, accion: 'CAMBIAR_ROL' } }), 1);
  });
});

describe('Solo el Administrador [E7-B01#3]', () => {
  it('[E7-B01-T09] QE1, ANA1 y AUD1 reciben 403 ACCESO_DENEGADO al cambiar un rol y los datos no cambian', async () => {
    for (const usuario of [f.qe1, f.ana1, f.aud1]) {
      const rol = await http().put(`/v1/usuarios/${f.inact1.id}/rol`).set(como(usuario)).send({ rol: 'AUDITOR' });
      assert.equal(rol.status, 403, `PUT rol como ${usuario.nombre}`);
      assert.equal(rol.body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: f.inact1.id }, include: { rol: true } })).rol.nombre, 'QE');
  });

  it('un Auditor tampoco lee usuarios ni roles', async () => {
    await http().get('/v1/usuarios').set(como(f.aud1)).expect(403);
    await http().get('/v1/roles').set(como(f.aud1)).expect(403);
  });

  it('[E7-B01-T10] sin token: 401 NO_AUTENTICADO', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.inact1.id}/rol`).send({ rol: 'AUDITOR' });
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
  });

  it('[E7-B01#3] el perfil de un Auditor lleva su rol leído de la base (E1-F11)', async () => {
    assert.equal((await http().get('/v1/me').set(como(f.aud1)).expect(200)).body.rol, 'AUDITOR');
  });
});

describe('Migración D208 sobre una base que aún tiene el rol Líder QA', () => {
  it('pasa al Líder a AUDITOR desactivado, lo audita, quita el rol del catálogo y es idempotente', async () => {
    const sql = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20261118000000_d208_retiro_lider_qa', 'migration.sql'), 'utf8');
    const sentencias = sql
      .split(/;\s*\r?\n/)
      .map((bloque) => bloque.replace(/^\s*--.*$/gm, '').trim())
      .filter((bloque) => bloque.length > 0);
    assert.equal(sentencias.length, 3, 'actualiza usuarios, quita el rol y elimina celula_lider');

    await prisma.$executeRaw`INSERT INTO "organizacion"."rol" ("nombre", "descripcion") VALUES ('LIDER_QA', 'rol retirado') ON CONFLICT ("nombre") DO NOTHING`;
    const lider = await prisma.usuario.create({
      data: { id: '5e000000-0000-4000-8000-000000000003', nombre: 'Líder antiguo', correo: 'lider.antiguo@quality360.local', rol: { connect: { nombre: 'LIDER_QA' } } },
    });

    for (let vuelta = 0; vuelta < 2; vuelta += 1) {
      for (const sentencia of sentencias) await prisma.$executeRawUnsafe(sentencia);
    }

    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: lider.id }, include: { rol: true } });
    assert.equal(despues.rol.nombre, 'AUDITOR');
    assert.equal(despues.activo, false);
    assert.equal(await prisma.rol.count({ where: { nombre: 'LIDER_QA' } }), 0);
    const auditados = (await auditoriaDe(lider.id)).filter((fila) => fila.actorId === 'migracion-d208');
    assert.equal(auditados.length, 1, 'la segunda vuelta no audita de nuevo');
    assert.deepEqual(auditados[0]?.antes, { rol: 'LIDER_QA', activo: true });
    assert.deepEqual(auditados[0]?.despues, { rol: 'AUDITOR', activo: false });
    assert.equal(auditados[0]?.accion, 'CAMBIAR_ROL');
  });
});
