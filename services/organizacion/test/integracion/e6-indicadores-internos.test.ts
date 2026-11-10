/**
 * Integración E6 · O2: `GET /v1/interno/indicadores/{ambito,snapshot}` (D176, D177) y el recurso `INDICADORES` de
 * `POST /v1/interno/auditoria/exportaciones` (D168), contra Postgres y Supabase Auth locales. Fixture E7 (H1–H8).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { crearFixtureE7, type FixtureE7 } from '../fixture-e7.js';

const TOKEN_INDICADORES = 'token-indicadores-de-pruebas-0123456789';
let app: NestExpressApplication;
let appSinCredencial: NestExpressApplication;
let f: FixtureE7;
let inactiva: UsuarioDePrueba;
let celdaD: { id: string };

const http = (): ReturnType<typeof request> => request(app.getHttpServer());
const como = (usuario: UsuarioDePrueba) => ({ authorization: autorizacion(usuario.token) });

type HduInd = { codigo: string; estado: string; cierreParcial: boolean; sprint: { inicio: string; fin: string } | null; analista: { activo: boolean } | null };
const codigos = (cuerpo: { hdu: HduInd[] }): string[] => cuerpo.hdu.map((hdu) => hdu.codigo).sort();
const nombres = (lista: Array<{ nombre: string }>): string[] => lista.map((item) => item.nombre);

before(async () => {
  await limpiarBaseDeDatos();
  process.env.INDICADORES_SERVICIO_TOKEN = TOKEN_INDICADORES;
  app = await crearAppDePrueba({ indicadoresServicioToken: TOKEN_INDICADORES });
  appSinCredencial = await crearAppDePrueba({ indicadoresServicioToken: null });
  f = await crearFixtureE7();
  // Un analista desactivado con una HDU activa, y otro desactivado cuya única HDU está cerrada.
  inactiva = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA-INACTIVA', activo: false });
  const inactivaCerrada = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'ANA-CERRADA', activo: false });
  const base = { celulaId: f.celdaC.id, prioridad: 'MEDIA' as const, qeResponsableId: f.qe2.id, creadoPorTipo: 'SERVICIO' as const, creadoPorId: 'prueba', creadoPorNombre: 'prueba' };
  await prisma.hdu.create({ data: { ...base, codigo: 'H9', codigoNormalizado: 'h9', titulo: 'H9', historiaSprints: { create: { sprintId: f.sprint.id } }, estado: 'PENDIENTE', analistaId: inactiva.id } });
  await prisma.hdu.create({ data: { ...base, codigo: 'H10', codigoNormalizado: 'h10', titulo: 'H10', historiaSprints: { create: { sprintId: f.sprint.id } }, estado: 'CERRADA', analistaId: inactivaCerrada.id } });
  // CEL-D sin HDU, a cargo de LID2.
  celdaD = await prisma.celula.create({ data: { nombre: 'CEL-D' } });
  await prisma.celulaLider.create({ data: { usuarioId: f.lid2.id, celulaId: celdaD.id, asignadoPorTipo: 'USUARIO', asignadoPorId: f.adm1.id, asignadoPorNombre: f.adm1.nombre } });
});

after(async () => {
  delete process.env.INDICADORES_SERVICIO_TOKEN;
  await app.close();
  await appSinCredencial.close();
  await prisma.$disconnect();
});

describe('GET /v1/interno/indicadores/ambito [D176]', () => {
  it('QE1: sus HDU como responsable y las de los analistas que supervisa, con célula, sprint con fechas, QE, analista y cierreParcial', async () => {
    const r = await http().get('/v1/interno/indicadores/ambito').set(como(f.qe1)).expect(200);
    assert.deepEqual(codigos(r.body), ['H1', 'H2', 'H5', 'H6', 'H8']);
    assert.deepEqual(r.body.usuario, { id: f.qe1.id, nombre: 'QE1', rol: 'QE' });
    assert.equal(r.body.todas, false);
    const h1 = r.body.hdu.find((hdu: { codigo: string }) => hdu.codigo === 'H1');
    assert.deepEqual(h1.celula, { id: f.celdaA.id, nombre: 'CEL-A' });
    assert.deepEqual(h1.sprint, { id: f.sprint.id, nombre: 'Sprint E7', inicio: '2026-10-01', fin: '2026-10-14' });
    assert.deepEqual(h1.qeResponsable, { id: f.qe1.id, nombre: 'QE1' });
    assert.deepEqual(h1.analista, { id: f.ana1.id, nombre: 'ANA1', activo: true });
    assert.equal(h1.cierreParcial, false);
    assert.equal(r.body.hdu.find((hdu: { codigo: string }) => hdu.codigo === 'H5').analista, null);
    assert.deepEqual(nombres(r.body.celulas), ['CEL-A', 'CEL-B', 'CEL-C']);
    assert.deepEqual(nombres(r.body.analistas), ['ANA1', 'ANA2']);
    assert.deepEqual(r.body.analistas[0].supervisor, { id: f.qe1.id, nombre: 'QE1' });
    assert.deepEqual(r.body.qes, [{ id: f.qe1.id, nombre: 'QE1' }]);
  });

  it('QE2: H3, H4, H7 y H9/H10; el analista inactivo con HDU activa aparece, el inactivo con solo HDU cerradas no', async () => {
    const r = await http().get('/v1/interno/indicadores/ambito').set(como(f.qe2)).expect(200);
    assert.deepEqual(codigos(r.body), ['H10', 'H3', 'H4', 'H7', 'H9']);
    assert.deepEqual(nombres(r.body.analistas), ['ANA-INACTIVA', 'ANA3']);
    const inactivo = r.body.analistas.find((a: { nombre: string }) => a.nombre === 'ANA-INACTIVA');
    assert.equal(inactivo.activo, false);
    assert.equal(inactivo.supervisor, null);
  });

  it('LID1: HDU de CEL-A y CEL-B; LID2: su célula sin HDU aparece igual (tarjeta «Sin HDU»)', async () => {
    const l1 = await http().get('/v1/interno/indicadores/ambito').set(como(f.lid1)).expect(200);
    assert.deepEqual(codigos(l1.body), ['H1', 'H2', 'H3', 'H5', 'H6', 'H7']);
    assert.deepEqual(nombres(l1.body.celulas), ['CEL-A', 'CEL-B']);
    assert.deepEqual(nombres(l1.body.analistas), ['ANA1', 'ANA2', 'ANA3']);
    const l2 = await http().get('/v1/interno/indicadores/ambito').set(como(f.lid2)).expect(200);
    assert.deepEqual(l2.body.hdu, []);
    assert.deepEqual(l2.body.celulas, [{ id: celdaD.id, nombre: 'CEL-D' }]);
    assert.deepEqual(l2.body.analistas, []);
  });

  it('AUD1: todas las HDU, todos los analistas activos (también sin HDU, ANA4) y los inactivos con HDU no cerrada', async () => {
    const r = await http().get('/v1/interno/indicadores/ambito').set(como(f.aud1)).expect(200);
    assert.equal(r.body.todas, true);
    assert.equal(r.body.hdu.length, 10);
    assert.deepEqual(nombres(r.body.analistas), ['ANA-INACTIVA', 'ANA1', 'ANA2', 'ANA3', 'ANA4']);
    assert.equal(r.body.analistas.find((a: { nombre: string }) => a.nombre === 'ANA4').supervisor, null);
    // D176: el Auditor recibe todos los QE activos, también uno sin HDU ni equipo (QE3), para leer su umbral (D161).
    const qe3 = await crearUsuarioDePrueba('QE', { nombre: 'QE3' });
    const conQe3 = await http().get('/v1/interno/indicadores/ambito').set(como(f.aud1)).expect(200);
    assert.deepEqual(nombres(conQe3.body.qes), ['QE1', 'QE2', 'QE3']);
    assert.ok(conQe3.body.qes.some((qe: { id: string }) => qe.id === qe3.id));
  });

  it('un cierre con excepción marca cierreParcial en el ámbito', async () => {
    await prisma.cierreHdu.create({
      data: { hduId: f.h.H7.id, aprobados: 4, pendientes: ['A', 'B', 'C', 'D', 'E', 'F'], justificacion: 'x'.repeat(30), actorId: f.qe2.id, actorNombre: 'QE2', actorRol: 'QE' },
    });
    const r = await http().get('/v1/interno/indicadores/ambito').set(como(f.qe2)).expect(200);
    assert.equal(r.body.hdu.find((hdu: { codigo: string }) => hdu.codigo === 'H7').cierreParcial, true);
    assert.equal(r.body.hdu.find((hdu: { codigo: string }) => hdu.codigo === 'H3').cierreParcial, false);
  });

  it('Analista, Administrador y usuario sin sesión no tienen ámbito de indicadores (403 / 401)', async () => {
    for (const usuario of [f.ana1, f.adm1]) {
      const r = await http().get('/v1/interno/indicadores/ambito').set(como(usuario));
      assert.equal(r.status, 403);
      assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await http().get('/v1/interno/indicadores/ambito')).status, 401);
  });

  it('el rol sale de la base: un QE desactivado recibe 403', async () => {
    const qe = await crearUsuarioDePrueba('QE', { nombre: 'QE-INACTIVO', activo: false });
    assert.equal((await http().get('/v1/interno/indicadores/ambito').set(como(qe))).status, 403);
  });
});

describe('GET /v1/interno/indicadores/snapshot [D177]', () => {
  const conCredencial = (valor: string = TOKEN_INDICADORES) => ({ 'x-q360-servicio-token': valor });

  it('con la credencial: todas las HDU, el total y el ámbito de cada QE activo con HDU', async () => {
    const r = await http().get('/v1/interno/indicadores/snapshot').set(conCredencial()).expect(200);
    assert.equal(r.body.total, 10);
    assert.equal(r.body.hdu.length, 10);
    const porQe = Object.fromEntries(r.body.ambitosQe.map((a: { qe: { nombre: string }; hduIds: string[] }) => [a.qe.nombre, a.hduIds.length]));
    assert.deepEqual(porQe, { QE1: 5, QE2: 5 });
    const qe1 = r.body.ambitosQe.find((a: { qe: { id: string } }) => a.qe.id === f.qe1.id);
    assert.deepEqual([...qe1.hduIds].sort(), [f.h.H1.id, f.h.H2.id, f.h.H5.id, f.h.H6.id, f.h.H8.id].sort());
  });

  it('limite recorta las HDU pero no el total; un límite inválido es 400', async () => {
    const r = await http().get('/v1/interno/indicadores/snapshot?limite=3').set(conCredencial()).expect(200);
    assert.equal(r.body.hdu.length, 3);
    assert.equal(r.body.total, 10);
    for (const malo of ['0', 'abc', '5001', '-1']) {
      const respuesta = await http().get(`/v1/interno/indicadores/snapshot?limite=${malo}`).set(conCredencial());
      assert.equal(respuesta.status, 400, malo);
      assert.equal(respuesta.body.detalles[0].campo, 'limite');
    }
  });

  it('sin cabecera, con otro valor, con la credencial de la semilla o con una sesión de usuario: 401', async () => {
    assert.equal((await http().get('/v1/interno/indicadores/snapshot')).status, 401);
    assert.equal((await http().get('/v1/interno/indicadores/snapshot').set(conCredencial('otro'))).status, 401);
    assert.equal((await http().get('/v1/interno/indicadores/snapshot').set(conCredencial(process.env.X_Q360_SERVICIO_TOKEN))).status, 401);
    assert.equal((await http().get('/v1/interno/indicadores/snapshot').set(como(f.adm1))).status, 401);
    assert.equal((await http().get('/v1/interno/indicadores/snapshot').set(como(f.aud1)).set(conCredencial())).status, 200, 'la credencial basta; la sesión no cuenta');
  });

  it('sin INDICADORES_SERVICIO_TOKEN configurada responde siempre 401', async () => {
    const r = await request(appSinCredencial.getHttpServer()).get('/v1/interno/indicadores/snapshot').set(conCredencial());
    assert.equal(r.status, 401);
    assert.equal((await request(appSinCredencial.getHttpServer()).get('/v1/interno/indicadores/snapshot').set(conCredencial(''))).status, 401);
  });

  it('la credencial de Indicadores no abre ninguna otra ruta interna', async () => {
    for (const ruta of ['/v1/interno/acceso', '/v1/interno/indicadores/ambito', '/v1/hdu', '/v1/interno/hdu/ambito']) {
      assert.equal((await http().get(ruta).set(conCredencial())).status, 401, ruta);
    }
  });
});

describe('POST /v1/interno/auditoria/exportaciones con INDICADORES [D168]', () => {
  const cuerpo = { recurso: 'INDICADORES', filtros: { vista: 'carga', formato: 'csv', celulaId: null }, filas: 7 };

  it('QE, Líder y Auditor registran EXPORTAR con actor, recurso, filtros y filas', async () => {
    for (const usuario of [f.qe1, f.lid1, f.aud1]) {
      const r = await http().post('/v1/interno/auditoria/exportaciones').set(como(usuario)).send(cuerpo);
      assert.equal(r.status, 201, usuario.nombre);
      const entrada = await prisma.auditoria.findFirstOrThrow({ where: { entidadId: r.body.id, accion: 'EXPORTAR' } });
      assert.equal(entrada.actorId, usuario.id);
      assert.deepEqual(entrada.despues, { recurso: 'INDICADORES', filtros: cuerpo.filtros, filas: 7 });
    }
  });

  it('los demás recursos siguen siendo solo del Auditor; Administrador y Analista reciben 403', async () => {
    const otro = { ...cuerpo, recurso: 'CERTIFICADOS' };
    assert.equal((await http().post('/v1/interno/auditoria/exportaciones').set(como(f.qe1)).send(otro)).status, 403);
    assert.equal((await http().post('/v1/interno/auditoria/exportaciones').set(como(f.lid1)).send(otro)).status, 403);
    assert.equal((await http().post('/v1/interno/auditoria/exportaciones').set(como(f.aud1)).send(otro)).status, 201);
    for (const usuario of [f.adm1, f.ana1]) {
      assert.equal((await http().post('/v1/interno/auditoria/exportaciones').set(como(usuario)).send(cuerpo)).status, 403);
    }
    assert.equal((await http().post('/v1/interno/auditoria/exportaciones').send(cuerpo)).status, 401);
  });
});
