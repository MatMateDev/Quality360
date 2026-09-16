/**
 * Integración contra el Postgres local (svc_organizacion) y el Supabase Auth
 * local: perfil, acceso y administración de usuarios (E1-B01, B02, B06, B07,
 * B08, B10, B12).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';

let app: NestExpressApplication;
let admin: UsuarioDePrueba;

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin de prueba' });
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /v1/me [E1-B10]', () => {
  it('sin token: 401 (E1-B02#1)', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/me');
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
  });

  it('con sesión válida: identidad, rol y datos mínimos, sin secretos [E1-B10#1,2,3]', async () => {
    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', autorizacion(admin.token));
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.id, admin.id);
    assert.equal(respuesta.body.correo, admin.correo);
    assert.equal(respuesta.body.rol, 'ADMINISTRADOR');
    assert.equal('contrasena' in respuesta.body, false);
  });

  it('usuario inactivo: acceso denegado aunque el token siga vigente [E1-B01#2, E1-B07#3]', async () => {
    const inactivo = await crearUsuarioDePrueba('ANALISTA_QA', { activo: false });
    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', autorizacion(inactivo.token));
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });

  it('rol vigente reflejado tras un cambio de rol (E1-F11#3)', async () => {
    const usuario = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/usuarios/${usuario.id}/rol`)
      .set('authorization', autorizacion(admin.token))
      .send({ rol: 'QE' })
      .expect(200);

    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', autorizacion(usuario.token));
    assert.equal(respuesta.body.rol, 'QE');
  });
});

describe('POST /v1/usuarios [E1-B07#1, E1-B12#1]', () => {
  it('solo Administrador puede registrar usuarios (E1-B02, x-roles)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', autorizacion(qe.token))
      .send({ nombre: 'Nuevo', correo: `no-admin-${Date.now()}@quality360.local`, rol: 'ANALISTA_QA' });
    assert.equal(respuesta.status, 403);
  });

  it('valida el esquema antes de crear (400)', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', autorizacion(admin.token))
      .send({ nombre: '', correo: 'no-es-correo', rol: 'ROL_INVALIDO' });
    assert.equal(respuesta.status, 400);
    assert.equal(respuesta.body.codigo, 'VALIDACION');
    assert.ok(respuesta.body.detalles.length > 0);
  });

  it('crea el registro y la cuenta de Supabase Auth; queda activo', async () => {
    const correo = `alta-${Date.now()}@quality360.local`;
    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', autorizacion(admin.token))
      .send({ nombre: 'Persona Nueva', correo, rol: 'ANALISTA_QA' });
    assert.equal(respuesta.status, 201);
    assert.equal(respuesta.body.correo, correo);
    assert.equal(respuesta.body.activo, true);
    assert.equal(respuesta.headers.location, `/v1/usuarios/${respuesta.body.id}`);

    const enBase = await prisma.usuario.findUnique({ where: { id: respuesta.body.id } });
    assert.ok(enBase !== null);
  });

  it('correo duplicado: 409 (E1-B07#1)', async () => {
    const existente = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await request(app.getHttpServer())
      .post('/v1/usuarios')
      .set('authorization', autorizacion(admin.token))
      .send({ nombre: 'Otra persona', correo: existente.correo, rol: 'ANALISTA_QA' });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'CORREO_DUPLICADO');
  });
});

describe('PATCH /v1/usuarios/{id} y último administrador [E1-B07#2,3]', () => {
  it('actualiza nombre y correo sin cambiar el id', async () => {
    const usuario = await crearUsuarioDePrueba('ANALISTA_QA');
    const nuevoCorreo = `actualizado-${Date.now()}@quality360.local`;
    const respuesta = await request(app.getHttpServer())
      .patch(`/v1/usuarios/${usuario.id}`)
      .set('authorization', autorizacion(admin.token))
      .send({ nombre: 'Nombre actualizado', correo: nuevoCorreo });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.id, usuario.id);
    assert.equal(respuesta.body.correo, nuevoCorreo);
  });

  it('desactivar impide operaciones protegidas en la siguiente solicitud (E1-B07#3)', async () => {
    const usuario = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .patch(`/v1/usuarios/${usuario.id}`)
      .set('authorization', autorizacion(admin.token))
      .send({ activo: false })
      .expect(200);

    const respuesta = await request(app.getHttpServer()).get('/v1/me').set('authorization', autorizacion(usuario.token));
    assert.equal(respuesta.status, 403);
  });

  it('no permite desactivar al último administrador activo (E1-B08#2, por extensión de la regla)', async () => {
    const respuesta = await request(app.getHttpServer())
      .patch(`/v1/usuarios/${admin.id}`)
      .set('authorization', autorizacion(admin.token))
      .send({ activo: false });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'ULTIMO_ADMINISTRADOR');
  });
});

describe('PUT /v1/usuarios/{id}/rol [E1-B08]', () => {
  it('rechaza roles fuera del catálogo (400, E1-B08#1)', async () => {
    const usuario = await crearUsuarioDePrueba('ANALISTA_QA');
    const respuesta = await request(app.getHttpServer())
      .put(`/v1/usuarios/${usuario.id}/rol`)
      .set('authorization', autorizacion(admin.token))
      .send({ rol: 'SUPERUSUARIO' });
    assert.equal(respuesta.status, 400);
  });

  it('protege al último administrador activo (E1-B08#2)', async () => {
    const respuesta = await request(app.getHttpServer())
      .put(`/v1/usuarios/${admin.id}/rol`)
      .set('authorization', autorizacion(admin.token))
      .send({ rol: 'QE' });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'ULTIMO_ADMINISTRADOR');
  });

  it('exige resolver relaciones de supervisión antes de sacar a un QE con analistas vigentes (E1-B08#3)', async () => {
    const qe = await crearUsuarioDePrueba('QE');
    const analista = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .put(`/v1/analistas/${analista.id}/supervisor`)
      .set('authorization', autorizacion(admin.token))
      .send({ qeId: qe.id })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .put(`/v1/usuarios/${qe.id}/rol`)
      .set('authorization', autorizacion(admin.token))
      .send({ rol: 'ANALISTA_QA' });

    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'RELACIONES_INCOMPATIBLES');
    assert.equal(respuesta.body.relaciones.analistasVigentes.length, 1);
    assert.equal(respuesta.body.relaciones.analistasVigentes[0].id, analista.id);
  });
});

describe('GET /v1/usuarios — listar y buscar [E1-F09#1]', () => {
  it('el buscador filtra por nombre o correo, sin distinguir mayúsculas', async () => {
    const marca = `Busqueda${Date.now()}`;
    const usuario = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: `${marca} Pérez` });

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/usuarios?q=${marca.toLowerCase()}`)
      .set('authorization', autorizacion(admin.token));

    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.body.items.some((item: { id: string }) => item.id === usuario.id));
  });
});

describe('GET /v1/auditoria [E1-B12#1]', () => {
  it('registra actor, fecha y cambios de una operación sobre usuarios', async () => {
    const usuario = await crearUsuarioDePrueba('ANALISTA_QA');
    await request(app.getHttpServer())
      .patch(`/v1/usuarios/${usuario.id}`)
      .set('authorization', autorizacion(admin.token))
      .send({ nombre: 'Con auditoría' })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/auditoria?entidad=USUARIO&entidadId=${usuario.id}`)
      .set('authorization', autorizacion(admin.token));

    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.body.items.length >= 1);
    const registro = respuesta.body.items[0];
    assert.equal(registro.actor.id, admin.id);
    assert.equal(registro.entidad, 'USUARIO');
    assert.ok(registro.fecha);
  });
});
