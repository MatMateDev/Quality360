/**
 * E5-B02 · Consultar Jira (mapeo y guardado, paginación y tope, límite de tasa, presupuesto, errores) y E5-B05 #1, #2, #10
 * (consulta guardada, clasificación, vida). Postgres local real; Organización y Jira falsos (ayudas.ts). IDs de
 * `docs/backlog/e5-consulta-asignacion.md`. E5-B02-T03 (ADF) la cubre la prueba del mapeo.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, type ModoJira, type OrganizacionFalsa } from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const CONSULTAR = '/v1/integraciones/jira/consultas';

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});

afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
  org.caida = false;
  org.accesoCaido = false;
  org.fallarUpsertDesde = null;
  org.llamadas.length = 0;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

async function listo(proyecto = 'QTY', config: Parameters<typeof montar>[0] = {}): Promise<Montaje> {
  m = await montar({ org, ...config });
  const guardado = await guardarConfiguracion(m, { proyecto });
  assert.equal(guardado.status, 200);
  assert.equal(guardado.body.guardado, true);
  m.jira.llamadas.length = 0;
  return m;
}

const consultar = (cuerpo: unknown = {}, persona: Parameters<Montaje['pedir']>[2] = 'adm1') => m.pedir('post', CONSULTAR, persona, cuerpo);
const continuar = (id: string) => m.pedir('post', `${CONSULTAR}/${id}/continuaciones`, 'adm1', {});
const items = async (id: string, grupo: string, extra = '') => (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=${grupo}${extra}`, 'adm1')).body;
const codigos = (cuerpo: { items: Array<{ codigo: string | null }> }) => cuerpo.items.map((i) => i.codigo);

describe('E5-B02#1 · mapeo y guardado', () => {
  it('E5-B02-T01 consulta QTY: 11 leídas, 10 nuevas, 1 con error, CON_ERRORES; no crea ni modifica HDU', async () => {
    await listo();
    const r = await consultar();
    assert.equal(r.status, 200);
    const { consulta, ejecucion } = r.body;
    assert.deepEqual([consulta.estado, consulta.version, consulta.proyecto, consulta.sitioHost], ['ABIERTA', 1, 'QTY', '127.0.0.1:4010']);
    assert.ok(Date.parse(consulta.venceEn) > Date.now() + 23 * 3_600_000);
    assert.deepEqual(
      [ejecucion.fase, ejecucion.origen, ejecucion.leidas, ejecucion.nuevas, ejecucion.cambiaron, ejecucion.sinCambios, ejecucion.conError, ejecucion.conAdvertencias, ejecucion.resultado, ejecucion.consultaId],
      ['CONSULTA', 'JIRA', 11, 10, 0, 0, 1, 4, 'CON_ERRORES', consulta.id],
    );
    assert.deepEqual([ejecucion.creadas, ejecucion.actualizadas, ejecucion.omitidas], [0, 0, 0]);
    assert.deepEqual([consulta.leidas, consulta.nuevas, consulta.conError, consulta.conAdvertencias], [11, 10, 1, 4]);
    assert.deepEqual(m.jira.consultas[0]?.tipos, ['Story', 'Historia']);
    assert.equal(m.jira.consultas[0]?.proyecto, 'QTY');
    assert.equal(org.upserts.length, 0);
    assert.equal(org.llamadas.filter((l) => l.includes('upsert')).length, 0);
    assert.deepEqual(consulta.sugerencia, { celula: { id: consulta.sugerencia.celula.id, nombre: 'CEL-C' }, qeResponsable: { id: PERSONAS.qe2.id, nombre: PERSONAS.qe2.nombre }, sprintRespaldo: { id: consulta.sugerencia.sprintRespaldo.id, nombre: 'E5 Sprint 1' } });
  });

  it('E5-B02-T02 las filas guardan lo mapeado: título, prioridad, sprint de Jira, descripción, referencia y asignación vacía', async () => {
    await listo();
    const { consulta } = (await consultar()).body;
    const nuevas = await items(consulta.id, 'NUEVA', '&tamanoPagina=100');
    assert.equal(nuevas.total, 10);
    const por = Object.fromEntries(nuevas.items.map((i: { codigo: string }) => [i.codigo, i]));
    assert.deepEqual(
      [por['QTY-1'].titulo, por['QTY-1'].prioridad, por['QTY-1'].sprintJira, por['QTY-1'].descripcion, por['QTY-1'].referencia, por['QTY-1'].urlExterna],
      ['Historia QTY-1', 'ALTA', 'E5 Sprint 2', 'Como usuario quiero activar 2FA', { estado: 'In Progress', responsable: 'Dev Uno' }, 'http://127.0.0.1:4010/browse/QTY-1'],
    );
    assert.deepEqual(por['QTY-1'].asignacion, { celula: null, qeResponsable: null, analista: null, sprint: null, sprintOrigen: null });
    assert.deepEqual([por['QTY-1'].completa, por['QTY-1'].faltantes, por['QTY-1'].marcada, por['QTY-1'].marcable], [false, ['celulaId', 'qeId', 'analistaId', 'sprintId'], false, false]);
    assert.deepEqual([por['QTY-3'].prioridad, por['QTY-4'].prioridad, por['QTY-12'].sprintJira], ['CRITICA', 'BAJA', 'E5 Sprint 1']);
    assert.deepEqual([por['QTY-5'].prioridad, por['QTY-5'].advertencias, por['QTY-6'].prioridad, por['QTY-6'].advertencias], [null, ['PRIORIDAD_AUSENTE'], null, ['PRIORIDAD_DESCONOCIDA']]);
    assert.deepEqual([por['QTY-8'].titulo.length, por['QTY-8'].advertencias, por['QTY-9'].descripcion.length, por['QTY-9'].advertencias], [200, ['TITULO_TRUNCADO'], 1000, ['DESCRIPCION_TRUNCADA']]);
    assert.equal(por['QTY-4'].sprintJira, null);
  });

  it('E5-B02-T04 QTY-11 (sin título) queda en CON_ERROR y no se marca; el Bug QTY-7 no figura en ningún grupo', async () => {
    await listo();
    const { consulta } = (await consultar()).body;
    const conError = await items(consulta.id, 'CON_ERROR');
    assert.deepEqual(codigos(conError), ['QTY-11']);
    assert.deepEqual([conError.items[0].motivo, conError.items[0].marcable, conError.items[0].asignacion], ['TITULO_VACIO', false, null]);
    for (const grupo of ['NUEVA', 'CAMBIO', 'SIN_CAMBIOS', 'CON_ERROR']) assert.ok(!codigos(await items(consulta.id, grupo, '&tamanoPagina=100')).includes('QTY-7'));
  });

  it('E5-B05-T32 (parte) los textos de Jira se devuelven tal cual y la búsqueda q es literal', async () => {
    await listo();
    m.jira.proyectos.get('QTY')![1]!.titulo = '<img src=x onerror=1>';
    m.jira.proyectos.get('QTY')![2]!.titulo = '=HYPERLINK("x")';
    const { consulta } = (await consultar()).body;
    const nuevas = await items(consulta.id, 'NUEVA', '&tamanoPagina=100');
    const titulos = nuevas.items.map((i: { titulo: string }) => i.titulo);
    assert.ok(titulos.includes('<img src=x onerror=1>') && titulos.includes('=HYPERLINK("x")'));
    const inyeccion = await items(consulta.id, 'NUEVA', `&q=${encodeURIComponent("' OR 1=1 --")}`);
    assert.deepEqual([inyeccion.total, inyeccion.items], [0, []]);
    assert.deepEqual(codigos(await items(consulta.id, 'NUEVA', '&q=qty-12')), ['QTY-12']);
    assert.equal((await items(consulta.id, 'NUEVA', '&q=%25')).total, 0);
    assert.equal((await m.pedir('get', `${CONSULTAR}/${consulta.id}/items`, 'adm1')).status, 400);
    assert.equal((await m.pedir('get', `${CONSULTAR}/${consulta.id}/items?grupo=OTRO`, 'adm1')).status, 400);
  });
});

describe('E5-B02#2 · paginación, tope y tandas', () => {
  it('E5-B02-T05 BIG (230): 100 + 100 + 30 en la misma consulta, sin duplicados, con 3 ejecuciones CONSULTA', async () => {
    await listo('BIG');
    const r1 = await consultar();
    assert.deepEqual([r1.body.ejecucion.leidas, r1.body.ejecucion.resultado, r1.body.ejecucion.hayMas, r1.body.ejecucion.continuarDesde], [100, 'INCOMPLETA', true, 'BIG-100']);
    assert.equal(m.jira.consultas.length, 2);
    const id = r1.body.consulta.id as string;
    assert.deepEqual([r1.body.consulta.leidas, r1.body.consulta.hayMas, r1.body.consulta.continuarDesde], [100, true, 'BIG-100']);
    const r2 = await continuar(id);
    assert.deepEqual([r2.status, r2.body.consulta.id, r2.body.ejecucion.leidas, r2.body.consulta.leidas, r2.body.consulta.version], [200, id, 100, 200, 2]);
    const r3 = await continuar(id);
    assert.deepEqual([r3.body.ejecucion.leidas, r3.body.ejecucion.resultado, r3.body.ejecucion.hayMas, r3.body.consulta.leidas, r3.body.consulta.hayMas], [30, 'EXITOSA', false, 230, false]);
    const filas = await consultaDuenio<{ n: number; distintas: number }>(`SELECT count(*)::int AS n, count(DISTINCT codigo_normalizado)::int AS distintas FROM integraciones.consulta_item WHERE id_consulta = '${id}'`);
    assert.deepEqual(filas[0], { n: 230, distintas: 230 });
    const ejecuciones = await consultaDuenio<{ fase: string }>("SELECT fase FROM integraciones.ejecucion_integracion WHERE origen = 'JIRA'");
    assert.deepEqual(ejecuciones.map((e) => e.fase), ['CONSULTA', 'CONSULTA', 'CONSULTA']);
    // Una consulta completa no se continúa.
    const completa = await continuar(id);
    assert.deepEqual([completa.status, completa.body.codigo, completa.body.estado], [409, 'CONSULTA_COMPLETA', 'ABIERTA']);
  });

  it('E5-B02-T06 EXACTO (100) termina EXITOSA sin continuación; VACIO crea una consulta abierta sin filas', async () => {
    await listo('EXACTO');
    const exacto = await consultar();
    assert.deepEqual([exacto.body.ejecucion.leidas, exacto.body.ejecucion.resultado, exacto.body.ejecucion.hayMas], [100, 'EXITOSA', false]);
    await m.cerrar();
    await listo('VACIO');
    const vacio = await consultar();
    assert.deepEqual([vacio.body.ejecucion.resultado, vacio.body.ejecucion.leidas, vacio.body.consulta.estado, vacio.body.consulta.leidas, vacio.body.consulta.hayMas], ['EXITOSA', 0, 'ABIERTA', 0, false]);
  });

  it('E5-B02-T29 ENORME (520): tope de 500 en la quinta tanda con TOPE_DE_CONSULTA y la sexta es CONSULTA_LLENA', async () => {
    await listo('ENORME');
    const primera = await consultar();
    const id = primera.body.consulta.id as string;
    for (let i = 0; i < 3; i++) assert.equal((await continuar(id)).body.ejecucion.resultado, 'INCOMPLETA');
    const quinta = await continuar(id);
    assert.deepEqual(
      [quinta.body.consulta.leidas, quinta.body.ejecucion.resultado, quinta.body.ejecucion.codigoError, quinta.body.ejecucion.hayMas, quinta.body.ejecucion.sugerencias],
      [500, 'INCOMPLETA', 'TOPE_DE_CONSULTA', true, []],
    );
    const sexta = await continuar(id);
    assert.deepEqual([sexta.status, sexta.body.codigo], [409, 'CONSULTA_LLENA']);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.consulta_item'))?.length, 500);
  });

  it('E5-B02-T12 con un presupuesto corto y Jira lento: INCOMPLETA PRESUPUESTO_DE_TIEMPO con lo leído guardado', async () => {
    await listo('BIG', { config: { presupuestoMs: 2500, topeIssues: 500 } });
    m.jira.modo = 'RETARDO';
    m.jira.retardoMs = 1000;
    const r = await consultar();
    assert.deepEqual([r.body.ejecucion.resultado, r.body.ejecucion.codigoError, r.body.ejecucion.hayMas, r.body.consulta.leidas], ['INCOMPLETA', 'PRESUPUESTO_DE_TIEMPO', true, 100]);
    assert.ok(r.body.ejecucion.duracionMs <= 3500);
    assert.equal(r.body.ejecucion.sugerencias[0], 'CONTINUAR');
  });
});

describe('E5-B02#3 · límite de tasa', () => {
  it('E5-B02-T07 con 429 y reintentos: completa y registra dos esperas', async () => {
    await listo();
    m.jira.modo = 'LIMITE';
    const r = await consultar();
    assert.deepEqual([r.body.ejecucion.nuevas, r.body.ejecucion.reintentos429, r.body.ejecucion.eventos.map((e: { tipo: string; esperaMs: number }) => [e.tipo, e.esperaMs])], [10, 2, [['JIRA_LIMITE_DE_TASA', 1000], ['JIRA_LIMITE_DE_TASA', 1000]]]);
  });

  it('E5-B02-T08 con el 429 persistente en la página 2: 50 filas, JIRA_LIMITE_DE_TASA, revisable, y al continuar termina sin duplicados', async () => {
    await listo('BIG');
    m.jira.modo = 'LIMITE_PAGINA_2';
    const r = await consultar();
    assert.deepEqual(
      [r.body.ejecucion.resultado, r.body.ejecucion.codigoError, r.body.consulta.leidas, r.body.ejecucion.continuarDesde, r.body.consulta.estado, r.body.ejecucion.sugerencias[0]],
      ['INCOMPLETA', 'JIRA_LIMITE_DE_TASA', 50, 'BIG-50', 'ABIERTA', 'CONTINUAR'],
    );
    assert.equal((await items(r.body.consulta.id, 'NUEVA')).total, 50);
    m.jira.modo = 'NORMAL';
    const id = r.body.consulta.id as string;
    let ultima = r;
    for (let i = 0; i < 4 && (ultima.body.consulta.hayMas as boolean); i++) ultima = await continuar(id);
    assert.deepEqual([ultima.body.consulta.leidas, ultima.body.consulta.hayMas], [230, false]);
    const filas = await consultaDuenio<{ n: number; distintas: number }>(`SELECT count(*)::int AS n, count(DISTINCT codigo_normalizado)::int AS distintas FROM integraciones.consulta_item WHERE id_consulta = '${id}'`);
    assert.deepEqual(filas[0], { n: 230, distintas: 230 });
  });
});

describe('E5-B02 · errores de Jira y de Organización', () => {
  it('E5-B02-T09 / T10 cada falla de Jira es FALLIDA con su código, mensaje fijo, sin consulta guardada y con la ejecución registrada', async () => {
    await listo();
    const esperado: Array<[ModoJira, string]> = [
      ['LENTO', 'JIRA_TIEMPO_AGOTADO'],
      ['TOKEN_REVOCADO', 'JIRA_CREDENCIAL_INVALIDA'],
      ['SIN_PERMISO', 'JIRA_SIN_PERMISO'],
      ['RESPUESTA_INVALIDA', 'JIRA_RESPUESTA_INVALIDA'],
      ['CAIDO', 'JIRA_NO_DISPONIBLE'],
      ['SITIO_INEXISTENTE', 'JIRA_SITIO_NO_ENCONTRADO'],
    ];
    for (const [modo, codigo] of esperado) {
      m.jira.modo = modo;
      const r = await consultar();
      assert.equal(r.status, 200, modo);
      assert.deepEqual([r.body.ejecucion.resultado, r.body.ejecucion.codigoError, r.body.consulta], ['FALLIDA', codigo, null], modo);
      assert.ok(!JSON.stringify(r.body).includes('q360-token'));
    }
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.consulta_jira')).length, 0);
    assert.equal((await consultaDuenio("SELECT 1 FROM integraciones.ejecucion_integracion WHERE fase = 'CONSULTA'")).length, esperado.length);
  });

  it('E5-B02-T11 solo el Administrador consulta; sin configuración 409; el falso no recibe peticiones ni se registra ejecución', async () => {
    m = await montar({ org });
    assert.deepEqual([(await consultar({}, 'adm1')).status, (await consultar({}, 'adm1')).body.codigo], [409, 'JIRA_NO_CONFIGURADO']);
    assert.equal((await consultar({}, 'adm1')).body.mensaje, 'Configura la conexión con Jira antes de consultar.');
    assert.equal((await guardarConfiguracion(m)).status, 200);
    m.jira.llamadas.length = 0;
    for (const persona of ['qe1', 'qe2', 'ana1', 'lid1', 'aud1'] as const) {
      const r = await consultar({}, persona);
      assert.deepEqual([r.status, r.body.codigo], [403, 'ACCESO_DENEGADO'], persona);
    }
    assert.equal((await consultar({}, null)).status, 401);
    assert.equal((await consultar({ origen: 'CSV' })).status, 400);
    assert.equal(m.jira.llamadas.length, 0);
    assert.equal((await consultaDuenio("SELECT 1 FROM integraciones.ejecucion_integracion WHERE fase = 'CONSULTA'")).length, 0);
  });

  it('E5-B02-T13 Organización detenida: 503 sin ejecución; detenida tras la primera página: FALLIDA ORGANIZACION_NO_DISPONIBLE sin consulta guardada', async () => {
    await listo();
    org.accesoCaido = true;
    const caida = await consultar();
    assert.equal(caida.status, 503);
    assert.equal(m.jira.llamadas.length, 0);
    org.accesoCaido = false;
    org.caida = true;
    assert.equal((await consultar()).status, 503);
    org.caida = false;
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);

    m.jira.alLeerPagina = () => {
      org.caida = true;
    };
    const r = await consultar();
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.ejecucion.resultado, r.body.ejecucion.codigoError, r.body.ejecucion.sugerencias, r.body.consulta], ['FALLIDA', 'ORGANIZACION_NO_DISPONIBLE', ['REINTENTAR'], null]);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.consulta_jira')).length, 0);
  });

  it('E5-B02-T14 / E5-B05-T34 una falla de Jira o de Organización al reemplazar no destruye la consulta abierta', async () => {
    await listo();
    const a = (await consultar()).body.consulta;
    m.jira.modo = 'CAIDO';
    const jiraCaido = await consultar({ reemplazar: true });
    assert.deepEqual([jiraCaido.body.ejecucion.resultado, jiraCaido.body.consulta], ['FALLIDA', null]);
    m.jira.modo = 'NORMAL';
    m.jira.alLeerPagina = () => {
      org.caida = true;
    };
    const orgCaida = await consultar({ reemplazar: true });
    org.caida = false;
    assert.deepEqual([orgCaida.body.ejecucion.resultado, orgCaida.body.ejecucion.codigoError], ['FALLIDA', 'ORGANIZACION_NO_DISPONIBLE']);
    const actual = (await m.pedir('get', `${CONSULTAR}/actual`, 'adm1')).body;
    assert.deepEqual([actual.consulta.id, actual.consulta.estado, actual.consulta.leidas, actual.consulta.version], [a.id, 'ABIERTA', 11, 1]);
    assert.equal((await items(a.id, 'NUEVA')).total, 10);
  });
});

describe('E5-B05#1 · consulta guardada y compartida', () => {
  it('E5-B05-T01 otro Administrador (y otra instancia del servicio) ve la misma consulta con la misma versión', async () => {
    await listo();
    const { consulta } = (await consultar()).body;
    await m.cerrar();
    m = await montar({ org, conservarDatos: true });
    const actual = await m.pedir('get', `${CONSULTAR}/actual`, 'adm2');
    assert.deepEqual(
      [actual.body.consulta.id, actual.body.consulta.estado, actual.body.consulta.creadaPor, actual.body.consulta.nuevas, actual.body.consulta.conError, actual.body.consulta.version, actual.body.ultimaCerrada],
      [consulta.id, 'ABIERTA', { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre }, 10, 1, 1, null],
    );
    const uno = await m.pedir('get', `${CONSULTAR}/${consulta.id}`, 'adm2');
    assert.deepEqual([uno.status, uno.body.version, uno.body.asignadas, uno.body.pendientes], [200, 1, 0, 0]);
    assert.equal((await m.pedir('get', `${CONSULTAR}/${consulta.id}`, 'qe1')).status, 403);
    assert.equal((await m.pedir('get', `${CONSULTAR}/0c000000-0000-4000-8000-0000000000ee`, 'adm1')).body.codigo, 'CONSULTA_NO_ENCONTRADA');
    assert.equal((await m.pedir('get', `${CONSULTAR}/no-uuid`, 'adm1')).status, 400);
  });
});

describe('E5-B05#2 · clasificación', () => {
  it('E5-B05-T02 a T05 nuevas, cambiaron, sin cambios (cerrada, prioridad ausente, a mano) y el motivo de cada una', async () => {
    await listo();
    const iguales = (n: number) => ({ codigo: `QTY-${n}`, titulo: `Historia QTY-${n}`, descripcion: `Descripción QTY-${n}` });
    org.agregarHdu({ codigo: 'QTY-1', titulo: 'Historia QTY-1', descripcion: 'Como usuario quiero activar 2FA', prioridad: 'ALTA', origen: 'JIRA' });
    org.agregarHdu({ ...iguales(2), titulo: 'Recuperar contraseña', prioridad: 'ALTA', origen: 'JIRA', estado: 'PENDIENTE' });
    org.agregarHdu({ ...iguales(9), titulo: 'Otro título', estado: 'CERRADA', origen: 'JIRA' });
    org.agregarHdu({ ...iguales(5), prioridad: 'BAJA', origen: 'JIRA' });
    org.agregarHdu({ ...iguales(6), prioridad: 'CRITICA', origen: 'JIRA' });
    org.agregarHdu({ ...iguales(10), titulo: 'Notificaciones', origen: 'MANUAL', prioridad: 'ALTA' });
    org.agregarHdu({ ...iguales(12), prioridad: 'ALTA', origen: 'MANUAL' });
    const { consulta } = (await consultar()).body;
    assert.deepEqual([consulta.nuevas, consulta.cambiaron, consulta.sinCambios, consulta.conError], [3, 2, 5, 1]);
    const cambio = await items(consulta.id, 'CAMBIO');
    assert.deepEqual(codigos(cambio), ['QTY-2', 'QTY-10']);
    assert.deepEqual(cambio.items[0].cambios, { titulo: { antes: 'Recuperar contraseña', despues: 'Historia QTY-2' }, prioridad: { antes: 'ALTA', despues: 'MEDIA' } });
    assert.deepEqual([cambio.items[0].hdu.estado, cambio.items[0].hdu.qeResponsable, cambio.items[0].origenHdu, cambio.items[0].asignacion, cambio.items[0].marcable], ['PENDIENTE', PERSONAS.qe2.nombre, 'JIRA', null, true]);
    assert.deepEqual([cambio.items[1].origenHdu, cambio.items[1].cambios.titulo], ['MANUAL', { antes: 'Notificaciones', despues: 'Historia QTY-10' }]);
    const sinCambios = await items(consulta.id, 'SIN_CAMBIOS', '&tamanoPagina=100');
    const motivos = Object.fromEntries(sinCambios.items.map((i: { codigo: string; motivo: string }) => [i.codigo, i.motivo]));
    assert.deepEqual(motivos, { 'QTY-1': 'SIN_CAMBIOS', 'QTY-5': 'SIN_CAMBIOS', 'QTY-6': 'SIN_CAMBIOS', 'QTY-9': 'HDU_CERRADA', 'QTY-12': 'SIN_CAMBIOS' });
    assert.ok(sinCambios.items.every((i: { marcable: boolean }) => !i.marcable));
    assert.deepEqual(codigos(await items(consulta.id, 'NUEVA', '&tamanoPagina=100')), ['QTY-3', 'QTY-4', 'QTY-8']);
    assert.ok(org.llamadas.every((l) => !l.includes('upsert')));
  });
});

describe('E5-B05#10 · vida de la consulta', () => {
  it('E5-B05-T22 una segunda consulta pide reemplazar (409 con quién y cuándo); al reemplazar, la anterior queda REEMPLAZADA y sin filas', async () => {
    await listo();
    const a = (await consultar()).body.consulta;
    const conflicto = await consultar();
    assert.deepEqual([conflicto.status, conflicto.body.codigo, conflicto.body.consultaId, conflicto.body.creadaPor, conflicto.body.asignadas, conflicto.body.mensaje], [409, 'CONSULTA_ABIERTA', a.id, { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre }, 0, 'Ya hay una consulta abierta.']);
    assert.ok(Date.parse(conflicto.body.creadaEn) > 0);
    assert.equal(m.jira.llamadas.length, 1);
    const b = (await consultar({ reemplazar: true }, 'adm2')).body.consulta;
    assert.notEqual(b.id, a.id);
    const vieja = (await m.pedir('get', `${CONSULTAR}/${a.id}`, 'adm1')).body;
    assert.deepEqual([vieja.estado, vieja.cerradaPor, vieja.nuevas, vieja.leidas, vieja.version, vieja.asignadas], ['REEMPLAZADA', { id: PERSONAS.adm2.id, nombre: PERSONAS.adm2.nombre }, 10, 11, 2, 0]);
    assert.equal((await consultaDuenio(`SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = '${a.id}'`)).length, 0);
    const lectura = await m.pedir('get', `${CONSULTAR}/${a.id}/items?grupo=NUEVA`, 'adm1');
    assert.deepEqual([lectura.status, lectura.body.codigo, lectura.body.estado, lectura.body.cerradaPor?.id], [409, 'CONSULTA_NO_ABIERTA', 'REEMPLAZADA', PERSONAS.adm2.id]);
    const continuacion = await continuar(a.id);
    assert.deepEqual([continuacion.status, continuacion.body.codigo], [409, 'CONSULTA_NO_ABIERTA']);
    const actual = (await m.pedir('get', `${CONSULTAR}/actual`, 'adm1')).body;
    assert.deepEqual([actual.consulta.id, actual.ultimaCerrada.id, actual.ultimaCerrada.estado], [b.id, a.id, 'REEMPLAZADA']);
  });

  it('E5-B05-T23 una consulta vencida se cierra al leerla, queda sin filas, responde 410 y deja consultar sin reemplazar', async () => {
    await listo('QTY', { config: { consultaVigenciaMs: 1000 } });
    const a = (await consultar()).body.consulta;
    await new Promise((resolver) => setTimeout(resolver, 1300));
    const actual = (await m.pedir('get', `${CONSULTAR}/actual`, 'adm1')).body;
    assert.deepEqual([actual.consulta, actual.ultimaCerrada.id, actual.ultimaCerrada.estado, actual.ultimaCerrada.cerradaPor], [null, a.id, 'VENCIDA', null]);
    assert.equal((await consultaDuenio(`SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = '${a.id}'`)).length, 0);
    const lectura = await m.pedir('get', `${CONSULTAR}/${a.id}/items?grupo=NUEVA`, 'adm1');
    assert.deepEqual([lectura.status, lectura.body.codigo], [410, 'CONSULTA_VENCIDA']);
    assert.equal((await continuar(a.id)).status, 410);
    assert.equal((await consultar()).status, 200);
  });

  it('E5-B05-T23 (perezosa) una consulta pasada de hora que nadie leyó no cuenta como abierta al consultar', async () => {
    await listo('QTY', { config: { consultaVigenciaMs: 1000 } });
    const a = (await consultar()).body.consulta;
    await new Promise((resolver) => setTimeout(resolver, 1300));
    const b = await consultar();
    assert.equal(b.status, 200);
    assert.notEqual(b.body.consulta.id, a.id);
    assert.equal((await m.pedir('get', `${CONSULTAR}/${a.id}`, 'adm1')).body.estado, 'VENCIDA');
  });

  it('E5-B05-T24 descartar purga las filas y deja la consulta DESCARTADA; repetir es 409 CONSULTA_NO_ABIERTA', async () => {
    await listo();
    const a = (await consultar()).body.consulta;
    const d = await m.pedir('post', `${CONSULTAR}/${a.id}/descartes`, 'adm2', {});
    assert.deepEqual([d.status, d.body.estado, d.body.version, d.body.cerradaPor.id, d.body.pendientes], [200, 'DESCARTADA', 2, PERSONAS.adm2.id, 0]);
    assert.equal((await consultaDuenio(`SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = '${a.id}'`)).length, 0);
    const otra = await m.pedir('post', `${CONSULTAR}/${a.id}/descartes`, 'adm1', {});
    assert.deepEqual([otra.status, otra.body.codigo, otra.body.estado], [409, 'CONSULTA_NO_ABIERTA', 'DESCARTADA']);
    assert.equal(org.upserts.length, 0);
    assert.equal((await consultaDuenio("SELECT 1 FROM integraciones.ejecucion_integracion WHERE fase = 'CONFIRMACION'")).length, 0);
  });
});
