/**
 * Integración E6-B05 · cierre con excepción (D173–D175, D189) contra Postgres y Supabase Auth locales.
 * Certificaciones e Impedimentos son falsos (aprobados e impedimentos por HDU); la verificación contra
 * los servicios reales es la regresión de `q360-qa`. Los casos de la HDU están nombrados con su ID.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion } from '../../src/configuracion.js';
import { crearApp } from '../../src/crear-app.js';
import { autorizacion, crearCelulaDePrueba, crearSprintDePrueba, crearUsuarioDePrueba, limpiarBaseDeDatos, prisma, type UsuarioDePrueba } from '../ayudas.js';
import { CertificacionesCierreFalsa, CLAVES_ENTREGABLE } from '../certificaciones-cierre-falsa.js';
import { ImpedimentosFalsa } from '../impedimentos-falsa.js';
import '../entorno.js';

const JUSTIFICACION = 'Se cierra por decisión del QE: el UAT no aplica a este alcance.'; // > 20
let app: NestExpressApplication;
const certificaciones = new CertificacionesCierreFalsa();
const impedimentos = new ImpedimentosFalsa();
let admin: UsuarioDePrueba;
let qe1: UsuarioDePrueba;
let qe2: UsuarioDePrueba;
let ana1: UsuarioDePrueba;
let lider: UsuarioDePrueba;
let auditor: UsuarioDePrueba;
let celula: { id: string };
let sprint: { id: string };

const http = () => request(app.getHttpServer());
const post = (hduId: string, usuario: UsuarioDePrueba, cuerpo: object) =>
  http().post(`/v1/hdu/${hduId}/estado`).set('authorization', autorizacion(usuario.token)).send(cuerpo);

/** Crea una HDU de `duenio`, con `ana1` asignada, y la lleva a PENDIENTE_CIERRE con `aprobados` entregables aprobados. */
async function hduListaParaCerrar(aprobados: number, duenio: UsuarioDePrueba = qe1): Promise<string> {
  const creada = await http()
    .post('/v1/hdu')
    .set('authorization', autorizacion(duenio.token))
    .send({ codigo: `E6-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, titulo: 'Cierre con excepción', celulaId: celula.id, sprintId: sprint.id, prioridad: 'ALTA' })
    .expect(201);
  const id = creada.body.id as string;
  await http().put(`/v1/hdu/${id}/analista`).set('authorization', autorizacion(duenio.token)).send({ analistaId: ana1.id }).expect(200);
  for (const estado of ['DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE']) await post(id, duenio, { estado }).expect(200);
  certificaciones.aprobados.set(id, aprobados);
  return id;
}

async function contarConstancias(hduId: string): Promise<number> {
  return prisma.cierreHdu.count({ where: { hduId } });
}

before(async () => {
  await limpiarBaseDeDatos();
  await certificaciones.iniciar();
  await impedimentos.iniciar();
  app = await crearApp(cargarConfiguracion({ ...process.env, CERTIFICACIONES_URL: certificaciones.url, IMPEDIMENTOS_URL: impedimentos.url }), { registro: false });
  admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin E6' });
  qe1 = await crearUsuarioDePrueba('QE', { nombre: 'QE Uno' });
  qe2 = await crearUsuarioDePrueba('QE', { nombre: 'QE Dos' });
  ana1 = await crearUsuarioDePrueba('ANALISTA_QA', { nombre: 'Ana Uno' });
  lider = await crearUsuarioDePrueba('LIDER_QA', { nombre: 'Lider E6' });
  auditor = await crearUsuarioDePrueba('AUDITOR', { nombre: 'Auditor E6' });
  celula = await crearCelulaDePrueba('Célula E6');
  sprint = await crearSprintDePrueba('Sprint E6');
  await http().put(`/v1/analistas/${ana1.id}/supervisor`).set('authorization', autorizacion(admin.token)).send({ qeId: qe1.id }).expect(200);
});

after(async () => {
  await app.close();
  await certificaciones.cerrar();
  await impedimentos.cerrar();
  await prisma.$disconnect();
});

describe('E6-B05 · cierre con excepción', () => {
  it('[E6-B05-T01] el QE responsable cierra con 1 aprobado y justificación: constancia, marca y detalle', async () => {
    const id = await hduListaParaCerrar(1);
    const respuesta = await post(id, qe1, { estado: 'CERRADA', justificacion: `  ${JUSTIFICACION}  ` });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.estadoAnterior, 'PENDIENTE_CIERRE');
    assert.equal(respuesta.body.estadoNuevo, 'CERRADA');
    assert.equal(respuesta.body.hdu.estado, 'CERRADA');
    assert.equal(respuesta.body.hdu.cierreParcial, true);
    assert.equal(respuesta.body.cierre.aprobados, 1);
    assert.deepEqual(respuesta.body.cierre.pendientes, CLAVES_ENTREGABLE.slice(1));
    assert.equal(respuesta.body.cierre.justificacion, JUSTIFICACION, 'la justificación se guarda sin espacios de los bordes');
    assert.deepEqual(respuesta.body.cierre.actor, { tipo: 'USUARIO', id: qe1.id, nombre: 'QE Uno' });
    assert.equal(respuesta.body.cierre.actorRol, 'QE');
    assert.ok(!Number.isNaN(Date.parse(respuesta.body.cierre.fecha)));

    const detalle = await http().get(`/v1/hdu/${id}`).set('authorization', autorizacion(qe1.token)).expect(200);
    assert.equal(detalle.body.cierreParcial, true);
    assert.equal(detalle.body.cierre.aprobados, 1);
    assert.equal(detalle.body.cierre.pendientes.length, 9);
    assert.equal(detalle.body.permisos.cerrarConExcepcion, false);
    assert.deepEqual(detalle.body.transicionesPermitidas, []);
  });

  it('[E6-B05-T02] sin justificación 409 CHECKLIST_INCOMPLETO con puedeCerrarConExcepcion; en blanco 422; 19 y 501 caracteres 400', async () => {
    const id = await hduListaParaCerrar(1);
    const sin = await post(id, qe1, { estado: 'CERRADA' });
    assert.equal(sin.status, 409);
    assert.equal(sin.body.codigo, 'CHECKLIST_INCOMPLETO');
    assert.equal(sin.body.puedeCerrarConExcepcion, true);
    assert.equal(sin.body.checklist.estado, 'ok');
    const nula = await post(id, qe1, { estado: 'CERRADA', justificacion: null });
    assert.equal(nula.status, 409);
    assert.equal(nula.body.codigo, 'CHECKLIST_INCOMPLETO');

    const blanco = await post(id, qe1, { estado: 'CERRADA', justificacion: '   ' });
    assert.equal(blanco.status, 422);
    assert.equal(blanco.body.codigo, 'JUSTIFICACION_REQUERIDA');
    assert.equal(blanco.body.detalles[0].campo, 'justificacion');

    for (const largo of [19, 501]) {
      const corta = await post(id, qe1, { estado: 'CERRADA', justificacion: 'x'.repeat(largo) });
      assert.equal(corta.status, 400, `largo ${largo}`);
      assert.equal(corta.body.codigo, 'VALIDACION');
      assert.equal(corta.body.detalles[0].campo, 'justificacion');
    }
    // El largo se mide después de quitar espacios: 19 letras más espacios sigue siendo corto.
    const conEspacios = await post(id, qe1, { estado: 'CERRADA', justificacion: `    ${'y'.repeat(19)}    ` });
    assert.equal(conEspacios.status, 400);
    // El tope de forma (2000) también es 400.
    assert.equal((await post(id, qe1, { estado: 'CERRADA', justificacion: 'z'.repeat(2001) })).status, 400);

    const detalle = await http().get(`/v1/hdu/${id}`).set('authorization', autorizacion(qe1.token)).expect(200);
    assert.equal(detalle.body.estado, 'PENDIENTE_CIERRE');
    assert.equal(await contarConstancias(id), 0);
  });

  it('[E6-B05-T03] los límites 20 y 500 caracteres son válidos', async () => {
    const uno = await hduListaParaCerrar(0);
    assert.equal((await post(uno, qe1, { estado: 'CERRADA', justificacion: 'a'.repeat(20) })).status, 200, 'cierra con 0 aprobados y 20 caracteres');
    const dos = await hduListaParaCerrar(5);
    const cierre = await post(dos, qe1, { estado: 'CERRADA', justificacion: 'b'.repeat(500) });
    assert.equal(cierre.status, 200);
    assert.equal(cierre.body.cierre.justificacion.length, 500);
    assert.equal(cierre.body.cierre.aprobados, 5);
  });

  it('[E6-B05-T04] solo el QE responsable cierra con excepción: 403 para QE ajeno, QE supervisor, analista, líder, administrador y auditor', async () => {
    const id = await hduListaParaCerrar(1);
    // El QE supervisor del analista deja de ser el responsable: lo es qe2 (el Administrador reasigna).
    await http().put(`/v1/hdu/${id}/qe-responsable`).set('authorization', autorizacion(admin.token)).send({ qeResponsableId: qe2.id, motivo: 'Traspaso por prueba' }).expect(200);

    const cierres = [
      ['QE supervisor (no responsable)', qe1],
      ['analista asignado', ana1],
      ['administrador', admin],
      ['líder', lider],
      ['auditor', auditor],
    ] as const;
    for (const [nombre, usuario] of cierres) {
      const respuesta = await post(id, usuario, { estado: 'CERRADA', justificacion: JUSTIFICACION });
      assert.equal(respuesta.status, 403, nombre);
      assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO', nombre);
    }
    // Y sin justificación el 409 les dice que no pueden cerrar con excepción.
    const sin = await post(id, qe1, { estado: 'CERRADA' });
    assert.equal(sin.status, 409);
    assert.equal(sin.body.puedeCerrarConExcepcion, false);
    const detalleSupervisor = await http().get(`/v1/hdu/${id}`).set('authorization', autorizacion(qe1.token)).expect(200);
    assert.equal(detalleSupervisor.body.permisos.cerrarConExcepcion, false);
    const detalleResponsable = await http().get(`/v1/hdu/${id}`).set('authorization', autorizacion(qe2.token)).expect(200);
    assert.equal(detalleResponsable.body.permisos.cerrarConExcepcion, true);
    assert.equal(await contarConstancias(id), 0);
    assert.equal((await post(id, qe2, { estado: 'CERRADA', justificacion: JUSTIFICACION })).status, 200);
  });

  it('[E6-B05-T05] un impedimento abierto bloquea el cierre parcial (409 HDU_BLOQUEADA) hasta resolverlo', async () => {
    const id = await hduListaParaCerrar(3);
    const bloqueante = impedimentos.bloquear(id, 'Ambiente caído');
    const bloqueado = await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION });
    assert.equal(bloqueado.status, 409);
    assert.equal(bloqueado.body.codigo, 'HDU_BLOQUEADA');
    assert.equal(bloqueado.body.impedimentos.items[0].id, bloqueante.id);
    assert.equal(await contarConstancias(id), 0);
    impedimentos.bloqueantes.delete(id);
    const ok = await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.cierre.aprobados, 3);
  });

  it('[E6-B05-T06] orden de validación: transición, checklist, justificación, impedimentos', async () => {
    // (a) EN_EJECUCION con justificación válida: TRANSICION_INVALIDA antes de mirar la justificación.
    const creada = await http()
      .post('/v1/hdu')
      .set('authorization', autorizacion(qe1.token))
      .send({ codigo: `E6-A-${Date.now()}`, titulo: 'Orden', celulaId: celula.id, sprintId: sprint.id, prioridad: 'BAJA' })
      .expect(201);
    await post(creada.body.id, qe1, { estado: 'DISENO_PRUEBAS' }).expect(200);
    await post(creada.body.id, qe1, { estado: 'EN_EJECUCION' }).expect(200);
    const a = await post(creada.body.id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION });
    assert.equal(a.status, 409);
    assert.equal(a.body.codigo, 'TRANSICION_INVALIDA');
    assert.deepEqual(a.body.transicionesPermitidas, ['PENDIENTE_CIERRE']);

    // (b) Certificaciones detenido con justificación válida: CHECKLIST_NO_DISPONIBLE (D192).
    const id = await hduListaParaCerrar(2);
    certificaciones.caida = true;
    try {
      const b = await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION });
      assert.equal(b.status, 409);
      assert.equal(b.body.codigo, 'CHECKLIST_NO_DISPONIBLE');
      assert.equal(b.body.checklist.estado, 'indisponible');
      assert.equal(b.body.puedeCerrarConExcepcion, undefined);
    } finally {
      certificaciones.caida = false;
    }

    // (c) Con impedimento abierto y sin justificación: CHECKLIST_INCOMPLETO, no HDU_BLOQUEADA.
    impedimentos.bloquear(id);
    const c = await post(id, qe1, { estado: 'CERRADA' });
    assert.equal(c.status, 409);
    assert.equal(c.body.codigo, 'CHECKLIST_INCOMPLETO');
    // Con justificación inválida y un impedimento: la justificación se valida antes que el bloqueo.
    const d = await post(id, qe1, { estado: 'CERRADA', justificacion: 'corta' });
    assert.equal(d.status, 400);
    // Y un tercero con justificación recibe 403 antes que HDU_BLOQUEADA.
    assert.equal((await post(id, admin, { estado: 'CERRADA', justificacion: JUSTIFICACION })).status, 403);
    impedimentos.bloqueantes.delete(id);
  });

  it('[E6-B05-T06] Impedimentos caído: 503, la HDU no cambia; el detalle de entregables caído: 409 CHECKLIST_NO_DISPONIBLE', async () => {
    const id = await hduListaParaCerrar(4);
    impedimentos.caida = true;
    try {
      const respuesta = await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION });
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    } finally {
      impedimentos.caida = false;
    }
    certificaciones.entregablesCaidos = true;
    try {
      const respuesta = await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION });
      assert.equal(respuesta.status, 409);
      assert.equal(respuesta.body.codigo, 'CHECKLIST_NO_DISPONIBLE');
    } finally {
      certificaciones.entregablesCaidos = false;
    }
    assert.equal(await contarConstancias(id), 0);
    const detalle = await http().get(`/v1/hdu/${id}`).set('authorization', autorizacion(qe1.token)).expect(200);
    assert.equal(detalle.body.estado, 'PENDIENTE_CIERRE');
  });

  it('[E6-B05-T07] el cierre con excepción no deja certificado en Organización: no hay estado nuevo ni cambia el modelo de la HDU', async () => {
    const id = await hduListaParaCerrar(2);
    await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION }).expect(200);
    // El certificado vive en Certificaciones (que rechaza la HDU CERRADA, ver su prueba E6-B05-T07); aquí,
    // la HDU sigue siendo CERRADA terminal, sin reapertura ni transiciones.
    const reabrir = await post(id, qe1, { estado: 'EN_EJECUCION' });
    assert.equal(reabrir.status, 409);
    assert.equal(reabrir.body.codigo, 'TRANSICION_INVALIDA');
    assert.deepEqual(reabrir.body.transicionesPermitidas, []);
  });

  it('[E6-B05-T08] auditoría CERRAR_HDU_PARCIAL para el Administrador, historial para el Auditor y constancia inmutable', async () => {
    const id = await hduListaParaCerrar(1);
    await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION }).expect(200);

    const auditoria = await http().get(`/v1/auditoria?entidad=HDU&entidadId=${id}`).set('authorization', autorizacion(admin.token)).expect(200);
    type EntradaAuditoria = { accion: string; actor: { id: string }; entidadId: string; despues?: { estado?: string; aprobados?: number; justificacion?: string } };
    const entrada = (auditoria.body.items as EntradaAuditoria[]).find((item) => item.accion === 'CERRAR_HDU_PARCIAL');
    assert.ok(entrada, 'hay una entrada CERRAR_HDU_PARCIAL');
    assert.equal(entrada.actor.id, qe1.id);
    assert.equal(entrada.entidadId, id);
    assert.equal(entrada.despues?.aprobados, 1);
    assert.equal(entrada.despues?.justificacion, JUSTIFICACION);
    assert.ok((auditoria.body.items as EntradaAuditoria[]).some((item) => item.accion === 'CAMBIAR_ESTADO_HDU' && item.despues?.estado === 'CERRADA'));

    const detalle = await http().get(`/v1/hdu/${id}`).set('authorization', autorizacion(auditor.token)).expect(200);
    assert.equal(detalle.body.cierre.aprobados, 1);
    // Solo lectura (D39): la ausencia de `cerrarConExcepcion` equivale a false (ver desviaciones del informe).
    assert.deepEqual(detalle.body.permisos, { cambiarEstado: false, asignarAnalista: false });
    const historial = await http().get(`/v1/hdu/${id}/historial`).set('authorization', autorizacion(auditor.token)).expect(200);
    const tipos = historial.body.items.map((evento: { tipo: string }) => evento.tipo);
    const indiceEstado = historial.body.items.findLastIndex((e: { tipo: string; estadoNuevo?: string }) => e.tipo === 'ESTADO' && e.estadoNuevo === 'CERRADA');
    const indiceCierre = tipos.indexOf('CIERRE_EXCEPCION');
    assert.ok(indiceCierre >= 0, 'el historial trae CIERRE_EXCEPCION');
    assert.equal(indiceCierre, indiceEstado + 1, 'CIERRE_EXCEPCION va justo después del ESTADO del cierre');
    assert.equal(historial.body.items[indiceCierre].fecha, historial.body.items[indiceEstado].fecha);
    assert.equal(historial.body.items[indiceCierre].aprobados, 1);
    assert.equal(historial.body.items[indiceCierre].pendientes.length, 9);

    const listado = await http().get('/v1/hdu').set('authorization', autorizacion(qe1.token)).query({ tamanoPagina: 100 }).expect(200);
    assert.equal(listado.body.items.find((hdu: { id: string }) => hdu.id === id).cierreParcial, true);
    assert.ok(listado.body.items.some((hdu: { cierreParcial: boolean }) => hdu.cierreParcial === false));

    await assert.rejects(() => prisma.$executeRawUnsafe(`UPDATE cierre_hdu SET justificacion = 'x' WHERE id_historia = '${id}'::uuid`), /solo inserción/);
    await assert.rejects(() => prisma.$executeRawUnsafe(`DELETE FROM cierre_hdu WHERE id_historia = '${id}'::uuid`), /solo inserción/);
    assert.equal(await contarConstancias(id), 1);
  });

  it('[E6-B05-T09] con 10 aprobados el cierre es el normal: la justificación se ignora y no se guarda', async () => {
    const sinTexto = await hduListaParaCerrar(10);
    const normal = await post(sinTexto, qe1, { estado: 'CERRADA' });
    assert.equal(normal.status, 200);
    assert.equal(normal.body.cierre, null);
    assert.equal(normal.body.hdu.cierreParcial, false);

    const conTexto = await hduListaParaCerrar(10);
    const ignorada = await post(conTexto, qe1, { estado: 'CERRADA', justificacion: 'corta' });
    assert.equal(ignorada.status, 200, 'una justificación inválida se ignora con 10 aprobados');
    assert.equal(ignorada.body.hdu.cierreParcial, false);
    assert.equal(await contarConstancias(conTexto), 0);
    assert.equal(await prisma.auditoria.count({ where: { entidadId: conTexto, accion: 'CERRAR_HDU_PARCIAL' } }), 0);
    assert.equal(await prisma.auditoria.count({ where: { entidadId: conTexto, accion: 'CAMBIAR_ESTADO_HDU' } }), 4);
    const detalle = await http().get(`/v1/hdu/${conTexto}`).set('authorization', autorizacion(qe1.token)).expect(200);
    assert.equal(detalle.body.cierre, null);
  });

  it('[E6-B05-T10] una HDU cerrada con excepción sigue siendo terminal: ninguna transición ni nuevo cierre', async () => {
    const id = await hduListaParaCerrar(2);
    await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION }).expect(200);
    for (const estado of ['EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA']) {
      const respuesta = await post(id, qe1, { estado, justificacion: JUSTIFICACION });
      assert.equal(respuesta.status, 409, estado);
      assert.equal(respuesta.body.codigo, 'TRANSICION_INVALIDA', estado);
    }
    const reasignar = await http().put(`/v1/hdu/${id}/analista`).set('authorization', autorizacion(qe1.token)).send({ analistaId: ana1.id, motivo: 'Misma analista' });
    assert.ok([200, 409].includes(reasignar.status));
    assert.equal(await contarConstancias(id), 1);
  });

  it('[E6-B05-T11] dos cierres simultáneos: uno 200 y el otro 409 TRANSICION_INVALIDA, una sola constancia', async () => {
    const id = await hduListaParaCerrar(2);
    const [a, b] = await Promise.all([
      post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION }),
      post(id, qe1, { estado: 'CERRADA', justificacion: `${JUSTIFICACION} (segundo)` }),
    ]);
    const estados = [a.status, b.status].sort();
    assert.deepEqual(estados, [200, 409]);
    const rechazada = a.status === 409 ? a : b;
    assert.equal(rechazada.body.codigo, 'TRANSICION_INVALIDA');
    assert.equal(await contarConstancias(id), 1);
    assert.equal(await prisma.auditoria.count({ where: { entidadId: id, accion: 'CERRAR_HDU_PARCIAL' } }), 1);
    assert.equal(await prisma.hduHistorialEstado.count({ where: { hduId: id, estadoNuevo: 'CERRADA' } }), 1);
  });

  it('el cierre se escribe completo o no se escribe: dos eventos de historial y dos entradas de auditoría', async () => {
    const id = await hduListaParaCerrar(6);
    await post(id, qe1, { estado: 'CERRADA', justificacion: JUSTIFICACION }).expect(200);
    const acciones = (await prisma.auditoria.findMany({ where: { entidadId: id }, select: { accion: true } })).map((fila) => fila.accion);
    assert.equal(acciones.filter((accion) => accion === 'CAMBIAR_ESTADO_HDU').length, 4);
    assert.equal(acciones.filter((accion) => accion === 'CERRAR_HDU_PARCIAL').length, 1);
    assert.equal(await prisma.hduHistorialEstado.count({ where: { hduId: id, estadoNuevo: 'CERRADA' } }), 1);
  });
});
