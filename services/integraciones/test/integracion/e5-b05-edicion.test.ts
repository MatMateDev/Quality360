/**
 * E5-B05 #3 a #5, #11, #12, #13 · Editar filas (PATCH …/items): asignación con las 4 reglas de D138, propuesta de sprint,
 * marcado, edición en grupo con rechazos informados, consulta compartida y entradas hostiles. Postgres local real;
 * Organización y Jira falsos (ayudas.ts). IDs de `docs/backlog/e5-consulta-asignacion.md`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { CELULA_A, CELULA_C, PERSONAS, SPRINT_1, SPRINT_2, SPRINT_DE_A, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
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
  org.llamadas.length = 0;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

async function listo(proyecto = 'QTY'): Promise<void> {
  m = await montar({ org });
  assert.equal((await guardarConfiguracion(m, { proyecto })).status, 200);
}

interface Item {
  id: string;
  codigo: string;
  asignacion: { celula: { id: string } | null; qeResponsable: { id: string } | null; analista: { id: string } | null; sprint: { id: string; nombre: string } | null; sprintOrigen: string | null } | null;
  completa: boolean;
  faltantes: string[];
  marcada: boolean;
  marcable: boolean;
  advertencias: string[];
  asignadoPor: { id: string } | null;
}

const consultar = (cuerpo: unknown = {}) => m.pedir('post', CONSULTAR, 'adm1', cuerpo);
const items = async (id: string, grupo: string, persona: 'adm1' | 'adm2' = 'adm1'): Promise<Item[]> =>
  (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=${grupo}&tamanoPagina=100`, persona)).body.items;
const patch = (id: string, cuerpo: unknown, persona: 'adm1' | 'adm2' | 'qe1' = 'adm1') => m.pedir('patch', `${CONSULTAR}/${id}/items`, persona, cuerpo);
const version = async (id: string): Promise<number> => (await m.pedir('get', `${CONSULTAR}/${id}`, 'adm1')).body.version;
const ficha = (lista: Item[], codigo: string): Item => lista.find((i) => i.codigo === codigo) as Item;

/** Consulta A (QTY, 10 nuevas) y las filas por código. */
async function consultaA() {
  await listo();
  const { consulta } = (await consultar()).body;
  const nuevas = await items(consulta.id, 'NUEVA');
  return { id: consulta.id as string, nuevas, f: (codigo: string) => ficha(nuevas, codigo).id };
}

describe('E5-B05#3 · la edición no llama a Jira', () => {
  it('E5-B05-T06 con el Jira falso caído, GET items y PATCH responden 200 y no hay peticiones nuevas a Jira', async () => {
    const { id, f } = await consultaA();
    const antes = m.jira.llamadas.length;
    m.jira.modo = 'CAIDO';
    assert.equal((await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=NUEVA`, 'adm1')).status, 200);
    assert.equal((await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } })).status, 200);
    assert.equal(m.jira.llamadas.length, antes);
  });
});

describe('E5-B05#4 · asignar una fila', () => {
  it('E5-B05-T07 CEL-C, QE2 y ANA3 dejan la fila completa con el sprint propuesto (JIRA) y la versión sube en 1', async () => {
    const { id, f } = await consultaA();
    const v0 = await version(id);
    const r = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.aplicadas, r.body.marcadas, r.body.incompletas, r.body.rechazadas, r.body.desmarcadas, r.body.version], [1, 0, 0, [], [], v0 + 1]);
    const fila = r.body.items[0] as Item;
    assert.deepEqual([fila.completa, fila.asignacion?.sprint?.id, fila.asignacion?.sprintOrigen, fila.asignacion?.analista?.id, fila.asignadoPor?.id], [true, SPRINT_2.id, 'JIRA', PERSONAS.ana3.id, PERSONAS.adm1.id]);
    assert.equal(await version(id), v0 + 1);
  });

  it('E5-B05-T08 cada combinación inválida se rechaza con su código y campo, y la fila y la versión no cambian', async () => {
    const { id, f } = await consultaA();
    const v0 = await version(id);
    const rechaza = async (asignacion: Record<string, unknown>) => patch(id, { itemIds: [f('QTY-1')], asignacion });
    const casos: Array<[Record<string, unknown>, string, string]> = [
      [{ qeId: PERSONAS.ana1.id }, 'QE_INVALIDO', 'qeId'],
      [{ qeId: PERSONAS.inact1.id }, 'QE_INVALIDO', 'qeId'],
      [{ qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana1.id }, 'ANALISTA_FUERA_DE_EQUIPO', 'analistaId'],
      [{ qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana4.id }, 'ANALISTA_FUERA_DE_EQUIPO', 'analistaId'],
      [{ celulaId: CELULA_C.id, sprintId: SPRINT_DE_A.id }, 'CATALOGO_INVALIDO', 'sprintId'],
      [{ celulaId: '0ce00000-0000-4000-8000-0000000000ff' }, 'CATALOGO_INVALIDO', 'celulaId'],
    ];
    for (const [asignacion, codigo, campo] of casos) {
      const r = await rechaza(asignacion);
      assert.deepEqual([r.status, r.body.codigo, r.body.detalles?.[0]?.campo], [422, codigo, campo], JSON.stringify(asignacion));
    }
    org.inactivas.add('ana3');
    const r = await rechaza({ qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id });
    org.inactivas.delete('ana3');
    assert.deepEqual([r.status, r.body.codigo], [422, 'ANALISTA_INVALIDO']);
    assert.equal((await rechaza({ celulaId: 'no-uuid' })).status, 400);
    assert.equal((await patch(id, { itemIds: [f('QTY-1')], estado: 'CONFIRMADA' })).status, 400);
    assert.equal(await version(id), v0);
    assert.deepEqual(ficha(await items(id, 'NUEVA'), 'QTY-1').asignacion, { celula: null, qeResponsable: null, analista: null, sprint: null, sprintOrigen: null });
  });

  it('E5-B05-T09 el sprint se propone por nombre de Jira (JIRA), por el respaldo (RESPALDO, con advertencia si el nombre no existe) y se limpia al cambiar a una célula sin ese sprint', async () => {
    const { id, f } = await consultaA();
    const en = async (codigo: string, celulaId: string) => (await patch(id, { itemIds: [f(codigo)], asignacion: { celulaId } })).body.items[0] as Item;
    const q1 = await en('QTY-1', CELULA_C.id);
    assert.deepEqual([q1.asignacion?.sprint?.nombre, q1.asignacion?.sprintOrigen], ['E5 Sprint 2', 'JIRA']);
    const q4 = await en('QTY-4', CELULA_C.id);
    assert.deepEqual([q4.asignacion?.sprint?.id, q4.asignacion?.sprintOrigen, q4.advertencias.includes('SPRINT_NO_ENCONTRADO')], [SPRINT_1.id, 'RESPALDO', false]);
    const q3 = await en('QTY-3', CELULA_C.id);
    assert.deepEqual([q3.asignacion?.sprintOrigen, q3.advertencias.includes('SPRINT_NO_ENCONTRADO')], ['RESPALDO', true]);
    const q1a = await en('QTY-1', CELULA_A.id);
    assert.deepEqual([q1a.asignacion?.sprint, q1a.completa], [null, false]);
  });
});

describe('E5-B05#5 · marcar', () => {
  it('E5-B05-T10 se marca una completa; una incompleta es 422 ASIGNACION_INCOMPLETA con faltantes; una SIN_CAMBIOS es 422 FILA_NO_MARCABLE; una CAMBIO se marca sin asignación', async () => {
    const iguales = (n: number) => ({ codigo: `QTY-${n}`, titulo: `Historia QTY-${n}`, descripcion: `Descripción QTY-${n}` });
    await listo();
    org.agregarHdu({ ...iguales(2), prioridad: 'MEDIA', origen: 'JIRA' });
    org.agregarHdu({ codigo: 'QTY-4', titulo: 'Otro nombre', origen: 'JIRA' });
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    const nuevas = await items(id, 'NUEVA');
    const q1 = ficha(nuevas, 'QTY-1');
    const q3 = ficha(nuevas, 'QTY-3');
    await patch(id, { itemIds: [q1.id], asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    const ok = await patch(id, { itemIds: [q1.id], marcada: true });
    assert.deepEqual([ok.status, ok.body.marcadas, ok.body.items[0].marcada], [200, 1, true]);
    const incompleta = await patch(id, { itemIds: [q3.id], marcada: true });
    assert.deepEqual([incompleta.status, incompleta.body.codigo, incompleta.body.detalles.map((d: { campo: string }) => d.campo)], [422, 'ASIGNACION_INCOMPLETA', ['celulaId', 'qeId', 'analistaId', 'sprintId']]);
    const sinCambios = ficha(await items(id, 'SIN_CAMBIOS'), 'QTY-2');
    const r = await patch(id, { itemIds: [sinCambios.id], marcada: true });
    assert.deepEqual([r.status, r.body.codigo], [422, 'FILA_NO_MARCABLE']);
    const cambio = (await items(id, 'CAMBIO'))[0] as Item;
    const rc = await patch(id, { itemIds: [cambio.id], marcada: true });
    assert.deepEqual([rc.status, rc.body.items[0].marcada, rc.body.items[0].asignacion], [200, true, null]);
  });

  it('E5-B05-T11 el grupo completo se asigna de una vez; con un analista de otro equipo todas se rechazan y no cambian; una SIN_CAMBIOS entre itemIds va a rechazadas', async () => {
    const iguales = (n: number) => ({ codigo: `QTY-${n}`, titulo: `Historia QTY-${n}`, descripcion: `Descripción QTY-${n}` });
    await listo();
    org.agregarHdu({ ...iguales(2), prioridad: 'MEDIA', origen: 'JIRA' });
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    const v0 = await version(id);
    const total = (await items(id, 'NUEVA')).length;
    const uno = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    assert.deepEqual([uno.status, uno.body.aplicadas, uno.body.rechazadas, uno.body.version], [200, total, [], v0 + 1]);
    assert.equal(uno.body.items.length, total);
    const v1 = await version(id);
    const dos = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: { qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana1.id } });
    assert.equal(dos.body.aplicadas, 0);
    assert.equal(dos.body.rechazadas.length, total);
    assert.ok(dos.body.rechazadas.every((x: { motivo: string; campo: string }) => x.motivo === 'ANALISTA_FUERA_DE_EQUIPO' && x.campo === 'analistaId'));
    assert.equal(await version(id), v1);
    assert.ok((await items(id, 'NUEVA')).every((i) => i.asignacion?.analista?.id === PERSONAS.ana3.id));
    const sinCambios = ficha(await items(id, 'SIN_CAMBIOS'), 'QTY-2');
    const q1 = ficha(await items(id, 'NUEVA'), 'QTY-1');
    const tres = await patch(id, { itemIds: [sinCambios.id, q1.id], asignacion: { celulaId: CELULA_C.id } });
    assert.deepEqual([tres.status, tres.body.rechazadas.map((x: { codigo: string; motivo: string }) => [x.codigo, x.motivo])], [200, [['QTY-2', 'FILA_NO_ASIGNABLE']]]);
  });

  it('E5-B05-T12 cambiar la célula de una fila completa y marcada a otra sin ese sprint la desmarca y lo informa', async () => {
    const { id, f } = await consultaA();
    await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id }, marcada: true });
    const r = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_A.id } });
    assert.deepEqual([r.status, r.body.desmarcadas, r.body.items[0].marcada, r.body.items[0].completa], [200, ['QTY-1'], false, false]);
  });

  it('marcarListas marca las completas del grupo e informa cuántas siguen incompletas; sin cambios reales la versión no sube', async () => {
    const { id, f } = await consultaA();
    await patch(id, { itemIds: [f('QTY-1'), f('QTY-3')], asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    const r = await patch(id, { grupo: 'NUEVA', todas: true, marcarListas: true });
    assert.deepEqual([r.body.marcadas, r.body.incompletas, r.body.aplicadas], [2, 8, 2]);
    const v = await version(id);
    const otra = await patch(id, { grupo: 'NUEVA', todas: true, marcarListas: true });
    assert.deepEqual([otra.body.marcadas, otra.body.aplicadas, otra.body.version], [0, 0, v]);
    assert.equal(await version(id), v);
  });

  it('la búsqueda q del alcance de grupo limita las filas editadas', async () => {
    const { id } = await consultaA();
    const r = await patch(id, { grupo: 'NUEVA', todas: true, q: 'qty-12', asignacion: { celulaId: CELULA_C.id } });
    assert.deepEqual([r.body.aplicadas, r.body.items.map((i: Item) => i.codigo)], [1, ['QTY-12']]);
  });
});

describe('E5-B05#4 · DEF-E5C-01 · ediciones paralelas sobre la misma fila', () => {
  it('dos PATCH simultáneos de campos distintos (célula y QE) conservan ambos campos y el sprint propuesto', async () => {
    const { id, nuevas } = await consultaA();
    const filas = nuevas.slice(0, 8);
    const pares = filas.flatMap((fila) => [
      patch(id, { itemIds: [fila.id], asignacion: { celulaId: CELULA_C.id } }),
      patch(id, { itemIds: [fila.id], asignacion: { qeId: PERSONAS.qe2.id } }),
    ]);
    for (const r of await Promise.all(pares)) assert.equal(r.status, 200);
    const despues = await items(id, 'NUEVA');
    for (const fila of filas) {
      const f = ficha(despues, fila.codigo);
      assert.equal(f.asignacion?.celula?.id, CELULA_C.id, `${fila.codigo}: la célula no se pierde`);
      assert.equal(f.asignacion?.qeResponsable?.id, PERSONAS.qe2.id, `${fila.codigo}: el QE no se pierde`);
      assert.notEqual(f.asignacion?.sprint ?? null, null, `${fila.codigo}: el sprint propuesto no se pierde`);
    }
  });

  it('dos PATCH en grupo con las mismas filas en orden distinto terminan sin interbloqueo', async () => {
    const { id, nuevas } = await consultaA();
    const ids = nuevas.slice(0, 6).map((i) => i.id);
    const [a, b] = await Promise.all([
      patch(id, { itemIds: ids, asignacion: { celulaId: CELULA_C.id } }),
      patch(id, { itemIds: [...ids].reverse(), asignacion: { qeId: PERSONAS.qe2.id } }),
    ]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    for (const f of (await items(id, 'NUEVA')).filter((i) => ids.includes(i.id))) {
      assert.deepEqual([f.asignacion?.celula?.id, f.asignacion?.qeResponsable?.id], [CELULA_C.id, PERSONAS.qe2.id]);
    }
  });
});

describe('E5-B05#11 · consulta compartida', () => {
  it('E5-B05-T27 otro Administrador edita la misma consulta y asignadoPor es él', async () => {
    const { id, f } = await consultaA();
    const r = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } }, 'adm2');
    assert.deepEqual([r.status, r.body.items[0].asignadoPor.id], [200, PERSONAS.adm2.id]);
    assert.equal((await patch(id, { itemIds: [f('QTY-1')], marcada: false }, 'qe1')).status, 403);
  });
});

describe('E5-B05#12 · una consulta grande', () => {
  it('E5-B05-T28 un solo PATCH asigna 230 filas y termina en menos de 3 s con una sola llamada de validación', async () => {
    await listo('BIG');
    const { consulta } = (await consultar()).body;
    const id = consulta.id as string;
    for (let i = 0; i < 2; i++) await m.pedir('post', `${CONSULTAR}/${id}/continuaciones`, 'adm1', {});
    org.llamadas.length = 0;
    const t0 = Date.now();
    const r = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    const ms = Date.now() - t0;
    assert.deepEqual([r.status, r.body.aplicadas, r.body.rechazadas.length, r.body.items.length], [200, 230, 0, 100]);
    assert.ok(ms < 3000, `tardó ${ms} ms`);
    assert.equal(org.llamadas.filter((l) => l.endsWith('/asignaciones/validar')).length, 1);
    const filas = await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE id_consulta = '${id}' AND analista_id = '${PERSONAS.ana3.id}'`);
    assert.equal(filas[0]?.n, 230);
  });
});

describe('E5-B05#13 · entradas hostiles', () => {
  it('E5-B05-T32 campos desconocidos son 400, un itemId de otra consulta es 404 y Organización caída es 503 sin cambios', async () => {
    const { id, f } = await consultaA();
    for (const extra of ['origen', 'estado', 'creadoPor']) {
      assert.equal((await patch(id, { itemIds: [f('QTY-1')], marcada: true, [extra]: 'x' })).status, 400, extra);
    }
    const ajena = await patch(id, { itemIds: ['0c000000-0000-4000-8000-0000000000ee'], marcada: true });
    assert.deepEqual([ajena.status, ajena.body.codigo], [404, 'CONSULTA_NO_ENCONTRADA']);
    assert.equal((await patch('0c000000-0000-4000-8000-0000000000ee', { itemIds: [f('QTY-1')], marcada: true })).status, 404);
    assert.equal((await patch(id, { itemIds: [f('QTY-1')], grupo: 'NUEVA', todas: true, marcada: true })).status, 400);
    assert.equal((await patch(id, { itemIds: [f('QTY-1')] })).status, 400);
    const v = await version(id);
    org.caida = true;
    const r = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } });
    org.caida = false;
    assert.deepEqual([r.status, r.body.codigo], [503, 'SERVICIO_NO_DISPONIBLE']);
    assert.equal(await version(id), v);
  });

  it('una consulta cerrada responde 409 CONSULTA_NO_ABIERTA y una vencida 410', async () => {
    const { id, f } = await consultaA();
    await consultaDuenio(`UPDATE integraciones.consulta_jira SET vence_en = now() - interval '1 minute' WHERE id_consulta = '${id}'`);
    const vencida = await patch(id, { itemIds: [f('QTY-1')], marcada: false });
    assert.deepEqual([vencida.status, vencida.body.codigo], [410, 'CONSULTA_VENCIDA']);
    const cerrada = await patch(id, { itemIds: [f('QTY-1')], marcada: false });
    assert.deepEqual([cerrada.status, cerrada.body.codigo], [410, 'CONSULTA_VENCIDA']);
  });
});

describe('E5-B07#1 a #3 · Analista único del QE (D201)', () => {
  afterEach(() => {
    org.equipos.set('qe1', new Set(['ana1']));
    org.equipos.set('qe2', new Set(['ana3']));
    org.inactivas.delete('ana3');
    org.inactivas.delete('ana4');
    org.versionAnterior = false;
  });

  type ItemB07 = Item & { analistaAuto: boolean; revision: number; aplicando: boolean };
  const asignarQe = async (qe: 'qe1' | 'qe2') => {
    const { id, f } = await consultaA();
    const antes = await version(id);
    const r = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS[qe].id } });
    return { id, f, antes, r, fila: async () => ficha(await items(id, 'NUEVA'), 'QTY-1') as ItemB07 };
  };

  it('E5-B07-T01 con exactamente un Analista activo en el equipo vigente la fila queda con él, analistaAuto true; version y revision suben', async () => {
    const { id, antes, r, fila } = await asignarQe('qe2');
    assert.equal(r.status, 200);
    const item = r.body.items[0];
    assert.deepEqual([item.asignacion.analista.id, item.analistaAuto, item.revision, item.completa], [PERSONAS.ana3.id, true, 2, true]);
    assert.equal(await version(id), antes + 1);
    assert.deepEqual([(await fila()).analistaAuto, (await fila()).revision], [true, 2]);
  });

  it('E5-B07-T02 con 0, 2+ o ninguno activo queda vacío y sin error; con 1 activo y otros inactivos se asigna el activo; una supervisión cerrada no cuenta', async () => {
    org.equipos.set('qe1', new Set(['ana1', 'ana4']));
    const dos = await asignarQe('qe1');
    assert.equal(dos.r.status, 200);
    assert.deepEqual([dos.r.body.items[0].asignacion.analista, dos.r.body.items[0].analistaAuto, dos.r.body.items[0].asignacion.qeResponsable.id], [null, false, PERSONAS.qe1.id]);
    await m.cerrar();

    org.equipos.set('qe1', new Set());
    const cero = await asignarQe('qe1');
    assert.deepEqual([cero.r.status, cero.r.body.items[0].asignacion.analista, cero.r.body.items[0].analistaAuto], [200, null, false]);
    await m.cerrar();

    org.equipos.set('qe2', new Set(['ana3', 'ana4']));
    org.inactivas.add('ana4');
    const uno = await asignarQe('qe2');
    assert.deepEqual([uno.r.body.items[0].asignacion.analista.id, uno.r.body.items[0].analistaAuto], [PERSONAS.ana3.id, true]);
    await m.cerrar();

    // Supervisión cerrada: el analista ya no está en el equipo vigente; el único activo era él.
    org.equipos.set('qe2', new Set());
    org.inactivas.delete('ana4');
    const cerrada = await asignarQe('qe2');
    assert.deepEqual([cerrada.r.body.items[0].asignacion.analista, cerrada.r.body.items[0].analistaAuto], [null, false]);
  });

  it('E5-B07-T03 un analistaId explícito se respeta y se valida como en D138; analistaAuto false', async () => {
    const { id, f } = await consultaA();
    const ok = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    assert.deepEqual([ok.status, ok.body.items[0].analistaAuto], [200, false]);
    const fuera = await patch(id, { itemIds: [f('QTY-2')], asignacion: { qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana1.id } });
    assert.deepEqual([fuera.status, fuera.body.codigo, fuera.body.detalles[0].campo], [422, 'ANALISTA_FUERA_DE_EQUIPO', 'analistaId']);
    org.inactivas.add('ana3');
    const inactivo = await patch(id, { itemIds: [f('QTY-3')], asignacion: { qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    org.inactivas.delete('ana3');
    assert.deepEqual([inactivo.status, inactivo.body.codigo], [422, 'ANALISTA_INVALIDO']);
  });

  it('elegir, limpiar o cambiar a un QE con 2+ analistas vuelve analistaAuto a false; tocar otra cosa lo conserva', async () => {
    const { id, f } = await asignarQe('qe2');
    // La célula cambia: el analista automático se conserva.
    const celula = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_A.id } });
    assert.deepEqual([celula.status, celula.body.items[0].analistaAuto, celula.body.items[0].asignacion.analista.id], [200, true, PERSONAS.ana3.id]);
    await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } });
    // Elige al mismo analista: deja de ser automático (y la fila cambia: revision sube).
    const antes = ficha(await items(id, 'NUEVA'), 'QTY-1') as ItemB07;
    const mismo = await patch(id, { itemIds: [f('QTY-1')], asignacion: { analistaId: PERSONAS.ana3.id } });
    assert.deepEqual([mismo.body.items[0].analistaAuto, mismo.body.items[0].revision], [false, antes.revision + 1]);
    // Vuelve a automático con un QE de un solo analista, y lo limpia.
    const otraVez = await patch(id, { itemIds: [f('QTY-1')], asignacion: { qeId: PERSONAS.qe1.id } });
    assert.deepEqual([otraVez.body.items[0].asignacion.analista.id, otraVez.body.items[0].analistaAuto], [PERSONAS.ana1.id, true]);
    const limpia = await patch(id, { itemIds: [f('QTY-1')], asignacion: { analistaId: null } });
    assert.deepEqual([limpia.body.items[0].asignacion.analista, limpia.body.items[0].analistaAuto], [null, false]);
    // A un QE con 2+ analistas.
    org.equipos.set('qe2', new Set(['ana3', 'ana4']));
    const dos = await patch(id, { itemIds: [f('QTY-1')], asignacion: { qeId: PERSONAS.qe2.id } });
    assert.deepEqual([dos.body.items[0].asignacion.analista, dos.body.items[0].analistaAuto], [null, false]);
  });

  it('también aplica a la edición en grupo: cada fila queda con el único analista', async () => {
    const { id } = await consultaA();
    const r = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id } });
    assert.equal(r.status, 200);
    assert.equal(r.body.rechazadas.length, 0);
    const lista = (await items(id, 'NUEVA')) as ItemB07[];
    assert.equal(lista.length, r.body.aplicadas);
    assert.ok(lista.every((i) => i.analistaAuto && i.asignacion?.analista?.id === PERSONAS.ana3.id));
  });

  it('con una Organización anterior (sin analistaPropuesto) el analista queda vacío y no hay error', async () => {
    org.versionAnterior = true;
    const { r } = await asignarQe('qe2');
    assert.deepEqual([r.status, r.body.items[0].asignacion.analista, r.body.items[0].analistaAuto], [200, null, false]);
  });
});

describe('E5-B07#6 · HDU ya asignada y fila en toma al editar (D202 f, D204)', () => {
  type ItemB07 = Item & { analistaAuto: boolean; revision: number; aplicando: boolean };
  const ya = (idHistoria: string) => `'{"idHistoria": "${idHistoria}", "qe": "Carla QE", "analista": null}'::jsonb`;

  it('E5-B07-T06 una NUEVA con yaAsignada es 422 HDU_YA_ASIGNADA con la alerta y la fila; en grupo va a rechazadas; no se marca', async () => {
    const { id, f } = await consultaA();
    const hdu = '0b000000-0000-4000-8000-0000000000a1';
    await consultaDuenio(`UPDATE integraciones.consulta_item SET ya_asignada = ${ya(hdu)}, id_historia = '${hdu}' WHERE id_item = '${f('QTY-1')}'`);
    const unica = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } });
    assert.deepEqual([unica.status, unica.body.codigo, unica.body.detalles[0].campo], [422, 'HDU_YA_ASIGNADA', 'itemId']);
    assert.equal(unica.body.mensaje, 'Esta HDU ya fue asignada a Carla QE / sin Analista');
    assert.deepEqual(unica.body.yaAsignada, { idHistoria: hdu, qe: 'Carla QE', analista: null });
    assert.deepEqual([unica.body.item.id, unica.body.item.yaAsignada.idHistoria, unica.body.item.idHistoria], [f('QTY-1'), hdu, hdu]);
    const marca = await patch(id, { itemIds: [f('QTY-1')], marcada: true });
    assert.deepEqual([marca.status, marca.body.codigo], [422, 'FILA_NO_MARCABLE']);
    const grupo = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: { celulaId: CELULA_C.id } });
    assert.equal(grupo.status, 200);
    assert.deepEqual(grupo.body.rechazadas.map((x: { codigo: string; motivo: string }) => [x.codigo, x.motivo]), [['QTY-1', 'HDU_YA_ASIGNADA']]);
    assert.equal(grupo.body.aplicadas, 9);
  });

  it('E5-B05-T11 / E5-B07-T06 CAMBIO y SIN_CAMBIOS con yaAsignada siguen en FILA_NO_ASIGNABLE; la marca de una CAMBIO se edita como hoy', async () => {
    await listo();
    org.agregarHdu({ codigo: 'QTY-1', titulo: 'Otro nombre', origen: 'JIRA', qeId: PERSONAS.qe1.id });
    org.agregarHdu({ codigo: 'QTY-2', titulo: 'Historia QTY-2', descripcion: 'Descripción QTY-2', prioridad: 'MEDIA', origen: 'JIRA', qeId: PERSONAS.qe1.id });
    const id = (await consultar()).body.consulta.id as string;
    const cambio = ficha(await items(id, 'CAMBIO'), 'QTY-1');
    const sin = ficha(await items(id, 'SIN_CAMBIOS'), 'QTY-2');
    for (const fila of [cambio, sin]) {
      const r = await patch(id, { itemIds: [fila.id], asignacion: { qeId: PERSONAS.qe2.id } });
      assert.deepEqual([r.status, r.body.codigo], [422, 'FILA_NO_ASIGNABLE'], fila.codigo);
    }
    const marca = await patch(id, { itemIds: [cambio.id], marcada: true });
    assert.deepEqual([marca.status, marca.body.items[0].marcada], [200, true]);
  });

  it('una fila con toma vigente responde FILA_EN_CURSO (422 con una fila, rechazadas en grupo); vencida la toma, se edita', async () => {
    const { id, f } = await consultaA();
    await consultaDuenio(`UPDATE integraciones.consulta_item SET aplicando_desde = now() WHERE id_item = '${f('QTY-1')}'`);
    assert.equal((ficha(await items(id, 'NUEVA'), 'QTY-1') as ItemB07).aplicando, true);
    const unica = await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } });
    assert.deepEqual([unica.status, unica.body.codigo], [422, 'FILA_EN_CURSO']);
    const grupo = await patch(id, { grupo: 'NUEVA', todas: true, asignacion: { celulaId: CELULA_C.id } });
    assert.deepEqual(grupo.body.rechazadas.map((x: { codigo: string; motivo: string }) => [x.codigo, x.motivo]), [['QTY-1', 'FILA_EN_CURSO']]);
    await consultaDuenio(`UPDATE integraciones.consulta_item SET aplicando_desde = now() - interval '31 seconds' WHERE id_item = '${f('QTY-1')}'`);
    assert.equal((ficha(await items(id, 'NUEVA'), 'QTY-1') as ItemB07).aplicando, false);
    assert.equal((await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } })).status, 200);
  });

  it('revision: nace en 1, sube con cada cambio de la fila y una edición que no cambia nada no la toca', async () => {
    const { id, f } = await consultaA();
    const rev = async () => (ficha(await items(id, 'NUEVA'), 'QTY-1') as ItemB07).revision;
    assert.equal(await rev(), 1);
    await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } });
    assert.equal(await rev(), 2);
    await patch(id, { itemIds: [f('QTY-1')], asignacion: { celulaId: CELULA_C.id } });
    assert.equal(await rev(), 2, 'la misma edición no cambia la fila');
    await patch(id, { itemIds: [f('QTY-1')], asignacion: { qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
    assert.equal(await rev(), 3);
    await patch(id, { itemIds: [f('QTY-1')], marcada: true });
    assert.equal(await rev(), 4);
  });
});
