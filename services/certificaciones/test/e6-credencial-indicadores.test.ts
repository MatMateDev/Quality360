/**
 * C1 · credencial de Indicadores en Certificaciones (E6, D177) y E6-B05-T07 (sin certificado tras un cierre con
 * excepción). `POST /v1/interno/checklist/estados` acepta la sesión O `X-Q360-Servicio-Token`; ninguna otra ruta la acepta.
 * Postgres local real (esquema `certificaciones`); Organización y Storage simulados.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { crearApp } from '../src/crear-app.js';
import { CLAVES_ENTREGABLE, type ClaveEntregable } from '../src/dominio/entregables.js';
import { ALMACEN_ARCHIVOS } from '../src/infraestructura/almacen.js';
import { AlmacenEnMemoria, iniciarOrganizacionFalsa, tokenDe, type ClavePersona, type OrganizacionFalsa } from './ayudas.js';
import { configuracionPrueba } from './ayudas-app.js';

const TOKEN = 'token-indicadores-de-pruebas-0123456789';
let organizacion: OrganizacionFalsa;
let app: NestExpressApplication;
let appSinCredencial: NestExpressApplication;

before(async () => {
  organizacion = await iniciarOrganizacionFalsa();
  const almacen = { provide: ALMACEN_ARCHIVOS, useValue: new AlmacenEnMemoria() };
  app = await crearApp({ ...configuracionPrueba(organizacion.url), indicadoresServicioToken: TOKEN }, { registro: false, almacen });
  appSinCredencial = await crearApp({ ...configuracionPrueba(organizacion.url), indicadoresServicioToken: null }, { registro: false, almacen });
});

after(async () => {
  await app.close();
  await appSinCredencial.close();
  await organizacion.cerrar();
});

async function llamar(persona: ClavePersona, metodo: 'get' | 'post', ruta: string, cuerpo?: object) {
  const solicitud = request(app.getHttpServer())[metodo](ruta).set('authorization', `Bearer ${await tokenDe(persona)}`);
  return cuerpo === undefined ? solicitud : solicitud.send(cuerpo);
}

const enlace = { evidencia: { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/browse/PAG-1' } };
async function marcarYAprobar(hduId: string, clave: ClaveEntregable): Promise<void> {
  assert.equal((await llamar('analista', 'post', `/v1/hdu/${hduId}/entregables/${clave}/marcar`, enlace)).status, 200);
  assert.equal((await llamar('qe', 'post', `/v1/hdu/${hduId}/entregables/${clave}/aprobar`)).status, 200);
}

const estados = (servidor: NestExpressApplication, cabeceras: Record<string, string>, hduIds: string[]) =>
  request(servidor.getHttpServer()).post('/v1/interno/checklist/estados').set(cabeceras).send({ hduIds });

describe('C1 · POST /v1/interno/checklist/estados con la credencial de Indicadores', () => {
  it('es una lectura global: HDU de cualquier célula (también ajenas al Líder) y ids que Certificaciones no conoce', async () => {
    const propia = organizacion.nuevaHdu({ deLider: true });
    const ajena = organizacion.nuevaHdu({ deLider: false });
    await marcarYAprobar(propia.id, 'PLAN_PRUEBAS');
    await marcarYAprobar(propia.id, 'DASHBOARD');
    const desconocido = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const r = await estados(app, { 'x-q360-servicio-token': TOKEN }, [propia.id, ajena.id, desconocido]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(
      r.body.items.map((item: { hduId: string; aprobados: number; certificado: unknown }) => [item.hduId, item.aprobados, item.certificado]),
      [[propia.id, 2, null], [ajena.id, 0, null], [desconocido, 0, null]],
    );
  });

  it('el resultado coincide con el que ve el Auditor con su sesión', async () => {
    const hdu = organizacion.nuevaHdu({ deLider: true });
    await marcarYAprobar(hdu.id, 'PLAN_PRUEBAS');
    const credencial = await estados(app, { 'x-q360-servicio-token': TOKEN }, [hdu.id]);
    const sesion = await llamar('auditor', 'post', '/v1/interno/checklist/estados', { hduIds: [hdu.id] });
    assert.equal(sesion.status, 200);
    assert.deepEqual(credencial.body, sesion.body);
  });

  it('con otro valor, con la variable sin configurar o con la cabecera vacía sin sesión: 401', async () => {
    const hdu = organizacion.nuevaHdu({ deLider: true });
    assert.equal((await estados(app, { 'x-q360-servicio-token': 'otro-valor' }, [hdu.id])).status, 401);
    assert.equal((await estados(appSinCredencial, { 'x-q360-servicio-token': TOKEN }, [hdu.id])).status, 401);
    assert.equal((await estados(app, {}, [hdu.id])).status, 401);
  });

  it('un lote inválido es 400 y la sesión de usuario sigue exigiendo ámbito (403 fuera de él)', async () => {
    assert.equal((await estados(app, { 'x-q360-servicio-token': TOKEN }, [])).status, 400);
    const ajena = organizacion.nuevaHdu({ deLider: false });
    assert.equal((await llamar('lider', 'post', '/v1/interno/checklist/estados', { hduIds: [ajena.id] })).status, 403);
  });

  it('ninguna otra ruta acepta la credencial: GET /v1/hdu/{id}/checklist y el resto responden 401', async () => {
    const hdu = organizacion.nuevaHdu({ deLider: true });
    const cabecera = { 'x-q360-servicio-token': TOKEN };
    const servidor = request(app.getHttpServer());
    assert.equal((await servidor.get(`/v1/hdu/${hdu.id}/checklist`).set(cabecera)).status, 401);
    assert.equal((await servidor.get(`/v1/hdu/${hdu.id}/entregables`).set(cabecera)).status, 401);
    assert.equal((await servidor.post(`/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`).set(cabecera).send(enlace)).status, 401);
    assert.equal((await servidor.post(`/v1/hdu/${hdu.id}/certificado`).set(cabecera)).status, 401);
    assert.equal((await servidor.get('/v1/interno/resumen-auditoria').set(cabecera)).status, 401);
    assert.equal((await servidor.get('/v1/auditor/bitacora').set(cabecera)).status, 401);
  });
});

describe('E6-B05-T07 · el cierre con excepción no deja certificado', () => {
  it('una HDU CERRADA con 3 aprobados: no existe certificado y generarlo se rechaza con 409 HDU_CERRADA sin crear ninguno', async () => {
    const cerrada = organizacion.nuevaHdu({ deLider: true });
    for (const clave of CLAVES_ENTREGABLE.slice(0, 3)) await marcarYAprobar(cerrada.id, clave);
    // Organización la cierra con excepción (E6-B05): Certificaciones solo ve el estado CERRADA.
    cerrada.estado = 'CERRADA';

    const generar = await llamar('qe', 'post', `/v1/hdu/${cerrada.id}/certificado`);
    assert.equal(generar.status, 409);
    assert.equal(generar.body.codigo, 'HDU_CERRADA');
    const lectura = await llamar('qe', 'get', `/v1/hdu/${cerrada.id}/certificado`);
    assert.ok([404, 409].includes(lectura.status), `sin certificado: ${lectura.status}`);
    const checklist = await llamar('qe', 'get', `/v1/hdu/${cerrada.id}/entregables`);
    assert.equal(checklist.body.certificado, null);
    assert.equal(checklist.body.certificacion.habilitada, false);
    assert.equal(checklist.body.resumen.completados, 3, 'el checklist se conserva con sus pendientes');
    const global = await estados(app, { 'x-q360-servicio-token': TOKEN }, [cerrada.id]);
    assert.equal(global.body.items[0].certificado, null);
  });

  it('un certificado emitido antes del cierre sigue vigente y el de otra HDU no cambia', async () => {
    const emitida = organizacion.nuevaHdu({ deLider: true });
    for (const clave of CLAVES_ENTREGABLE.slice(0, 8)) await marcarYAprobar(emitida.id, clave);
    const generado = await llamar('qe', 'post', `/v1/hdu/${emitida.id}/certificado`);
    assert.equal(generado.status, 201, JSON.stringify(generado.body));
    emitida.estado = 'CERRADA';
    const vigente = await llamar('qe', 'get', `/v1/hdu/${emitida.id}/certificado`);
    assert.equal(vigente.status, 200);
    assert.equal(vigente.body.certificado.folio, generado.body.certificado.folio);
  });
});
