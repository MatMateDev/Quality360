/**
 * Certificaciones en E7 contra Postgres local (esquema `certificaciones`) con Organización y
 * Storage simulados: solo lectura del Líder QA y del Auditor (E7-B02), seguimiento en lote para
 * las bandejas (E7-B03, D46) y consultas y exportaciones del Auditor (E7-B04, D47, D48).
 * Las HDU de cada prueba son nuevas; lo global se aísla por fecha, HDU o actor.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { crearApp } from '../src/crear-app.js';
import { CLAVES_ENTREGABLE, type ClaveEntregable } from '../src/dominio/entregables.js';
import { ALMACEN_ARCHIVOS } from '../src/infraestructura/almacen.js';
import { AlmacenEnMemoria, iniciarOrganizacionFalsa, tokenDe, type ClavePersona, type HduFalsa, type OrganizacionFalsa } from './ayudas.js';
import { configuracionPrueba, crearAppDePrueba } from './ayudas-app.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cuerpo = any;
const BOM = '﻿';

let organizacion: OrganizacionFalsa;
let almacen: AlmacenEnMemoria;
let app: NestExpressApplication;
const inicio = new Date();
const desde = (): string => encodeURIComponent(new Date(inicio.getTime() - 1000).toISOString());

before(async () => {
  organizacion = await iniciarOrganizacionFalsa();
  almacen = new AlmacenEnMemoria();
  app = await crearAppDePrueba(organizacion.url, almacen);
});

after(async () => {
  await app.close();
  await organizacion.cerrar();
});

async function llamar(persona: ClavePersona, metodo: 'get' | 'post', ruta: string, cuerpo?: object) {
  const token = await tokenDe(persona);
  const solicitud = request(app.getHttpServer())[metodo](ruta).set('authorization', `Bearer ${token}`);
  return cuerpo === undefined ? solicitud : solicitud.send(cuerpo);
}

async function pedirCsv(ruta: string, persona: ClavePersona, aplicacion: NestExpressApplication = app) {
  const token = await tokenDe(persona);
  const respuesta = await request(aplicacion.getHttpServer())
    .get(ruta)
    .set('authorization', `Bearer ${token}`)
    .buffer(true)
    .parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (parte: Buffer) => partes.push(parte));
      res.on('end', () => cb(null, Buffer.concat(partes).toString('utf8')));
    });
  assert.equal(respuesta.status, 200, String(respuesta.body));
  return respuesta;
}

const enlace = { evidencia: { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/browse/PAG-1' } };

async function marcarYAprobar(hduId: string, clave: ClaveEntregable): Promise<void> {
  const marca = await llamar('analista', 'post', `/v1/hdu/${hduId}/entregables/${clave}/marcar`, enlace);
  assert.equal(marca.status, 200, JSON.stringify(marca.body));
  const aprobacion = await llamar('qe', 'post', `/v1/hdu/${hduId}/entregables/${clave}/aprobar`);
  assert.equal(aprobacion.status, 200, JSON.stringify(aprobacion.body));
}

/** HDU con los 8 primeros entregables aprobados y su certificado (el 9.º); con `cerrada`, también el 10.º. */
async function hduCertificada(cerrada = false): Promise<{ hdu: HduFalsa; folio: string }> {
  const hdu = organizacion.nuevaHdu({ deLider: true });
  for (const clave of CLAVES_ENTREGABLE.slice(0, 8)) await marcarYAprobar(hdu.id, clave);
  const generado = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/certificado`);
  assert.equal(generado.status, 201, JSON.stringify(generado.body));
  if (cerrada) await marcarYAprobar(hdu.id, 'CIERRE_PRUEBAS');
  return { hdu, folio: generado.body.certificado.folio };
}

describe('Solo lectura del Líder QA y del Auditor [E7-B02]', () => {
  it('[E7-B02-T01] el Líder lee checklist, bitácora y certificado de una HDU de su célula, con permisos en false', async () => {
    const { hdu, folio } = await hduCertificada();
    const checklist = await llamar('lider', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(checklist.status, 200);
    assert.deepEqual(checklist.body.permisos, { puedeMarcar: false, puedeAprobar: false, puedeGenerarCertificado: false });
    assert.equal((await llamar('lider', 'get', `/v1/hdu/${hdu.id}/checklist`)).status, 200);
    assert.equal((await llamar('lider', 'get', `/v1/hdu/${hdu.id}/entregables/bitacora`)).status, 200);
    const certificado = await llamar('lider', 'get', `/v1/hdu/${hdu.id}/certificado`);
    assert.equal(certificado.status, 200);
    assert.equal(certificado.body.certificado.folio, folio);
    assert.match(certificado.body.descarga.url, /^http/);
  });

  it('[E7-B02-T02] una HDU de otra célula da 403 ACCESO_DENEGADO al Líder, igual que una inexistente', async () => {
    const ajena = organizacion.nuevaHdu({ deLider: false });
    const respuesta = await llamar('lider', 'get', `/v1/hdu/${ajena.id}/entregables`);
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
    const inexistente = await llamar('lider', 'get', '/v1/hdu/7c9e6679-7425-40de-944b-e07fc1f90ae7/entregables');
    assert.equal(inexistente.status, 403);
    assert.equal(inexistente.body.mensaje, respuesta.body.mensaje);
    assert.equal((await llamar('lider', 'get', `/v1/hdu/${ajena.id}/certificado`)).status, 403);
  });

  it('[E7-B02-T06] [E7-B02-T07] el Auditor lee cualquier HDU y obtiene URL firmada de la evidencia en archivo y del certificado', async () => {
    const { hdu, folio } = await hduCertificada();
    const otra = organizacion.nuevaHdu({ deLider: false });
    const subida = await llamar('analista', 'post', `/v1/hdu/${otra.id}/entregables/PLAN_PRUEBAS/evidencias`, {
      nombreArchivo: 'plan.pdf',
      tipoContenido: 'application/pdf',
      tamanoBytes: 1024,
    });
    almacen.simularSubida('evidencias', subida.body.ruta, 1024, 'application/pdf');
    await llamar('analista', 'post', `/v1/hdu/${otra.id}/entregables/PLAN_PRUEBAS/marcar`, { evidencia: { tipo: 'ARCHIVO', ruta: subida.body.ruta } });

    assert.equal((await llamar('auditor', 'get', `/v1/hdu/${otra.id}/entregables`)).status, 200);
    const evidencia = await llamar('auditor', 'get', `/v1/hdu/${otra.id}/entregables/PLAN_PRUEBAS/evidencia`);
    assert.equal(evidencia.status, 200);
    assert.match(evidencia.body.url, /evidencias\//);
    assert.ok(Date.parse(evidencia.body.expiraEn) > Date.now());
    const certificado = await llamar('auditor', 'get', `/v1/hdu/${hdu.id}/certificado`);
    assert.equal(certificado.status, 200);
    assert.equal(certificado.body.certificado.folio, folio);
    assert.match(certificado.body.descarga.url, new RegExp(`certificados/${hdu.id}/${folio}\\.pdf`));
  });

  it('[E7-B02-T08] [E7-B02-T09] AUD1 y LID1 reciben 403 al marcar, subir evidencia, desmarcar, aprobar, rechazar y certificar, sin eventos nuevos', async () => {
    const hdu = organizacion.nuevaHdu({ deLider: true });
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    const antes = (await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables/bitacora`)).body.eventos.length;

    const base = `/v1/hdu/${hdu.id}`;
    const intentos: Array<[string, string, object | undefined]> = [
      ['evidencias', `${base}/entregables/DASHBOARD/evidencias`, { nombreArchivo: 'a.pdf', tipoContenido: 'application/pdf', tamanoBytes: 10 }],
      ['marcar', `${base}/entregables/DASHBOARD/marcar`, enlace],
      ['desmarcar', `${base}/entregables/PLAN_PRUEBAS/desmarcar`, { motivo: 'prueba de solo lectura' }],
      ['aprobar', `${base}/entregables/PLAN_PRUEBAS/aprobar`, undefined],
      ['rechazar', `${base}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'prueba de solo lectura' }],
      ['certificado', `${base}/certificado`, undefined],
    ];
    let combinaciones = 0;
    for (const persona of ['auditor', 'lider'] as const) {
      for (const [nombre, ruta, cuerpo] of intentos) {
        const respuesta = await llamar(persona, 'post', ruta, cuerpo);
        assert.equal(respuesta.status, 403, `${nombre} como ${persona}`);
        assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
        combinaciones += 1;
      }
    }
    assert.equal(combinaciones, 12);
    const despues = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables/bitacora`);
    assert.equal(despues.body.eventos.length, antes, '0 eventos nuevos');
    const checklist = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(checklist.body.entregables[0].estado, 'POR_APROBAR');
    assert.equal(checklist.body.entregables[1].estado, 'PENDIENTE');
  });
});

describe('POST /v1/interno/checklist/estados [E7-B03, D46]', () => {
  it('[E7-B03#1] calcula aprobados, por aprobar, observaciones, siguiente entregable y fechas de cada HDU, en el orden pedido', async () => {
    const aprobada = organizacion.nuevaHdu();
    for (const clave of CLAVES_ENTREGABLE.slice(0, 3)) await marcarYAprobar(aprobada.id, clave);
    await llamar('analista', 'post', `/v1/hdu/${aprobada.id}/entregables/APROBACION_CASOS/marcar`, enlace);

    const rechazada = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${rechazada.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await llamar('qe', 'post', `/v1/hdu/${rechazada.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Falta evidencia de datos' });

    const sinCiclo = organizacion.nuevaHdu();
    const lista = await llamar('qe', 'post', '/v1/interno/checklist/estados', { hduIds: [sinCiclo.id, aprobada.id, rechazada.id] });
    assert.equal(lista.status, 200, JSON.stringify(lista.body));
    assert.deepEqual(lista.body.items.map((item: Cuerpo) => item.hduId), [sinCiclo.id, aprobada.id, rechazada.id]);

    const [vacia, tres, observada] = lista.body.items as Cuerpo[];
    assert.equal(vacia.aprobados, 0);
    assert.equal(vacia.porcentaje, 0);
    assert.deepEqual(vacia.siguienteEntregable, { clave: 'PLAN_PRUEBAS', orden: 1, nombre: 'Plan de pruebas' });
    assert.equal(vacia.certificado, null);
    assert.equal(vacia.ultimaActividad, null);
    assert.deepEqual([vacia.porAprobar, vacia.observaciones, vacia.listaParaCertificar, vacia.listaParaCerrar], [0, 0, false, false]);

    assert.equal(tres.aprobados, 3);
    assert.equal(tres.porcentaje, 30);
    assert.equal(tres.porAprobar, 1);
    assert.equal(tres.siguienteEntregable.orden, 4);
    assert.ok(Date.parse(tres.porAprobarDesde) > 0);
    assert.ok(Date.parse(tres.ultimaActividad) > 0);
    assert.equal(tres.observaciones, 0);

    assert.equal(observada.observaciones, 1, 'entregable PENDIENTE cuyo último evento es RECHAZAR');
    assert.equal(observada.porAprobar, 0);
    assert.equal(observada.aprobados, 0);
  });

  it('una observación deja de contar cuando el analista vuelve a marcar el entregable', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Corrige el enlace' });
    const antes = await llamar('qe', 'post', '/v1/interno/checklist/estados', { hduIds: [hdu.id] });
    assert.equal(antes.body.items[0].observaciones, 1);
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    const despues = await llamar('qe', 'post', '/v1/interno/checklist/estados', { hduIds: [hdu.id] });
    assert.deepEqual([despues.body.items[0].observaciones, despues.body.items[0].porAprobar], [0, 1]);
  });

  it('lista para certificar (1 a 8 aprobados y el 9 no) y lista para cerrar (10 aprobados), con la fecha desde que lo están', async () => {
    const lista = organizacion.nuevaHdu();
    for (const clave of CLAVES_ENTREGABLE.slice(0, 8)) await marcarYAprobar(lista.id, clave);
    const certificada = await hduCertificada(true);
    const cerca = organizacion.nuevaHdu();
    for (const clave of CLAVES_ENTREGABLE.slice(0, 7)) await marcarYAprobar(cerca.id, clave);

    const respuesta = await llamar('qe', 'post', '/v1/interno/checklist/estados', { hduIds: [lista.id, certificada.hdu.id, cerca.id] });
    const [paraCertificar, paraCerrar, casi] = respuesta.body.items as Cuerpo[];
    assert.deepEqual([paraCertificar.aprobados, paraCertificar.listaParaCertificar, paraCertificar.listaParaCerrar], [8, true, false]);
    assert.ok(Date.parse(paraCertificar.listaDesde) > 0);
    assert.equal(paraCertificar.siguienteEntregable.clave, 'CERTIFICADO');
    assert.deepEqual([paraCerrar.aprobados, paraCerrar.listaParaCertificar, paraCerrar.listaParaCerrar], [10, false, true]);
    assert.equal(paraCerrar.siguienteEntregable, null);
    assert.equal(paraCerrar.certificado.folio, certificada.folio);
    assert.ok(Date.parse(paraCerrar.listaDesde) > 0);
    assert.deepEqual([casi.aprobados, casi.listaParaCertificar, casi.listaParaCerrar, casi.listaDesde], [7, false, false, null]);
  });

  it('autoriza por sí mismo con el ámbito de Organización: un id ajeno da 403 completo; el Auditor y el Líder leen las suyas', async () => {
    const propia = organizacion.nuevaHdu({ deLider: true });
    const ajena = organizacion.nuevaHdu({ deLider: false, analistaId: '0a000000-0000-4000-8000-000000000005' });

    const mezcla = await llamar('analista', 'post', '/v1/interno/checklist/estados', { hduIds: [propia.id, ajena.id] });
    assert.equal(mezcla.status, 403);
    assert.equal(mezcla.body.codigo, 'ACCESO_DENEGADO');
    assert.equal('items' in mezcla.body, false, 'sin datos parciales');
    assert.equal((await llamar('analista', 'post', '/v1/interno/checklist/estados', { hduIds: [propia.id] })).status, 200);
    assert.equal((await llamar('lider', 'post', '/v1/interno/checklist/estados', { hduIds: [propia.id] })).status, 200);
    assert.equal((await llamar('lider', 'post', '/v1/interno/checklist/estados', { hduIds: [propia.id, ajena.id] })).status, 403);
    assert.equal((await llamar('auditor', 'post', '/v1/interno/checklist/estados', { hduIds: [propia.id, ajena.id] })).status, 200);
    assert.equal((await llamar('admin', 'post', '/v1/interno/checklist/estados', { hduIds: [propia.id, ajena.id] })).status, 200);
  });

  it('valida el cuerpo: 1 a 1000 UUID únicos y ningún campo extra', async () => {
    for (const cuerpo of [{}, { hduIds: [] }, { hduIds: ['no-uuid'] }, { hduIds: [123] }, { hduIds: ['7c9e6679-7425-40de-944b-e07fc1f90ae7', '7C9E6679-7425-40DE-944B-E07FC1F90AE7'] }, { hduIds: ['7c9e6679-7425-40de-944b-e07fc1f90ae7'], otro: 1 }]) {
      const respuesta = await llamar('admin', 'post', '/v1/interno/checklist/estados', cuerpo);
      assert.equal(respuesta.status, 400, JSON.stringify(cuerpo));
      assert.equal(respuesta.body.codigo, 'VALIDACION');
    }
    const muchos = Array.from({ length: 1001 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    assert.equal((await llamar('admin', 'post', '/v1/interno/checklist/estados', { hduIds: muchos })).status, 400);
  });

  it('sin token 401; Organización caída 503, nunca datos sin autorizar', async () => {
    assert.equal((await request(app.getHttpServer()).post('/v1/interno/checklist/estados').send({ hduIds: ['7c9e6679-7425-40de-944b-e07fc1f90ae7'] })).status, 401);
    const apagada = await iniciarOrganizacionFalsa();
    const hdu = apagada.nuevaHdu();
    const aislada = await crearAppDePrueba(apagada.url, new AlmacenEnMemoria());
    const token = await tokenDe('qe');
    await apagada.cerrar();
    const respuesta = await request(aislada.getHttpServer()).post('/v1/interno/checklist/estados').set('authorization', `Bearer ${token}`).send({ hduIds: [hdu.id] });
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    await aislada.close();
  });
});

describe('Consultas del Auditor [E7-B04#1]', () => {
  it('[E7-B04-T01] la bitácora de una HDU trae sus eventos, el más reciente primero, con la HDU y el entregable', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Falta evidencia de datos' });
    const respuesta = await llamar('auditor', 'get', `/v1/auditor/bitacora?hduId=${hdu.id}`);
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    assert.equal(respuesta.body.total, 2);
    assert.deepEqual(respuesta.body.items.map((e: Cuerpo) => e.accion), ['RECHAZAR', 'MARCAR']);
    const [primero] = respuesta.body.items as Cuerpo[];
    assert.deepEqual(primero.hdu, { id: hdu.id, codigo: hdu.codigo, titulo: hdu.titulo, estado: hdu.estado });
    assert.deepEqual([primero.clave, primero.nombreEntregable], ['PLAN_PRUEBAS', 'Plan de pruebas']);
    assert.deepEqual([primero.actor.nombre, primero.actor.rol], ['Carla QE', 'QE']);
    assert.equal(primero.motivo, 'Falta evidencia de datos');
    assert.deepEqual([respuesta.body.pagina, respuesta.body.tamanoPagina], [1, 25]);
  });

  it('[E7-B04-T02] accion=APROBAR con rango de fechas devuelve solo aprobaciones dentro del rango', async () => {
    const hdu = organizacion.nuevaHdu();
    await marcarYAprobar(hdu.id, 'PLAN_PRUEBAS');
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/DASHBOARD/marcar`, enlace);
    const fin = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    const respuesta = await llamar('auditor', 'get', `/v1/auditor/bitacora?hduId=${hdu.id}&accion=APROBAR&desde=${desde()}&hasta=${fin}`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body.items.map((e: Cuerpo) => [e.accion, e.clave]), [['APROBAR', 'PLAN_PRUEBAS']]);
    const porActor = await llamar('auditor', 'get', `/v1/auditor/bitacora?hduId=${hdu.id}&actorId=0a000000-0000-4000-8000-000000000004`);
    assert.deepEqual(porActor.body.items.map((e: Cuerpo) => e.accion).sort(), ['MARCAR', 'MARCAR']);
  });

  it('[E7-B04-T05] un filtro sin coincidencias responde 200 con lista vacía y total 0', async () => {
    const respuesta = await llamar('auditor', 'get', '/v1/auditor/bitacora?hduId=7c9e6679-7425-40de-944b-e07fc1f90ae7');
    assert.equal(respuesta.status, 200);
    assert.deepEqual([respuesta.body.items, respuesta.body.total], [[], 0]);
    const certificados = await llamar('auditor', 'get', '/v1/auditor/certificados?q=NO-EXISTE-ESTE-FOLIO');
    assert.deepEqual([certificados.body.items, certificados.body.total], [[], 0]);
  });

  it('valida los parámetros: fechas ISO, rango, UUID, acción, q y parámetros ajenos dan 400; el tamaño mayor a 100 se recorta', async () => {
    for (const consulta of ['desde=ayer', `desde=${encodeURIComponent('2026-10-02T00:00:00Z')}&hasta=${encodeURIComponent('2026-10-01T00:00:00Z')}`, 'hduId=x', 'accion=BORRAR', 'pagina=0', 'tamanoPagina=abc', 'ordenar=fecha', 'accion=MARCAR&accion=APROBAR']) {
      const respuesta = await llamar('auditor', 'get', `/v1/auditor/bitacora?${consulta}`);
      assert.equal(respuesta.status, 400, consulta);
      assert.equal(respuesta.body.codigo, 'VALIDACION');
    }
    assert.equal((await llamar('auditor', 'get', '/v1/auditor/certificados?q=a')).status, 400);
    assert.equal((await llamar('auditor', 'get', '/v1/auditor/certificados?hduId=x')).status, 400);
    const grande = await llamar('auditor', 'get', '/v1/auditor/bitacora?tamanoPagina=1000');
    assert.equal(grande.status, 200);
    assert.equal(grande.body.tamanoPagina, 100);
  });

  it('[E7-B04-T03] los certificados traen folio, HDU, fecha, QE emisor, huella y validez, igual que la verificación pública (D45)', async () => {
    const { hdu, folio } = await hduCertificada();
    const respuesta = await llamar('auditor', 'get', `/v1/auditor/certificados?q=${folio}`);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.total, 1);
    const [item] = respuesta.body.items as Cuerpo[];
    assert.equal(item.folio, folio);
    assert.deepEqual(item.hdu, { id: hdu.id, codigo: hdu.codigo, titulo: hdu.titulo });
    assert.deepEqual(item.emitidoPor, { id: '0a000000-0000-4000-8000-000000000002', nombre: 'Carla QE' });
    assert.match(item.huellaSha256, /^[0-9a-f]{64}$/);
    assert.ok(Date.parse(item.emitidoEn) > 0);
    const publica = await request(app.getHttpServer()).get(`/v1/certificados/${folio}/verificacion`);
    assert.equal(item.valido, publica.body.valido);
    assert.equal(item.valido, true);
    assert.equal(item.huellaSha256, publica.body.huellaSha256);
    const reciente = await llamar('auditor', 'get', `/v1/auditor/certificados?desde=${desde()}&emitidoPorId=0a000000-0000-4000-8000-000000000002`);
    const fechas = reciente.body.items.map((c: Cuerpo) => Date.parse(c.emitidoEn));
    assert.deepEqual([...fechas].sort((a, b) => b - a), fechas, 'del más reciente al más antiguo');
  });

  it('[E7-B04-T07] ADM1, QE1, ANA1 y LID1 reciben 403 en los endpoints de Certificaciones (consultas, exportaciones y resumen)', async () => {
    const rutas = ['/v1/auditor/bitacora', '/v1/auditor/certificados', '/v1/auditor/exportaciones/bitacora', '/v1/auditor/exportaciones/certificados', '/v1/interno/resumen-auditoria'];
    for (const persona of ['admin', 'qe', 'analista', 'lider'] as const) {
      for (const ruta of rutas) {
        const respuesta = await llamar(persona, 'get', ruta);
        assert.equal(respuesta.status, 403, `${ruta} como ${persona}`);
        assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
      }
    }
    assert.equal(organizacion.exportaciones.length, 0, 'ningún intento negado se registra');
  });

  it('[E7-B04-T08] sin token: 401 NO_AUTENTICADO', async () => {
    for (const ruta of ['/v1/auditor/bitacora', '/v1/auditor/certificados', '/v1/auditor/exportaciones/bitacora', '/v1/interno/resumen-auditoria']) {
      const respuesta = await request(app.getHttpServer()).get(ruta);
      assert.equal(respuesta.status, 401, ruta);
      assert.equal(respuesta.body.codigo, 'NO_AUTENTICADO');
    }
  });

  it('[E7-B03#1] el resumen del Auditor cuenta certificados y eventos de los últimos 7 días', async () => {
    await hduCertificada();
    const respuesta = await llamar('auditor', 'get', '/v1/interno/resumen-auditoria');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(Object.keys(respuesta.body).sort(), ['certificados', 'eventosUltimos7Dias']);
    assert.ok(respuesta.body.certificados >= 1);
    assert.ok(respuesta.body.eventosUltimos7Dias >= 9);
  });

  it('[E7-B04-T12] la bitácora responde 503 SERVICIO_NO_DISPONIBLE si Organización no responde, en vez de eventos sin su HDU', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    organizacion.fallarConsulta = true;
    try {
      const respuesta = await llamar('auditor', 'get', `/v1/auditor/bitacora?hduId=${hdu.id}`);
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.equal((await llamar('auditor', 'get', '/v1/auditor/certificados')).status, 200, 'los certificados guardan su HDU y no dependen de Organización');
    } finally {
      organizacion.fallarConsulta = false;
    }
  });
});

describe('HDU que Organización no conoce en la bitácora global [DEF-02, D55]', () => {
  it('la página con eventos de una HDU desconocida responde 200: esa HDU sale como «no disponible» y las demás conservan sus datos', async () => {
    const conocida = organizacion.nuevaHdu();
    const huerfana = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${conocida.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await llamar('analista', 'post', `/v1/hdu/${huerfana.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    organizacion.olvidarHdu(huerfana.id);

    const respuesta = await llamar('auditor', 'get', `/v1/auditor/bitacora?desde=${desde()}&tamanoPagina=100`);
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    const deHuerfana = (respuesta.body.items as Cuerpo[]).filter((e) => e.hdu.id === huerfana.id);
    assert.equal(deHuerfana.length, 1);
    assert.deepEqual(deHuerfana[0].hdu, { id: huerfana.id, codigo: '(HDU no disponible)', titulo: 'HDU no disponible en Organización', estado: 'PENDIENTE' });
    const deConocida = (respuesta.body.items as Cuerpo[]).find((e) => e.hdu.id === conocida.id);
    assert.equal(deConocida.hdu.codigo, conocida.codigo);
  });

  it('la exportación también funciona: la fila de la HDU desconocida lleva su id y «HDU no disponible»', async () => {
    const huerfana = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${huerfana.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    organizacion.olvidarHdu(huerfana.id);
    const respuesta = await pedirCsv(`/v1/auditor/exportaciones/bitacora?hduId=${huerfana.id}`, 'auditor');
    const lineas = (respuesta.body as unknown as string).replace(BOM, '').split('\r\n').filter((linea) => linea.length > 0);
    assert.equal(lineas.length, 2);
    assert.ok(lineas[1]?.includes(`;(HDU no disponible: ${huerfana.id});HDU no disponible en Organización;`), lineas[1]);
  });
});

describe('Exportación del Auditor [E7-B04#3, D48]', () => {
  it('[E7-B04-T09] exporta la bitácora filtrada: BOM, separador ;, una fila por evento y registro previo en Organización', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Falta evidencia; revisar "datos"' });
    const antes = organizacion.exportaciones.length;

    const respuesta = await pedirCsv(`/v1/auditor/exportaciones/bitacora?hduId=${hdu.id}`, 'auditor');
    assert.match(respuesta.headers['content-type'] ?? '', /^text\/csv; charset=utf-8/);
    assert.match(respuesta.headers['content-disposition'] ?? '', /^attachment; filename="quality360-bitacora-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(respuesta.headers['x-q360-filas'], '2');
    const texto = respuesta.body as unknown as string;
    assert.ok(texto.startsWith(BOM));
    const lineas = texto.replace(BOM, '').split('\r\n').filter((linea) => linea.length > 0);
    assert.equal(lineas[0], 'Fecha;HDU;Título;Entregable;Acción;Actor;Rol;Valor anterior;Valor nuevo;Motivo');
    assert.equal(lineas.length, 3);
    assert.ok(lineas[1]?.includes(`;${hdu.codigo};`) && lineas[1].includes(';RECHAZAR;Carla QE;QE;'));
    assert.ok(lineas[1]?.includes('"Falta evidencia; revisar ""datos"""'), 'entrecomilla separadores y comillas');
    assert.match(lineas[1]?.split(';')[0] ?? '', /^\d{4}-\d{2}-\d{2}T.*Z$/);

    assert.equal(organizacion.exportaciones.length, antes + 1);
    const registrada = organizacion.exportaciones.at(-1);
    assert.deepEqual(registrada, { recurso: 'BITACORA', filtros: { hduId: hdu.id }, filas: 2, sub: '0a000000-0000-4000-8000-000000000007' });
  });

  it('exporta los certificados con los mismos filtros y columnas; sin coincidencias, solo el encabezado', async () => {
    const { hdu, folio } = await hduCertificada();
    const respuesta = await pedirCsv(`/v1/auditor/exportaciones/certificados?q=${folio}`, 'auditor');
    const lineas = (respuesta.body as unknown as string).replace(BOM, '').split('\r\n').filter((linea) => linea.length > 0);
    assert.equal(lineas[0], 'Folio;HDU;Título;Fecha de emisión;QE emisor;Huella SHA-256;Válido');
    assert.equal(lineas.length, 2);
    assert.ok(lineas[1]?.startsWith(`${folio};${hdu.codigo};`) && lineas[1].endsWith(';Sí'));
    assert.equal(organizacion.exportaciones.at(-1)?.recurso, 'CERTIFICADOS');

    const vacia = await pedirCsv('/v1/auditor/exportaciones/certificados?q=NO-EXISTE-ESTE-FOLIO', 'auditor');
    assert.equal(vacia.headers['x-q360-filas'], '0');
    assert.equal((vacia.body as unknown as string).replace(BOM, '').split('\r\n').filter((l) => l.length > 0).length, 1);
  });

  it('[E7-B04-T11] con el límite reducido a 2 filas, exportar más da 422 EXPORTACION_EXCEDE_LIMITE y no se registra', async () => {
    const hdu = organizacion.nuevaHdu();
    await marcarYAprobar(hdu.id, 'PLAN_PRUEBAS');
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/DASHBOARD/marcar`, enlace);
    const limitada = await crearApp(
      { ...configuracionPrueba(organizacion.url), exportacionLimiteFilas: 2 },
      { registro: false, almacen: { provide: ALMACEN_ARCHIVOS, useValue: almacen } },
    );
    try {
      const antes = organizacion.exportaciones.length;
      const token = await tokenDe('auditor');
      const respuesta = await request(limitada.getHttpServer()).get(`/v1/auditor/exportaciones/bitacora?hduId=${hdu.id}`).set('authorization', `Bearer ${token}`);
      assert.equal(respuesta.status, 422);
      assert.equal(respuesta.body.codigo, 'EXPORTACION_EXCEDE_LIMITE');
      assert.match(respuesta.body.mensaje, /Acota los filtros/);
      assert.equal(organizacion.exportaciones.length, antes);
      const certificados = await request(limitada.getHttpServer()).get(`/v1/auditor/exportaciones/certificados?desde=${desde()}`).set('authorization', `Bearer ${token}`);
      assert.equal(certificados.status, 422, 'hay más de 2 certificados desde el inicio de la prueba');
    } finally {
      await limitada.close();
    }
  });

  it('si Organización no registra la exportación, 503 y no se entrega el archivo', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    organizacion.fallarRegistro = true;
    try {
      const antes = organizacion.exportaciones.length;
      const respuesta = await llamar('auditor', 'get', `/v1/auditor/exportaciones/bitacora?hduId=${hdu.id}`);
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.equal(respuesta.headers['content-type']?.includes('text/csv'), false);
      assert.equal(organizacion.exportaciones.length, antes);
    } finally {
      organizacion.fallarRegistro = false;
    }
  });
});
