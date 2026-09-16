/**
 * Integración — `/v1/interno/carga/*` (ADR 0007): autorización por
 * credencial de servicio, idempotencia por identificador natural, errores
 * por fila y auditoría con actor `{tipo: SERVICIO, id: integraciones}`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { crearAppDePrueba } from '../ayudas-app.js';
import { cargarConfiguracion } from '../../src/configuracion.js';
import { crearApp } from '../../src/crear-app.js';
import { limpiarBaseDeDatos, prisma } from '../ayudas.js';

const TOKEN = process.env.X_Q360_SERVICIO_TOKEN as string;
const CONTRASENA_DEMO = 'Quality360-demo-local';
const CABECERA = 'x-q360-servicio-token';

let app: NestExpressApplication;
let appDeshabilitada: NestExpressApplication;

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  appDeshabilitada = await crearApp({ ...cargarConfiguracion(), permitirCargaSemilla: false }, { registro: false });
});

after(async () => {
  await app.close();
  await appDeshabilitada.close();
  await prisma.$disconnect();
});

describe('Autorización de /v1/interno/carga/*', () => {
  it('sin cabecera de servicio: 404 (nunca alcanzable desde el navegador)', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/interno/carga/celulas')
      .send({ nombre: 'Célula sin cabecera' });
    assert.equal(respuesta.status, 404);
  });

  it('con token incorrecto: 404, no 403 (no revela que la ruta existe)', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/interno/carga/celulas')
      .set(CABECERA, 'token-incorrecto')
      .send({ nombre: 'Célula token incorrecto' });
    assert.equal(respuesta.status, 404);
  });

  it('con PERMITIR_CARGA_SEMILLA=false: 404 aunque el token sea correcto', async () => {
    const respuesta = await request(appDeshabilitada.getHttpServer())
      .post('/v1/interno/carga/celulas')
      .set(CABECERA, TOKEN)
      .send({ nombre: 'Célula deshabilitada' });
    assert.equal(respuesta.status, 404);
  });

  it('una sesión de usuario normal (sesionSupabase) no sirve para esta ruta: 404', async () => {
    const respuesta = await request(app.getHttpServer()).post('/v1/interno/carga/celulas').send({ nombre: 'x' });
    assert.equal(respuesta.status, 404);
  });
});

describe('Idempotencia y errores por fila', () => {
  it('célula: crea la primera vez, no duplica la segunda (mismo id)', async () => {
    const nombre = `Célula semilla ${Date.now()}`;
    const primera = await request(app.getHttpServer()).post('/v1/interno/carga/celulas').set(CABECERA, TOKEN).send({ nombre });
    assert.equal(primera.status, 201);
    assert.equal(primera.body.creado, true);

    const segunda = await request(app.getHttpServer())
      .post('/v1/interno/carga/celulas')
      .set(CABECERA, TOKEN)
      .send({ nombre: nombre.toUpperCase() });
    assert.equal(segunda.status, 200);
    assert.equal(segunda.body.creado, false);
    assert.equal(segunda.body.celula.id, primera.body.celula.id);

    const total = await prisma.celula.count({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    assert.equal(total, 1);
  });

  it('sprint: fin anterior a inicio se rechaza (400) sin afectar otras filas', async () => {
    const invalida = await request(app.getHttpServer())
      .post('/v1/interno/carga/sprints')
      .set(CABECERA, TOKEN)
      .send({ nombre: `Sprint inválido ${Date.now()}`, inicio: '2026-02-01', fin: '2026-01-01' });
    assert.equal(invalida.status, 400);

    const valida = await request(app.getHttpServer())
      .post('/v1/interno/carga/sprints')
      .set(CABECERA, TOKEN)
      .send({ nombre: `Sprint válido ${Date.now()}`, inicio: '2026-01-01', fin: '2026-01-14' });
    assert.equal(valida.status, 201);
  });

  it('usuario: vuelve a cargar el mismo correo sin duplicar ni tocar el rol', async () => {
    const correo = `semilla.${Date.now()}@quality360.local`;
    const primera = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA, TOKEN)
      .send({ nombre: 'QE Semilla', correo, rol: 'QE', contrasenaInicial: CONTRASENA_DEMO });
    assert.equal(primera.status, 201);
    assert.equal(primera.body.creado, true);

    const segunda = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA, TOKEN)
      .send({ nombre: 'Otro nombre', correo, rol: 'ANALISTA_QA', contrasenaInicial: CONTRASENA_DEMO });
    assert.equal(segunda.status, 200);
    assert.equal(segunda.body.creado, false);
    assert.equal(segunda.body.usuario.id, primera.body.usuario.id);
    assert.equal(segunda.body.usuario.rol, 'QE'); // no cambia: la carga existente no se toca

    const total = await prisma.usuario.count({ where: { correo } });
    assert.equal(total, 1);
  });

  it('usuario: datos inválidos se rechazan (400) sin invalidar el resto del lote', async () => {
    const filaInvalida = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA, TOKEN)
      .send({ nombre: '', correo: 'no-es-correo', rol: 'ROL_INVALIDO' });
    assert.equal(filaInvalida.status, 400);
    assert.ok(filaInvalida.body.detalles.length > 0);

    const filaValida = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA, TOKEN)
      .send({ nombre: 'Sigue el lote', correo: `sigue.${Date.now()}@quality360.local`, rol: 'ANALISTA_QA', contrasenaInicial: CONTRASENA_DEMO });
    assert.equal(filaValida.status, 201);
  });

  it('HDU: idempotente por código; QE responsable inválido se rechaza (422)', async () => {
    const celula = await request(app.getHttpServer())
      .post('/v1/interno/carga/celulas')
      .set(CABECERA, TOKEN)
      .send({ nombre: `Célula HDU ${Date.now()}` });
    const sprint = await request(app.getHttpServer())
      .post('/v1/interno/carga/sprints')
      .set(CABECERA, TOKEN)
      .send({ nombre: `Sprint HDU ${Date.now()}`, inicio: '2026-01-01', fin: '2026-01-14' });
    const qe = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA, TOKEN)
      .send({ nombre: 'QE de HDU semilla', correo: `qe.hdu.${Date.now()}@quality360.local`, rol: 'QE', contrasenaInicial: CONTRASENA_DEMO });

    const codigo = `SEM-${Date.now()}`;
    const datosHdu = {
      codigo,
      titulo: 'HDU de la semilla',
      celulaId: celula.body.celula.id,
      sprintId: sprint.body.sprint.id,
      prioridad: 'MEDIA',
      qeResponsableId: qe.body.usuario.id,
    };

    const primera = await request(app.getHttpServer()).post('/v1/interno/carga/hdu').set(CABECERA, TOKEN).send(datosHdu);
    assert.equal(primera.status, 201);
    assert.equal(primera.body.creado, true);
    assert.equal(primera.body.hdu.estado, 'PENDIENTE');
    assert.equal(primera.body.hdu.analista, null);

    const segunda = await request(app.getHttpServer())
      .post('/v1/interno/carga/hdu')
      .set(CABECERA, TOKEN)
      .send({ ...datosHdu, codigo: codigo.toUpperCase(), titulo: 'Título distinto, no debería aplicarse' });
    assert.equal(segunda.status, 200);
    assert.equal(segunda.body.creado, false);
    assert.equal(segunda.body.hdu.id, primera.body.hdu.id);
    assert.equal(segunda.body.hdu.titulo, 'HDU de la semilla');

    const conQeInvalido = await request(app.getHttpServer())
      .post('/v1/interno/carga/hdu')
      .set(CABECERA, TOKEN)
      .send({ ...datosHdu, codigo: `SEM-INVALIDA-${Date.now()}`, qeResponsableId: '9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10' });
    assert.equal(conQeInvalido.status, 422);
    assert.equal(conQeInvalido.body.codigo, 'QE_INVALIDO');
  });

  it('auditoría: la carga queda registrada con actor SERVICIO/integraciones', async () => {
    const nombre = `Célula auditada ${Date.now()}`;
    await request(app.getHttpServer()).post('/v1/interno/carga/celulas').set(CABECERA, TOKEN).send({ nombre });

    const correo = `auditado.${Date.now()}@quality360.local`;
    const usuario = await request(app.getHttpServer())
      .post('/v1/interno/carga/usuarios')
      .set(CABECERA, TOKEN)
      .send({ nombre: 'Auditado por semilla', correo, rol: 'ANALISTA_QA', contrasenaInicial: CONTRASENA_DEMO });

    const registro = await prisma.auditoria.findFirst({
      where: { entidad: 'USUARIO', entidadId: usuario.body.usuario.id, accion: 'CREAR_USUARIO' },
    });
    assert.ok(registro !== null);
    assert.equal(registro?.actorTipo, 'SERVICIO');
    assert.equal(registro?.actorId, 'integraciones');
  });
});

describe('Supervisión desde la semilla (credencialServicio en PUT /v1/analistas/{id}/supervisor)', () => {
  it('permite dejar analistas con supervisor, sin supervisor y con historial de más de un QE (E1-B09)', async () => {
    const correoQe1 = `qe1.semilla.${Date.now()}@quality360.local`;
    const correoQe2 = `qe2.semilla.${Date.now()}@quality360.local`;
    const correoA1 = `a1.semilla.${Date.now()}@quality360.local`;
    const correoA2 = `a2.semilla.${Date.now()}@quality360.local`;

    const qe1 = await request(app.getHttpServer()).post('/v1/interno/carga/usuarios').set(CABECERA, TOKEN).send({ nombre: 'QE1', correo: correoQe1, rol: 'QE', contrasenaInicial: CONTRASENA_DEMO });
    const qe2 = await request(app.getHttpServer()).post('/v1/interno/carga/usuarios').set(CABECERA, TOKEN).send({ nombre: 'QE2', correo: correoQe2, rol: 'QE', contrasenaInicial: CONTRASENA_DEMO });
    const a1 = await request(app.getHttpServer()).post('/v1/interno/carga/usuarios').set(CABECERA, TOKEN).send({ nombre: 'A1', correo: correoA1, rol: 'ANALISTA_QA', contrasenaInicial: CONTRASENA_DEMO });
    const a2 = await request(app.getHttpServer()).post('/v1/interno/carga/usuarios').set(CABECERA, TOKEN).send({ nombre: 'A2', correo: correoA2, rol: 'ANALISTA_QA', contrasenaInicial: CONTRASENA_DEMO });

    // a1 queda con historial de dos QE.
    await request(app.getHttpServer())
      .put(`/v1/analistas/${a1.body.usuario.id}/supervisor`)
      .set(CABECERA, TOKEN)
      .send({ qeId: qe1.body.usuario.id })
      .expect(200);
    const cambio = await request(app.getHttpServer())
      .put(`/v1/analistas/${a1.body.usuario.id}/supervisor`)
      .set(CABECERA, TOKEN)
      .send({ qeId: qe2.body.usuario.id, motivo: 'Reorganización de la semilla' });
    assert.equal(cambio.status, 200);
    assert.equal(cambio.body.vigente.qe.id, qe2.body.usuario.id);
    assert.equal(cambio.body.anterior.qe.id, qe1.body.usuario.id);

    // a2 queda sin supervisor (nunca se llama el endpoint para él).
    const historialA2 = await prisma.supervision.count({ where: { analistaId: a2.body.usuario.id } });
    assert.equal(historialA2, 0);

    const historialA1 = await prisma.supervision.count({ where: { analistaId: a1.body.usuario.id } });
    assert.equal(historialA1, 2);
  });
});
