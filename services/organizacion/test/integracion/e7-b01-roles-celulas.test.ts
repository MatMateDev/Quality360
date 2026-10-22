/**
 * E7-B01 · Roles Líder QA y Auditor, y células del Líder (D28, D30, D31, D40, D42, D43),
 * contra Postgres y Supabase Auth locales reales. Fixture de la sección 3 del backlog E7.
 */
import assert from 'node:assert/strict';
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
  it('[E7-B01-T01] ofrece los 5 roles en el orden del selector, con LIDER_QA y AUDITOR de solo lectura', async () => {
    const respuesta = await http().get('/v1/roles').set(como(f.adm1)).expect(200);
    assert.deepEqual(
      respuesta.body.items.map((rol: { codigo: string }) => rol.codigo),
      ['ANALISTA_QA', 'QE', 'LIDER_QA', 'ADMINISTRADOR', 'AUDITOR'],
    );
    assert.deepEqual(
      respuesta.body.items.map((rol: { nombre: string }) => rol.nombre),
      ['Analista QA', 'QE', 'Líder QA', 'Administrador', 'Auditor'],
    );
    const soloLectura = respuesta.body.items.filter((rol: { soloLectura: boolean }) => rol.soloLectura).map((rol: { codigo: string }) => rol.codigo);
    assert.deepEqual(soloLectura, ['LIDER_QA', 'AUDITOR']);
  });

  it('el catálogo de la base tiene las 5 filas (migración 20261021000000)', async () => {
    const nombres = (await prisma.rol.findMany({ select: { nombre: true } })).map((fila) => fila.nombre).sort();
    assert.deepEqual(nombres, ['ADMINISTRADOR', 'ANALISTA_QA', 'AUDITOR', 'LIDER_QA', 'QE']);
  });
});

describe('Asignar rol y células [E7-B01#1]', () => {
  it('[E7-B01-T02] cambia ANA4 a LIDER_QA y fija CEL-A y CEL-B: 2 vigentes y 2 entradas de auditoría con actor ADM1', async () => {
    await http().put(`/v1/usuarios/${f.ana4.id}/rol`).set(como(f.adm1)).send({ rol: 'LIDER_QA' }).expect(200);
    const respuesta = await http()
      .put(`/v1/usuarios/${f.ana4.id}/celulas-lider`)
      .set(como(f.adm1))
      .send({ celulaIds: [f.celdaA.id, f.celdaB.id] })
      .expect(200);
    assert.equal(respuesta.body.vigentes.length, 2);
    const consulta = await http().get(`/v1/usuarios/${f.ana4.id}/celulas-lider`).set(como(f.adm1)).expect(200);
    assert.deepEqual(consulta.body.vigentes.map((fila: { celula: { nombre: string } }) => fila.celula.nombre), ['CEL-A', 'CEL-B']);

    const registros = (await auditoriaDe(f.ana4.id)).filter((fila) => fila.accion === 'CAMBIAR_ROL' || fila.accion === 'ASIGNAR_CELULAS_LIDER');
    assert.deepEqual(registros.map((fila) => fila.accion), ['CAMBIAR_ROL', 'ASIGNAR_CELULAS_LIDER']);
    assert.ok(registros.every((fila) => fila.actorId === f.adm1.id));
    assert.deepEqual((registros[1]?.antes as { celulas: unknown[] }).celulas, []);
    assert.equal((registros[1]?.despues as { celulas: unknown[] }).celulas.length, 2);
  });

  it('el usuario trae sus células vigentes en el listado y en GET /v1/usuarios/{id} (D44)', async () => {
    const uno = await http().get(`/v1/usuarios/${f.lid1.id}`).set(como(f.adm1)).expect(200);
    assert.deepEqual(uno.body.celulasVigentes.map((celula: { nombre: string }) => celula.nombre), ['CEL-A', 'CEL-B']);
    const lista = await http().get('/v1/usuarios?q=LID&tamanoPagina=100').set(como(f.adm1)).expect(200);
    const lid2 = lista.body.items.find((usuario: { id: string }) => usuario.id === f.lid2.id);
    assert.deepEqual(lid2.celulasVigentes, []);
    const ana1 = await http().get(`/v1/usuarios/${f.ana1.id}`).set(como(f.adm1)).expect(200);
    assert.deepEqual(ana1.body.celulasVigentes, []);
    await http().get('/v1/usuarios/00000000-0000-4000-8000-000000000000').set(como(f.adm1)).expect(404);
  });

  it('rol y células en una sola llamada (D42): QE sin relaciones pasa a LIDER_QA con sus células y se auditan ambos cambios', async () => {
    const qe = await prisma.usuario.findUniqueOrThrow({ where: { id: f.inact1.id } });
    assert.equal(qe.activo, false);
    const respuesta = await http()
      .put(`/v1/usuarios/${f.inact1.id}/rol`)
      .set(como(f.adm1))
      .send({ rol: 'LIDER_QA', celulaIds: [f.celdaC.id] })
      .expect(200);
    assert.equal(respuesta.body.rol, 'LIDER_QA');
    assert.deepEqual(respuesta.body.celulasVigentes.map((celula: { nombre: string }) => celula.nombre), ['CEL-C']);
    const acciones = (await auditoriaDe(f.inact1.id)).map((fila) => fila.accion);
    assert.deepEqual(acciones, ['CAMBIAR_ROL', 'ASIGNAR_CELULAS_LIDER']);
    // Se deja como estaba para el resto de las pruebas.
    await http().put(`/v1/usuarios/${f.inact1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [] }).expect(200);
    await http().put(`/v1/usuarios/${f.inact1.id}/rol`).set(como(f.adm1)).send({ rol: 'QE' }).expect(200);
  });

  it('[E7-F07#2] un Líder sin células es válido: el cambio de rol sin celulaIds no abre ninguna', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.inact1.id}/rol`).set(como(f.adm1)).send({ rol: 'LIDER_QA' }).expect(200);
    assert.deepEqual(respuesta.body.celulasVigentes, []);
    await http().put(`/v1/usuarios/${f.inact1.id}/rol`).set(como(f.adm1)).send({ rol: 'QE' }).expect(200);
  });

  it('el cambio es atómico: una célula inexistente rechaza todo y el rol no cambia (E7-F07#2, D42)', async () => {
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: f.inact1.id }, include: { rol: true } });
    const respuesta = await http()
      .put(`/v1/usuarios/${f.inact1.id}/rol`)
      .set(como(f.adm1))
      .send({ rol: 'LIDER_QA', celulaIds: [f.celdaC.id, '00000000-0000-4000-8000-000000000001'] })
      .expect(422);
    assert.equal(respuesta.body.codigo, 'CATALOGO_INVALIDO');
    assert.deepEqual(respuesta.body.detalles[0], { campo: 'celulaIds[1]', codigo: 'NO_EXISTE', mensaje: 'La célula indicada no existe.' });
    const despues = await prisma.usuario.findUniqueOrThrow({ where: { id: f.inact1.id }, include: { rol: true } });
    assert.equal(despues.rol.nombre, antes.rol.nombre);
    assert.equal(await prisma.celulaLider.count({ where: { usuarioId: f.inact1.id, hasta: null } }), 0);
  });

  it('alta de usuario con rol LIDER_QA y células: crea la cuenta, el registro y las asignaciones (D42)', async () => {
    const correo = `lider.${Date.now()}@quality360.local`;
    const respuesta = await http()
      .post('/v1/usuarios')
      .set(como(f.adm1))
      .send({ nombre: 'Líder nuevo', correo, rol: 'LIDER_QA', celulaIds: [f.celdaB.id] })
      .expect(201);
    assert.equal(respuesta.body.rol, 'LIDER_QA');
    assert.deepEqual(respuesta.body.celulasVigentes.map((celula: { nombre: string }) => celula.nombre), ['CEL-B']);
    assert.deepEqual((await auditoriaDe(respuesta.body.id)).map((fila) => fila.accion), ['CREAR_USUARIO', 'ASIGNAR_CELULAS_LIDER']);
  });

  it('alta de usuario con célula inexistente: 422 y no se crea nada', async () => {
    const correo = `lider.invalido.${Date.now()}@quality360.local`;
    await http()
      .post('/v1/usuarios')
      .set(como(f.adm1))
      .send({ nombre: 'Líder inválido', correo, rol: 'LIDER_QA', celulaIds: ['00000000-0000-4000-8000-000000000002'] })
      .expect(422);
    assert.equal(await prisma.usuario.count({ where: { correo } }), 0);
  });
});

describe('Reglas de integridad [E7-B01#2]', () => {
  it('[E7-B01-T03] un rol fuera del catálogo se rechaza con 400 VALIDACION y VALOR_NO_PERMITIDO', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.ana1.id}/rol`).set(como(f.adm1)).send({ rol: 'SUPERVISOR' }).expect(400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.ok(respuesta.body.detalles.some((detalle: { campo: string; codigo: string }) => detalle.campo === 'rol' && detalle.codigo === 'VALOR_NO_PERMITIDO'));
  });

  it('celulaIds no vacío con un rol distinto de LIDER_QA: 400 NO_PERMITIDO y nada cambia (D42)', async () => {
    const respuesta = await http()
      .put(`/v1/usuarios/${f.inact1.id}/rol`)
      .set(como(f.adm1))
      .send({ rol: 'AUDITOR', celulaIds: [f.celdaA.id] })
      .expect(400);
    assert.deepEqual(respuesta.body.detalles[0]?.campo, 'celulaIds');
    assert.deepEqual(respuesta.body.detalles[0]?.codigo, 'NO_PERMITIDO');
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: f.inact1.id }, include: { rol: true } })).rol.nombre, 'QE');
  });

  it('[E7-B01-T04] células a un usuario que no es Líder: 409 ROL_INCOMPATIBLE y sin cambios', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.qe1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaA.id] }).expect(409);
    assert.equal(respuesta.body.codigo, 'ROL_INCOMPATIBLE');
    assert.equal(await prisma.celulaLider.count({ where: { usuarioId: f.qe1.id } }), 0);
  });

  it('[E7-B01-T05] una célula inexistente se rechaza con 422 y las células de LID1 no cambian', async () => {
    const respuesta = await http()
      .put(`/v1/usuarios/${f.lid1.id}/celulas-lider`)
      .set(como(f.adm1))
      .send({ celulaIds: [f.celdaA.id, '00000000-0000-4000-8000-000000000003'] })
      .expect(422);
    assert.equal(respuesta.body.codigo, 'CATALOGO_INVALIDO');
    const vigentes = await prisma.celulaLider.findMany({ where: { usuarioId: f.lid1.id, hasta: null } });
    assert.equal(vigentes.length, 2);
  });

  it('[E7-B01-T06] cambiar el rol de LID1 con células: 409 RELACIONES_INCOMPATIBLES; con la lista vacía el cambio da 200', async () => {
    const rechazo = await http().put(`/v1/usuarios/${f.lid1.id}/rol`).set(como(f.adm1)).send({ rol: 'ANALISTA_QA' }).expect(409);
    assert.equal(rechazo.body.codigo, 'RELACIONES_INCOMPATIBLES');
    assert.deepEqual(rechazo.body.relaciones.celulasVigentes.map((celula: { nombre: string }) => celula.nombre), ['CEL-A', 'CEL-B']);
    assert.match(rechazo.body.mensaje, /CEL-A, CEL-B/);
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: f.lid1.id }, include: { rol: true } })).rol.nombre, 'LIDER_QA');

    await http().put(`/v1/usuarios/${f.lid1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [] }).expect(200);
    await http().put(`/v1/usuarios/${f.lid1.id}/rol`).set(como(f.adm1)).send({ rol: 'ANALISTA_QA' }).expect(200);
    // Vuelve a ser Líder con sus dos células para el resto de las pruebas.
    await http().put(`/v1/usuarios/${f.lid1.id}/rol`).set(como(f.adm1)).send({ rol: 'LIDER_QA', celulaIds: [f.celdaA.id, f.celdaB.id] }).expect(200);
  });

  it('[E7-B01-T07] PUT con solo CEL-A: CEL-B queda con fecha_hasta y sigue en el historial; vigentes = 1', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.lid1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaA.id] }).expect(200);
    assert.deepEqual(respuesta.body.vigentes.map((fila: { celula: { nombre: string } }) => fila.celula.nombre), ['CEL-A']);
    const historial = respuesta.body.historial as Array<{ celula: { nombre: string }; hasta: string | null; retiradoPor: { id: string } | null }>;
    const celdaB = historial.find((fila) => fila.celula.nombre === 'CEL-B' && fila.hasta !== null);
    assert.ok(celdaB, 'CEL-B debe figurar en el historial con fecha de término');
    assert.equal(celdaB.retiradoPor?.id, f.adm1.id);
    // Sin diferencias no se audita (200 sin cambios).
    const antes = await prisma.auditoria.count({ where: { accion: 'ASIGNAR_CELULAS_LIDER', entidadId: f.lid1.id } });
    await http().put(`/v1/usuarios/${f.lid1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaA.id] }).expect(200);
    assert.equal(await prisma.auditoria.count({ where: { accion: 'ASIGNAR_CELULAS_LIDER', entidadId: f.lid1.id } }), antes);
    await http().put(`/v1/usuarios/${f.lid1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaA.id, f.celdaB.id] }).expect(200);
  });

  it('el índice único parcial rechaza dos asignaciones vigentes de la misma célula para el mismo líder', async () => {
    await assert.rejects(
      prisma.celulaLider.create({
        data: { usuarioId: f.lid1.id, celulaId: f.celdaA.id, asignadoPorTipo: 'USUARIO', asignadoPorId: f.adm1.id, asignadoPorNombre: 'ADM1' },
      }),
      /Unique constraint|celula_lider_vigente_key/,
    );
  });

  it('[E7-B01-T08] el único administrador no puede cambiar su propio rol (E1-B08#2)', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.adm1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    assert.equal(respuesta.body.codigo, 'ULTIMO_ADMINISTRADOR');
  });

  it('el último administrador se valida antes que las relaciones (D43)', async () => {
    // Un administrador con relaciones abiertas inexistentes no puede pasar de rol: gana ULTIMO_ADMINISTRADOR.
    const respuesta = await http().put(`/v1/usuarios/${f.adm1.id}/rol`).set(como(f.adm1)).send({ rol: 'LIDER_QA', celulaIds: [f.celdaA.id] }).expect(409);
    assert.equal(respuesta.body.codigo, 'ULTIMO_ADMINISTRADOR');
  });
});

describe('Relaciones incompatibles al cambiar de rol (D40, D43)', () => {
  it('un QE con analistas y HDU abiertas recibe las 4 claves a la vez, con a quiénes reasignar', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.qe1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    assert.equal(respuesta.body.codigo, 'RELACIONES_INCOMPATIBLES');
    const { relaciones } = respuesta.body;
    assert.deepEqual(Object.keys(relaciones).sort(), ['analistasVigentes', 'celulasVigentes', 'hduAbiertas', 'supervisorVigente']);
    assert.deepEqual(relaciones.analistasVigentes.map((usuario: { nombre: string }) => usuario.nombre), ['ANA1', 'ANA2']);
    assert.equal(relaciones.supervisorVigente, null);
    assert.equal(relaciones.hduAbiertas.total, 5);
    assert.deepEqual(relaciones.hduAbiertas.items.map((hdu: { codigo: string }) => hdu.codigo), ['H1', 'H2', 'H5', 'H6', 'H8']);
    assert.deepEqual(relaciones.celulasVigentes, []);
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

  it('desactivar conserva la regla de E1-B07: solo un QE con analistas vigentes lo impide, y el 409 trae las 4 claves', async () => {
    const respuesta = await http().patch(`/v1/usuarios/${f.qe1.id}`).set(como(f.adm1)).send({ activo: false }).expect(409);
    assert.deepEqual(Object.keys(respuesta.body.relaciones).sort(), ['analistasVigentes', 'celulasVigentes', 'hduAbiertas', 'supervisorVigente']);
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
  it('[E7-B01-T09] QE1, ANA1, LID1 y AUD1 reciben 403 ACCESO_DENEGADO en los 8 intentos y los datos no cambian', async () => {
    const vigentesAntes = await prisma.celulaLider.count({ where: { usuarioId: f.lid2.id, hasta: null } });
    for (const usuario of [f.qe1, f.ana1, f.lid1, f.aud1]) {
      const celulas = await http().put(`/v1/usuarios/${f.lid2.id}/celulas-lider`).set(como(usuario)).send({ celulaIds: [f.celdaC.id] });
      assert.equal(celulas.status, 403, `PUT celulas-lider como ${usuario.nombre}`);
      assert.equal(celulas.body.codigo, 'ACCESO_DENEGADO');
      const rol = await http().put(`/v1/usuarios/${f.lid2.id}/rol`).set(como(usuario)).send({ rol: 'QE' });
      assert.equal(rol.status, 403, `PUT rol como ${usuario.nombre}`);
      assert.equal(rol.body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal(await prisma.celulaLider.count({ where: { usuarioId: f.lid2.id, hasta: null } }), vigentesAntes);
    assert.equal((await prisma.usuario.findUniqueOrThrow({ where: { id: f.lid2.id }, include: { rol: true } })).rol.nombre, 'LIDER_QA');
  });

  it('un Líder y un Auditor tampoco leen usuarios, roles ni células de otros', async () => {
    for (const usuario of [f.lid1, f.aud1]) {
      await http().get('/v1/usuarios').set(como(usuario)).expect(403);
      await http().get('/v1/roles').set(como(usuario)).expect(403);
      await http().get(`/v1/usuarios/${f.lid2.id}/celulas-lider`).set(como(usuario)).expect(403);
    }
  });

  it('[E7-B01-T10] sin token: 401 NO_AUTENTICADO', async () => {
    const respuesta = await http().put(`/v1/usuarios/${f.lid2.id}/celulas-lider`).send({ celulaIds: [f.celdaC.id] });
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
  });

  it('[E7-B01#3] el perfil de un Líder y de un Auditor lleva su rol leído de la base (E1-F11)', async () => {
    assert.equal((await http().get('/v1/me').set(como(f.lid1)).expect(200)).body.rol, 'LIDER_QA');
    assert.equal((await http().get('/v1/me').set(como(f.aud1)).expect(200)).body.rol, 'AUDITOR');
  });
});
