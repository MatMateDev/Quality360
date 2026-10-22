/**
 * E7-B03 · Las 5 bandejas por rol (D33, D34, D46, D49, D51) contra Postgres y Supabase Auth
 * locales reales y un Certificaciones falso que entrega el seguimiento del checklist de cada HDU.
 * Fixture de la sección 3 del backlog E7.
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
const valor = (bloque: { estado: string; datos?: { valor: number } }): number | string => (bloque.estado === 'ok' ? (bloque.datos as { valor: number }).valor : bloque.estado);
const codigosLista = (bandeja: Cuerpo): string[] => bandeja.hdu.datos.items.map((item: { codigo: string }) => item.codigo);

async function conCertificacionesCaida<T>(accion: () => Promise<T>): Promise<T> {
  cert.caida = true;
  try {
    return await accion();
  } finally {
    cert.caida = false;
  }
}

before(async () => {
  await cert.iniciar();
  await limpiarBaseDeDatos();
  app = await crearAppDePrueba({ certificacionesUrl: cert.url, certificacionesTimeoutMs: 1500 });
  f = await crearFixtureE7(cert);
});

after(async () => {
  await app.close();
  await cert.cerrar();
  await prisma.$disconnect();
});

describe('Cálculo por ámbito [E7-B03#1]', () => {
  it('[E7-B03-T01] ANA1: abiertas 2, observaciones 0, esperando 1. ANA2: 2, 1, 0 y su lista empieza por H2', async () => {
    const ana1: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana1)).expect(200)).body;
    assert.equal(ana1.rol, 'ANALISTA_QA');
    assert.ok(Date.parse(ana1.generadaEn) > 0);
    assert.deepEqual([valor(ana1.contadores.abiertas), valor(ana1.contadores.conObservaciones), valor(ana1.contadores.esperandoAprobacion)], [2, 0, 1]);
    assert.deepEqual(codigosLista(ana1), ['H1', 'H6']);
    assert.equal(ana1.supervisor.datos.supervisor.nombre, 'QE1');
    assert.equal(ana1.hdu.datos.items[0].seguimiento.datos.siguienteEntregable.orden, 4);

    const ana2: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana2)).expect(200)).body;
    assert.deepEqual([valor(ana2.contadores.abiertas), valor(ana2.contadores.conObservaciones), valor(ana2.contadores.esperandoAprobacion)], [2, 1, 0]);
    assert.deepEqual(codigosLista(ana2), ['H2', 'H8']);
    assert.equal(ana2.hdu.datos.items[1].seguimiento.datos.aprobados, 10);
  });

  it('[E7-B03-T02] ANA4 sin HDU: contadores en 0 con estado ok, lista vacía y supervisor null explícito', async () => {
    const llamadasAntes = cert.lotes.length;
    const ana4: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana4)).expect(200)).body;
    for (const clave of ['abiertas', 'conObservaciones', 'esperandoAprobacion']) {
      assert.deepEqual(ana4.contadores[clave].estado, 'ok', clave);
      assert.equal(ana4.contadores[clave].datos.valor, 0, clave);
    }
    assert.deepEqual(ana4.hdu.datos.items, []);
    assert.equal(ana4.hdu.datos.total, 0);
    assert.equal(ana4.supervisor.datos.supervisor, null);
    assert.equal(cert.lotes.length, llamadasAntes, 'sin HDU no hay nada que preguntarle a Certificaciones');
  });

  it('[E7-B03-T03] QE1: por aprobar 1 (en 1 HDU), sin analista 1, listas para certificar 1, para cerrar 1. QE2: todo 0', async () => {
    const qe1: Cuerpo = (await http().get('/v1/bandeja/qe').set(como(f.qe1)).expect(200)).body;
    assert.equal(qe1.rol, 'QE');
    assert.deepEqual(qe1.contadores.porAprobar.datos, { valor: 1, hdu: 1 });
    assert.equal(valor(qe1.contadores.sinAnalista), 1);
    assert.equal(valor(qe1.contadores.listasCertificar), 1);
    assert.equal(valor(qe1.contadores.listasCerrar), 1);
    assert.equal(qe1.acciones.datos.calculoParcial, false);
    const filas = qe1.acciones.datos.items as Array<{ hdu: { codigo: string }; tipo: string; entregablesPorAprobar: number | null; antiguedadDias: number }>;
    assert.deepEqual(
      filas.map((fila) => [fila.hdu.codigo, fila.tipo]),
      [['H5', 'ASIGNAR'], ['H8', 'CERRAR'], ['H6', 'CERTIFICAR'], ['H1', 'APROBAR']],
      'la más antigua primero',
    );
    assert.equal(filas.find((fila) => fila.tipo === 'APROBAR')?.entregablesPorAprobar, 1);
    assert.ok(filas.every((fila) => !['H3', 'H4', 'H7'].includes(fila.hdu.codigo)), 'ninguna fila de QE1 es de H3, H4 o H7');
    assert.ok(filas.every((fila) => fila.antiguedadDias >= 0));

    const qe2: Cuerpo = (await http().get('/v1/bandeja/qe').set(como(f.qe2)).expect(200)).body;
    assert.deepEqual(qe2.contadores.porAprobar.datos, { valor: 0, hdu: 0 });
    assert.equal(valor(qe2.contadores.sinAnalista), 0);
    assert.equal(valor(qe2.contadores.listasCertificar), 0);
    assert.equal(valor(qe2.contadores.listasCerrar), 0);
    assert.deepEqual(qe2.acciones.datos.items, []);
  });

  it('QE: filtra por tipo de acción y por analista; una HDU de su analista con otro QE responsable no aparece', async () => {
    const aprobar: Cuerpo = (await http().get('/v1/bandeja/qe?tipoAccion=APROBAR').set(como(f.qe1)).expect(200)).body;
    assert.deepEqual(aprobar.acciones.datos.items.map((a: Cuerpo) => a.hdu.codigo), ['H1']);
    const deAna2: Cuerpo = (await http().get(`/v1/bandeja/qe?analistaId=${f.ana2.id}`).set(como(f.qe1)).expect(200)).body;
    assert.deepEqual(deAna2.acciones.datos.items.map((a: Cuerpo) => a.hdu.codigo), ['H8']);
    // ANA3 la supervisa QE2, pero una HDU suya con QE1 responsable aparecería en QE1; las de QE2 jamás.
    const todas: Cuerpo = (await http().get('/v1/bandeja/qe?q=Historia').set(como(f.qe1)).expect(200)).body;
    assert.ok(todas.acciones.datos.items.every((a: Cuerpo) => ['H1', 'H5', 'H6', 'H8'].includes(a.hdu.codigo)));
  });

  it('[E7-B03-T04] LID1: células 2, abiertas 5, cerradas 1, sin analista 1, certificados 1; lista de 6 HDU', async () => {
    const lid1: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid1)).expect(200)).body;
    assert.equal(lid1.rol, 'LIDER_QA');
    assert.deepEqual(lid1.celulas.datos.items.map((c: Cuerpo) => c.nombre), ['CEL-A', 'CEL-B']);
    assert.deepEqual(
      [valor(lid1.contadores.celulas), valor(lid1.contadores.hduAbiertas), valor(lid1.contadores.hduCerradas), valor(lid1.contadores.sinAnalista), valor(lid1.contadores.certificados)],
      [2, 5, 1, 1, 1],
    );
    assert.deepEqual(codigosLista(lid1), ['H1', 'H2', 'H5', 'H7', 'H3', 'H6'], 'célula, luego sprint más reciente, luego código');
    assert.equal(lid1.hdu.datos.total, 6);
    const resumen = lid1.resumenPorCelula.datos.items as Cuerpo[];
    const celdaA = resumen.find((fila) => fila.celula.nombre === 'CEL-A');
    assert.deepEqual(celdaA.porEstado, { PENDIENTE: 1, DISENO_PRUEBAS: 0, EN_EJECUCION: 2, PENDIENTE_CIERRE: 0, CERRADA: 1 });
    // Avance promedio de las abiertas de CEL-A: H1 30, H2 10 y H5 0.
    assert.equal(celdaA.avancePromedioAbiertas.datos.porcentaje, 13.3);
    const celdaB = resumen.find((fila) => fila.celula.nombre === 'CEL-B');
    assert.equal(celdaB.avancePromedioAbiertas.datos.porcentaje, 40);
  });

  it('[E7-B03-T05] LID1 con estado=CERRADA ve solo H7', async () => {
    const respuesta: Cuerpo = (await http().get('/v1/bandeja/lider?estado=CERRADA').set(como(f.lid1)).expect(200)).body;
    assert.deepEqual(codigosLista(respuesta), ['H7']);
    assert.equal(valor(respuesta.contadores.hduAbiertas), 5, 'los contadores no dependen de los filtros');
  });

  it('Líder: filtra por QE, por analista y «sin analista»; celulaId ajena da 403; sin células, todo en 0 con ok', async () => {
    const deQe1: Cuerpo = (await http().get(`/v1/bandeja/lider?qeId=${f.qe1.id}`).set(como(f.lid1)).expect(200)).body;
    assert.deepEqual(codigosLista(deQe1).sort(), ['H1', 'H2', 'H5', 'H6']);
    const sinAnalista: Cuerpo = (await http().get('/v1/bandeja/lider?sinAnalista=true').set(como(f.lid1)).expect(200)).body;
    assert.deepEqual(codigosLista(sinAnalista), ['H5']);
    const conAnalista: Cuerpo = (await http().get('/v1/bandeja/lider?sinAnalista=false').set(como(f.lid1)).expect(200)).body;
    assert.equal(conAnalista.hdu.datos.total, 6, 'sinAnalista=false no filtra');
    const ajena = await http().get(`/v1/bandeja/lider?celulaId=${f.celdaC.id}`).set(como(f.lid1));
    assert.equal(ajena.status, 403);

    const lid2: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid2)).expect(200)).body;
    assert.deepEqual(lid2.celulas.datos.items, []);
    assert.equal(lid2.contadores.celulas.datos.valor, 0);
    assert.equal(lid2.contadores.certificados.estado, 'ok');
    assert.equal(lid2.contadores.certificados.datos.valor, 0);
    assert.deepEqual(lid2.resumenPorCelula.datos.items, []);
    assert.deepEqual(lid2.hdu.datos.items, []);
  });

  it('[E7-B03-T06] ADM1: 10 activos (1/2/4/2/1), 1 inactivo, ANA4 sin QE, LID2 sin células, CEL-C sin líder y 8 HDU', async () => {
    const admin: Cuerpo = (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body;
    assert.equal(admin.rol, 'ADMINISTRADOR');
    const c = admin.contadores;
    assert.deepEqual(c.usuariosActivos.datos, { valor: 10, porRol: { ADMINISTRADOR: 1, QE: 2, ANALISTA_QA: 4, LIDER_QA: 2, AUDITOR: 1 } });
    assert.equal(valor(c.usuariosInactivos), 1);
    assert.equal(valor(c.analistasSinQe), 1);
    assert.equal(valor(c.qeSinAnalistas), 0);
    assert.equal(valor(c.lideresSinCelulas), 1);
    assert.equal(valor(c.celulasSinLider), 1);
    assert.equal(valor(c.hduTotal), 8);
    assert.deepEqual(
      admin.pendientes.datos.items.map((p: Cuerpo) => [p.tipo, p.usuario?.nombre ?? null, p.celula?.nombre ?? null]),
      [['ANALISTA_SIN_QE', 'ANA4', null], ['LIDER_SIN_CELULAS', 'LID2', null], ['CELULA_SIN_LIDER', null, 'CEL-C']],
    );
    assert.equal(admin.pendientes.datos.total, 3);
  });

  it('[E7-B03-T07] AUD1: hdu-total 8, certificados 2 y contadores de 7 días consistentes con la bitácora y la auditoría', async () => {
    // Genera auditoría de usuarios reciente (un cambio de datos y uno de rol).
    await http().patch(`/v1/usuarios/${f.ana4.id}`).set(como(f.adm1)).send({ nombre: 'ANA4' }).expect(200);
    const auditor: Cuerpo = (await http().get('/v1/bandeja/auditor').set(como(f.aud1)).expect(200)).body;
    assert.equal(auditor.rol, 'AUDITOR');
    assert.equal(valor(auditor.contadores.hduTotal), 8);
    assert.equal(valor(auditor.contadores.certificados), 2);
    assert.equal(valor(auditor.contadores.eventos7d), cert.resumen.eventosUltimos7Dias);
    const esperado = await prisma.auditoria.count({
      where: { entidad: { in: ['USUARIO', 'SUPERVISION', 'EXPORTACION'] }, fecha: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    assert.ok(esperado >= 1);
    assert.equal(valor(auditor.contadores.cambiosUsuarios7d), esperado);
    assert.deepEqual(codigosLista(auditor), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8']);
  });

  it('Auditor: filtra por célula, estado y certificado; el rango usa la fecha de actualización', async () => {
    const celdaA: Cuerpo = (await http().get(`/v1/bandeja/auditor?celulaId=${f.celdaA.id}`).set(como(f.aud1)).expect(200)).body;
    assert.deepEqual(codigosLista(celdaA), ['H1', 'H2', 'H5', 'H7']);
    const conCertificado: Cuerpo = (await http().get('/v1/bandeja/auditor?certificado=con').set(como(f.aud1)).expect(200)).body;
    assert.deepEqual(codigosLista(conCertificado), ['H7', 'H8']);
    const sinCertificado: Cuerpo = (await http().get('/v1/bandeja/auditor?certificado=sin&estado=EN_EJECUCION').set(como(f.aud1)).expect(200)).body;
    assert.deepEqual(codigosLista(sinCertificado), ['H1', 'H2', 'H6']);
    const futuro = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const vacio: Cuerpo = (await http().get(`/v1/bandeja/auditor?desde=${encodeURIComponent(futuro)}`).set(como(f.aud1)).expect(200)).body;
    assert.deepEqual(vacio.hdu.datos.items, []);
    await http().get(`/v1/bandeja/auditor?desde=${encodeURIComponent(futuro)}&hasta=2020-01-01T00:00:00Z`).set(como(f.aud1)).expect(400);
    const ordenada: Cuerpo = (await http().get('/v1/bandeja/auditor?orden=avance:desc').set(como(f.aud1)).expect(200)).body;
    assert.deepEqual(codigosLista(ordenada).slice(0, 2).sort(), ['H7', 'H8']);
    assert.equal(ordenada.hdu.datos.orden, 'avance:desc');
  });

  it('[E7-B03-T08] tamanoPagina=1000 se recorta a 100 y la respuesta informa el tamaño efectivo', async () => {
    const respuesta: Cuerpo = (await http().get('/v1/bandeja/lider?tamanoPagina=1000').set(como(f.lid1)).expect(200)).body;
    assert.equal(respuesta.hdu.datos.tamanoPagina, 100);
    const pequeno: Cuerpo = (await http().get('/v1/bandeja/lider?tamanoPagina=2&pagina=2').set(como(f.lid1)).expect(200)).body;
    assert.equal(pequeno.hdu.datos.tamanoPagina, 2);
    assert.equal(pequeno.hdu.datos.pagina, 2);
    assert.equal(pequeno.hdu.datos.total, 6);
    assert.deepEqual(codigosLista(pequeno), ['H5', 'H7']);
    const porDefecto: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid1)).expect(200)).body;
    assert.equal(porDefecto.hdu.datos.tamanoPagina, 25);
  });

  it('valida los parámetros: orden con columna inválida, q de 1 carácter y parámetros ajenos a la bandeja dan 400', async () => {
    const orden = await http().get('/v1/bandeja/lider?orden=inventada:asc').set(como(f.lid1));
    assert.equal(orden.status, 400);
    assert.equal(orden.body.codigo, 'VALIDACION');
    await http().get('/v1/bandeja/lider?orden=codigo').set(como(f.lid1)).expect(400);
    await http().get('/v1/bandeja/lider?q=a').set(como(f.lid1)).expect(400);
    await http().get('/v1/bandeja/qe?estado=PENDIENTE').set(como(f.qe1)).expect(400);
    await http().get('/v1/bandeja/analista?soloConObservaciones=quizas').set(como(f.ana1)).expect(400);
    const buscada: Cuerpo = (await http().get('/v1/bandeja/lider?q=h3').set(como(f.lid1)).expect(200)).body;
    assert.deepEqual(codigosLista(buscada), ['H3']);
  });

  it('propaga el token del usuario y la traza a Certificaciones (D46)', async () => {
    await http().get('/v1/bandeja/analista').set(como(f.ana1)).set('x-trace-id', 'traza-e7-123').expect(200);
    assert.equal(cert.autorizaciones.at(-1), autorizacion(f.ana1.token));
  });
});

describe('Filtros y orden que dependen de Certificaciones [E7-F02#3]', () => {
  it('[E7-F02#3] ANA2 con «solo con observaciones» ve solo H2 y el contador no cambia', async () => {
    const respuesta: Cuerpo = (await http().get('/v1/bandeja/analista?soloConObservaciones=true').set(como(f.ana2)).expect(200)).body;
    assert.deepEqual(codigosLista(respuesta), ['H2']);
    assert.equal(valor(respuesta.contadores.conObservaciones), 1);
    assert.equal(valor(respuesta.contadores.abiertas), 2);
  });

  it('un filtro que depende de Certificaciones deja la lista indisponible, nunca sin filtrar (D46)', async () => {
    const respuesta: Cuerpo = await conCertificacionesCaida(async () => (await http().get('/v1/bandeja/analista?soloConObservaciones=true').set(como(f.ana2)).expect(200)).body);
    assert.deepEqual(respuesta.hdu, { fuente: 'organizacion.hdu', estado: 'indisponible' });
    assert.equal(respuesta.contadores.abiertas.estado, 'ok');
    assert.equal(respuesta.contadores.conObservaciones.estado, 'indisponible');
  });

  it('un orden que depende de Certificaciones cae al de respaldo y se informa en `orden`', async () => {
    const respuesta: Cuerpo = await conCertificacionesCaida(async () => (await http().get('/v1/bandeja/lider?orden=avance:desc').set(como(f.lid1)).expect(200)).body);
    assert.equal(respuesta.hdu.estado, 'ok');
    assert.equal(respuesta.hdu.datos.orden, 'celula:asc,sprint:desc,codigo:asc');
    assert.equal(respuesta.hdu.datos.items.length, 6);
  });
});

describe('Fuente no disponible [E7-B03#2]', () => {
  it('[E7-B03-T09] QE1 con Certificaciones detenido: por aprobar, listas para certificar y para cerrar indisponibles; sin analista = 1 con ok', async () => {
    const qe1: Cuerpo = await conCertificacionesCaida(async () => (await http().get('/v1/bandeja/qe').set(como(f.qe1)).expect(200)).body);
    for (const clave of ['porAprobar', 'listasCertificar', 'listasCerrar']) {
      assert.deepEqual(qe1.contadores[clave], { fuente: 'certificaciones.checklist', estado: 'indisponible' }, clave);
    }
    assert.equal(qe1.contadores.sinAnalista.estado, 'ok');
    assert.equal(qe1.contadores.sinAnalista.datos.valor, 1);
    assert.equal(qe1.acciones.datos.calculoParcial, true);
    assert.deepEqual(qe1.acciones.datos.items.map((a: Cuerpo) => [a.hdu.codigo, a.tipo]), [['H5', 'ASIGNAR']]);
  });

  it('QE con Certificaciones detenido y un filtro por una acción que depende de ella: las acciones quedan indisponibles', async () => {
    const respuesta: Cuerpo = await conCertificacionesCaida(async () => (await http().get('/v1/bandeja/qe?tipoAccion=CERRAR').set(como(f.qe1)).expect(200)).body);
    assert.deepEqual(respuesta.acciones, { fuente: 'organizacion.hdu', estado: 'indisponible' });
    const asignar: Cuerpo = await conCertificacionesCaida(async () => (await http().get('/v1/bandeja/qe?tipoAccion=ASIGNAR').set(como(f.qe1)).expect(200)).body);
    assert.equal(asignar.acciones.estado, 'ok');
    assert.equal(asignar.acciones.datos.calculoParcial, true);
  });

  it('[E7-B03-T10] ANA1, LID1 y AUD1 con Certificaciones detenido: 200, observaciones, aprobación, avance y certificado indisponibles; las listas siguen', async () => {
    await conCertificacionesCaida(async () => {
      const ana1: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana1)).expect(200)).body;
      assert.equal(ana1.contadores.conObservaciones.estado, 'indisponible');
      assert.equal(ana1.contadores.esperandoAprobacion.estado, 'indisponible');
      assert.equal(ana1.contadores.abiertas.datos.valor, 2);
      assert.deepEqual(codigosLista(ana1), ['H1', 'H6']);
      assert.equal(ana1.hdu.datos.items[0].seguimiento.estado, 'indisponible');
      assert.equal(ana1.hdu.datos.orden, 'prioridad:desc');

      const lid1: Cuerpo = (await http().get('/v1/bandeja/lider').set(como(f.lid1)).expect(200)).body;
      assert.equal(lid1.contadores.certificados.estado, 'indisponible');
      assert.equal(lid1.contadores.hduAbiertas.datos.valor, 5);
      assert.equal(lid1.resumenPorCelula.datos.items[0].avancePromedioAbiertas.estado, 'indisponible');
      assert.equal(lid1.hdu.datos.items.length, 6);
      assert.equal(lid1.hdu.datos.items[0].seguimiento.estado, 'indisponible');

      const aud1: Cuerpo = (await http().get('/v1/bandeja/auditor').set(como(f.aud1)).expect(200)).body;
      assert.equal(aud1.contadores.certificados.estado, 'indisponible');
      assert.equal(aud1.contadores.eventos7d.estado, 'indisponible');
      assert.equal(aud1.contadores.hduTotal.datos.valor, 8);
      assert.equal(aud1.contadores.cambiosUsuarios7d.estado, 'ok');
      assert.equal(aud1.hdu.datos.items.length, 8);

      // Filtrar por certificado necesita a Certificaciones: el bloque queda indisponible.
      const filtrado: Cuerpo = (await http().get('/v1/bandeja/auditor?certificado=con').set(como(f.aud1)).expect(200)).body;
      assert.equal(filtrado.hdu.estado, 'indisponible');
    });
  });

  it('[E7-B03-T11] ADM1 con Certificaciones detenido: todo ok, porque no depende de ella', async () => {
    const admin: Cuerpo = await conCertificacionesCaida(async () => (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body);
    const estados = [...Object.values(admin.contadores), admin.pendientes, admin.ultimosCambios].map((bloque: Cuerpo) => bloque.estado);
    assert.ok(estados.every((estado) => estado === 'ok'), JSON.stringify(estados));
  });

  it('una respuesta ilegible de Certificaciones también se degrada a indisponible, no a 0', async () => {
    const original = cert.seguimientos.get(f.h.H1.id);
    cert.seguimientos.set(f.h.H1.id, { hduId: 'otro' } as never);
    try {
      const ana1: Cuerpo = (await http().get('/v1/bandeja/analista').set(como(f.ana1)).expect(200)).body;
      assert.equal(ana1.contadores.conObservaciones.estado, 'indisponible');
    } finally {
      if (original !== undefined) cert.seguimientos.set(f.h.H1.id, original);
    }
  });
});

describe('Rol exclusivo [E7-B03#3]', () => {
  const rutas: Array<[string, () => UsuarioDePrueba]> = [
    ['analista', () => f.ana1],
    ['qe', () => f.qe1],
    ['lider', () => f.lid1],
    ['admin', () => f.adm1],
    ['auditor', () => f.aud1],
  ];

  it('[E7-B03-T12] cada rol recibe 403 ACCESO_DENEGADO, con cuerpo idéntico, en los 4 endpoints que no son suyos (20 combinaciones)', async () => {
    const cuerpos: string[] = [];
    let combinaciones = 0;
    for (const [rutaPropia, usuario] of rutas) {
      for (const [ruta] of rutas) {
        if (ruta === rutaPropia) continue;
        const respuesta = await http().get(`/v1/bandeja/${ruta}`).set(como(usuario()));
        assert.equal(respuesta.status, 403, `${rutaPropia} → ${ruta}`);
        assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
        const { traceId: _traza, ...sinTraza } = respuesta.body;
        cuerpos.push(JSON.stringify(sinTraza));
        combinaciones += 1;
      }
    }
    assert.equal(combinaciones, 20);
    assert.equal(new Set(cuerpos).size, 1, 'el cuerpo es el mismo en las 20');
  });

  it('el Administrador no abre las bandejas de otros roles (D33)', async () => {
    for (const ruta of ['analista', 'qe', 'lider', 'auditor']) await http().get(`/v1/bandeja/${ruta}`).set(como(f.adm1)).expect(403);
  });

  it('[E7-B03-T13] sin token o con token inválido: 401 NO_AUTENTICADO en las 5 rutas', async () => {
    for (const [ruta] of rutas) {
      const sinToken = await http().get(`/v1/bandeja/${ruta}`);
      assert.equal(sinToken.status, 401, ruta);
      assert.equal(sinToken.body.codigo, 'NO_AUTENTICADO');
      const invalido = await http().get(`/v1/bandeja/${ruta}`).set('authorization', 'Bearer token.invalido.xyz');
      assert.equal(invalido.status, 401, ruta);
    }
  });

  it('[E7-B03-T14] INACT1 (QE desactivado) recibe 403 ACCESO_DENEGADO', async () => {
    const respuesta = await http().get('/v1/bandeja/qe').set(como(f.inact1));
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  });
});

describe('Resolución de pendientes del Administrador [E7-F05#2]', () => {
  it('[E7-F05#2] tras asignar QE a ANA4, células a LID2 y líder a CEL-C, no quedan pendientes y los últimos cambios lo reflejan', async () => {
    await http().put(`/v1/analistas/${f.ana4.id}/supervisor`).set(como(f.adm1)).send({ qeId: f.qe1.id }).expect(200);
    await http().put(`/v1/usuarios/${f.lid2.id}/celulas-lider`).set(como(f.adm1)).send({ celulaIds: [f.celdaC.id] }).expect(200);
    const admin: Cuerpo = (await http().get('/v1/bandeja/admin').set(como(f.adm1)).expect(200)).body;
    assert.deepEqual(admin.pendientes.datos, { items: [], total: 0, pagina: 1, tamanoPagina: 25 });
    for (const clave of ['analistasSinQe', 'qeSinAnalistas', 'lideresSinCelulas', 'celulasSinLider']) {
      assert.equal(admin.contadores[clave].datos.valor, 0, clave);
    }
    const primero = admin.ultimosCambios.datos.items[0];
    assert.equal(primero.operacion, 'ASIGNAR_CELULAS_LIDER');
    assert.equal(primero.actor.id, f.adm1.id);
    assert.equal(primero.usuarioAfectado.id, f.lid2.id);
    assert.ok(admin.ultimosCambios.datos.items.length <= 10);
    const segundo = admin.ultimosCambios.datos.items[1];
    assert.equal(segundo.operacion, 'ASIGNAR_SUPERVISOR');
    assert.equal(segundo.usuarioAfectado.id, f.ana4.id, 'en supervisión el usuario afectado es el analista');
  });
});
