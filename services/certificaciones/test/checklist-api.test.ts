/**
 * API del checklist contra Postgres local (esquema `certificaciones`) con
 * Organización y Storage simulados. Cada prueba usa HDU nuevas: no hace falta limpiar.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { CLAVES_ENTREGABLE, type ClaveEntregable } from '../src/dominio/entregables.js';
import { AlmacenEnMemoria, iniciarOrganizacionFalsa, tokenDe, type ClavePersona, type OrganizacionFalsa } from './ayudas.js';
import { crearAppDePrueba } from './ayudas-app.js';

let organizacion: OrganizacionFalsa;
let almacen: AlmacenEnMemoria;
let app: NestExpressApplication;

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

const enlace = { evidencia: { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/browse/PAG-1' } };

async function marcarYAprobar(hduId: string, clave: ClaveEntregable): Promise<void> {
  const marca = await llamar('analista', 'post', `/v1/hdu/${hduId}/entregables/${clave}/marcar`, enlace);
  assert.equal(marca.status, 200, JSON.stringify(marca.body));
  const aprobacion = await llamar('qe', 'post', `/v1/hdu/${hduId}/entregables/${clave}/aprobar`);
  assert.equal(aprobacion.status, 200, JSON.stringify(aprobacion.body));
}

describe('GET /v1/hdu/{hduId}/entregables [E3-F01]', () => {
  it('[E3-F01#1] muestra los 10 entregables en orden con estado, responsable y fecha', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    const respuesta = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(
      respuesta.body.entregables.map((e: { clave: string }) => e.clave),
      [...CLAVES_ENTREGABLE],
    );
    const primero = respuesta.body.entregables[0];
    assert.equal(primero.estado, 'POR_APROBAR');
    assert.equal(primero.completado.nombre, 'Ana Analista');
    assert.ok(Date.parse(primero.completado.fecha) > 0);
    assert.equal(respuesta.body.entregables[1].estado, 'PENDIENTE');
  });

  it('[E3-F01#2] calcula el porcentaje sobre los aprobados', async () => {
    const hdu = organizacion.nuevaHdu();
    await marcarYAprobar(hdu.id, 'PLAN_PRUEBAS');
    await marcarYAprobar(hdu.id, 'DASHBOARD');
    const respuesta = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(respuesta.body.resumen.completados, 2);
    assert.equal(respuesta.body.resumen.porcentajeCumplimiento, 20);
    const resumen = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/checklist`);
    assert.deepEqual(resumen.body, { hduId: hdu.id, totalEntregables: 10, completados: 2, porcentajeCumplimiento: 20, completo: false });
  });

  it('[E3-F01#3] permisos: solo el analista asignado marca; admin y QE sin relación de análisis no', async () => {
    const hdu = organizacion.nuevaHdu();
    const analista = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    const admin = await llamar('admin', 'get', `/v1/hdu/${hdu.id}/entregables`);
    const qe = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.deepEqual(analista.body.permisos, { puedeMarcar: true, puedeAprobar: false, puedeGenerarCertificado: false });
    assert.deepEqual(admin.body.permisos, { puedeMarcar: false, puedeAprobar: false, puedeGenerarCertificado: false });
    assert.equal(qe.body.permisos.puedeMarcar, false);
    assert.equal(qe.body.permisos.puedeAprobar, true);
  });

  it('fuera de ámbito o HDU inexistente: 403 ACCESO_DENEGADO (D12)', async () => {
    const hdu = organizacion.nuevaHdu();
    const ajeno = await llamar('otroAnalista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(ajeno.status, 403);
    assert.equal(ajeno.body.codigo, 'ACCESO_DENEGADO');
    const inexistente = await llamar('admin', 'get', '/v1/hdu/7c9e6679-7425-40de-944b-e07fc1f90ae7/entregables');
    assert.equal(inexistente.status, 403);
  });
});

describe('Marcar y desmarcar [E3-F02] [E3-B01] [E3-B02#1]', () => {
  it('[E3-F02#1] [E3-B01#1] marcar con enlace guarda evidencia, analista y fecha', async () => {
    const hdu = organizacion.nuevaHdu();
    const respuesta = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.estado, 'POR_APROBAR');
    assert.deepEqual(respuesta.body.evidencia, { tipo: 'ENLACE', url: 'https://jira.ejemplo.cl/browse/PAG-1' });
    assert.equal(respuesta.body.completado.id, '0a000000-0000-4000-8000-000000000004');
  });

  it('[E3-F02#1] marcar con archivo: pide URL de subida, sube y marca', async () => {
    const hdu = organizacion.nuevaHdu();
    const subida = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/evidencias`, {
      nombreArchivo: 'Plan de pruebas v1.pdf',
      tipoContenido: 'application/pdf',
      tamanoBytes: 2048,
    });
    assert.equal(subida.status, 201, JSON.stringify(subida.body));
    assert.ok(subida.body.ruta.startsWith(`${hdu.id}/PLAN_PRUEBAS/`));
    almacen.simularSubida('evidencias', subida.body.ruta, 2048, 'application/pdf');

    const marca = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      evidencia: { tipo: 'ARCHIVO', ruta: subida.body.ruta },
    });
    assert.equal(marca.status, 200, JSON.stringify(marca.body));
    assert.deepEqual(marca.body.evidencia, { tipo: 'ARCHIVO', nombre: 'Plan-de-pruebas-v1.pdf', tipoContenido: 'application/pdf', tamanoBytes: 2048 });

    const descarga = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/evidencia`);
    assert.equal(descarga.status, 200);
    assert.match(descarga.body.url, /firmada=1/);
  });

  it('evidencia inválida: tipo no permitido, archivo no subido o ruta ajena → 422', async () => {
    const hdu = organizacion.nuevaHdu();
    const tipo = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/evidencias`, {
      nombreArchivo: 'script.exe',
      tipoContenido: 'application/x-msdownload',
      tamanoBytes: 10,
    });
    assert.equal(tipo.status, 422);
    assert.equal(tipo.body.codigo, 'EVIDENCIA_INVALIDA');
    const sinSubir = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      evidencia: { tipo: 'ARCHIVO', ruta: `${hdu.id}/PLAN_PRUEBAS/no-existe.pdf` },
    });
    assert.equal(sinSubir.status, 422);
    const ajena = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      evidencia: { tipo: 'ARCHIVO', ruta: 'otra-hdu/PLAN_PRUEBAS/archivo.pdf' },
    });
    assert.equal(ajena.status, 422);
    const http = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      evidencia: { tipo: 'ENLACE', url: 'http://inseguro.cl' },
    });
    assert.equal(http.status, 400);
  });

  it('[E3-F02#2] [E3-B02#1] orden libre (D130): marca un entregable con los anteriores pendientes', async () => {
    const hdu = organizacion.nuevaHdu();
    const respuesta = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/EJECUCION/marcar`, enlace);
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    assert.equal(respuesta.body.estado, 'POR_APROBAR');
    const vista = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(vista.body.entregables[0].estado, 'PENDIENTE');
  });

  it('[E3-B01#2] un registro por clave y HDU: marcar dos veces → 409 ENTREGABLE_YA_REGISTRADO', async () => {
    const hdu = organizacion.nuevaHdu();
    const ruta = `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`;
    const [a, b] = await Promise.all([llamar('analista', 'post', ruta, enlace), llamar('analista', 'post', ruta, enlace)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const tercera = await llamar('analista', 'post', ruta, enlace);
    assert.equal(tercera.status, 409);
    assert.equal(tercera.body.codigo, 'ENTREGABLE_YA_REGISTRADO');
  });

  it('[E3-B01#3] sin rol autorizado: QE, admin u otro analista no marcan (403)', async () => {
    const hdu = organizacion.nuevaHdu();
    const ruta = `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`;
    assert.equal((await llamar('qe', 'post', ruta, enlace)).status, 403);
    assert.equal((await llamar('admin', 'post', ruta, enlace)).status, 403);
    assert.equal((await llamar('otroAnalista', 'post', ruta, enlace)).status, 403);
  });

  it('[E3-F02#3] [E3-B04#2] desmarcar exige motivo y lo registra en la bitácora', async () => {
    const hdu = organizacion.nuevaHdu();
    await marcarYAprobar(hdu.id, 'PLAN_PRUEBAS');
    const sinMotivo = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/desmarcar`, { motivo: '  ' });
    assert.equal(sinMotivo.status, 422);
    assert.equal(sinMotivo.body.codigo, 'MOTIVO_REQUERIDO');
    const respuesta = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/desmarcar`, {
      motivo: 'El plan cambió tras la reunión con negocio',
    });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.estado, 'PENDIENTE');
    const bitacora = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables/bitacora`);
    const evento = bitacora.body.eventos[0];
    assert.equal(evento.accion, 'DESMARCAR');
    assert.equal(evento.motivo, 'El plan cambió tras la reunión con negocio');
    assert.equal(evento.valorAnterior.estado, 'APROBADO');
    assert.equal(evento.valorNuevo.estado, 'PENDIENTE');
  });
});

describe('Aprobación del QE [E3-F03] [E3-B02#2]', () => {
  it('[E3-F03#1] aprobar deja nombre y fecha del QE', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    const respuesta = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/aprobar`);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.estado, 'APROBADO');
    assert.equal(respuesta.body.aprobado.nombre, 'Carla QE');
    assert.ok(Date.parse(respuesta.body.aprobado.fecha) > 0);
  });

  it('[E3-B02#2] el analista u otro QE no aprueban (403)', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    assert.equal((await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/aprobar`)).status, 403);
    assert.equal((await llamar('otroQe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/aprobar`)).status, 403);
  });

  it('[E3-F03#2] rechazar con comentario vuelve a pendiente con la observación visible', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    const sinComentario = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, {});
    assert.equal(sinComentario.status, 422);
    const respuesta = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Falta el alcance' });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.estado, 'PENDIENTE');
    assert.equal(respuesta.body.evidencia, null);
    const vista = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(vista.body.entregables[0].observacion.comentario, 'Falta el alcance');
    assert.equal(vista.body.entregables[0].observacion.autor.nombre, 'Carla QE');
  });

  it('[E3-F03#3] bandeja: por aprobar de sus HDU, agrupados por HDU', async () => {
    const primera = organizacion.nuevaHdu();
    const segunda = organizacion.nuevaHdu();
    const ajena = organizacion.nuevaHdu({ qeResponsableId: '0a000000-0000-4000-8000-000000000003' });
    await llamar('analista', 'post', `/v1/hdu/${primera.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await marcarYAprobar(segunda.id, 'PLAN_PRUEBAS');
    await llamar('analista', 'post', `/v1/hdu/${segunda.id}/entregables/DASHBOARD/marcar`, enlace);
    await llamar('analista', 'post', `/v1/hdu/${ajena.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);

    const respuesta = await llamar('qe', 'get', '/v1/qe/aprobaciones-pendientes');
    assert.equal(respuesta.status, 200);
    const grupos = respuesta.body.grupos.filter((g: { hdu: { id: string } }) => [primera.id, segunda.id, ajena.id].includes(g.hdu.id));
    assert.deepEqual(grupos.map((g: { hdu: { id: string } }) => g.hdu.id).sort(), [primera.id, segunda.id].sort());
    const deSegunda = grupos.find((g: { hdu: { id: string } }) => g.hdu.id === segunda.id);
    assert.deepEqual(deSegunda.entregables.map((e: { clave: string }) => e.clave), ['DASHBOARD']);
    assert.equal((await llamar('analista', 'get', '/v1/qe/aprobaciones-pendientes')).status, 403);
  });
});

describe('Certificado [E3-F04] [E3-B03] [E3-B04]', () => {
  it('[E3-F04#2] [E3-B03#3] con entregables faltantes: deshabilitado con motivo y 409 con el faltante', async () => {
    const hdu = organizacion.nuevaHdu();
    for (const clave of CLAVES_ENTREGABLE.slice(0, 7)) await marcarYAprobar(hdu.id, clave);
    const vista = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(vista.body.certificacion.habilitada, false);
    assert.deepEqual(vista.body.certificacion.faltantes, ['APROBACION_UAT']);
    const respuesta = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/certificado`);
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'ENTREGABLES_PENDIENTES');
    assert.deepEqual(respuesta.body.detalles.map((d: { campo: string }) => d.campo), ['APROBACION_UAT']);
  });

  it('[E3-F04#1] [E3-B03#1] [E3-B03#2] [E3-F04#3] genera PDF con folio, lo verifica y lo vuelve a descargar', async () => {
    const hdu = organizacion.nuevaHdu();
    for (const clave of CLAVES_ENTREGABLE.slice(0, 8)) await marcarYAprobar(hdu.id, clave);

    assert.equal((await llamar('analista', 'post', `/v1/hdu/${hdu.id}/certificado`)).status, 403);
    const generado = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/certificado`);
    assert.equal(generado.status, 201, JSON.stringify(generado.body));
    const folio: string = generado.body.certificado.folio;
    assert.match(folio, /^Q360-\d{4}-[A-Z2-7]{8}$/);

    const pdf = almacen.archivos.get(`certificados/${hdu.id}/${folio}.pdf`);
    assert.ok(pdf !== undefined);
    assert.equal(Buffer.from(pdf.contenido.slice(0, 5)).toString('latin1'), '%PDF-');
    assert.equal(createHash('sha256').update(pdf.contenido).digest('hex'), generado.body.certificado.huellaSha256);

    const vista = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    const noveno = vista.body.entregables[8];
    assert.equal(noveno.estado, 'APROBADO');
    assert.deepEqual(noveno.evidencia, { tipo: 'CERTIFICADO', folio });
    assert.equal(vista.body.certificado.folio, folio);

    const verificacion = await request(app.getHttpServer()).get(`/v1/certificados/${folio}/verificacion`);
    assert.equal(verificacion.status, 200);
    assert.equal(verificacion.body.valido, true);
    assert.equal(verificacion.body.hdu.codigo, hdu.codigo);
    assert.equal(verificacion.body.emitidoPor, 'Carla QE');
    assert.equal((await request(app.getHttpServer()).get('/v1/certificados/Q360-2026-AAAAAAAA/verificacion')).status, 404);

    const otra = await llamar('qe', 'post', `/v1/hdu/${hdu.id}/certificado`);
    assert.equal(otra.status, 409);
    assert.equal(otra.body.codigo, 'CERTIFICADO_EXISTENTE');
    const descarga = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/certificado`);
    assert.equal(descarga.status, 200);
    assert.equal(descarga.body.certificado.folio, folio);

    await marcarYAprobar(hdu.id, 'CIERRE_PRUEBAS');
    const resumen = await llamar('qe', 'get', `/v1/hdu/${hdu.id}/checklist`);
    assert.equal(resumen.body.completo, true);
    assert.equal(resumen.body.porcentajeCumplimiento, 100);
  });

  it('[E3-B04#1] [E3-B04#3] la bitácora registra actor, fecha, valor anterior y nuevo de cada acción', async () => {
    const hdu = organizacion.nuevaHdu();
    await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    await llamar('qe', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/rechazar`, { comentario: 'Incompleto' });
    await marcarYAprobar(hdu.id, 'PLAN_PRUEBAS');
    const respuesta = await llamar('admin', 'get', `/v1/hdu/${hdu.id}/entregables/bitacora`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(
      respuesta.body.eventos.map((e: { accion: string }) => e.accion),
      ['APROBAR', 'MARCAR', 'RECHAZAR', 'MARCAR'],
    );
    const aprobar = respuesta.body.eventos[0];
    assert.equal(aprobar.actor.nombre, 'Carla QE');
    assert.equal(aprobar.actor.rol, 'QE');
    assert.equal(aprobar.valorAnterior.estado, 'POR_APROBAR');
    assert.equal(aprobar.valorNuevo.estado, 'APROBADO');
    assert.equal(respuesta.body.eventos[2].motivo, 'Incompleto');
    assert.equal((await llamar('otroAnalista', 'get', `/v1/hdu/${hdu.id}/entregables/bitacora`)).status, 403);
  });

  it('[D22] una HDU cerrada no admite cambios en su checklist', async () => {
    const hdu = organizacion.nuevaHdu({ estado: 'CERRADA' });
    const respuesta = await llamar('analista', 'post', `/v1/hdu/${hdu.id}/entregables/PLAN_PRUEBAS/marcar`, enlace);
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.body.codigo, 'HDU_CERRADA');
    const vista = await llamar('analista', 'get', `/v1/hdu/${hdu.id}/entregables`);
    assert.equal(vista.body.permisos.puedeMarcar, false);
  });
});
