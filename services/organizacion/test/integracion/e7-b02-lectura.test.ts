/**
 * E7-B02 · Ámbitos de lectura del Líder QA y del Auditor, y solo lectura (D12, D32, D47, D50),
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

describe('Ámbito del Líder QA [E7-B02#1]', () => {
  it('[E7-B02-T01] LID1 lista H1, H2, H3, H5, H6 y H7; no H4 ni H8', async () => {
    const respuesta = await http().get('/v1/hdu?tamanoPagina=100').set(como(f.lid1)).expect(200);
    assert.deepEqual(codigos(respuesta.body), ['H1', 'H2', 'H3', 'H5', 'H6', 'H7']);
    assert.equal(respuesta.body.total, 6);
  });

  it('[E7-B02-T02] H4 (CEL-C): detalle, historial y acceso interno dan el mismo 403 que una HDU inexistente, sin revelar si existe', async () => {
    const inexistente = await http().get(`/v1/hdu/${INEXISTENTE}`).set(como(f.lid1));
    assert.equal(inexistente.status, 403);
    for (const ruta of [`/v1/hdu/${f.h.H4.id}`, `/v1/hdu/${f.h.H4.id}/historial`]) {
      const respuesta = await http().get(ruta).set(como(f.lid1));
      assert.equal(respuesta.status, 403, ruta);
      assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
      assert.equal(respuesta.body.mensaje, inexistente.body.mensaje);
      assert.deepEqual(respuesta.body.detalles, inexistente.body.detalles);
    }
    const acceso = await http().get(`/v1/interno/hdu/${f.h.H4.id}/acceso`).set(como(f.lid1)).expect(200);
    assert.deepEqual(acceso.body, { hduId: f.h.H4.id, permitido: false, relacion: null });
    const acceso8 = await http().get(`/v1/interno/hdu/${f.h.H8.id}/acceso`).set(como(f.lid1)).expect(200);
    assert.equal(acceso8.body.permitido, false);
  });

  it('[E7-B02-T03] un Líder sin células recibe una lista vacía con 200, no un error', async () => {
    const respuesta = await http().get('/v1/hdu').set(como(f.lid2)).expect(200);
    assert.deepEqual(respuesta.body.items, []);
    assert.equal(respuesta.body.total, 0);
    const ambito = await http().get('/v1/interno/hdu/ambito').set(como(f.lid2)).expect(200);
    assert.deepEqual(ambito.body, { usuarioId: f.lid2.id, rol: 'LIDER_QA', todas: false, hduIds: [] });
  });

  it('[E7-B02-T04] celulaId de otra célula: 403; de una propia filtra dentro de su ámbito', async () => {
    const ajena = await http().get(`/v1/hdu?celulaId=${f.celdaC.id}`).set(como(f.lid1));
    assert.equal(ajena.status, 403);
    assert.equal(ajena.body.codigo, 'ACCESO_DENEGADO');
    const propia = await http().get(`/v1/hdu?celulaId=${f.celdaA.id}`).set(como(f.lid1)).expect(200);
    assert.deepEqual(codigos(propia.body), ['H1', 'H2', 'H5', 'H7']);
  });

  it('el detalle de una HDU de su célula es de solo lectura: permisos y transiciones vacíos (D39)', async () => {
    const respuesta = await http().get(`/v1/hdu/${f.h.H2.id}`).set(como(f.lid1)).expect(200);
    assert.deepEqual(respuesta.body.permisos, { cambiarEstado: false, asignarAnalista: false });
    assert.deepEqual(respuesta.body.transicionesPermitidas, []);
    const historial = await http().get(`/v1/hdu/${f.h.H2.id}/historial`).set(como(f.lid1)).expect(200);
    assert.equal(historial.body.hduId, f.h.H2.id);
  });

  it('el catálogo de células y sprints también es legible por el Líder y el Auditor', async () => {
    for (const usuario of [f.lid1, f.aud1]) {
      await http().get('/v1/catalogos/celulas').set(como(usuario)).expect(200);
      await http().get('/v1/catalogos/sprints').set(como(usuario)).expect(200);
    }
  });
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

  it('el acceso interno distingue las relaciones de solo lectura y no permite escribir (D32, D47)', async () => {
    const lider = await http().get(`/v1/interno/hdu/${f.h.H2.id}/acceso`).set(como(f.lid1)).expect(200);
    assert.equal(lider.body.relacion, 'LECTOR_CELULA');
    assert.equal(lider.body.actor.rol, 'LIDER_QA');
    assert.equal(lider.body.hdu.codigo, 'H2');
    const auditor = await http().get(`/v1/interno/hdu/${f.h.H4.id}/acceso`).set(como(f.aud1)).expect(200);
    assert.equal(auditor.body.relacion, 'LECTOR_AUDITORIA');
    assert.equal(auditor.body.permitido, true);
  });

  it('GET /v1/interno/acceso trae las células del Líder en el ámbito y el rol AUDITOR', async () => {
    const lider = await http().get('/v1/interno/acceso').set(como(f.lid1)).expect(200);
    assert.equal(lider.body.rol, 'LIDER_QA');
    assert.deepEqual([...lider.body.ambito.celulasIds].sort(), [f.celdaA.id, f.celdaB.id].sort());
    const auditor = await http().get('/v1/interno/acceso').set(como(f.aud1)).expect(200);
    assert.equal(auditor.body.rol, 'AUDITOR');
    assert.deepEqual(auditor.body.ambito.celulasIds, []);
    const analista = await http().get('/v1/interno/acceso').set(como(f.ana1)).expect(200);
    assert.deepEqual(analista.body.ambito.celulasIds, []);
  });

  it('GET /v1/interno/hdu/ambito: todas para Administrador y Auditor; lista explícita para el resto (D47)', async () => {
    const admin = await http().get('/v1/interno/hdu/ambito').set(como(f.adm1)).expect(200);
    assert.deepEqual(admin.body, { usuarioId: f.adm1.id, rol: 'ADMINISTRADOR', todas: true, hduIds: [] });
    const auditor = await http().get('/v1/interno/hdu/ambito').set(como(f.aud1)).expect(200);
    assert.equal(auditor.body.todas, true);
    const lider = await http().get('/v1/interno/hdu/ambito').set(como(f.lid1)).expect(200);
    assert.deepEqual([...lider.body.hduIds].sort(), ['H1', 'H2', 'H3', 'H5', 'H6', 'H7'].map((c) => f.h[c as keyof FixtureE7['h']].id).sort());
    const analista = await http().get('/v1/interno/hdu/ambito').set(como(f.ana1)).expect(200);
    assert.deepEqual([...analista.body.hduIds].sort(), [f.h.H1.id, f.h.H6.id].sort());
    const qe = await http().get('/v1/interno/hdu/ambito').set(como(f.qe1)).expect(200);
    assert.equal(qe.body.todas, false);
    assert.deepEqual([...qe.body.hduIds].sort(), ['H1', 'H2', 'H5', 'H6', 'H8'].map((c) => f.h[c as keyof FixtureE7['h']].id).sort());
  });

  it('POST /v1/interno/hdu/consulta devuelve las HDU pedidas en el orden pedido; un id fuera de ámbito o inexistente da 403 completo', async () => {
    const bien = await http().post('/v1/interno/hdu/consulta').set(como(f.lid1)).send({ hduIds: [f.h.H2.id, f.h.H1.id] }).expect(200);
    assert.deepEqual(bien.body.items.map((hdu: { codigo: string }) => hdu.codigo), ['H2', 'H1']);
    assert.equal(bien.body.items[0].celula, 'CEL-A');
    assert.equal(bien.body.items[0].qeResponsable.nombre, 'QE1');

    const mezcla = await http().post('/v1/interno/hdu/consulta').set(como(f.lid1)).send({ hduIds: [f.h.H1.id, f.h.H4.id] });
    assert.equal(mezcla.status, 403);
    assert.equal(mezcla.body.codigo, 'ACCESO_DENEGADO');
    assert.equal('items' in mezcla.body, false, 'sin datos parciales');
    await http().post('/v1/interno/hdu/consulta').set(como(f.aud1)).send({ hduIds: [f.h.H4.id, INEXISTENTE] }).expect(403);
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
    { nombre: 'asignar células', llamar: (u) => http().put(`/v1/usuarios/${f.lid2.id}/celulas-lider`).set(como(u)).send({ celulaIds: [f.celdaC.id] }) },
  ];

  it('[E7-B02-T08] AUD1 y LID1 reciben 403 ACCESO_DENEGADO en las 16 combinaciones de escritura de Organización', async () => {
    let intentos = 0;
    for (const usuario of [f.aud1, f.lid1]) {
      for (const mutacion of mutaciones(f.h.H1.id)) {
        const respuesta = await mutacion.llamar(usuario);
        assert.equal(respuesta.status, 403, `${mutacion.nombre} como ${usuario.nombre}`);
        assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
        intentos += 1;
      }
    }
    assert.equal(intentos, 16);
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

describe('Cambio de ámbito sin recargar [E7-B02#1]', () => {
  it('[E7-B02-T05] ADM1 quita CEL-B a LID1: H3 pasa de 200 a 403 en la consulta siguiente', async () => {
    await http().get(`/v1/hdu/${f.h.H3.id}`).set(como(f.lid1)).expect(200);
    await http().put(`/v1/usuarios/${f.lid1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaA.id] }).expect(200);
    const despues = await http().get(`/v1/hdu/${f.h.H3.id}`).set(como(f.lid1));
    assert.equal(despues.status, 403);
    assert.equal(despues.body.codigo, 'ACCESO_DENEGADO');
    const lista = await http().get('/v1/hdu').set(como(f.lid1)).expect(200);
    assert.deepEqual(codigos(lista.body), ['H1', 'H2', 'H5', 'H7']);
    await http().put(`/v1/usuarios/${f.lid1.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaA.id, f.celdaB.id] }).expect(200);
  });
});
