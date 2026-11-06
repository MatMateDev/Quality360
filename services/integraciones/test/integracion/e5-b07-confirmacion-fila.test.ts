/**
 * E5-B07 #4 a #15 · «Confirmar asignación» de una sola fila (POST …/items/{itemId}/confirmaciones): toma atómica, `revision`,
 * idempotencia por actor, `existente` → 200 `repetida` o 409, ejecución `HDU` ya cerrada, `consulta.creadas` y coexistencia con el
 * lote. Postgres local real; Organización y Jira falsos (ayudas.ts). IDs de `docs/backlog/e5-detalle-asignacion-por-hdu.md`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { CELULA_C, PERSONAS, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const CONSULTAR = '/v1/integraciones/jira/consultas';
const SIN_ORG = (l: string): boolean => !l.endsWith('/v1/interno/acceso') && !l.endsWith('/v1/me');

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
  org.versionAnterior = false;
  org.retardoUpsertMs = 0;
  org.alAplicarUpsert = null;
  org.perderRespuestaUpsert = false;
  org.fallarUpsertDesde = null;
  org.inactivas.delete('ana3');
  org.inactivas.delete('qe2');
  org.equipos.set('qe1', new Set(['ana1']));
  org.equipos.set('qe2', new Set(['ana3']));
  org.llamadas.length = 0;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

interface FilaB07 {
  id: string;
  codigo: string;
  revision: number;
  marcada: boolean;
  aplicada: boolean;
  aplicando: boolean;
  idHistoria: string | null;
  analistaAuto: boolean;
  completa: boolean;
  faltantes: string[];
  asignacion: { analista: { id: string } | null } | null;
  aplicacion: { alcance: string; por: { id: string } } | null;
  yaAsignada: { idHistoria: string; qe: string; analista: string | null } | null;
}

async function listo(proyecto = 'QTY', config: Parameters<typeof montar>[0] = {}): Promise<void> {
  m = await montar({ org, ...config });
  assert.equal((await guardarConfiguracion(m, { proyecto })).status, 200);
}

const consultar = (cuerpo: unknown = {}) => m.pedir('post', CONSULTAR, 'adm1', cuerpo);
const items = async (id: string, grupo = 'NUEVA'): Promise<FilaB07[]> => (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=${grupo}&tamanoPagina=100`, 'adm1')).body.items;
const fila = async (id: string, codigo: string, grupo = 'NUEVA'): Promise<FilaB07> => (await items(id, grupo)).find((i) => i.codigo === codigo) as FilaB07;
const patch = (id: string, cuerpo: unknown, persona: 'adm1' | 'adm2' = 'adm1') => m.pedir('patch', `${CONSULTAR}/${id}/items`, persona, cuerpo);
const confirmarFila = (id: string, itemId: string, revision: unknown, persona: Parameters<Montaje['pedir']>[2] = 'adm1') =>
  m.pedir('post', `${CONSULTAR}/${id}/items/${itemId}/confirmaciones`, persona, typeof revision === 'object' && revision !== null ? revision : { revision });
const consultaDe = async (id: string) => (await m.pedir('get', `${CONSULTAR}/${id}`, 'adm1')).body;
const hduEnBase = async () => consultaDuenio<{ alcance: string; leidas: number; creadas: number; fase: string; resultado: string; terminada_en: Date | null }>(
  `SELECT alcance, leidas, creadas, fase, resultado, terminada_en FROM integraciones.ejecucion_integracion WHERE alcance = 'HDU'`,
);

/** Consulta de QTY con QTY-1 a QTY-4 listas para confirmar: CEL-C y QE2 (ANA3 queda sola, automática). */
async function preparada(config: Parameters<typeof montar>[0] = {}) {
  await listo('QTY', config);
  const id = (await consultar()).body.consulta.id as string;
  const lista = await items(id);
  const r = await patch(id, { itemIds: lista.slice(0, 4).map((i) => i.id), asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id } });
  assert.equal(r.status, 200);
  assert.equal(r.body.rechazadas.length, 0);
  return { id, uno: await fila(id, 'QTY-1'), dos: await fila(id, 'QTY-2'), tres: await fila(id, 'QTY-3') };
}

describe('E5-B07#4 · confirmar una HDU', () => {
  it('E5-B07-T04 200: HDU creada con célula, QE, Analista y sprint; fila aplicada; version y creadas suben; sin llamar a Jira; la consulta sigue ABIERTA', async () => {
    const { id, uno } = await preparada();
    assert.equal(uno.completa, true);
    assert.equal(uno.analistaAuto, true);
    const antes = await consultaDe(id);
    const llamadasJira = m.jira.llamadas.length;
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ['consulta', 'ejecucion', 'hdu', 'item', 'repetida', 'resultado']);
    assert.deepEqual([r.body.resultado, r.body.repetida], ['CREADA', false]);
    assert.deepEqual(r.body.hdu, { id: r.body.item.idHistoria, codigo: 'QTY-1', titulo: 'Historia QTY-1', estado: 'PENDIENTE' });
    // La fila.
    const item = r.body.item;
    assert.deepEqual([item.aplicada, item.marcada, item.aplicando, item.yaAsignada, item.revision], [true, true, false, null, uno.revision + 1]);
    assert.deepEqual([item.aplicacion.alcance, item.aplicacion.por.id], ['HDU', PERSONAS.adm1.id]);
    assert.ok(Math.abs(Date.parse(item.aplicacion.en) - Date.now()) < 30_000);
    // La HDU se creó en Organización con la asignación completa, con UNA fila CREAR del mismo upsert que usa el lote.
    const hdu = org.hdus.get('qty-1');
    assert.ok(hdu);
    assert.deepEqual([hdu.id, hdu.qeId, hdu.analistaId, hdu.celulaId, hdu.origen], [item.idHistoria, PERSONAS.qe2.id, PERSONAS.ana3.id, CELULA_C.id, 'JIRA']);
    assert.equal(org.upserts.length, 1);
    const enviado = org.upserts[0] as { origen: string; consultaId: string; filas: Array<{ operacion: string; codigo: string; asignacion: Record<string, string> }> };
    assert.deepEqual([enviado.origen, enviado.consultaId, enviado.filas.length, enviado.filas[0]?.operacion, enviado.filas[0]?.codigo], ['JIRA', id, 1, 'CREAR', 'QTY-1']);
    assert.equal(enviado.filas[0]?.asignacion.analistaId, PERSONAS.ana3.id);
    // La consulta: sigue abierta, venceEn no cambia, version y creadas suben.
    const c = r.body.consulta;
    assert.deepEqual([c.estado, c.venceEn, c.version, c.creadas], ['ABIERTA', antes.venceEn, antes.version + 1, 1]);
    assert.equal(c.aplicadas, 1);
    assert.equal(m.jira.llamadas.length, llamadasJira, 'no llama a Jira');
    // La ejecución.
    assert.deepEqual(
      [r.body.ejecucion.fase, r.body.ejecucion.alcance, r.body.ejecucion.leidas, r.body.ejecucion.creadas, r.body.ejecucion.resultado, r.body.ejecucion.consultaId],
      ['CONFIRMACION', 'HDU', 1, 1, 'EXITOSA', id],
    );
    const enLista = await fila(id, 'QTY-1');
    assert.deepEqual([enLista.aplicada, enLista.idHistoria, enLista.revision], [true, item.idHistoria, item.revision]);
  });

  it('E5-B07-T04b la ejecución HDU nace cerrada: convive con una confirmación en lote EN_CURSO y no ocupa ejecucion_en_curso_key', async () => {
    const { id, uno } = await preparada();
    await consultaDuenio(
      `INSERT INTO integraciones.ejecucion_integracion (origen, fase, consulta_id, actor_id, actor_nombre, actor_rol, resultado) VALUES ('JIRA', 'CONFIRMACION', '${id}', '${PERSONAS.adm2.id}', 'Pablo Admin', 'ADMINISTRADOR', 'EN_CURSO')`,
    );
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.equal(r.status, 200);
    const filas = await hduEnBase();
    assert.equal(filas.length, 1);
    assert.ok(filas[0]?.terminada_en !== null);
    assert.equal((await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.ejecucion_integracion WHERE terminada_en IS NULL`))[0]?.n, 1, 'solo la del lote sigue EN_CURSO');
  });
});

describe('E5-B07#5 · fila incompleta o no nueva', () => {
  it('E5-B07-T05 incompleta: 422 ASIGNACION_INCOMPLETA con un detalle por campo faltante; CAMBIO, SIN_CAMBIOS y CON_ERROR: 422 FILA_NO_ASIGNABLE; nada se crea', async () => {
    await listo();
    org.agregarHdu({ codigo: 'QTY-1', titulo: 'Otro nombre', origen: 'JIRA' });
    org.agregarHdu({ codigo: 'QTY-2', titulo: 'Historia QTY-2', descripcion: 'Descripción QTY-2', prioridad: 'MEDIA', origen: 'JIRA' });
    const id = (await consultar()).body.consulta.id as string;
    const nueva = await fila(id, 'QTY-3');
    await patch(id, { itemIds: [nueva.id], asignacion: { celulaId: CELULA_C.id } });
    const incompleta = await confirmarFila(id, nueva.id, (await fila(id, 'QTY-3')).revision);
    assert.deepEqual([incompleta.status, incompleta.body.codigo], [422, 'ASIGNACION_INCOMPLETA']);
    // La célula propone el sprint; faltan el QE y el analista.
    assert.deepEqual(incompleta.body.detalles.map((d: { campo: string }) => d.campo), ['qeId', 'analistaId']);
    const cambio = await fila(id, 'QTY-1', 'CAMBIO');
    const sin = await fila(id, 'QTY-2', 'SIN_CAMBIOS');
    const error = await fila(id, 'QTY-11', 'CON_ERROR');
    for (const f of [cambio, sin, error]) {
      const r = await confirmarFila(id, f.id, f.revision);
      assert.deepEqual([r.status, r.body.codigo], [422, 'FILA_NO_ASIGNABLE'], f.codigo);
    }
    assert.equal(org.upserts.length, 0);
    assert.equal(org.hdus.has('qty-3'), false);
    assert.equal((await consultaDe(id)).creadas, 0);
  });
});

describe('E5-B07#6, #7 · HDU ya asignada', () => {
  it('E5-B07-T06 una fila NUEVA con yaAsignada responde 409 HDU_YA_ASIGNADA sin llamar a Organización; una CAMBIO responde FILA_NO_ASIGNABLE (orden del contrato)', async () => {
    const { id, uno } = await preparada();
    const hdu = '0b000000-0000-4000-8000-0000000000b1';
    await consultaDuenio(`UPDATE integraciones.consulta_item SET ya_asignada = '{"idHistoria": "${hdu}", "qe": "Carla QE", "analista": null}'::jsonb, id_historia = '${hdu}' WHERE id_item = '${uno.id}'`);
    org.llamadas.length = 0;
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([r.status, r.body.codigo], [409, 'HDU_YA_ASIGNADA']);
    assert.deepEqual(r.body.yaAsignada, { idHistoria: hdu, qe: 'Carla QE', analista: null });
    assert.equal(r.body.mensaje, 'Esta HDU ya fue asignada a Carla QE / sin Analista');
    assert.equal(r.body.item.yaAsignada.idHistoria, hdu);
    assert.equal(org.llamadas.filter(SIN_ORG).length, 0);
  });

  it('E5-B07-T07 otra persona creó la HDU durante la revisión: 409 con los nombres ACTUALES de Organización; la fila queda yaAsignada y de solo lectura; la HDU existente no cambia', async () => {
    const { id, uno } = await preparada();
    // QE1 la crea a mano, sin analista, y después la reasignan: el 409 trae lo que dice Organización AHORA.
    const existente = org.agregarHdu({ codigo: 'QTY-1', titulo: 'Creada a mano', origen: 'MANUAL', qeId: PERSONAS.qe1.id });
    existente.analistaId = PERSONAS.ana1.id;
    const antes = await consultaDe(id);
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([r.status, r.body.codigo], [409, 'HDU_YA_ASIGNADA']);
    assert.deepEqual(r.body.yaAsignada, { idHistoria: existente.id, qe: 'Carla QE', analista: 'Ana Analista' });
    assert.equal(r.body.mensaje, 'Esta HDU ya fue asignada a Carla QE / Ana Analista');
    // La fila quedó yaAsignada, desmarcada, sin toma y con la revisión nueva.
    const f = r.body.item;
    assert.deepEqual([f.yaAsignada, f.idHistoria, f.marcada, f.aplicada, f.aplicando, f.revision], [r.body.yaAsignada, existente.id, false, false, false, uno.revision + 1]);
    assert.equal((await consultaDe(id)).version, antes.version + 1);
    assert.equal((await consultaDe(id)).yaAsignadas, 1);
    // La HDU existente no cambió y no hay ejecución HDU ni creadas.
    assert.deepEqual([existente.titulo, existente.qeId, existente.origen], ['Creada a mano', PERSONAS.qe1.id, 'MANUAL']);
    assert.equal((await hduEnBase()).length, 0);
    assert.equal((await consultaDe(id)).creadas, 0);
    // De solo lectura: editar y confirmar otra vez no tocan a Organización.
    org.upserts.length = 0;
    const editar = await patch(id, { itemIds: [uno.id], asignacion: { qeId: PERSONAS.qe1.id } });
    assert.deepEqual([editar.status, editar.body.codigo], [422, 'HDU_YA_ASIGNADA']);
    const otra = await confirmarFila(id, uno.id, f.revision);
    assert.deepEqual([otra.status, otra.body.codigo], [409, 'HDU_YA_ASIGNADA']);
    assert.equal(org.upserts.length, 0);
  });

  it('la HDU aparece entre la validación y el upsert: el upsert responde HDU_CREADA_DESPUES y el resultado es el mismo 409', async () => {
    const { id, uno } = await preparada();
    org.alAplicarUpsert = () => {
      org.alAplicarUpsert = null;
      org.agregarHdu({ codigo: 'QTY-1', titulo: 'Otra persona', origen: 'JIRA', qeId: PERSONAS.qe1.id });
    };
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([r.status, r.body.codigo, r.body.yaAsignada.qe], [409, 'HDU_YA_ASIGNADA', 'Carla QE']);
    assert.equal(org.hdus.size, 1);
    assert.equal((await hduEnBase()).length, 0);
  });

  it('con una Organización anterior (el upsert no informa existente) se leen los nombres con estado-codigos y es 409', async () => {
    const { id, uno } = await preparada();
    org.versionAnterior = true;
    org.alAplicarUpsert = () => {
      org.alAplicarUpsert = null;
      org.agregarHdu({ codigo: 'QTY-1', titulo: 'Otra persona', origen: 'JIRA', qeId: PERSONAS.qe1.id });
    };
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([r.status, r.body.codigo, r.body.yaAsignada.qe, r.body.yaAsignada.analista], [409, 'HDU_YA_ASIGNADA', 'Carla QE', null]);
  });
});

describe('E5-B07#8 · dos Administradores', () => {
  it('E5-B07-T08 confirmar a la vez: exactamente uno recibe 200; el otro 409 (HDU_YA_ASIGNADA o FILA_EN_CURSO); una HDU y una sola ejecución HDU', async () => {
    const { id, uno } = await preparada();
    org.retardoUpsertMs = 400;
    const [a, b] = await Promise.all([confirmarFila(id, uno.id, uno.revision, 'adm1'), confirmarFila(id, uno.id, uno.revision, 'adm2')]);
    const estados = [a.status, b.status].sort();
    assert.deepEqual(estados, [200, 409]);
    const perdedora = a.status === 409 ? a : b;
    assert.ok(['HDU_YA_ASIGNADA', 'FILA_EN_CURSO'].includes(perdedora.body.codigo), perdedora.body.codigo);
    assert.equal(org.hdus.size, 1);
    assert.equal(org.upserts.length, 1, 'el perdedor no llega a Organización');
    assert.equal((await hduEnBase()).length, 1);
    assert.equal((await consultaDe(id)).creadas, 1);
    // Si el segundo llega después, la fila ya es de otro Administrador: 409 HDU_YA_ASIGNADA con los nombres actuales.
    const tarde = await confirmarFila(id, uno.id, uno.revision, a.status === 200 ? 'adm2' : 'adm1');
    assert.deepEqual([tarde.status, tarde.body.codigo], [409, 'HDU_YA_ASIGNADA']);
    assert.deepEqual(tarde.body.yaAsignada.qe, 'Marcos QE');
  });

  it('el mismo Administrador con doble clic: uno gana y el otro es FILA_EN_CURSO; el reintento posterior es idempotente', async () => {
    const { id, uno } = await preparada();
    org.retardoUpsertMs = 400;
    const [a, b] = await Promise.all([confirmarFila(id, uno.id, uno.revision), confirmarFila(id, uno.id, uno.revision)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal((a.status === 409 ? a : b).body.codigo, 'FILA_EN_CURSO');
    org.retardoUpsertMs = 0;
    const ganadora = a.status === 200 ? a : b;
    const otra = await confirmarFila(id, uno.id, uno.revision);
    assert.equal(otra.status, 200);
    assert.deepEqual([otra.body.repetida, otra.body.ejecucion.id, otra.body.hdu.id], [true, ganadora.body.ejecucion.id, ganadora.body.hdu.id]);
    assert.equal(org.upserts.length, 1);
    assert.equal((await hduEnBase()).length, 1);
  });
});

describe('E5-B07#9, #10 · fila modificada y asignación que dejó de ser válida', () => {
  it('E5-B07-T09 ADM2 cambió el Analista después de que ADM1 vio la fila: 409 FILA_MODIFICADA con la fila actual; nada se crea', async () => {
    const { id, uno } = await preparada();
    org.equipos.set('qe2', new Set(['ana3', 'ana4']));
    const cambio = await patch(id, { itemIds: [uno.id], asignacion: { analistaId: PERSONAS.ana4.id } }, 'adm2');
    assert.equal(cambio.status, 200);
    const r = await confirmarFila(id, uno.id, uno.revision, 'adm1');
    assert.deepEqual([r.status, r.body.codigo], [409, 'FILA_MODIFICADA']);
    assert.equal(r.body.mensaje, 'Otra persona modificó esta HDU. Revisa los datos actuales y confirma de nuevo.');
    assert.deepEqual([r.body.item.revision, r.body.item.asignacion.analista.id, r.body.item.asignadoPor.id], [uno.revision + 1, PERSONAS.ana4.id, PERSONAS.adm2.id]);
    assert.equal(org.upserts.length, 0);
    // Con la revisión nueva sí.
    const ok = await confirmarFila(id, uno.id, r.body.item.revision);
    assert.equal(ok.status, 200);
    assert.equal(org.hdus.get('qty-1')?.analistaId, PERSONAS.ana4.id);
  });

  it('E5-B07-T10 el Analista se desactivó: 409 ASIGNACIONES_INVALIDAS con una fila y el motivo; nada se escribe; la fila queda desmarcada, con el campo limpio y sin toma', async () => {
    const { id, uno } = await preparada();
    await patch(id, { itemIds: [uno.id], marcada: true });
    const antes = await consultaDe(id);
    const fresca = await fila(id, 'QTY-1');
    org.inactivas.add('ana3');
    const r = await confirmarFila(id, uno.id, fresca.revision);
    assert.deepEqual([r.status, r.body.codigo], [409, 'ASIGNACIONES_INVALIDAS']);
    assert.deepEqual(r.body.filas, [{ itemId: uno.id, codigo: 'QTY-1', campo: 'analistaId', motivo: 'ANALISTA_INVALIDO' }]);
    assert.equal(r.body.version, antes.version + 1);
    assert.equal(org.upserts.length, 0);
    assert.equal(org.hdus.size, 0);
    const despues = await fila(id, 'QTY-1');
    assert.deepEqual([despues.marcada, despues.aplicando, despues.analistaAuto, despues.asignacion?.analista, despues.revision, despues.faltantes], [false, false, false, null, fresca.revision + 1, ['analistaId']]);
    assert.equal((await hduEnBase()).length, 0);
  });

  it('el QE se desactivó: el QE y el analista que dependía de él quedan limpios', async () => {
    const { id, uno } = await preparada();
    org.inactivas.add('qe2');
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([r.status, r.body.codigo, r.body.filas[0].campo, r.body.filas[0].motivo], [409, 'ASIGNACIONES_INVALIDAS', 'qeId', 'QE_INVALIDO']);
    const despues = await fila(id, 'QTY-1');
    assert.deepEqual([despues.faltantes, despues.aplicando], [['qeId', 'analistaId'], false]);
  });
});

describe('E5-B07#11 · reintento y falla parcial', () => {
  it('E5-B07-T11 Organización creó la HDU pero Integraciones no alcanzó a marcarla: el reintento del mismo Administrador es 200 repetida, sin duplicar', async () => {
    const { id, uno } = await preparada();
    org.perderRespuestaUpsert = true;
    const perdida = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([perdida.status, perdida.body.codigo], [503, 'SERVICIO_NO_DISPONIBLE']);
    assert.equal(org.hdus.size, 1, 'Organización sí la creó');
    const despues = await fila(id, 'QTY-1');
    assert.deepEqual([despues.aplicada, despues.aplicando, despues.revision], [false, false, uno.revision], 'la fila no quedó aplicando');
    org.perderRespuestaUpsert = false;
    const r = await confirmarFila(id, uno.id, uno.revision);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.resultado, r.body.repetida, r.body.item.aplicada, r.body.item.idHistoria], ['CREADA', true, true, org.hdus.get('qty-1')?.id]);
    assert.equal(org.hdus.size, 1);
    assert.equal((await hduEnBase()).length, 1);
    assert.equal((await consultaDe(id)).creadas, 1);
    // Un tercer intento no vuelve a hablar con Organización ni registra otra ejecución.
    const llamadas = org.upserts.length;
    const otra = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([otra.status, otra.body.repetida, otra.body.ejecucion.id], [200, true, r.body.ejecucion.id]);
    assert.equal(org.upserts.length, llamadas);
    assert.equal((await hduEnBase()).length, 1);
  });

  it('otro Administrador que reintenta la fila ya creada recibe 409 HDU_YA_ASIGNADA', async () => {
    const { id, uno } = await preparada();
    assert.equal((await confirmarFila(id, uno.id, uno.revision, 'adm1')).status, 200);
    const r = await confirmarFila(id, uno.id, uno.revision, 'adm2');
    assert.deepEqual([r.status, r.body.codigo, r.body.yaAsignada.qe], [409, 'HDU_YA_ASIGNADA', 'Marcos QE']);
  });

  it('Organización no responde: 503 SERVICIO_NO_DISPONIBLE, la fila no queda aplicando y el reintento funciona; una toma abandonada vence a los 30 s', async () => {
    const { id, uno } = await preparada();
    org.fallarUpsertDesde = 1;
    const caida = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([caida.status, caida.body.codigo], [503, 'SERVICIO_NO_DISPONIBLE']);
    assert.equal((await fila(id, 'QTY-1')).aplicando, false);
    org.fallarUpsertDesde = null;
    // Un proceso que murió dejando la toma: mientras está vigente es FILA_EN_CURSO; vencida, se puede tomar de nuevo.
    await consultaDuenio(`UPDATE integraciones.consulta_item SET aplicando_desde = now() WHERE id_item = '${uno.id}'`);
    const enCurso = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([enCurso.status, enCurso.body.codigo], [409, 'FILA_EN_CURSO']);
    assert.equal(enCurso.body.mensaje, 'Otra persona está confirmando esta HDU ahora. Espera unos segundos y revisa.');
    await consultaDuenio(`UPDATE integraciones.consulta_item SET aplicando_desde = now() - interval '31 seconds' WHERE id_item = '${uno.id}'`);
    const ok = await confirmarFila(id, uno.id, uno.revision);
    assert.equal(ok.status, 200);
  });

  it('Organización caída desde el principio: 503 y nada cambia', async () => {
    const { id, uno } = await preparada();
    const antes = await consultaDe(id);
    org.caida = true;
    const r = await confirmarFila(id, uno.id, uno.revision);
    org.caida = false;
    assert.deepEqual([r.status, r.body.codigo], [503, 'SERVICIO_NO_DISPONIBLE']);
    assert.equal((await consultaDe(id)).version, antes.version);
    assert.equal((await fila(id, 'QTY-1')).aplicando, false);
  });
});

describe('E5-B07#12 · coexistencia con el lote', () => {
  it('E5-B07-T12 el lote omite lo aplicado una a una sin contarlo; confirma el resto; creadas cuenta ambos caminos; al cerrar CONFIRMADA descarta las no marcadas', async () => {
    const { id, uno, dos, tres } = await preparada();
    assert.equal((await patch(id, { itemIds: [dos.id, tres.id], marcada: true })).status, 200);
    assert.equal((await confirmarFila(id, uno.id, uno.revision)).status, 200);
    org.upserts.length = 0;
    const c = await consultaDe(id);
    const r = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version: c.version });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // Solo viajaron QTY-2 y QTY-3.
    const filasEnviadas = org.upserts.flatMap((u) => (u.filas as Array<{ codigo: string }>).map((f) => f.codigo));
    assert.deepEqual(filasEnviadas, ['QTY-2', 'QTY-3']);
    assert.deepEqual([r.body.ejecucion.alcance, r.body.ejecucion.leidas, r.body.ejecucion.creadas], ['LOTE', 2, 2]);
    assert.deepEqual([r.body.consulta.estado, r.body.consulta.creadas], ['CONFIRMADA', 3]);
    assert.equal(r.body.consulta.descartadas, 8, '11 filas leídas menos las 3 creadas');
    assert.equal(org.hdus.size, 3);
  });

  it('el lote guarda quién aplicó cada fila (alcance LOTE) y su id_historia; una fila tomada por otra petición se omite', async () => {
    const { id, uno, dos, tres } = await preparada();
    assert.equal((await patch(id, { itemIds: [uno.id, dos.id, tres.id], marcada: true })).status, 200);
    // Se confirma una sola fila de un lote INCOMPLETO simulado: la fila `tres` está tomada por otra petición.
    await consultaDuenio(`UPDATE integraciones.consulta_item SET aplicando_desde = now() WHERE id_item = '${tres.id}'`);
    org.upserts.length = 0;
    const c = await consultaDe(id);
    const r = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version: c.version });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const codigos = org.upserts.flatMap((u) => (u.filas as Array<{ codigo: string }>).map((f) => f.codigo));
    assert.deepEqual(codigos, ['QTY-1', 'QTY-2'], 'la tomada se omite');
    assert.equal(r.body.ejecucion.leidas, 2);
    assert.equal(org.hdus.has('qty-3'), false);
  });

  it('con cero filas marcadas pendientes (todas ya creadas una a una) el lote responde 422 SIN_SELECCION', async () => {
    const { id, uno } = await preparada();
    assert.equal((await confirmarFila(id, uno.id, uno.revision)).status, 200);
    const c = await consultaDe(id);
    const r = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version: c.version });
    assert.deepEqual([r.status, r.body.codigo], [422, 'SIN_SELECCION']);
  });

  it('el lote que se interrumpe libera las tomas: las filas vuelven a ser confirmables', async () => {
    const { id, uno, dos } = await preparada();
    assert.equal((await patch(id, { itemIds: [uno.id, dos.id], marcada: true })).status, 200);
    org.fallarUpsertDesde = 1;
    const c = await consultaDe(id);
    const r = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version: c.version });
    org.fallarUpsertDesde = null;
    assert.equal(r.body.ejecucion.resultado, 'FALLIDA');
    assert.equal((await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE aplicando_desde IS NOT NULL`))[0]?.n, 0);
    const fresca = await fila(id, 'QTY-1');
    assert.equal((await confirmarFila(id, uno.id, fresca.revision)).status, 200);
  });
});

describe('E5-B07#13 · vida de la consulta', () => {
  it('E5-B07-T13 confirmar una fila no cierra la consulta ni renueva venceEn; descartar, vencer y reemplazar conservan lo creado y su contador', async () => {
    for (const modo of ['descartar', 'vencer', 'reemplazar'] as const) {
      const { id, uno } = await preparada();
      const antes = await consultaDe(id);
      assert.equal((await confirmarFila(id, uno.id, uno.revision)).status, 200);
      const despues = await consultaDe(id);
      assert.deepEqual([despues.estado, despues.venceEn], ['ABIERTA', antes.venceEn]);
      if (modo === 'descartar') assert.equal((await m.pedir('post', `${CONSULTAR}/${id}/descartes`, 'adm1', {})).status, 200);
      if (modo === 'vencer') {
        await consultaDuenio(`UPDATE integraciones.consulta_jira SET vence_en = now() - interval '1 second' WHERE id_consulta = '${id}'`);
        assert.equal((await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=NUEVA`, 'adm1')).status, 410);
      }
      if (modo === 'reemplazar') assert.equal((await consultar({ reemplazar: true })).status, 200);
      const cerrada = (await consultaDuenio<{ estado: string; creadas: number; descartadas: number }>(`SELECT estado, creadas, descartadas FROM integraciones.consulta_jira WHERE id_consulta = '${id}'`))[0];
      assert.equal(cerrada?.creadas, 1, modo);
      assert.equal(cerrada?.estado, { descartar: 'DESCARTADA', vencer: 'VENCIDA', reemplazar: 'REEMPLAZADA' }[modo]);
      if (modo === 'descartar') assert.equal(cerrada?.descartadas, 10, '«Terminar revisión» cuenta las filas sin confirmar que se pierden (11 leídas menos 1 creada)');
      assert.equal(org.hdus.has('qty-1'), true, 'lo creado nunca se deshace');
      assert.equal((await consultaDuenio<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE id_consulta = '${id}'`))[0]?.n, 0, 'solo se purgan las filas');
      await m.cerrar();
      org.hdus.clear();
    }
  });

  it('descartar con una fila en toma no espera: la HDU se crea igual, se registra la ejecución HDU y la marca de la fila ya no se escribe', async () => {
    const { id, uno } = await preparada();
    org.retardoUpsertMs = 500;
    const confirmando = confirmarFila(id, uno.id, uno.revision);
    await new Promise((r) => setTimeout(r, 150));
    const descarte = await m.pedir('post', `${CONSULTAR}/${id}/descartes`, 'adm1', {});
    assert.equal(descarte.status, 200);
    const r = await confirmando;
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.consulta.estado, 'DESCARTADA');
    assert.equal(org.hdus.has('qty-1'), true);
    const filas = await hduEnBase();
    assert.equal(filas.length, 1);
    assert.equal(r.body.item.aplicada, true);
  });
});

describe('E5-B07#14 · permisos y orden de validación', () => {
  it('E5-B07-T14 401 sin sesión; 403 a QE, Analista, Líder y Auditor; sin secretos en la respuesta', async () => {
    const { id, uno } = await preparada();
    assert.equal((await confirmarFila(id, uno.id, uno.revision, null)).status, 401);
    for (const persona of ['qe1', 'ana1', 'lid1', 'aud1'] as const) assert.equal((await confirmarFila(id, uno.id, uno.revision, persona)).status, 403, persona);
    assert.equal(org.upserts.length, 0);
    const ok = await confirmarFila(id, uno.id, uno.revision);
    assert.doesNotMatch(JSON.stringify(ok.body), /token|secret|apikey|password/i);
  });

  it('404 → 400 → 410 → 409: consulta o fila inexistente o ajena es 404; cuerpo inválido es 400; vencida 410; cerrada 409', async () => {
    const { id, uno } = await preparada();
    const NADA = '0c000000-0000-4000-8000-0000000000ee';
    assert.equal((await confirmarFila(NADA, uno.id, 1)).status, 404);
    assert.equal((await confirmarFila(id, NADA, 1)).status, 404);
    assert.equal((await confirmarFila(id, 'no-uuid', 1)).status, 400);
    for (const cuerpo of [{}, { revision: 0 }, { revision: '1' }, { revision: 1.5 }, { revision: 1, version: 3 }, { revision: 1, itemId: uno.id }, []] as unknown[]) {
      assert.equal((await confirmarFila(id, uno.id, cuerpo as object)).status, 400, JSON.stringify(cuerpo));
    }
    assert.equal(org.upserts.length, 0);
    // Vencida: 410 (y un cuerpo inválido sigue siendo 400 antes que el estado).
    await consultaDuenio(`UPDATE integraciones.consulta_jira SET vence_en = now() - interval '1 second' WHERE id_consulta = '${id}'`);
    assert.equal((await confirmarFila(id, uno.id, {})).status, 400);
    const vencida = await confirmarFila(id, uno.id, uno.revision);
    assert.deepEqual([vencida.status, vencida.body.codigo], [410, 'CONSULTA_VENCIDA']);
    // Cerrada: 409 CONSULTA_NO_ABIERTA.
    await m.cerrar();
    const otra = await preparada();
    assert.equal((await m.pedir('post', `${CONSULTAR}/${otra.id}/descartes`, 'adm1', {})).status, 200);
    const cerrada = await confirmarFila(otra.id, otra.uno.id, otra.uno.revision);
    assert.deepEqual([cerrada.status, cerrada.body.codigo], [409, 'CONSULTA_NO_ABIERTA']);
    // Una fila de otra consulta (la anterior ya vencida/purgada) sigue siendo 404 con la consulta abierta.
    await m.cerrar();
    const abierta = await preparada();
    assert.equal((await confirmarFila(abierta.id, uno.id, uno.revision)).status, 404);
  });
});

describe('E5-B07#15 · registro en el historial', () => {
  it('E5-B07-T15 la ejecución CONFIRMACION con alcance HDU, leidas 1 y detalle con nombres; la ven Administrador y Auditor; el filtro alcance separa las HDU del lote', async () => {
    const { id, uno, dos } = await preparada();
    const r = await confirmarFila(id, uno.id, uno.revision);
    const ejecucionId = r.body.ejecucion.id as string;
    assert.equal((await patch(id, { itemIds: [dos.id], marcada: true })).status, 200);
    const lote = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version: (await consultaDe(id)).version });
    assert.equal(lote.status, 200);

    for (const persona of ['adm1', 'aud1'] as const) {
      const e = await m.pedir('get', `/v1/integraciones/ejecuciones/${ejecucionId}`, persona);
      assert.equal(e.status, 200, persona);
      const x = e.body;
      assert.deepEqual([x.fase, x.alcance, x.leidas, x.creadas, x.actualizadas, x.omitidas, x.conError], ['CONFIRMACION', 'HDU', 1, 1, 0, 0, 0]);
      assert.equal(x.creadas + x.actualizadas + x.omitidas + x.conError, x.leidas, 'invariante de D141');
      assert.deepEqual([x.actor.id, x.proyecto, x.sitioHost, x.consultaId], [PERSONAS.adm1.id, 'QTY', '127.0.0.1:4010', id]);
      const d = await m.pedir('get', `/v1/integraciones/ejecuciones/${ejecucionId}/detalle`, persona);
      assert.equal(d.status, 200);
      assert.deepEqual(d.body.items.map((i: { codigo: string; resultado: string; idHistoria: string }) => [i.codigo, i.resultado, i.idHistoria]), [['QTY-1', 'CREADA', r.body.hdu.id]]);
      assert.deepEqual(d.body.items[0].asignacion, { celula: 'CEL-C', qe: 'Marcos QE', analista: 'Ana Tres', sprint: 'E5 Sprint 2' });
    }

    const soloHdu = await m.pedir('get', '/v1/integraciones/ejecuciones?alcance=HDU', 'adm1');
    assert.deepEqual(soloHdu.body.items.map((i: { id: string; alcance: string }) => [i.id, i.alcance]), [[ejecucionId, 'HDU']]);
    const soloLote = await m.pedir('get', '/v1/integraciones/ejecuciones?alcance=LOTE', 'adm1');
    assert.ok(soloLote.body.items.length >= 2 && soloLote.body.items.every((i: { alcance: string }) => i.alcance === 'LOTE'));
    assert.equal(soloLote.body.items.some((i: { id: string }) => i.id === ejecucionId), false);
    assert.equal((await m.pedir('get', '/v1/integraciones/ejecuciones', 'aud1')).body.items.length, soloLote.body.items.length + 1);
    assert.equal((await m.pedir('get', '/v1/integraciones/ejecuciones?alcance=TODOS', 'adm1')).status, 400);
    // «Última completada» sigue siendo la sincronización o confirmación en lote, no una HDU suelta.
    const estado = await m.pedir('get', '/v1/integraciones/estado', 'adm1');
    assert.equal(estado.body.ultimaCompletada.alcance, 'LOTE');
  });
});
