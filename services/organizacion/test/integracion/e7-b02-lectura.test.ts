/**
 * E7-B02 · Lectura total del Auditor y solo lectura (D12, D32, D47, D50), contra Postgres y
 * Supabase Auth locales reales. Fixture de la sección 3 del backlog E7. El ámbito del Líder QA
 * (E7-B02#1) se retiró con el rol (D208).
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
const INEXISTENTE = '00000000-0000-4000-8000-0000000000aa';

const codigos = (cuerpo: { items: Array<{ codigo: string }> }): string[] => cuerpo.items.map((item) => item.codigo).sort();

before(async () => {
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba();
  f = await crearFixtureE7();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('Lectura total del Auditor [E7-B02#2]', () => {
  it('[E7-B02-T06] AUD1 lista las 8 HDU y el detalle de H7 incluye historiales; una inexistente da 404 (D50)', async () => {
    const lista = await http().get('/v1/hdu?tamanoPagina=100').set(como(f.aud1)).expect(200);
    assert.deepEqual(codigos(lista.body), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8']);
    const detalle = await http().get(`/v1/hdu/${f.h.H7.id}`).set(como(f.aud1)).expect(200);
    assert.equal(detalle.body.codigo, 'H7');
    assert.deepEqual(detalle.body.permisos, { cambiarEstado: false, asignarAnalista: false });
    const historial = await http().get(`/v1/hdu/${f.h.H7.id}/historial`).set(como(f.aud1)).expect(200);
    assert.ok(historial.body.items.length >= 1);
    const inexistente = await http().get(`/v1/hdu/${INEXISTENTE}`).set(como(f.aud1));
    assert.equal(inexistente.status, 404);
  });

  it('el catálogo de células y sprints también es legible por el Auditor', async () => {
    await http().get('/v1/catalogos/celulas').set(como(f.aud1)).expect(200);
    await http().get('/v1/catalogos/sprints').set(como(f.aud1)).expect(200);
  });

  it('el acceso interno distingue la relación de solo lectura del Auditor (D32, D47)', async () => {
    const auditor = await http().get(`/v1/interno/hdu/${f.h.H4.id}/acceso`).set(como(f.aud1)).expect(200);
    assert.equal(auditor.body.relacion, 'LECTOR_AUDITORIA');
    assert.equal(auditor.body.permitido, true);
  });

  it('GET /v1/interno/acceso trae el rol AUDITOR y un ámbito sin células (D208)', async () => {
    const auditor = await http().get('/v1/interno/acceso').set(como(f.aud1)).expect(200);
    assert.equal(auditor.body.rol, 'AUDITOR');
    assert.deepEqual(auditor.body.ambito, { qeSupervisorId: null, analistasSupervisadosIds: [] });
    const analista = await http().get('/v1/interno/acceso').set(como(f.ana1)).expect(200);
    assert.deepEqual(analista.body.ambito, { qeSupervisorId: f.qe1.id, analistasSupervisadosIds: [] });
  });

  it('GET /v1/interno/hdu/ambito: todas para Administrador y Auditor; lista explícita para el resto (D47)', async () => {
    const admin = await http().get('/v1/interno/hdu/ambito').set(como(f.adm1)).expect(200);
    assert.deepEqual(admin.body, { usuarioId: f.adm1.id, rol: 'ADMINISTRADOR', todas: true, hduIds: [] });
    const auditor = await http().get('/v1/interno/hdu/ambito').set(como(f.aud1)).expect(200);
    assert.equal(auditor.body.todas, true);
    const analista = await http().get('/v1/interno/hdu/ambito').set(como(f.ana1)).expect(200);
    assert.deepEqual([...analista.body.hduIds].sort(), [f.h.H1.id, f.h.H6.id].sort());
    const qe = await http().get('/v1/interno/hdu/ambito').set(como(f.qe1)).expect(200);
    assert.equal(qe.body.todas, false);
    assert.deepEqual([...qe.body.hduIds].sort(), ['H1', 'H2', 'H5', 'H6', 'H8'].map((c) => f.h[c as keyof FixtureE7['h']].id).sort());
  });

  it('POST /v1/interno/hdu/consulta devuelve las HDU pedidas en el orden pedido; un id fuera de ámbito o inexistente da 403 completo', async () => {
    const bien = await http().post('/v1/interno/hdu/consulta').set(como(f.qe1)).send({ hduIds: [f.h.H2.id, f.h.H1.id] }).expect(200);
    assert.deepEqual(bien.body.items.map((hdu: { codigo: string }) => hdu.codigo), ['H2', 'H1']);
    assert.equal(bien.body.items[0].celula, 'CEL-A');
    assert.equal(bien.body.items[0].qeResponsable.nombre, 'QE1');

    const mezcla = await http().post('/v1/interno/hdu/consulta').set(como(f.qe1)).send({ hduIds: [f.h.H1.id, f.h.H4.id] });
    assert.equal(mezcla.status, 403);
    assert.equal(mezcla.body.codigo, 'ACCESO_DENEGADO');
    assert.equal('items' in mezcla.body, false, 'sin datos parciales');
    await http().post('/v1/interno/hdu/consulta').set(como(f.qe1)).send({ hduIds: [f.h.H1.id, INEXISTENTE] }).expect(403);
    // Ámbito total (D55): el id desconocido se omite en vez de tumbar el lote.
    const conHuerfana = await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: [f.h.H4.id, INEXISTENTE] }).expect(200);
    assert.deepEqual(conHuerfana.body.items.map((hdu: { id: string }) => hdu.id), [f.h.H4.id]);
    const auditor = await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: [f.h.H4.id, f.h.H8.id] }).expect(200);
    assert.equal(auditor.body.items.length, 2);
  });

  it('POST /v1/interno/hdu/consulta valida el cuerpo: 1 a 1000 ids únicos', async () => {
    await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: [] }).expect(400);
    await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: [f.h.H1.id, f.h.H1.id] }).expect(400);
    await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: ['no-es-uuid'] }).expect(400);
    const muchos = Array.from({ length: 1001 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: muchos }).expect(400);
  });
});

describe('Sin escritura [E7-B02#3]', () => {
  const mutaciones = (h1: string): Array<{ nombre: string; llamar: (u: UsuarioDePrueba) => request.Test }> => [
    { nombre: 'crear HDU', llamar: (u) => http().post('/v1/hdu').set(como(u)).send({ codigo: 'NUEVA-1', titulo: 'x', celulaId: f.celdaA.id, sprintId: f.sprint.id, prioridad: 'BAJA' }) },
    { nombre: 'cambiar estado', llamar: (u) => http().post(`/v1/hdu/${h1}/estado`).set(como(u)).send({ estado: 'PENDIENTE_CIERRE' }) },
    { nombre: 'reasignar analista', llamar: (u) => http().put(`/v1/hdu/${h1}/analista`).set(como(u)).send({ analistaId: f.ana2.id, motivo: 'prueba de solo lectura' }) },
    { nombre: 'reasignar QE responsable', llamar: (u) => http().put(`/v1/hdu/${h1}/qe-responsable`).set(como(u)).send({ qeResponsableId: f.qe2.id, motivo: 'prueba de solo lectura' }) },
    { nombre: 'crear usuario', llamar: (u) => http().post('/v1/usuarios').set(como(u)).send({ nombre: 'Intruso', correo: 'intruso@quality360.local', rol: 'QE' }) },
    { nombre: 'cambiar supervisión', llamar: (u) => http().put(`/v1/analistas/${f.ana4.id}/supervisor`).set(como(u)).send({ qeId: f.qe1.id }) },
    { nombre: 'cambiar rol', llamar: (u) => http().put(`/v1/usuarios/${f.ana4.id}/rol`).set(como(u)).send({ rol: 'QE' }) },
  ];

  it('[E7-B02-T08] AUD1 recibe 403 ACCESO_DENEGADO en las 7 operaciones de escritura de Organización', async () => {
    let intentos = 0;
    for (const mutacion of mutaciones(f.h.H1.id)) {
      const respuesta = await mutacion.llamar(f.aud1);
      assert.equal(respuesta.status, 403, `${mutacion.nombre} como ${f.aud1.nombre}`);
      assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
      intentos += 1;
    }
    assert.equal(intentos, 7);
  });

  it('[E7-B02-T09] tras los intentos nada cambió: H1 conserva estado, analista y QE, sin historial nuevo ni auditoría', async () => {
    const h1 = await prisma.hdu.findUniqueOrThrow({ where: { id: f.h.H1.id } });
    assert.equal(h1.estado, 'EN_EJECUCION');
    assert.equal(h1.analistaId, f.ana1.id);
    assert.equal(h1.qeResponsableId, f.qe1.id);
    assert.equal(await prisma.hduHistorialEstado.count({ where: { hduId: f.h.H1.id } }), 0);
    assert.equal(await prisma.hduHistorialAsignacion.count({ where: { hduId: f.h.H1.id } }), 0);
    assert.equal(await prisma.hduHistorialResponsable.count({ where: { hduId: f.h.H1.id } }), 0);
    assert.equal(await prisma.hdu.count({ where: { codigo: 'NUEVA-1' } }), 0);
    assert.equal(await prisma.auditoria.count({ where: { entidad: 'HDU', accion: { in: ['CAMBIAR_ESTADO_HDU', 'REASIGNAR_ANALISTA', 'REASIGNAR_QE_RESPONSABLE', 'CREAR_HDU'] } } }), 0);
  });
});
