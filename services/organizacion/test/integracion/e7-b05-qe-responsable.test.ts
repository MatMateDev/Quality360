/**
 * E7-B05 · Reasignación del QE responsable de una HDU (D54) y catálogo de personas,
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
const ruta = (hduId: string): string => `/v1/hdu/${hduId}/qe-responsable`;

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  f = await crearFixtureE7();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Reasignar el QE responsable [E7-B05#1]', () => {
  it('[E7-B05-T01] ADM1 reasigna H2 de QE1 a QE2 con motivo: se actualiza la HDU y queda auditado con antes, después, motivo y actor', async () => {
    const respuesta = await http().put(ruta(f.h.H2.id)).set(como(f.adm1)).send({ qeResponsableId: f.qe2.id, motivo: 'QE1 pasa a otro proyecto' }).expect(200);
    assert.equal(respuesta.body.cambio, true);
    assert.equal(respuesta.body.qeAnterior.id, f.qe1.id);
    assert.equal(respuesta.body.qeNuevo.id, f.qe2.id);
    assert.equal(respuesta.body.hdu.qeResponsable.id, f.qe2.id);
    assert.equal(respuesta.body.motivo, 'QE1 pasa a otro proyecto');
    assert.equal(respuesta.body.actor.id, f.adm1.id);

    assert.equal((await prisma.hdu.findUniqueOrThrow({ where: { id: f.h.H2.id } })).qeResponsableId, f.qe2.id);
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { entidadId: f.h.H2.id, accion: 'REASIGNAR_QE_RESPONSABLE' } });
    assert.equal(auditoria.entidad, 'HDU');
    assert.equal(auditoria.actorId, f.adm1.id);
    assert.deepEqual(auditoria.antes, { qeResponsableId: f.qe1.id });
    assert.deepEqual(auditoria.despues, { qeResponsableId: f.qe2.id });
    assert.equal(auditoria.motivo, 'QE1 pasa a otro proyecto');
  });

  it('el historial de la HDU incluye el evento QE_RESPONSABLE en orden cronológico, para quien puede leerla', async () => {
    const historial = await http().get(`/v1/hdu/${f.h.H2.id}/historial`).set(como(f.qe2)).expect(200);
    const tipos = historial.body.items.map((evento: { tipo: string }) => evento.tipo);
    assert.deepEqual(tipos, ['ESTADO', 'QE_RESPONSABLE']);
    const evento = historial.body.items[1];
    assert.deepEqual([evento.qeAnterior.id, evento.qeNuevo.id, evento.motivo, evento.actor.id], [f.qe1.id, f.qe2.id, 'QE1 pasa a otro proyecto', f.adm1.id]);
    const fechas = historial.body.items.map((e: { fecha: string }) => Date.parse(e.fecha));
    assert.deepEqual([...fechas].sort((a, b) => a - b), fechas);
  });

  it('el nuevo QE responsable ya ve la HDU en su ámbito y el anterior solo por su equipo', async () => {
    await http().get(`/v1/hdu/${f.h.H2.id}`).set(como(f.qe2)).expect(200);
    const anterior = await http().get(`/v1/hdu/${f.h.H2.id}`).set(como(f.qe1)).expect(200);
    assert.equal(anterior.body.permisos.asignarAnalista, false, 'QE1 ya no es el responsable');
  });

  it('el mismo QE: 200 sin cambio y sin auditoría ni historial', async () => {
    const antes = await prisma.auditoria.count({ where: { accion: 'REASIGNAR_QE_RESPONSABLE' } });
    const respuesta = await http().put(ruta(f.h.H2.id)).set(como(f.adm1)).send({ qeResponsableId: f.qe2.id, motivo: 'Sin cambios' }).expect(200);
    assert.equal(respuesta.body.cambio, false);
    assert.equal(respuesta.body.motivo, null);
    assert.equal(await prisma.auditoria.count({ where: { accion: 'REASIGNAR_QE_RESPONSABLE' } }), antes);
    assert.equal(await prisma.hduHistorialResponsable.count({ where: { hduId: f.h.H2.id } }), 1);
  });

  it('resuelve el 409 de D43: tras reasignar sus HDU abiertas, el QE solo conserva los analistas por reasignar', async () => {
    for (const codigo of ['H1', 'H5', 'H6', 'H8'] as const) {
      await http().put(ruta(f.h[codigo].id)).set(como(f.adm1)).send({ qeResponsableId: f.qe2.id, motivo: 'Traspaso de cartera' }).expect(200);
    }
    const respuesta = await http().put(`/v1/usuarios/${f.qe1.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(409);
    assert.equal(respuesta.body.relaciones.hduAbiertas.total, 0);
    assert.equal(respuesta.body.relaciones.analistasVigentes.length, 2);
  });
});

describe('Solo el Administrador [E7-B05#2]', () => {
  it('[E7-B05-T02] el QE (incluso el responsable), el analista, el Líder y el Auditor reciben 403 y nada cambia', async () => {
    const antes = (await prisma.hdu.findUniqueOrThrow({ where: { id: f.h.H3.id } })).qeResponsableId;
    for (const usuario of [f.qe2, f.qe1, f.ana3, f.lid1, f.aud1]) {
      const respuesta = await http().put(ruta(f.h.H3.id)).set(como(usuario)).send({ qeResponsableId: f.qe1.id, motivo: 'Intento no autorizado' });
      assert.equal(respuesta.status, 403, usuario.nombre);
      assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await prisma.hdu.findUniqueOrThrow({ where: { id: f.h.H3.id } })).qeResponsableId, antes);
    assert.equal(await prisma.hduHistorialResponsable.count({ where: { hduId: f.h.H3.id } }), 0);
  });

  it('sin token: 401', async () => {
    await http().put(ruta(f.h.H3.id)).send({ qeResponsableId: f.qe1.id, motivo: 'sin sesión' }).expect(401);
  });
});

describe('Destino inválido o HDU cerrada [E7-B05#3]', () => {
  const reasignar = (hduId: string, cuerpo: object) => http().put(ruta(hduId)).set(como(f.adm1)).send(cuerpo);

  it('[E7-B05-T03] un destino que no es QE, está inactivo o no existe se rechaza con 422 QE_INVALIDO', async () => {
    for (const destino of [f.ana1.id, f.lid1.id, f.inact1.id, '00000000-0000-4000-8000-0000000000bb']) {
      const respuesta = await reasignar(f.h.H3.id, { qeResponsableId: destino, motivo: 'Destino inválido' });
      assert.equal(respuesta.status, 422, destino);
      assert.equal(respuesta.body.codigo, 'QE_INVALIDO');
    }
    assert.equal(await prisma.hduHistorialResponsable.count({ where: { hduId: f.h.H3.id } }), 0);
  });

  it('una HDU cerrada no admite el cambio: 409 HDU_CERRADA', async () => {
    const respuesta = await reasignar(f.h.H7.id, { qeResponsableId: f.qe1.id, motivo: 'HDU cerrada' });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'HDU_CERRADA');
  });

  it('el motivo es obligatorio: ausente o muy corto 400; en blanco 422 MOTIVO_REQUERIDO', async () => {
    await reasignar(f.h.H3.id, { qeResponsableId: f.qe1.id }).expect(400);
    await reasignar(f.h.H3.id, { qeResponsableId: f.qe1.id, motivo: 'ab' }).expect(400);
    await reasignar(f.h.H3.id, { qeResponsableId: f.qe1.id, motivo: 'x'.repeat(501) }).expect(400);
    const enBlanco = await reasignar(f.h.H3.id, { qeResponsableId: f.qe1.id, motivo: '     ' });
    assert.equal(enBlanco.status, 422);
    assert.equal(enBlanco.body.codigo, 'MOTIVO_REQUERIDO');
    await reasignar(f.h.H3.id, { qeResponsableId: 'no-uuid', motivo: 'Motivo válido' }).expect(400);
    await reasignar(f.h.H3.id, { qeResponsableId: f.qe1.id, motivo: 'Motivo válido', otro: 1 }).expect(400);
  });

  it('una HDU inexistente da 404 al Administrador', async () => {
    await reasignar('00000000-0000-4000-8000-0000000000cc', { qeResponsableId: f.qe1.id, motivo: 'No existe' }).expect(404);
  });
});

describe('GET /v1/catalogos/personas [D54]', () => {
  it('lista las personas por rol, solo activas por defecto, ordenadas por nombre', async () => {
    const qe = await http().get('/v1/catalogos/personas?rol=QE').set(como(f.adm1)).expect(200);
    assert.deepEqual(qe.body.items.map((p: { nombre: string }) => p.nombre), ['QE1', 'QE2']);
    assert.deepEqual(Object.keys(qe.body.items[0]).sort(), ['correo', 'id', 'nombre', 'rol']);
    const inactivos = await http().get('/v1/catalogos/personas?rol=QE&activo=false').set(como(f.adm1)).expect(200);
    assert.deepEqual(inactivos.body.items.map((p: { nombre: string }) => p.nombre), ['INACT1']);
    const todos = await http().get('/v1/catalogos/personas').set(como(f.adm1)).expect(200);
    assert.equal(todos.body.items.length, 10);
    await http().get('/v1/catalogos/personas?rol=SUPERVISOR').set(como(f.adm1)).expect(400);
  });

  it('solo el Administrador lo consulta: trae correos', async () => {
    for (const usuario of [f.qe1, f.ana1, f.lid1, f.aud1]) await http().get('/v1/catalogos/personas').set(como(usuario)).expect(403);
  });
});
