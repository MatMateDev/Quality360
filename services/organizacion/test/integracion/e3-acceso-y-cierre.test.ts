/**
 * Integración E3 en Organización: acceso interno ampliado para Certificaciones
 * (actor y datos de la HDU), lista de HDU del QE responsable y cierre con el
 * checklist real (D11) usando un Certificaciones falso.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion } from '../../src/configuracion.js';
import { crearApp } from '../../src/crear-app.js';
import {
  autorizacion,
  crearCelulaDePrueba,
  crearSprintDePrueba,
  crearUsuarioDePrueba,
  limpiarBaseDeDatos,
  prisma,
  type UsuarioDePrueba,
} from '../ayudas.js';
import { ImpedimentosFalsa } from '../impedimentos-falsa.js';
import '../entorno.js';

let app: NestExpressApplication;
let certificaciones: Server;
let completo = false;
const impedimentos = new ImpedimentosFalsa();
let admin: UsuarioDePrueba;
let qe: UsuarioDePrueba;
let otroQe: UsuarioDePrueba;
let analista: UsuarioDePrueba;
let otroAnalista: UsuarioDePrueba;
let celula: { id: string; nombre: string };
let sprint: { id: string; nombre: string };

async function crearHdu(duenio: UsuarioDePrueba): Promise<{ id: string; codigo: string }> {
  const respuesta = await request(app.getHttpServer())
    .post('/v1/hdu')
    .set('authorization', autorizacion(duenio.token))
    .send({ codigo: `E3-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, titulo: 'Checklist E3', celulaId: celula.id, sprintId: sprint.id, prioridad: 'ALTA' })
    .expect(201);
  return respuesta.body;
}

before(async () => {
  await limpiarBaseDeDatos();
  await impedimentos.iniciar();
  certificaciones = createServer((peticion, res) => {
    const hduId = peticion.url?.match(/^\/v1\/hdu\/([^/]+)\/checklist$/)?.[1];
    res.writeHead(hduId === undefined ? 404 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ hduId, totalEntregables: 10, completados: completo ? 10 : 9, porcentajeCumplimiento: completo ? 100 : 90, completo }));
  });
  await new Promise<void>((resolver) => certificaciones.listen(0, '127.0.0.1', resolver));
  const direccion = certificaciones.address();
  if (direccion === null || typeof direccion === 'string') throw new Error('sin puerto');
  app = await crearApp(cargarConfiguracion({ ...process.env, CERTIFICACIONES_URL: `http://127.0.0.1:${direccion.port}`, IMPEDIMENTOS_URL: impedimentos.url }), { registro: false });

  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin E3' });
  qe = await crearUsuarioDePrueba('QE', { nombre: 'Carla QE' });
  otroQe = await crearUsuarioDePrueba('QE', { nombre: 'Marcos QE' });
  analista = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'Ana Analista' });
  otroAnalista = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'Beatriz Analista' });
  celula = await crearCelulaDePrueba('Pagos E3');
  sprint = await crearSprintDePrueba('Sprint E3');
  await request(app.getHttpServer())
    .put(`/v1/analistas/${analista.id}/supervisor`)
    .set('authorization', autorizacion(admin.token))
    .send({ qeId: qe.id })
    .expect(200);
});

after(async () => {
  await app.close();
  await new Promise<void>((resolver) => certificaciones.close(() => resolver()));
  await impedimentos.cerrar();
  await prisma.$disconnect();
});

describe('GET /v1/interno/hdu/{id}/acceso con actor y HDU [E3-B01#1]', () => {
  it('permitido: incluye nombre y rol de quien consulta y los datos de la HDU', async () => {
    const hdu = await crearHdu(qe);
    await request(app.getHttpServer())
      .put(`/v1/hdu/${hdu.id}/analista`)
      .set('authorization', autorizacion(qe.token))
      .send({ analistaId: analista.id })
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .get(`/v1/interno/hdu/${hdu.id}/acceso`)
      .set('authorization', autorizacion(analista.token));
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.permitido, true);
    assert.equal(respuesta.body.relacion, 'ANALISTA_ASIGNADO');
    assert.deepEqual(respuesta.body.actor, { id: analista.id, nombre: 'Ana Analista', rol: 'ANALISTA_QA' });
    assert.deepEqual(respuesta.body.hdu, {
      id: hdu.id,
      codigo: hdu.codigo,
      titulo: 'Checklist E3',
      estado: 'PENDIENTE',
      celula: 'Pagos E3',
      sprint: 'Sprint E3',
      // E4 (D86): ids y fin del sprint para Impedimentos.
      celulaId: celula.id,
      sprintId: sprint.id,
      sprintFin: '2026-01-14',
      qeResponsable: { id: qe.id, nombre: 'Carla QE' },
      analista: { id: analista.id, nombre: 'Ana Analista' },
    });
  });

  it('fuera de ámbito: permitido false, sin actor ni datos de la HDU', async () => {
    const hdu = await crearHdu(qe);
    const respuesta = await request(app.getHttpServer())
      .get(`/v1/interno/hdu/${hdu.id}/acceso`)
      .set('authorization', autorizacion(otroAnalista.token));
    assert.deepEqual(respuesta.body, { hduId: hdu.id, permitido: false, relacion: null });
  });
});

describe('GET /v1/interno/hdu/responsable [E3-F03#3]', () => {
  it('lista solo las HDU donde el QE es responsable; otro rol recibe 403', async () => {
    const propia = await crearHdu(qe);
    const ajena = await crearHdu(otroQe);
    const respuesta = await request(app.getHttpServer()).get('/v1/interno/hdu/responsable').set('authorization', autorizacion(qe.token));
    assert.equal(respuesta.status, 200);
    const ids = respuesta.body.items.map((hdu: { id: string }) => hdu.id);
    assert.ok(ids.includes(propia.id));
    assert.ok(!ids.includes(ajena.id));
    assert.equal(respuesta.body.items[0].qeResponsable.nombre, 'Carla QE');

    const analistaRespuesta = await request(app.getHttpServer()).get('/v1/interno/hdu/responsable').set('authorization', autorizacion(analista.token));
    assert.equal(analistaRespuesta.status, 403);
  });
});

describe('Cierre de HDU con el checklist de Certificaciones (D11, E2-B02#3)', () => {
  async function hastaPendienteCierre(): Promise<string> {
    const hdu = await crearHdu(qe);
    for (const estado of ['DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE']) {
      await request(app.getHttpServer()).post(`/v1/hdu/${hdu.id}/estado`).set('authorization', autorizacion(qe.token)).send({ estado }).expect(200);
    }
    return hdu.id;
  }

  it('checklist incompleto: 409 CHECKLIST_INCOMPLETO con el bloque ok', async () => {
    completo = false;
    const id = await hastaPendienteCierre();
    const respuesta = await request(app.getHttpServer()).post(`/v1/hdu/${id}/estado`).set('authorization', autorizacion(qe.token)).send({ estado: 'CERRADA' });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'CHECKLIST_INCOMPLETO');
    assert.equal(respuesta.body.checklist.estado, 'ok');
    assert.equal(respuesta.body.checklist.datos.completados, 9);
  });

  it('checklist completo: la HDU se cierra', async () => {
    completo = true;
    const id = await hastaPendienteCierre();
    const respuesta = await request(app.getHttpServer()).post(`/v1/hdu/${id}/estado`).set('authorization', autorizacion(qe.token)).send({ estado: 'CERRADA' });
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    assert.equal(respuesta.body.estadoNuevo, 'CERRADA');
  });
});
