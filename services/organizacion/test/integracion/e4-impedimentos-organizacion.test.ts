/**
 * E4 en Organización (B6 y B8): internos para Impedimentos (candidatos, datos de sprint, ámbito con
 * detalle, carga del sprint, recursos de exportación), cierre bloqueado (E4-B02-T12 a T14) y bloques
 * de impedimentos de las 5 bandejas. Postgres y Supabase Auth locales reales; Certificaciones e
 * Impedimentos simulados. Fixture de la sección 3 del backlog E7.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { ImpedimentoDeLote } from '../../src/aplicacion/puertos/proveedor-impedimentos.js';
import { autorizacion, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { CertificacionesFalsa } from '../certificaciones-falsa.js';
import { crearFixtureE7, type FixtureE7 } from '../fixture-e7.js';
import { ImpedimentosFalsa, evaluacionVacia } from '../impedimentos-falsa.js';

const TOKEN_SERVICIO = process.env.X_Q360_SERVICIO_TOKEN as string;

let app: NestExpressApplication;
let f: FixtureE7;
const cert = new CertificacionesFalsa();
const imp = new ImpedimentosFalsa();

const http = (): ReturnType<typeof request> => request(app.getHttpServer());
const como = (usuario: UsuarioDePrueba) => ({ authorization: autorizacion(usuario.token) });

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cuerpo = any;
const valor = (bloque: { estado: string; datos?: { valor: number } }): number | string => (bloque.estado === 'ok' ? (bloque.datos as { valor: number }).valor : bloque.estado);
const codigosLista = (bandeja: Cuerpo): string[] => bandeja.hdu.datos.items.map((item: { codigo: string }) => item.codigo);

function impedimentoDeLote(hduId: string, titulo: string, estado: 'ABIERTO' | 'ESCALADO', responsable: UsuarioDePrueba, diasAbierto: number, esNuevo = false): ImpedimentoDeLote {
  return {
    id: randomUUID(),
    hduId,
    tipo: 'AMBIENTE',
    titulo,
    estado,
    responsable: { id: responsable.id, nombre: responsable.nombre, externo: false },
    creadoPor: { id: f.ana1.id, nombre: f.ana1.nombre, rol: 'ANALISTA_QA' },
    fechaRegistro: new Date(Date.now() - diasAbierto * 86_400_000).toISOString(),
    abiertoDesde: new Date(Date.now() - diasAbierto * 86_400_000).toISOString(),
    diasAbierto,
    esNuevo,
  };
}

async function conImpedimentosCaido<T>(accion: () => Promise<T>): Promise<T> {
  imp.caida = true;
  try {
    return await accion();
  } finally {
    imp.caida = false;
  }
}

before(async () => {
  await cert.iniciar();
  await imp.iniciar();
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba({ certificacionesUrl: cert.url, certificacionesTimeoutMs: 1500, impedimentosUrl: imp.url, impedimentosTimeoutMs: 1500 });
  f = await crearFixtureE7(cert);

  // Estado base del fixture E4: I1 (H3), I2 (H1), I3 (H6, escalado a LID1).
  const riesgo = (nivel: 'BAJO' | 'MEDIO' | 'ALTO', origen: 'MANUAL' | 'SUGERIDO') => ({ nivelVigente: nivel, origen, estado: 'ok' as const, calculoParcial: false });
  imp.evaluaciones.set(f.h.H1.id, { ...evaluacionVacia(f.h.H1.id), bloqueada: true, abiertos: 1, riesgo: riesgo('ALTO', 'SUGERIDO'), nivelSugerido: 'ALTO' });
  imp.evaluaciones.set(f.h.H3.id, { ...evaluacionVacia(f.h.H3.id), bloqueada: true, abiertos: 1, nuevos: 1, riesgo: riesgo('MEDIO', 'SUGERIDO'), nivelSugerido: 'MEDIO' });
  imp.evaluaciones.set(f.h.H6.id, {
    ...evaluacionVacia(f.h.H6.id),
    bloqueada: true,
    abiertos: 1,
    escalados: 1,
    riesgo: riesgo('MEDIO', 'MANUAL'),
    nivelFijado: 'MEDIO',
    nivelSugerido: 'ALTO',
  });
  imp.impedimentos.push(
    impedimentoDeLote(f.h.H3.id, 'Ambiente QA no responde', 'ABIERTO', f.qe2, 0, true),
    impedimentoDeLote(f.h.H1.id, 'Faltan cuentas de prueba con saldo', 'ABIERTO', f.qe1, 6),
    impedimentoDeLote(f.h.H6.id, 'API de Pagos sin sandbox', 'ESCALADO', f.lid1, 3),
  );
});

after(async () => {
  await app.close();
  await cert.cerrar();
  await imp.cerrar();
  await prisma.$disconnect();
});

describe('E4-B6 · acceso interno para Impedimentos (D86)', () => {
  it('[E4-B01#1] incluirCandidatos: registro (QE responsable y supervisor, sin repetir) y escalamiento (Líderes de la célula y Administradores)', async () => {
    const h1: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso?incluirCandidatos=true`).set(como(f.qe1)).expect(200)).body;
    assert.deepEqual(h1.candidatosResponsable.registro, [{ id: f.qe1.id, nombre: 'QE1', rol: 'QE' }]);
    assert.deepEqual(h1.candidatosResponsable.escalamiento.map((p: Cuerpo) => [p.id, p.rol]).sort(), [[f.adm1.id, 'ADMINISTRADOR'], [f.lid1.id, 'LIDER_QA']].sort());
    // H8 es de CEL-C, que no tiene líder: solo el Administrador.
    const h8: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H8.id}/acceso?incluirCandidatos=true`).set(como(f.qe1)).expect(200)).body;
    assert.deepEqual(h8.candidatosResponsable.escalamiento.map((p: Cuerpo) => p.id), [f.adm1.id]);
    // LID2 (sin células), los QE y los analistas no son candidatos de escalamiento.
    assert.ok(!h1.candidatosResponsable.escalamiento.some((p: Cuerpo) => [f.lid2.id, f.qe1.id, f.ana1.id].includes(p.id)));
  });

  it('[E4-B01#1] sin incluirCandidatos no hay candidatos; un valor inválido es 400; fuera de ámbito no revela nada', async () => {
    const sin: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso`).set(como(f.qe1)).expect(200)).body;
    assert.equal('candidatosResponsable' in sin, false);
    await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso?incluirCandidatos=quizas`).set(como(f.qe1)).expect(400);
    const fuera: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso?incluirCandidatos=true`).set(como(f.qe2)).expect(200)).body;
    assert.deepEqual(fuera, { hduId: f.h.H1.id, permitido: false, relacion: null });
  });

  it('[E4-B01#1] solo candidatos activos', async () => {
    await prisma.usuario.update({ where: { id: f.lid1.id }, data: { activo: false } });
    try {
      const h1: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso?incluirCandidatos=true`).set(como(f.qe1)).expect(200)).body;
      assert.deepEqual(h1.candidatosResponsable.escalamiento.map((p: Cuerpo) => p.id), [f.adm1.id]);
    } finally {
      await prisma.usuario.update({ where: { id: f.lid1.id }, data: { activo: true } });
    }
  });

  it('[E4-B02#2] la HDU trae celulaId, sprintId y sprintFin en acceso, consulta y ámbito', async () => {
    const acceso: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso`).set(como(f.qe1)).expect(200)).body;
    assert.deepEqual([acceso.hdu.celulaId, acceso.hdu.sprintId, acceso.hdu.sprintFin], [f.celdaA.id, f.sprint.id, '2026-10-14']);
    const consulta: Cuerpo = (await http().post('/v1/interno/hdu/consulta').set(como(f.qe1)).send({ hduIds: [f.h.H1.id] }).expect(200)).body;
    assert.equal(consulta.items[0].sprintFin, '2026-10-14');
  });

  it('[E4-F04#3] ambito/detalle: todo el ámbito por código, sin cerradas salvo incluirCerradas; el Analista, 403', async () => {
    const qe1: Cuerpo = (await http().get('/v1/interno/hdu/ambito/detalle').set(como(f.qe1)).expect(200)).body;
    assert.deepEqual(qe1.items.map((h: Cuerpo) => h.codigo), ['H1', 'H2', 'H5', 'H6', 'H8']);
    const admin: Cuerpo = (await http().get('/v1/interno/hdu/ambito/detalle').set(como(f.adm1)).expect(200)).body;
    assert.deepEqual(admin.items.map((h: Cuerpo) => h.codigo), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H8']);
    const conCerradas: Cuerpo = (await http().get('/v1/interno/hdu/ambito/detalle?incluirCerradas=true').set(como(f.aud1)).expect(200)).body;
    assert.equal(conCerradas.items.length, 8);
    const lider: Cuerpo = (await http().get('/v1/interno/hdu/ambito/detalle').set(como(f.lid1)).expect(200)).body;
    assert.deepEqual(lider.items.map((h: Cuerpo) => h.codigo), ['H1', 'H2', 'H3', 'H5', 'H6']);
    assert.deepEqual((await http().get('/v1/interno/hdu/ambito/detalle').set(como(f.lid2)).expect(200)).body.items, []);
    await http().get('/v1/interno/hdu/ambito/detalle').set(como(f.ana1)).expect(403);
  });

  it('[E4-F04#3] PUT carga/hdu/{id}/sprint fija el sprint vigente, es idempotente y exige la célula de la HDU', async () => {
    const sprint = await prisma.sprint.create({ data: { nombre: 'SP-PROX-A', inicio: new Date('2026-10-20'), fin: new Date('2026-10-30'), celulaId: f.celdaA.id } });
    const ruta = `/v1/interno/carga/hdu/${f.h.H1.id}/sprint`;
    const una = await http().put(ruta).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ sprintId: sprint.id });
    assert.deepEqual([una.status, una.body], [200, { cambio: true, hduId: f.h.H1.id, sprintId: sprint.id }]);
    const dos = await http().put(ruta).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ sprintId: sprint.id });
    assert.equal(dos.body.cambio, false);
    const acceso: Cuerpo = (await http().get(`/v1/interno/hdu/${f.h.H1.id}/acceso`).set(como(f.qe1)).expect(200)).body;
    assert.deepEqual([acceso.hdu.sprintId, acceso.hdu.sprintFin], [sprint.id, '2026-10-30']);
    assert.equal(await prisma.historiaSprint.count({ where: { hduId: f.h.H1.id, fechaRetiro: null } }), 1);
    // H3 es de CEL-B: el sprint de CEL-A no le corresponde.
    const otraCelula = await http().put(`/v1/interno/carga/hdu/${f.h.H3.id}/sprint`).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ sprintId: sprint.id });
    assert.equal(otraCelula.status, 422);
    assert.equal(otraCelula.body.codigo, 'CATALOGO_INVALIDO');
    assert.equal((await http().put(`/v1/interno/carga/hdu/${randomUUID()}/sprint`).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ sprintId: sprint.id })).status, 404);
    assert.equal((await http().put(ruta).send({ sprintId: sprint.id })).status, 404);
    assert.equal((await http().put(ruta).set('x-q360-servicio-token', TOKEN_SERVICIO).send({ sprintId: 'x' })).status, 400);
  });

  it('[E4-B04#2] las exportaciones IMPEDIMENTOS y GESTION_IMPEDIMENTOS quedan en la auditoría del Auditor', async () => {
    for (const recurso of ['IMPEDIMENTOS', 'GESTION_IMPEDIMENTOS']) {
      const r = await http().post('/v1/interno/auditoria/exportaciones').set(como(f.aud1)).send({ recurso, filtros: { hduId: f.h.H7.id }, filas: 2 });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const registro = await prisma.auditoria.findFirst({ where: { accion: 'EXPORTAR', actorId: f.aud1.id }, orderBy: { fecha: 'desc' } });
      assert.equal((registro?.despues as Cuerpo).recurso, recurso);
    }
    await http().post('/v1/interno/auditoria/exportaciones').set(como(f.aud1)).send({ recurso: 'INVENTADO', filtros: {}, filas: 1 }).expect(400);
    await http().post('/v1/interno/auditoria/exportaciones').set(como(f.qe1)).send({ recurso: 'IMPEDIMENTOS', filtros: {}, filas: 1 }).expect(403);
  });
});

describe('E4-B8 · bloques de impedimentos en las bandejas (D87)', () => {
  it('[E4-F01#3] Analista: contador, bloqueo por fila, soloBloqueadas; envía estado, fin del sprint y avance', async () => {
    const ana1: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana1)).expect(200)).body;
    assert.equal(ana1.impedimentos.contadores.impedimentosAbiertos.fuente, 'impedimentos.impedimentos');
    assert.equal(valor(ana1.impedimentos.contadores.impedimentosAbiertos), 2);
    assert.deepEqual(codigosLista(ana1), ['H1', 'H6']);
    assert.ok(ana1.hdu.datos.items.every((item: Cuerpo) => item.bloqueo.estado === 'ok' && item.bloqueo.datos.bloqueada === true && !('riesgo' in item)), 'sin riesgo (D73)');
    const enviado = imp.lotes.at(-1)?.hdu.find((h) => h.hduId === f.h.H1.id);
    assert.deepEqual(enviado, { hduId: f.h.H1.id, estado: 'EN_EJECUCION', sprintFin: '2026-10-30', avance: 30 });
    assert.match(imp.autorizaciones.at(-1) ?? '', /^Bearer /);
    // Los bloques certificados no cambian (D71).
    assert.deepEqual([valor(ana1.contadores.abiertas), valor(ana1.contadores.esperandoAprobacion)], [2, 1]);

    const bloqueadas: Cuerpo = (await http().get('/v1/bandeja/analista?soloBloqueadas=true').set(como(f.ana2)).expect(200)).body;
    assert.deepEqual([bloqueadas.hdu.estado, bloqueadas.hdu.datos.total], ['ok', 0]);
    const conSolo: Cuerpo = (await http().get('/v1/bandeja/analista?soloBloqueadas=true').set(como(f.ana1)).expect(200)).body;
    assert.deepEqual(codigosLista(conSolo), ['H1', 'H6']);
    assert.equal(valor((await http().get('/v1/bandeja/analista').set(como(f.ana4)).expect(200)).body.impedimentos.contadores.impedimentosAbiertos), 0);
  });

  it('[E4-F01#3] QE: contadores, lista de hasta 10 en orden D74, y bloqueo solo en las filas CERRAR', async () => {
    const qe1: Cuerpo = (await http().get('/v1/bandeja/qe').set(como(f.qe1)).expect(200)).body;
    const c = qe1.impedimentos.contadores;
    assert.deepEqual([valor(c.impedimentosAbiertos), valor(c.impedimentosNuevos), valor(c.hduRiesgoAlto)], [2, 0, 1]);
    assert.equal(qe1.impedimentos.lista.datos.total, 2);
    assert.deepEqual(qe1.impedimentos.lista.datos.items.map((i: Cuerpo) => i.titulo), ['Faltan cuentas de prueba con saldo', 'API de Pagos sin sandbox']);
    const primero = qe1.impedimentos.lista.datos.items[0];
    assert.deepEqual([primero.hdu.codigo, primero.celula.nombre, primero.analista.nombre, primero.riesgo.nivelVigente, primero.escaladoAMi], ['H1', 'CEL-A', 'ANA1', 'ALTO', false]);
    const filas: Cuerpo[] = qe1.acciones.datos.items;
    const cerrar = filas.filter((fila) => fila.tipo === 'CERRAR');
    assert.ok(cerrar.length > 0);
    assert.ok(cerrar.every((fila) => fila.bloqueo.estado === 'ok' && fila.bloqueo.datos.bloqueada === false));
    assert.ok(filas.filter((fila) => fila.tipo !== 'CERRAR').every((fila) => !('bloqueo' in fila)));
    assert.equal(filas.length, 4, 'la lista «Requiere mi acción» no recibe filas nuevas (D71)');

    const qe2: Cuerpo = (await http().get('/v1/bandeja/qe').set(como(f.qe2)).expect(200)).body;
    assert.deepEqual([valor(qe2.impedimentos.contadores.impedimentosAbiertos), valor(qe2.impedimentos.contadores.impedimentosNuevos)], [1, 1]);
  });

  it('[E4-F03#2] Líder: contadores, escalados a él primero (D79), bloqueo y riesgo por fila, soloBloqueadas', async () => {
    const lid1: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid1)).expect(200)).body;
    const c = lid1.impedimentos.contadores;
    assert.deepEqual([valor(c.impedimentosAbiertos), valor(c.hduBloqueadas), valor(c.escaladosAMi)], [3, 3, 1]);
    const lista: Cuerpo[] = lid1.impedimentos.lista.datos.items;
    assert.deepEqual(lista.map((i) => i.titulo), ['API de Pagos sin sandbox', 'Faltan cuentas de prueba con saldo', 'Ambiente QA no responde']);
    assert.equal(lista[0]?.escaladoAMi, true);
    const h1 = lid1.hdu.datos.items.find((item: Cuerpo) => item.codigo === 'H1');
    assert.deepEqual([h1.bloqueo.datos, h1.riesgo.fuente, h1.riesgo.datos.nivelVigente], [{ bloqueada: true, abiertos: 1 }, 'impedimentos.riesgo', 'ALTO']);

    const soloBloqueadas: Cuerpo = (await http().get('/v1/bandeja/lider?soloBloqueadas=true').set(como(f.lid1)).expect(200)).body;
    assert.deepEqual(codigosLista(soloBloqueadas).sort(), ['H1', 'H3', 'H6']);
  });

  it('[E4-F03#2] Líder sin células: contadores en 0 con ok y lista vacía, sin consultar a Impedimentos', async () => {
    const antes = imp.lotes.length;
    const lid2: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid2)).expect(200)).body;
    assert.deepEqual([valor(lid2.impedimentos.contadores.impedimentosAbiertos), valor(lid2.impedimentos.contadores.hduBloqueadas), valor(lid2.impedimentos.contadores.escaladosAMi)], [0, 0, 0]);
    assert.deepEqual([lid2.impedimentos.lista.estado, lid2.impedimentos.lista.datos.items, lid2.impedimentos.lista.datos.total], ['ok', [], 0]);
    assert.equal(imp.lotes.length, antes);
  });

  it('[E4-F03#2] Administrador y Auditor: contadores; el Administrador ve solo los escalados a él, más antiguos primero', async () => {
    const adm: Cuerpo = (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body;
    assert.deepEqual([valor(adm.impedimentos.contadores.impedimentosAbiertos), valor(adm.impedimentos.contadores.hduBloqueadas), valor(adm.impedimentos.contadores.hduRiesgoAlto)], [3, 3, 1]);
    assert.deepEqual([adm.impedimentos.escalados.estado, adm.impedimentos.escalados.datos.total], ['ok', 0]);

    const reciente = impedimentoDeLote(f.h.H8.id, 'Escalado reciente', 'ESCALADO', f.adm1, 1);
    const antiguo = impedimentoDeLote(f.h.H2.id, 'Escalado antiguo', 'ESCALADO', f.adm1, 9);
    imp.impedimentos.push(reciente, antiguo);
    try {
      const conEscalados: Cuerpo = (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body;
      assert.deepEqual(conEscalados.impedimentos.escalados.datos.items.map((i: Cuerpo) => i.titulo), ['Escalado antiguo', 'Escalado reciente']);
      assert.equal(conEscalados.impedimentos.escalados.datos.items[0].escaladoAMi, true);
    } finally {
      imp.impedimentos.splice(imp.impedimentos.indexOf(reciente), 1);
      imp.impedimentos.splice(imp.impedimentos.indexOf(antiguo), 1);
    }

    const aud: Cuerpo = (await http().get('/v1/bandeja/auditor').set(como(f.aud1)).expect(200)).body;
    assert.deepEqual([valor(aud.impedimentos.contadores.impedimentosAbiertos), valor(aud.impedimentos.contadores.hduBloqueadas)], [3, 3]);
    assert.ok(aud.hdu.datos.items.every((item: Cuerpo) => !('bloqueo' in item) && !('riesgo' in item)), 'sin bloqueo ni riesgo por fila (D71, D80)');
  });

  it('[E4-F03#2] el Administrador consulta Certificaciones solo para su avance; si no responde, los bloques certificados siguen ok', async () => {
    cert.caida = true;
    try {
      const adm: Cuerpo = (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body;
      assert.equal(adm.contadores.usuariosActivos.estado, 'ok');
      assert.equal(adm.impedimentos.contadores.impedimentosAbiertos.estado, 'ok');
      assert.ok(imp.lotes.at(-1)?.hdu.every((h) => h.avance === null), 'sin avance cuando Certificaciones no responde');
    } finally {
      cert.caida = false;
    }
  });

  it('[E4-F01#3] con Impedimentos caído, solo los bloques E4 vienen indisponible y la respuesta es 200', async () => {
    await conImpedimentosCaido(async () => {
      const ana1: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana1)).expect(200)).body;
      assert.equal(ana1.impedimentos.contadores.impedimentosAbiertos.estado, 'indisponible');
      assert.equal(ana1.contadores.abiertas.estado, 'ok');
      assert.ok(ana1.hdu.datos.items.every((item: Cuerpo) => item.bloqueo.estado === 'indisponible'));
      // Un filtro que depende de Impedimentos deja la lista indisponible, nunca sin filtrar.
      assert.equal((await http().get('/v1/bandeja/analista?soloBloqueadas=true').set(como(f.ana1)).expect(200)).body.hdu.estado, 'indisponible');

      const qe1: Cuerpo = (await http().get('/v1/bandeja/qe').set(como(f.qe1)).expect(200)).body;
      assert.deepEqual([qe1.impedimentos.contadores.hduRiesgoAlto.estado, qe1.impedimentos.lista.estado, qe1.contadores.sinAnalista.estado], ['indisponible', 'indisponible', 'ok']);
      assert.ok(qe1.acciones.datos.items.filter((fila: Cuerpo) => fila.tipo === 'CERRAR').every((fila: Cuerpo) => fila.bloqueo.estado === 'indisponible'));

      const lid1: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid1)).expect(200)).body;
      assert.deepEqual([lid1.impedimentos.contadores.escaladosAMi.estado, lid1.impedimentos.lista.estado, lid1.hdu.datos.items[0].riesgo.estado], ['indisponible', 'indisponible', 'indisponible']);
      const adm: Cuerpo = (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body;
      assert.deepEqual([adm.impedimentos.contadores.hduRiesgoAlto.estado, adm.impedimentos.escalados.estado], ['indisponible', 'indisponible']);
      const aud: Cuerpo = (await http().get('/v1/bandeja/auditor').set(como(f.aud1)).expect(200)).body;
      assert.equal(aud.impedimentos.contadores.hduBloqueadas.estado, 'indisponible');
    });
  });

  it('[E7-B03] las 5 bandejas traen el bloque impedimentos', async () => {
    const rutas: Array<[string, UsuarioDePrueba]> = [['analista', f.ana1], ['qe', f.qe1], ['lider', f.lid1], ['admin', f.adm1], ['auditor', f.aud1]];
    for (const [ruta, usuario] of rutas) {
      const cuerpo: Cuerpo = (await http().get(`/v1/bandeja/${ruta}`).set(como(usuario)).expect(200)).body;
      assert.ok(cuerpo.impedimentos !== undefined, ruta);
    }
  });
});

describe('E4-B02 · cierre de la HDU con impedimentos (D60, D77)', () => {
  const cerrar = (usuario: UsuarioDePrueba, hduId: string) => http().post(`/v1/hdu/${hduId}/estado`).set(como(usuario)).send({ estado: 'CERRADA' });
  const estadoDe = async (hduId: string) => (await prisma.hdu.findUniqueOrThrow({ where: { id: hduId } })).estado;

  it('[E4-B02#2] T12: un impedimento abierto bloquea el cierre (409 HDU_BLOQUEADA con la lista) y la HDU no cambia', async () => {
    const bloqueante = imp.bloquear(f.h.H8.id, 'Ambiente QA no responde');
    const r = await cerrar(f.qe1, f.h.H8.id);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.codigo, 'HDU_BLOQUEADA');
    assert.deepEqual(r.body.impedimentos, { total: 1, items: [bloqueante] });
    assert.equal(await estadoDe(f.h.H8.id), 'PENDIENTE_CIERRE');
    assert.ok(r.headers['x-trace-id']);
  });

  it('[E4-B02#2] T12: el cuerpo lista hasta 20 y cuenta el total (D77)', async () => {
    for (let i = 0; i < 24; i += 1) imp.bloquear(f.h.H8.id, `Impedimento ${i}`, i % 2 === 0 ? 'ABIERTO' : 'ESCALADO');
    const r = await cerrar(f.adm1, f.h.H8.id);
    assert.equal(r.status, 409);
    assert.deepEqual([r.body.impedimentos.total, r.body.impedimentos.items.length], [25, 20]);
  });

  it('[E4-B02#2] el orden es transición, checklist, impedimentos: con el checklist incompleto responde CHECKLIST_INCOMPLETO', async () => {
    cert.checklistCompleto = false;
    try {
      const r = await cerrar(f.qe1, f.h.H8.id);
      assert.equal(r.body.codigo, 'CHECKLIST_INCOMPLETO');
    } finally {
      cert.checklistCompleto = true;
    }
    const invalida = await cerrar(f.qe1, f.h.H5.id);
    assert.equal(invalida.body.codigo, 'TRANSICION_INVALIDA');
  });

  it('[E4-B02#2] T13: con Impedimentos detenido el cierre responde 503 y la HDU sigue en PENDIENTE_CIERRE', async () => {
    imp.bloqueantes.delete(f.h.H8.id);
    await conImpedimentosCaido(async () => {
      const r = await cerrar(f.qe1, f.h.H8.id);
      assert.equal(r.status, 503, JSON.stringify(r.body));
      assert.equal(r.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.equal(r.body.mensaje, 'No pudimos verificar los impedimentos de la HDU');
      assert.deepEqual(r.body.impedimentos, { fuente: 'impedimentos.impedimentos', estado: 'indisponible' });
    });
    assert.equal(await estadoDe(f.h.H8.id), 'PENDIENTE_CIERRE');
  });

  it('[E4-B02#2] T14: sin impedimentos abiertos el cierre con checklist completo se comporta como siempre', async () => {
    imp.bloqueantes.delete(f.h.H8.id);
    imp.consultasAbiertos.length = 0;
    const r = await cerrar(f.qe1, f.h.H8.id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.estadoNuevo, 'CERRADA');
    assert.deepEqual(imp.consultasAbiertos, [f.h.H8.id]);
    assert.match(imp.autorizaciones.at(-1) ?? '', /^Bearer /);
    assert.equal(await estadoDe(f.h.H8.id), 'CERRADA');
  });
});
