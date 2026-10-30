/** E4-B02 · Ciclo de vida de los impedimentos (T12 a T14, el cierre de la HDU, están en las pruebas de Organización). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '#prisma';

import { PERSONAS, iniciarFalsos, type ClavePersona, type Falsos, type HduFalsa } from '../ayudas.js';
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

const accion = (persona: ClavePersona | null, id: string, operacion: string, cuerpo: object) => como(app, persona, 'post', `/v1/impedimentos/${id}/${operacion}`, cuerpo);
const evaluar = async (hdu: HduFalsa) => {
  const r = await como(app, 'qe1', 'post', '/v1/interno/impedimentos/evaluacion', { hdu: [{ hduId: hdu.id, estado: hdu.estado, sprintFin: hdu.sprintFin, avance: hdu.avance }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.items[0] as { bloqueada: boolean; abiertos: number };
};
const cuentaAcciones = (id: string) => prisma.accionImpedimento.count({ where: { impedimentoId: id } });
const estadoDe = async (id: string) => (await prisma.impedimento.findUniqueOrThrow({ where: { id } })).estado;
const registrar = async (persona: ClavePersona, hdu: HduFalsa, titulo: string): Promise<string> => {
  const r = await como(app, persona, 'post', `/v1/hdu/${hdu.id}/impedimentos`, { tipo: 'RECURSOS', titulo, descripcion: 'Descripción suficiente del impedimento.', responsableId: PERSONAS.qe1.id });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id as string;
};

describe('E4-B02 · ciclo de vida', () => {
  it('[E4-B02#1] T01: el QE responsable resuelve I2', async () => {
    const i = await registrar('qe1', f.h.H5, 'Para resolver T01');
    const r = await accion('qe1', i, 'resolver', { comentario: 'Ya está solucionado' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.impedimento.estado, 'RESUELTO');
    assert.ok(r.body.impedimento.fechaResolucion);
    assert.deepEqual([r.body.accion.tipo, r.body.accion.actor.id, r.body.accion.estadoAnterior, r.body.accion.estado, r.body.accion.comentario], ['RESOLVER', PERSONAS.qe1.id, 'ABIERTO', 'RESUELTO', 'Ya está solucionado']);
  });

  it('[E4-B02#1] T02: escalar a un Líder cambia el responsable y deja el detalle', async () => {
    const i = await registrar('ana1', f.h.H8, 'Para escalar T02');
    // H8 no está en un célula del Líder: el destino válido es el Administrador.
    const r = await accion('qe1', i, 'escalar', { responsableId: PERSONAS.adm1.id, comentario: 'Se necesita ayuda' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.impedimento.estado, 'ESCALADO');
    assert.equal(r.body.impedimento.responsable.id, PERSONAS.adm1.id);
    assert.equal(r.body.accion.tipo, 'ESCALAR');
    assert.equal(r.body.accion.detalle.responsableAnterior.id, PERSONAS.qe1.id);
    assert.equal(r.body.accion.detalle.responsableNuevo.id, PERSONAS.adm1.id);
    await accion('qe1', i, 'resolver', { comentario: 'Limpieza del caso' });
  });

  it('[E4-B02#2] T03: al resolver el último abierto la HDU se desbloquea', async () => {
    const h1 = f.h.H1;
    const h6 = f.h.H6;
    assert.equal((await evaluar(h1)).bloqueada, true);
    assert.equal((await accion('qe1', f.i.I2, 'resolver', { comentario: 'Cuentas entregadas' })).status, 200);
    assert.deepEqual(await evaluar(h1), { ...(await evaluar(h1)), bloqueada: false, abiertos: 0 });
    assert.equal((await accion('qe1', f.i.I3, 'resolver', { comentario: 'Sandbox disponible' })).status, 200);
    assert.deepEqual([(await evaluar(h6)).bloqueada, (await evaluar(h6)).abiertos], [false, 0]);
  });

  it('[E4-B02#2] T04: con otro abierto la HDU sigue bloqueada', async () => {
    const h = falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana1' });
    const primero = await registrar('ana1', h, 'Primer impedimento');
    const segundo = await registrar('ana1', h, 'Segundo impedimento');
    const r = await accion('qe1', primero, 'resolver', { comentario: 'Primero resuelto' });
    assert.deepEqual(r.body.hdu, { bloqueada: true, abiertos: 1 });
    assert.deepEqual(await evaluar(h), { ...(await evaluar(h)), bloqueada: true, abiertos: 1 });
    const fin = await accion('qe1', segundo, 'resolver', { comentario: 'Segundo resuelto' });
    assert.deepEqual(fin.body.hdu, { bloqueada: false, abiertos: 0 });
  });

  it('[E4-B02#3] T05: sobre un resuelto, escalar, resolver y seguimiento dan 409 sin registrar nada', async () => {
    const antes = await cuentaAcciones(f.i.I4);
    for (const [operacion, cuerpo] of [['escalar', { responsableNombre: 'Equipo Pagos', comentario: 'Escalar' }], ['resolver', { comentario: 'Resolver' }], ['seguimiento', { comentario: 'Seguir' }]] as const) {
      const r = await accion('qe1', f.i.I4, operacion, cuerpo);
      assert.equal(r.status, 409, operacion);
      assert.equal(r.body.codigo, 'TRANSICION_INVALIDA');
      assert.equal(r.body.estadoActual, 'RESUELTO');
      assert.deepEqual(r.body.operacionesPermitidas, ['REABRIR']);
      assert.equal(r.body.operacion, operacion.toUpperCase());
    }
    assert.equal((await accion('qe1', f.i.I4, 'escalar', { responsableNombre: 'Equipo Pagos', comentario: 'Escalar' })).body.mensaje, 'Un impedimento resuelto solo puede reabrirse.');
    assert.equal(await cuentaAcciones(f.i.I4), antes);
  });

  it('[E4-B02#1] T06: escalar de nuevo, resolver un escalado y reabrir uno no resuelto', async () => {
    const i = await registrar('ana1', f.h.H8, 'Para T06');
    assert.equal((await accion('qe1', i, 'escalar', { responsableId: PERSONAS.adm1.id, comentario: 'A la administración' })).status, 200);
    // El mismo destino actual no es válido (D92).
    const igual = await accion('qe1', i, 'escalar', { responsableId: PERSONAS.adm1.id, comentario: 'De nuevo' });
    assert.equal(igual.status, 422);
    assert.equal(igual.body.codigo, 'RESPONSABLE_INVALIDO');
    const tercero = await accion('qe1', i, 'escalar', { responsableNombre: 'Proveedor externo', comentario: 'Al proveedor' });
    assert.equal(tercero.status, 200);
    assert.equal(tercero.body.impedimento.estado, 'ESCALADO');
    assert.equal(tercero.body.accion.detalle.responsableAnterior.id, PERSONAS.adm1.id);
    const reabrir = await accion('qe1', i, 'reabrir', { motivo: 'No está resuelto' });
    assert.equal(reabrir.status, 409);
    assert.equal(reabrir.body.codigo, 'TRANSICION_INVALIDA');
    assert.equal((await accion('qe1', i, 'resolver', { comentario: 'Resuelto desde escalado' })).status, 200);
  });

  it('[E4-B02#1] T07: reabrir reinicia abierto_desde y conserva el registro y el historial', async () => {
    const antes = await como(app, 'qe1', 'get', `/v1/impedimentos/${f.i.I4}`);
    const r = await accion('qe1', f.i.I4, 'reabrir', { motivo: 'El criterio volvió a cambiar' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.impedimento.estado, 'ABIERTO');
    assert.equal(r.body.impedimento.fechaResolucion, null);
    assert.equal(r.body.impedimento.fechaRegistro, antes.body.fechaRegistro);
    assert.ok(new Date(r.body.impedimento.abiertoDesde).getTime() > new Date(antes.body.abiertoDesde).getTime());
    assert.equal(r.body.impedimento.diasAbierto, 0);
    const detalle = await como(app, 'qe1', 'get', `/v1/impedimentos/${f.i.I4}`);
    assert.deepEqual(detalle.body.acciones.map((a: { tipo: string }) => a.tipo), ['REGISTRAR', 'RESOLVER', 'REABRIR']);
    assert.deepEqual(detalle.body.operacionesPermitidas, ['RESOLVER', 'ESCALAR', 'SEGUIMIENTO']);
  });

  it('[E4-B02#1] T08: cuerpos inválidos y destinos fuera de los candidatos', async () => {
    const i = await registrar('ana1', f.h.H8, 'Para T08');
    const antes = await cuentaAcciones(i);
    assert.equal((await accion('qe1', i, 'resolver', {})).status, 400);
    const enBlanco = await accion('qe1', i, 'resolver', { comentario: '   ' });
    assert.equal(enBlanco.status, 422);
    assert.equal(enBlanco.body.codigo, 'COMENTARIO_REQUERIDO');
    assert.equal((await accion('qe1', i, 'escalar', { comentario: 'Sin destino' })).status, 400);
    for (const destino of [PERSONAS.ana1.id, PERSONAS.qe2.id, PERSONAS.lid2.id]) {
      const r = await accion('qe1', i, 'escalar', { responsableId: destino, comentario: 'Destino inválido' });
      assert.equal(r.status, 422, destino);
      assert.equal(r.body.codigo, 'RESPONSABLE_INVALIDO');
    }
    const motivo = await accion('qe2', f.i.I5, 'reabrir', { motivo: '  ' });
    assert.equal(motivo.status, 409, 'HDU cerrada antes que el 422');
    assert.equal(await estadoDe(i), 'ABIERTO');
    assert.equal(await cuentaAcciones(i), antes);
    await accion('qe1', i, 'resolver', { comentario: 'Limpieza del caso' });
  });

  it('[E4-B02#1] T09: solo el QE responsable gestiona (403 al resto) y sin token, 401', async () => {
    const i = await registrar('ana1', f.h.H8, 'Para T09');
    const resuelto = f.i.I4;
    const antes = await cuentaAcciones(i);
    for (const persona of ['ana1', 'qe2', 'lid1', 'aud1', 'adm1'] as const) {
      for (const [id, operacion, cuerpo] of [[i, 'resolver', { comentario: 'Intento' }], [i, 'escalar', { responsableId: PERSONAS.adm1.id, comentario: 'Intento' }], [resuelto, 'reabrir', { motivo: 'Intento' }]] as const) {
        const r = await accion(persona, id, operacion, cuerpo);
        assert.equal(r.status, 403, `${persona} ${operacion}`);
        assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
      }
    }
    const sinToken = await accion(null, i, 'resolver', { comentario: 'Intento' });
    assert.equal(sinToken.status, 401);
    assert.equal(await estadoDe(i), 'ABIERTO');
    assert.equal(await cuentaAcciones(i), antes);
    await accion('qe1', i, 'resolver', { comentario: 'Limpieza del caso' });
  });

  it('[E4-B02#1] T10: dos resolver simultáneos, uno 200 y otro 409, con una sola acción RESOLVER', async () => {
    const i = await registrar('ana1', f.h.H8, 'Para T10');
    const [a, b] = await Promise.all([accion('qe1', i, 'resolver', { comentario: 'Primero' }), accion('qe1', i, 'resolver', { comentario: 'Segundo' })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const perdedora = a.status === 409 ? a : b;
    assert.equal(perdedora.body.codigo, 'TRANSICION_INVALIDA');
    assert.equal(await prisma.accionImpedimento.count({ where: { impedimentoId: i, tipoAccion: 'RESOLVER' } }), 1);
  });

  it('[E4-B02#3] T11: sobre una HDU cerrada, 409 HDU_CERRADA y el impedimento sigue resuelto', async () => {
    const r = await accion('qe2', f.i.I5, 'reabrir', { motivo: 'Intento sobre HDU cerrada' });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'HDU_CERRADA');
    assert.equal(await estadoDe(f.i.I5), 'RESUELTO');
  });

  it('[E4-B02#2] el cierre consulta los impedimentos abiertos de la HDU (D60, D77)', async () => {
    const h = falsos.nuevaHdu({ qeResponsable: 'qe1', analista: 'ana1', estado: 'PENDIENTE_CIERRE' });
    const i = await registrar('qe1', h, 'Bloquea el cierre');
    const abiertos = await como(app, 'qe1', 'get', `/v1/interno/hdu/${h.id}/impedimentos/abiertos`);
    assert.equal(abiertos.status, 200);
    assert.deepEqual([abiertos.body.hduId, abiertos.body.total, abiertos.body.items[0].id, abiertos.body.items[0].estado], [h.id, 1, i, 'ABIERTO']);
    await accion('qe1', i, 'resolver', { comentario: 'Resuelto' });
    assert.equal((await como(app, 'qe1', 'get', `/v1/interno/hdu/${h.id}/impedimentos/abiertos`)).body.total, 0);
    assert.equal((await como(app, 'qe2', 'get', `/v1/interno/hdu/${h.id}/impedimentos/abiertos`)).status, 403);
  });
});
