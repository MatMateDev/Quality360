/**
 * E7-B04 · Auditoría de usuarios y exportaciones del Auditor que atiende Organización
 * (D35, D38, D45, D48, D53), contra Postgres y Supabase Auth locales reales y un
 * Certificaciones falso. La bitácora y los certificados se prueban en Certificaciones.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { autorizacion, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { CertificacionesFalsa } from '../certificaciones-falsa.js';
import { crearFixtureE7, type FixtureE7 } from '../fixture-e7.js';

let app: NestExpressApplication;
let f: FixtureE7;
const cert = new CertificacionesFalsa();

const http = (): ReturnType<typeof request> => request(app.getHttpServer());
const como = (usuario: UsuarioDePrueba) => ({ authorization: autorizacion(usuario.token) });

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cuerpo = any;
const BOM = '﻿';

function filasCsv(texto: string): string[] {
  return texto.replace(BOM, '').split('\r\n').filter((linea) => linea.length > 0);
}

const pedirCsv = (ruta: string, usuario: UsuarioDePrueba) =>
  http().get(ruta).set(como(usuario)).buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (parte: Buffer) => partes.push(parte));
    res.on('end', () => cb(null, Buffer.concat(partes).toString('utf8')));
  });

before(async () => {
  await cert.iniciar();
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba({ certificacionesUrl: cert.url, certificacionesTimeoutMs: 1500 });
  f = await crearFixtureE7(cert);
  // Auditoría de usuarios de partida: un cambio de rol, uno de datos y una supervisión.
  await http().put(`/v1/usuarios/${f.ana4.id}/rol`).set(como(f.adm1)).send({ rol: 'AUDITOR' }).expect(200);
  await http().patch(`/v1/usuarios/${f.ana1.id}`).set(como(f.adm1)).send({ nombre: 'ANA1' }).expect(200);
  await http().put(`/v1/usuarios/${f.lid2.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaC.id] }).expect(200);
});

after(async () => {
  await app.close();
  await cert.cerrar();
  await prisma.$disconnect();
});

describe('Consulta con filtros [E7-B04#1]', () => {
  it('[E7-B04-T04] operacion=CAMBIAR_ROL devuelve solo cambios de rol, con antes y después', async () => {
    const respuesta: Cuerpo = (await http().get('/v1/auditor/auditoria-usuarios?operacion=CAMBIAR_ROL').set(como(f.aud1)).expect(200)).body;
    assert.ok(respuesta.total >= 1);
    for (const fila of respuesta.items) {
      assert.equal(fila.operacion, 'CAMBIAR_ROL');
      assert.equal(fila.entidad, 'USUARIO');
      assert.ok(fila.antes?.rol !== undefined && fila.despues?.rol !== undefined);
    }
    const ana4 = respuesta.items.find((fila: Cuerpo) => fila.usuarioAfectado?.id === f.ana4.id);
    assert.deepEqual([ana4.antes, ana4.despues], [{ rol: 'ANALISTA_QA' }, { rol: 'AUDITOR' }]);
    assert.equal(ana4.actor.id, f.adm1.id);
  });

  it('más reciente primero, con filtros por actor, usuario afectado y rango de fechas', async () => {
    const todo: Cuerpo = (await http().get('/v1/auditor/auditoria-usuarios').set(como(f.aud1)).expect(200)).body;
    const fechas = todo.items.map((fila: Cuerpo) => Date.parse(fila.fecha));
    assert.deepEqual([...fechas].sort((a, b) => b - a), fechas);
    const deAna1: Cuerpo = (await http().get(`/v1/auditor/auditoria-usuarios?usuarioAfectadoId=${f.ana1.id}`).set(como(f.aud1)).expect(200)).body;
    assert.ok(deAna1.items.every((fila: Cuerpo) => fila.usuarioAfectado.id === f.ana1.id));
    const delActor: Cuerpo = (await http().get(`/v1/auditor/auditoria-usuarios?actorId=${f.adm1.id}`).set(como(f.aud1)).expect(200)).body;
    assert.ok(delActor.total >= 3);
    const futuro = encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString());
    const ninguna: Cuerpo = (await http().get(`/v1/auditor/auditoria-usuarios?desde=${futuro}`).set(como(f.aud1)).expect(200)).body;
    assert.deepEqual([ninguna.items, ninguna.total], [[], 0]);
    await http().get(`/v1/auditor/auditoria-usuarios?desde=${futuro}&hasta=2020-01-01T00:00:00Z`).set(como(f.aud1)).expect(400);
    await http().get('/v1/auditor/auditoria-usuarios?operacion=BORRAR').set(como(f.aud1)).expect(400);
  });

  it('en supervisión el usuario afectado es el analista y la entrada solo trae campos permitidos', async () => {
    await http().put(`/v1/analistas/${f.ana3.id}/supervisor`).set(como(f.adm1)).send({ qeId: f.qe1.id, motivo: 'Rebalanceo del equipo' }).expect(200);
    const respuesta: Cuerpo = (await http().get('/v1/auditor/auditoria-usuarios?operacion=CAMBIAR_SUPERVISOR').set(como(f.aud1)).expect(200)).body;
    const fila = respuesta.items[0];
    assert.equal(fila.entidad, 'SUPERVISION');
    assert.equal(fila.usuarioAfectado.id, f.ana3.id);
    assert.equal(fila.motivo, 'Rebalanceo del equipo');
    assert.deepEqual(fila.antes, { qeId: f.qe2.id });
    await http().put(`/v1/analistas/${f.ana3.id}/supervisor`).set(como(f.adm1)).send({ qeId: f.qe2.id, motivo: 'Se revierte' }).expect(200);
  });
});

describe('Contenido seguro [E7-B04#2]', () => {
  it('[E7-B04-T06] ninguna fila ni campo contiene password, token ni secret, aunque la base los tenga', async () => {
    await prisma.auditoria.create({
      data: {
        actorTipo: 'USUARIO',
        actorId: f.adm1.id,
        actorNombre: 'ADM1',
        entidad: 'USUARIO',
        entidadId: f.ana2.id,
        accion: 'ACTUALIZAR_USUARIO',
        antes: { nombre: 'viejo', password: 'clave-123', access_token: 'tkn-1', rol: 'ANALISTA_QA' },
        despues: { nombre: 'nuevo', clientSecret: 'sec-1', celulas: [{ id: 'x', nombre: 'CEL-X', refresh_token: 'tkn-2' }], campoInterno: 'no-visible' },
        motivo: null,
      },
    });
    let pagina = 1;
    let revisadas = 0;
    for (;;) {
      const respuesta: Cuerpo = (await http().get(`/v1/auditor/auditoria-usuarios?pagina=${pagina}&tamanoPagina=5`).set(como(f.aud1)).expect(200)).body;
      const texto = JSON.stringify(respuesta.items);
      assert.doesNotMatch(texto, /password|token|secret|clave-123|tkn-|sec-1/i);
      assert.doesNotMatch(texto, /campoInterno|no-visible/);
      revisadas += respuesta.items.length;
      if (pagina * 5 >= respuesta.total) break;
      pagina += 1;
    }
    assert.ok(revisadas >= 5);
    const afectada: Cuerpo = (await http().get(`/v1/auditor/auditoria-usuarios?usuarioAfectadoId=${f.ana2.id}`).set(como(f.aud1)).expect(200)).body;
    assert.deepEqual(afectada.items[0].antes, { nombre: 'viejo', rol: 'ANALISTA_QA' });
    assert.deepEqual(afectada.items[0].despues, { nombre: 'nuevo', celulas: [{ id: 'x', nombre: 'CEL-X' }] });
  });

  it('[E7-B04-T07] ADM1, QE1, ANA1 y LID1 reciben 403 ACCESO_DENEGADO en los 3 endpoints de Organización (12 intentos)', async () => {
    const rutas = ['/v1/auditor/auditoria-usuarios', '/v1/auditor/exportaciones/auditoria-usuarios', '/v1/auditor/exportaciones/hdu'];
    let intentos = 0;
    for (const usuario of [f.adm1, f.qe1, f.ana1, f.lid1]) {
      for (const ruta of rutas) {
        const respuesta = await http().get(ruta).set(como(usuario));
        assert.equal(respuesta.status, 403, `${ruta} como ${usuario.nombre}`);
        assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
        intentos += 1;
      }
    }
    assert.equal(intentos, 12);
    assert.equal(await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } }), 0, 'ningún intento negado se registra como exportación');
  });

  it('el Administrador conserva GET /v1/auditoria, sin pantalla pero con acceso (D53), y el Auditor no la lee', async () => {
    await http().get('/v1/auditoria').set(como(f.adm1)).expect(200);
    await http().get('/v1/auditoria').set(como(f.aud1)).expect(403);
  });

  it('[E7-B04-T08] sin token: 401 NO_AUTENTICADO', async () => {
    const respuesta = await http().get('/v1/auditor/auditoria-usuarios');
    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
    await http().get('/v1/auditor/exportaciones/hdu').expect(401);
  });
});

describe('Exportación [E7-B04#3]', () => {
  it('[E7-B04-T09] exporta HDU con celulaId=CEL-A: encabezado y 4 filas, con BOM, separador ; y cabeceras de descarga', async () => {
    const respuesta = await pedirCsv(`/v1/auditor/exportaciones/hdu?celulaId=${f.celdaA.id}`, f.aud1).expect(200);
    assert.match(respuesta.headers['content-type'] ?? '', /^text\/csv; charset=utf-8/);
    assert.match(respuesta.headers['content-disposition'] ?? '', /^attachment; filename="quality360-hdu-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(respuesta.headers['x-q360-filas'], '4');
    const texto = respuesta.body as unknown as string;
    assert.ok(texto.startsWith(BOM), 'lleva BOM UTF-8');
    const lineas = filasCsv(texto);
    assert.equal(lineas.length, 5);
    assert.equal(lineas[0], 'Código;Título;Célula;Sprint;Estado;QE;Analista;Avance;Certificado;Actualizada');
    assert.deepEqual(lineas.slice(1).map((linea) => linea.split(';')[0]), ['H1', 'H2', 'H5', 'H7']);
    const h1 = lineas[1]?.split(';') ?? [];
    assert.deepEqual([h1[2], h1[4], h1[5], h1[6], h1[7], h1[8]], ['CEL-A', 'EN_EJECUCION', 'QE1', 'ANA1', '3/10', '']);
    assert.match(h1[9] ?? '', /^\d{4}-\d{2}-\d{2}T.*Z$/, 'fechas ISO 8601 en UTC');
    assert.equal(lineas[4]?.split(';')[8], 'F7');
  });

  it('[E7-B04-T10] la última entrada de auditoría es la exportación, con AUD1 como actor, recurso, filtros y 4 filas', async () => {
    await pedirCsv(`/v1/auditor/exportaciones/auditoria-usuarios?operacion=CAMBIAR_ROL`, f.aud1).expect(200);
    const hdu = await pedirCsv(`/v1/auditor/exportaciones/hdu?celulaId=${f.celdaA.id}`, f.aud1).expect(200);
    assert.equal(hdu.headers['x-q360-filas'], '4');
    const consulta: Cuerpo = (await http().get('/v1/auditor/auditoria-usuarios?tamanoPagina=3').set(como(f.aud1)).expect(200)).body;
    const ultima = consulta.items[0];
    assert.equal(ultima.operacion, 'EXPORTAR');
    assert.equal(ultima.entidad, 'EXPORTACION');
    assert.equal(ultima.usuarioAfectado, null);
    assert.equal(ultima.actor.id, f.aud1.id);
    assert.deepEqual(ultima.despues, { recurso: 'HDU', filtros: { celulaId: f.celdaA.id }, filas: 4 });
    const anterior = consulta.items[1];
    assert.deepEqual(anterior.despues, { recurso: 'AUDITORIA_USUARIOS', filtros: { operacion: 'CAMBIAR_ROL' }, filas: anterior.despues.filas });
  });

  it('exportar la auditoría de usuarios usa los mismos filtros y columnas que la consulta; sin coincidencias, solo el encabezado', async () => {
    const consulta: Cuerpo = (await http().get('/v1/auditor/auditoria-usuarios?operacion=CAMBIAR_ROL').set(como(f.aud1)).expect(200)).body;
    const respuesta = await pedirCsv('/v1/auditor/exportaciones/auditoria-usuarios?operacion=CAMBIAR_ROL', f.aud1).expect(200);
    const lineas = filasCsv(respuesta.body as unknown as string);
    assert.equal(lineas.length - 1, consulta.total);
    assert.equal(lineas[0], 'Fecha;Actor;Operación;Usuario afectado;Cambios;Motivo');
    assert.doesNotMatch(lineas.join('\n'), /password|token|secret/i);

    const futuro = encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString());
    const vacia = await pedirCsv(`/v1/auditor/exportaciones/auditoria-usuarios?desde=${futuro}`, f.aud1).expect(200);
    assert.equal(vacia.headers['x-q360-filas'], '0');
    assert.equal(filasCsv(vacia.body as unknown as string).length, 1);
  });

  it('[E7-B04-T11] con el límite reducido a 2 filas, exportar más responde 422 EXPORTACION_EXCEDE_LIMITE y no registra nada', async () => {
    const limitada = await crearAppDePrueba({ certificacionesUrl: cert.url, exportacionLimiteFilas: 2 });
    try {
      const antes = await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } });
      const hdu = await request(limitada.getHttpServer()).get('/v1/auditor/exportaciones/hdu').set(como(f.aud1));
      assert.equal(hdu.status, 422);
      assert.equal(hdu.body.codigo, 'EXPORTACION_EXCEDE_LIMITE');
      assert.match(hdu.body.mensaje, /Acota los filtros/);
      const auditoria = await request(limitada.getHttpServer()).get('/v1/auditor/exportaciones/auditoria-usuarios').set(como(f.aud1));
      assert.equal(auditoria.status, 422);
      assert.equal(await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } }), antes);
      // Dentro del límite sí exporta.
      const dentro = await request(limitada.getHttpServer()).get(`/v1/auditor/exportaciones/hdu?estado=CERRADA`).set(como(f.aud1));
      assert.equal(dentro.status, 200);
    } finally {
      await limitada.close();
    }
  });

  it('[E7-B04-T12] con Certificaciones detenido la auditoría de usuarios responde 200 y exportar HDU da 503 sin archivo ni registro', async () => {
    cert.caida = true;
    try {
      await http().get('/v1/auditor/auditoria-usuarios').set(como(f.aud1)).expect(200);
      const antes = await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } });
      const exportacion = await http().get('/v1/auditor/exportaciones/hdu').set(como(f.aud1));
      assert.equal(exportacion.status, 503);
      assert.equal(exportacion.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.equal(await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } }), antes);
    } finally {
      cert.caida = false;
    }
  });

  it('Certificaciones registra aquí sus exportaciones (D48): 201 solo para el Auditor, con recurso válido', async () => {
    const cuerpo = { recurso: 'BITACORA', filtros: { hduId: f.h.H2.id }, filas: 7 };
    const creada: Cuerpo = (await http().post('/v1/interno/auditoria/exportaciones').set(como(f.aud1)).send(cuerpo).expect(201)).body;
    assert.match(creada.id, /^[0-9a-f-]{36}$/);
    const registro = await prisma.auditoria.findFirstOrThrow({ where: { entidadId: creada.id } });
    assert.equal(registro.accion, 'EXPORTAR');
    assert.equal(registro.entidad, 'EXPORTACION');
    assert.equal(registro.actorId, f.aud1.id);
    assert.deepEqual(registro.despues, cuerpo);
    for (const usuario of [f.adm1, f.qe1, f.lid1]) await http().post('/v1/interno/auditoria/exportaciones').set(como(usuario)).send(cuerpo).expect(403);
    await http().post('/v1/interno/auditoria/exportaciones').set(como(f.aud1)).send({ ...cuerpo, recurso: 'OTRO' }).expect(400);
    await http().post('/v1/interno/auditoria/exportaciones').set(como(f.aud1)).send({ ...cuerpo, filas: -1 }).expect(400);
  });
});
