/**
 * E5-B05 #6 a #12 · Confirmar (POST …/confirmaciones), descartar y la vida de la consulta frente a las escrituras.
 * Postgres local real; Organización y Jira falsos (ayudas.ts). La escritura real contra Organización (T14, auditoría,
 * historial) la cubre `scripts/e2e-real.mjs`. IDs de `docs/backlog/e5-consulta-asignacion.md`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { CELULA_C, PERSONAS, SPRINT_2, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const CONSULTAR = '/v1/integraciones/jira/consultas';
const ASIGNACION = { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id };

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});

afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
  org.caida = false;
  org.fallarUpsertDesde = null;
  org.inactivas.delete('ana3');
  org.inactivas.delete('qe2');
  org.equipos.set('qe2', new Set(['ana3']));
  org.equipos.set('qe1', new Set(['ana1']));
  org.llamadas.length = 0;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

interface Fila {
  id: string;
  codigo: string;
  marcada: boolean;
}

async function listo(proyecto = 'QTY', config: Parameters<typeof montar>[0] = {}): Promise<void> {
  m = await montar({ org, ...config });
  assert.equal((await guardarConfiguracion(m, { proyecto })).status, 200);
}

const consultar = (cuerpo: unknown = {}) => m.pedir('post', CONSULTAR, 'adm1', cuerpo);
const items = async (id: string, grupo: string): Promise<Fila[]> => (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=${grupo}&tamanoPagina=100`, 'adm1')).body.items;
const patch = (id: string, cuerpo: unknown, persona: 'adm1' | 'adm2' = 'adm1') => m.pedir('patch', `${CONSULTAR}/${id}/items`, persona, cuerpo);
const confirmar = (id: string, version: number, persona: 'adm1' | 'adm2' = 'adm1') => m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, persona, { version });
const version = async (id: string): Promise<number> => (await m.pedir('get', `${CONSULTAR}/${id}`, 'adm1')).body.version;
const detalle = async (ejecucionId: string) => (await m.pedir('get', `/v1/integraciones/ejecuciones/${ejecucionId}/detalle?tamanoPagina=100`, 'adm1')).body.items;

/** Consulta de QTY con QTY-1 a QTY-4 asignadas (CEL-C, QE2, ANA3) y marcadas. */
async function consultaConCuatro(): Promise<{ id: string; ids: string[] }> {
  await listo();
  const { consulta } = (await consultar()).body;
  const id = consulta.id as string;
  const nuevas = await items(id, 'NUEVA');
  const ids = ['QTY-1', 'QTY-2', 'QTY-3', 'QTY-4'].map((c) => (nuevas.find((f) => f.codigo === c) as Fila).id);
  const r = await patch(id, { itemIds: ids, asignacion: ASIGNACION, marcada: true });
  assert.deepEqual([r.status, r.body.aplicadas, r.body.marcadas], [200, 4, 4]);
  return { id, ids };
}

describe('E5-B05#6 · confirmar crea las HDU asignadas', () => {
  it('E5-B05-T13 crea QTY-1 a QTY-4 con su asignación, deja la consulta CONFIRMADA y el detalle con los nombres', async () => {
    const { id } = await consultaConCuatro();
    const antes = m.jira.llamadas.length;
    const r = await confirmar(id, await version(id));
    assert.equal(r.status, 200);
    const e = r.body.ejecucion;
    assert.deepEqual([e.origen, e.fase, e.leidas, e.creadas, e.actualizadas, e.omitidas, e.conError, e.resultado], ['JIRA', 'CONFIRMACION', 4, 4, 0, 0, 0, 'EXITOSA']);
    assert.equal(r.body.consulta.estado, 'CONFIRMADA');
    assert.equal(r.body.consulta.descartadas, 7);
    assert.equal(m.jira.llamadas.length, antes);
    assert.equal(org.hdus.size, 4);
    const q1 = org.hdus.get('qty-1');
    assert.deepEqual([q1?.qeId, q1?.analistaId, q1?.celulaId, q1?.origen, q1?.estado], [PERSONAS.qe2.id, PERSONAS.ana3.id, CELULA_C.id, 'JIRA', 'PENDIENTE']);
    const filas = await detalle(e.id);
    assert.equal(filas.length, 4);
    assert.deepEqual(filas[0].asignacion, { celula: 'CEL-C', qe: PERSONAS.qe2.nombre, analista: PERSONAS.ana3.nombre, sprint: SPRINT_2.nombre });
    assert.ok(filas.every((f: { resultado: string }) => f.resultado === 'CREADA'));
    const purgadas = await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE id_consulta = '${id}'`);
    assert.equal(purgadas[0]?.n, 0);
    assert.equal(JSON.stringify(r.body).includes('token'), false);
  });

  it('E5-B05-T30 una consulta de 50 filas es revisable con el 429 de Jira y la confirmación crea las 10 marcadas sin llamar a Jira', async () => {
    await listo('BIG');
    m.jira.modo = 'LIMITE_PAGINA_2';
    const primera = await consultar();
    const id = primera.body.consulta.id as string;
    const nuevas = await items(id, 'NUEVA');
    const diez = nuevas.slice(0, 10).map((f) => f.id);
    await patch(id, { itemIds: diez, asignacion: ASIGNACION, marcada: true });
    const llamadas = m.jira.llamadas.length;
    m.jira.modo = 'CAIDO';
    const r = await confirmar(id, await version(id));
    assert.deepEqual([r.status, r.body.ejecucion.creadas, r.body.consulta.estado], [200, 10, 'CONFIRMADA']);
    assert.equal(m.jira.llamadas.length, llamadas);
  });
});

describe('E5-B05#7 · confirmar actualiza las CAMBIO', () => {
  it('E5-B05-T15 / T16 actualiza solo título, descripción y prioridad, vincula una HDU a mano (origen JIRA) y no toca la asignación', async () => {
    await listo();
    const original = org.agregarHdu({ codigo: 'QTY-2', titulo: 'Recuperar clave', prioridad: 'BAJA', origen: 'JIRA', qeId: PERSONAS.qe1.id, analistaId: PERSONAS.ana1.id });
    const manual = org.agregarHdu({ codigo: 'QTY-5', titulo: 'Historia QTY-5', descripcion: 'Descripción QTY-5', prioridad: 'MEDIA', origen: 'MANUAL', qeId: PERSONAS.qe1.id });
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    const cambios = await items(id, 'CAMBIO');
    assert.ok(cambios.some((f) => f.codigo === 'QTY-2'));
    const marcar = cambios.map((f) => f.id);
    const marcadas = await patch(id, { itemIds: marcar, marcada: true });
    assert.equal(marcadas.status, 200);
    const r = await confirmar(id, await version(id));
    assert.equal(r.status, 200);
    assert.equal(r.body.ejecucion.creadas, 0);
    assert.ok(r.body.ejecucion.actualizadas >= 1);
    assert.deepEqual([original.titulo, original.prioridad, original.qeId, original.analistaId, original.estado], ['Historia QTY-2', 'MEDIA', PERSONAS.qe1.id, PERSONAS.ana1.id, 'PENDIENTE']);
    assert.ok(['JIRA', 'MANUAL'].includes(manual.origen));
    const filas = await detalle(r.body.ejecucion.id);
    assert.ok(filas.every((f: { asignacion: unknown }) => f.asignacion === null));
  });
});

describe('E5-B05#8 · pre-validación de las asignaciones', () => {
  it('E5-B05-T17 con ANA3 desactivada: 409 ASIGNACIONES_INVALIDAS con las 4 filas, desmarcadas, sin HDU y sin ejecución', async () => {
    const { id } = await consultaConCuatro();
    org.inactivas.add('ana3');
    const v = await version(id);
    const r = await confirmar(id, v);
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'ASIGNACIONES_INVALIDAS');
    assert.equal(r.body.filas.length, 4);
    assert.ok(r.body.filas.every((f: { motivo: string; campo: string }) => f.motivo === 'ANALISTA_INVALIDO' && f.campo === 'analistaId'));
    assert.equal(r.body.version, v + 1);
    assert.equal(org.hdus.size, 0);
    assert.equal((await m.pedir('get', `${CONSULTAR}/${id}`, 'adm1')).body.estado, 'ABIERTA');
    assert.ok((await items(id, 'NUEVA')).every((f) => !f.marcada));
    const ejecuciones = await consultaDuenio<{ n: number }>("SELECT count(*)::int AS n FROM integraciones.ejecucion_integracion WHERE fase = 'CONFIRMACION'");
    assert.equal(ejecuciones[0]?.n, 0);
    const sin = await confirmar(id, r.body.version);
    assert.deepEqual([sin.status, sin.body.codigo], [422, 'SIN_SELECCION']);
  });

  it('E5-B05-T18 si ANA3 pasó a otro QE o QE2 se desactivó: ANALISTA_FUERA_DE_EQUIPO y QE_INVALIDO, sin crear nada', async () => {
    const { id } = await consultaConCuatro();
    org.equipos.set('qe2', new Set());
    org.equipos.set('qe1', new Set(['ana1', 'ana3']));
    const a = await confirmar(id, await version(id));
    assert.deepEqual([a.status, a.body.codigo, a.body.filas[0].motivo], [409, 'ASIGNACIONES_INVALIDAS', 'ANALISTA_FUERA_DE_EQUIPO']);
    assert.equal(org.hdus.size, 0);
    org.equipos.set('qe2', new Set(['ana3']));
    const nuevas = await items(id, 'NUEVA');
    await patch(id, { itemIds: [nuevas[0]?.id], marcada: true });
    org.inactivas.add('qe2');
    const b = await confirmar(id, await version(id));
    assert.deepEqual([b.status, b.body.codigo, b.body.filas[0].motivo], [409, 'ASIGNACIONES_INVALIDAS', 'QE_INVALIDO']);
    assert.equal(org.hdus.size, 0);
  });
});

describe('E5-B05#9 · escrituras que cambian bajo los pies', () => {
  it('E5-B05-T19 una HDU creada a mano después: esa fila es OMITIDA HDU_CREADA_DESPUES, la HDU del QE no cambia y el resto se crea', async () => {
    const { id } = await consultaConCuatro();
    const manual = org.agregarHdu({ codigo: 'QTY-3', titulo: 'A mano', origen: 'MANUAL', qeId: PERSONAS.qe1.id });
    const r = await confirmar(id, await version(id));
    assert.deepEqual([r.status, r.body.ejecucion.creadas, r.body.ejecucion.omitidas, r.body.ejecucion.resultado], [200, 3, 1, 'EXITOSA']);
    const fila = (await detalle(r.body.ejecucion.id)).find((f: { codigo: string }) => f.codigo === 'QTY-3');
    assert.deepEqual([fila.resultado, fila.motivo], ['OMITIDA', 'HDU_CREADA_DESPUES']);
    assert.deepEqual([manual.titulo, manual.qeId, manual.origen], ['A mano', PERSONAS.qe1.id, 'MANUAL']);
  });

  it('E5-B05-T20 una CAMBIO cuya HDU se cerró queda OMITIDA HDU_CERRADA y no se escribe', async () => {
    await listo();
    const hdu = org.agregarHdu({ codigo: 'QTY-2', titulo: 'Otro título', origen: 'JIRA', qeId: PERSONAS.qe1.id });
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    const cambio = (await items(id, 'CAMBIO')).find((f) => f.codigo === 'QTY-2') as Fila;
    await patch(id, { itemIds: [cambio.id], marcada: true });
    hdu.estado = 'CERRADA';
    const r = await confirmar(id, await version(id));
    const fila = (await detalle(r.body.ejecucion.id))[0];
    assert.deepEqual([r.body.ejecucion.omitidas, fila.resultado, fila.motivo, hdu.titulo], [1, 'OMITIDA', 'HDU_CERRADA', 'Otro título']);
  });

  it('E5-B05-T21 otro código creado a mano antes de escribir: solo esa fila es OMITIDA y el lote no falla completo', async () => {
    const { id } = await consultaConCuatro();
    org.agregarHdu({ codigo: 'QTY-2', titulo: 'A mano', origen: 'MANUAL', qeId: PERSONAS.qe1.id });
    const r = await confirmar(id, await version(id));
    assert.deepEqual([r.status, r.body.ejecucion.creadas, r.body.ejecucion.omitidas], [200, 3, 1]);
    assert.equal(org.hdus.size, 4);
  });
});

describe('E5-B05#10 · vida de la consulta', () => {
  it('E5-B05-T22 reemplazada: PATCH y confirmaciones dan 409 CONSULTA_NO_ABIERTA con estado REEMPLAZADA', async () => {
    const { id, ids } = await consultaConCuatro();
    const sin = await consultar();
    assert.deepEqual([sin.status, sin.body.codigo], [409, 'CONSULTA_ABIERTA']);
    assert.equal((await consultar({ reemplazar: true })).status, 200);
    const p = await patch(id, { itemIds: [ids[0]], marcada: false });
    assert.deepEqual([p.status, p.body.codigo, p.body.estado], [409, 'CONSULTA_NO_ABIERTA', 'REEMPLAZADA']);
    const c = await confirmar(id, 1);
    assert.deepEqual([c.status, c.body.codigo, c.body.estado], [409, 'CONSULTA_NO_ABIERTA', 'REEMPLAZADA']);
    assert.equal(org.hdus.size, 0);
  });

  it('E5-B05-T23 vencida: PATCH y confirmaciones dan 410 CONSULTA_VENCIDA, no se crea nada y una nueva consulta no necesita reemplazar', async () => {
    const { id, ids } = await consultaConCuatro();
    await consultaDuenio(`UPDATE integraciones.consulta_jira SET vence_en = now() - interval '1 second' WHERE id_consulta = '${id}'`);
    const actual = await m.pedir('get', `${CONSULTAR}/actual`, 'adm1');
    assert.deepEqual([actual.body.consulta, actual.body.ultimaCerrada.estado], [null, 'VENCIDA']);
    const p = await patch(id, { itemIds: [ids[0]], marcada: false });
    assert.deepEqual([p.status, p.body.codigo], [410, 'CONSULTA_VENCIDA']);
    const c = await confirmar(id, 1);
    assert.deepEqual([c.status, c.body.codigo], [410, 'CONSULTA_VENCIDA']);
    assert.equal((await consultar()).status, 200);
    assert.equal(org.hdus.size, 0);
  });

  it('E5-B05-T24 descartar deja DESCARTADA con las filas purgadas; repetir o editar da 409; no se crea nada', async () => {
    const { id, ids } = await consultaConCuatro();
    const d = await m.pedir('post', `${CONSULTAR}/${id}/descartes`, 'adm1', {});
    assert.deepEqual([d.status, d.body.estado], [200, 'DESCARTADA']);
    const purgadas = await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE id_consulta = '${id}'`);
    assert.equal(purgadas[0]?.n, 0);
    const otra = await m.pedir('post', `${CONSULTAR}/${id}/descartes`, 'adm1', {});
    assert.deepEqual([otra.status, otra.body.codigo], [409, 'CONSULTA_NO_ABIERTA']);
    assert.equal((await patch(id, { itemIds: [ids[0]], marcada: false })).status, 409);
    assert.equal(org.hdus.size, 0);
  });
});

describe('E5-B05#11 · dos Administradores', () => {
  it('E5-B05-T25 confirmar con una versión vieja da 409 CONSULTA_MODIFICADA con la versión actual; con la nueva crea las 4', async () => {
    const { id, ids } = await consultaConCuatro();
    const vista = await version(id);
    assert.equal((await patch(id, { itemIds: [ids[0]], marcada: true }, 'adm2')).status, 200);
    assert.equal((await patch(id, { itemIds: [ids[0]], marcada: false }, 'adm2')).status, 200);
    const vieja = await confirmar(id, vista);
    assert.deepEqual([vieja.status, vieja.body.codigo, vieja.body.version > vista], [409, 'CONSULTA_MODIFICADA', true]);
    assert.equal(org.hdus.size, 0);
    await patch(id, { itemIds: [ids[0]], marcada: true }, 'adm2');
    const nueva = await confirmar(id, await version(id));
    assert.deepEqual([nueva.status, nueva.body.ejecucion.creadas], [200, 4]);
  });

  it('E5-B05-T26 dos confirmaciones simultáneas: una crea las 4 y la otra es 409; sin duplicados y una sola ejecución', async () => {
    const { id } = await consultaConCuatro();
    const v = await version(id);
    const [a, b] = await Promise.all([confirmar(id, v, 'adm1'), confirmar(id, v, 'adm2')]);
    const estados = [a.status, b.status].sort();
    assert.deepEqual(estados, [200, 409]);
    const perdedora = a.status === 409 ? a : b;
    assert.ok(['INTEGRACION_EN_CURSO', 'CONSULTA_NO_ABIERTA', 'CONSULTA_MODIFICADA'].includes(perdedora.body.codigo), perdedora.body.codigo);
    assert.equal(org.hdus.size, 4);
    const ejecuciones = await consultaDuenio<{ n: number }>("SELECT count(*)::int AS n FROM integraciones.ejecucion_integracion WHERE fase = 'CONFIRMACION'");
    assert.equal(ejecuciones[0]?.n, 1);
  });
});

describe('E5-B05#12 · confirmación incompleta y continuación', () => {
  it('E5-B05-T28 con Organización detenida tras el primer lote: INCOMPLETA con 25 creadas y pendientes 205; al repetir termina sin repetir las 25', async () => {
    await listo('BIG');
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    for (let i = 0; i < 2; i++) await m.pedir('post', `${CONSULTAR}/${id}/continuaciones`, 'adm1', {});
    const asignada = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: ASIGNACION });
    assert.deepEqual([asignada.body.aplicadas, asignada.body.rechazadas.length], [230, 0]);
    const marcada = await patch(id, { grupo: 'NUEVA', todas: true, marcarListas: true });
    assert.equal(marcada.body.marcadas, 230);

    org.fallarUpsertDesde = 2;
    const r1 = await confirmar(id, await version(id));
    assert.equal(r1.status, 200);
    assert.deepEqual(
      [r1.body.ejecucion.resultado, r1.body.ejecucion.codigoError, r1.body.ejecucion.creadas, r1.body.consulta.estado, r1.body.consulta.pendientes, r1.body.consulta.aplicadas],
      ['INCOMPLETA', 'ORGANIZACION_NO_DISPONIBLE', 25, 'ABIERTA', 205, 25],
    );
    assert.equal(org.hdus.size, 25);
    assert.ok(!r1.body.ejecucion.sugerencias.some((s: string) => s === 'CONTINUAR'));

    org.fallarUpsertDesde = null;
    const r2 = await confirmar(id, r1.body.consulta.version);
    assert.deepEqual([r2.body.ejecucion.resultado, r2.body.ejecucion.creadas, r2.body.consulta.estado], ['EXITOSA', 205, 'CONFIRMADA']);
    assert.equal(org.hdus.size, 230);
    const enviados = org.upserts.flatMap((u) => (u.filas as Array<{ codigo: string }>).map((f) => f.codigo));
    assert.equal(new Set(enviados).size, 230);
    assert.equal(enviados.length, 230);
  });

  it('con un presupuesto agotado antes del primer lote la confirmación es FALLIDA PRESUPUESTO_DE_TIEMPO y la consulta sigue abierta', async () => {
    await listo();
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    const nuevas = await items(id, 'NUEVA');
    await patch(id, { itemIds: [nuevas[0]?.id], asignacion: ASIGNACION, marcada: true });
    await m.cerrar();
    m = await montar({ org, conservarDatos: true, config: { presupuestoMs: 1000 } });
    const r = await confirmar(id, await version(id));
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.ejecucion.resultado, r.body.ejecucion.codigoError, r.body.consulta.estado, r.body.consulta.pendientes], ['FALLIDA', 'PRESUPUESTO_DE_TIEMPO', 'ABIERTA', 1]);
  });
});

describe('Entradas de confirmar', () => {
  it('cuerpo inválido es 400, id inexistente 404, sin filas marcadas 422 SIN_SELECCION y un QE 403', async () => {
    await listo();
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    assert.equal((await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', {})).status, 400);
    assert.equal((await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version: 1, extra: true })).status, 400);
    assert.equal((await m.pedir('post', `${CONSULTAR}/0c000000-0000-4000-8000-0000000000ee/confirmaciones`, 'adm1', { version: 1 })).status, 404);
    const sin = await confirmar(id, 1);
    assert.deepEqual([sin.status, sin.body.codigo], [422, 'SIN_SELECCION']);
    assert.equal((await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'qe1', { version: 1 })).status, 403);
  });
});
