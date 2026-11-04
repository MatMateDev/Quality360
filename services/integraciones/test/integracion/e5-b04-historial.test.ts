/**
 * E5-B04 · Registro e historial de ejecuciones (trazabilidad, visibilidad por rol, sin secretos, inmutabilidad).
 * Postgres local real; Organización y Jira falsos. IDs de `docs/backlog/e5-integracion-jira.md`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';

import { CELULA_C, PERSONAS, TOKEN_JIRA, cerrarBases, consultaDuenio, ejecutarDuenio, iniciarOrganizacionFalsa, prismaServicio, type OrganizacionFalsa } from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const CONSULTAR = '/v1/integraciones/jira/consultas';
const IMPORTAR = '/v1/integraciones/archivos/importaciones';

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});
afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
  org.fallarUpsertDesde = null;
  org.accesoCaido = false;
});
after(async () => {
  await org.cerrar();
  await cerrarBases();
});

const CSV = ['codigo,titulo', 'ARC-1,Uno', 'ARC-2,Dos', 'ARC-3,Tres', 'ARC-4,Cuatro'].join('\n');
const archivo = (contenido: string, nombre = 'historias-validas.csv') => ({ formato: 'CSV', nombre, contenido });

async function listo(config: Parameters<typeof montar>[0] = {}): Promise<Montaje> {
  m = await montar({ org, ...config });
  assert.equal((await guardarConfiguracion(m)).body.guardado, true);
  return m;
}

/** Consulta de Jira, asigna todas las nuevas (CEL-C, QE2, ANA3), las marca y confirma. */
async function sincronizar(persona: 'adm1' | 'adm2' = 'adm1', consultaCuerpo: unknown = {}) {
  const consulta = await m.pedir('post', CONSULTAR, persona, consultaCuerpo);
  if (consulta.status !== 200 || consulta.body.consulta === null) return { consulta, confirmacion: null };
  const id = consulta.body.consulta.id as string;
  const asignada = await m.pedir('patch', `${CONSULTAR}/${id}/items`, persona, { grupo: 'NUEVA', todas: true, asignacion: { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id, analistaId: PERSONAS.ana3.id } });
  assert.equal(asignada.status, 200);
  await m.pedir('patch', `${CONSULTAR}/${id}/items`, persona, { grupo: 'NUEVA', todas: true, marcarListas: true });
  const version = (await m.pedir('get', `${CONSULTAR}/${id}`, persona)).body.version as number;
  const confirmacion = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, persona, { version });
  return { consulta, confirmacion };
}

describe('E5-B04#1 · registro', () => {
  it('E5-B04-T01 una consulta y su confirmación dejan origen, fase, actor, fechas, duración, resultado y contadores', async () => {
    await listo();
    const { consulta, confirmacion } = await sincronizar();
    for (const r of [consulta, confirmacion]) {
      const e = (await m.pedir('get', `/v1/integraciones/ejecuciones/${r?.body.ejecucion.id}`, 'adm1')).body;
      assert.equal(e.origen, 'JIRA');
      assert.deepEqual(e.actor, { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre, rol: 'ADMINISTRADOR' });
      assert.ok(Date.parse(e.terminadaEn) >= Date.parse(e.iniciadaEn));
      assert.ok(e.duracionMs > 0);
      assert.deepEqual([e.reintentos429, e.proyecto, e.sitioHost, e.archivo], [0, 'QTY', '127.0.0.1:4010', null]);
    }
    const c = consulta.body.ejecucion;
    assert.deepEqual([c.fase, c.resultado, c.leidas, c.nuevas, c.cambiaron, c.sinCambios, c.conError, c.creadas], ['CONSULTA', 'CON_ERRORES', 11, 10, 0, 0, 1, 0]);
    const k = confirmacion?.body.ejecucion;
    assert.deepEqual([k.fase, k.resultado, k.leidas, k.creadas, k.conError, k.consultaId], ['CONFIRMACION', 'EXITOSA', 10, 10, 0, consulta.body.consulta.id]);
  });

  it('E5-B04-T02 un archivo guarda nombre, tamaño y huella SHA-256, nunca el contenido', async () => {
    await listo();
    const r = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.archivo, { nombre: 'historias-validas.csv', tamano: Buffer.byteLength(CSV), huella: createHash('sha256').update(CSV).digest('hex') });
    assert.equal(r.body.proyecto, null);
    assert.equal(r.body.sitioHost, null);
    const filas = await consultaDuenio('SELECT * FROM integraciones.ejecucion_integracion');
    assert.equal(JSON.stringify(filas).includes('ARC-1,Uno'), false);
    assert.equal(JSON.stringify(r.body).includes('ARC-1,Uno'), false);
  });

  it('E5-B04-T03 el detalle de la confirmación trae una fila por HDU creada con idHistoria, la referencia de Jira y la asignación; la consulta no tiene filas de detalle', async () => {
    await listo();
    const { consulta, confirmacion } = await sincronizar();
    const d = await m.pedir('get', `/v1/integraciones/ejecuciones/${confirmacion?.body.ejecucion.id}/detalle`, 'adm1');
    assert.equal(d.body.total, 10);
    assert.equal(d.body.filasOcultas, 0);
    assert.ok(d.body.items.every((f: { resultado: string; idHistoria: string | null }) => f.resultado === 'CREADA' && f.idHistoria !== null));
    assert.deepEqual(d.body.items[0].referencia, { estado: 'In Progress', responsable: 'Dev Uno' });
    assert.deepEqual(d.body.items[0].asignacion.celula, 'CEL-C');
    const vacio = await m.pedir('get', `/v1/integraciones/ejecuciones/${consulta.body.ejecucion.id}/detalle`, 'adm1');
    assert.equal(vacio.body.total, 0);
  });

  it('E5-B04-T04 en toda ejecución, incluso las fallidas, creadas+actualizadas+omitidas+conError = leidas y terminadaEn tiene valor', async () => {
    await listo();
    await sincronizar();
    await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    m.jira.modo = 'CAIDO';
    const fallida = await m.pedir('post', CONSULTAR, 'adm1', {});
    assert.deepEqual([fallida.body.ejecucion.leidas, fallida.body.ejecucion.codigoError], [0, 'JIRA_NO_DISPONIBLE']);
    const lista = await m.pedir('get', '/v1/integraciones/ejecuciones', 'adm1');
    assert.equal(lista.body.total, 5);
    for (const e of lista.body.items) {
      // En la fase CONSULTA nada se escribe: la suma es por grupo (D141).
      if (e.fase === 'CONSULTA') assert.equal(e.nuevas + e.cambiaron + e.sinCambios + e.conError, e.leidas);
      else assert.equal(e.creadas + e.actualizadas + e.omitidas + e.conError, e.leidas);
      assert.ok(e.terminadaEn);
    }
  });

  it('E5-B04-T13 un archivo con estructura inválida responde 422 con ejecucionId y deja una FALLIDA con la huella; la vista previa no registra', async () => {
    await listo();
    const malo = archivo('descripcion\nuna', 'sin-columna-titulo.csv');
    const prev = await m.pedir('post', '/v1/integraciones/archivos/vista-previa', 'adm1', malo);
    assert.equal(prev.status, 422);
    assert.equal(prev.body.ejecucionId, null);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);

    const r = await m.pedir('post', IMPORTAR, 'adm1', malo);
    assert.equal(r.status, 422);
    assert.equal(r.body.codigo, 'COLUMNAS_FALTANTES');
    assert.deepEqual(r.body.columnasFaltantes, ['codigo', 'titulo']);
    const e = (await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.ejecucionId}`, 'adm1')).body;
    assert.deepEqual([e.resultado, e.codigoError, e.leidas, e.archivo.huella], ['FALLIDA', 'COLUMNAS_FALTANTES', 0, createHash('sha256').update('descripcion\nuna').digest('hex')]);
    assert.deepEqual(e.sugerencias, ['CORREGIR_ARCHIVO']);
  });

  it('un 413 y un formato desconocido no registran ejecución', async () => {
    await listo();
    assert.equal((await m.pedir('post', IMPORTAR, 'adm1', archivo('x'.repeat(1_100_000)))).status, 413);
    assert.equal((await m.pedir('post', IMPORTAR, 'adm1', { ...archivo(CSV), formato: 'XLSX' })).status, 422);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);
  });
});

describe('E5-B04#2 · consulta', () => {
  it('E5-B04-T05 historial ordenado, con filtros, orden y tamaño de página recortado a 100 sin error', async () => {
    await listo();
    const { consulta, confirmacion } = await sincronizar();
    const r1 = consulta.body.ejecucion.id as string;
    const r1b = confirmacion?.body.ejecucion.id as string;
    const r2 = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    const r3 = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    m.jira.modo = 'CAIDO';
    const r4 = await m.pedir('post', CONSULTAR, 'adm1', {});
    const ids = (r: { body: { items: Array<{ id: string }> } }) => r.body.items.map((e) => e.id);
    const get = (q: string) => m.pedir('get', `/v1/integraciones/ejecuciones${q}`, 'adm1');
    assert.deepEqual(ids(await get('')), [r4.body.ejecucion.id, r3.body.id, r2.body.id, r1b, r1]);
    assert.deepEqual(ids(await get('?origen=CSV')), [r3.body.id, r2.body.id]);
    assert.deepEqual(ids(await get('?resultado=FALLIDA')), [r4.body.ejecucion.id]);
    assert.equal((await get('?orden=iniciadaEn:asc')).body.items[0].id, r1);
    const grande = await get('?tamanoPagina=500');
    assert.equal(grande.status, 200);
    assert.equal(grande.body.tamanoPagina, 100);
    const pagina = await get('?tamanoPagina=2&pagina=2');
    assert.deepEqual([pagina.body.items.length, pagina.body.total], [2, 5]);
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    assert.equal((await get(`?desde=${hoy}&hasta=${hoy}`)).body.total, 5);
    assert.equal((await get('?desde=2020-01-01&hasta=2020-01-02')).body.total, 0);
    for (const q of ['?orden=fecha:asc', '?origen=XML', '?fase=OTRA', '?resultado=NADA', '?desde=2026-02-30', '?desde=2026-10-02&hasta=2026-10-01', '?pagina=0']) assert.equal((await get(q)).status, 400, q);
  });

  it('E5-B04-T06 el QE ve en el detalle las filas de su ámbito y las con error sin título; el resto cuenta como ocultas; el Auditor ve todo', async () => {
    await listo();
    // Una importación con una fila inválida: sus HDU quedan con QE2 (destino) y la fila con error no tiene HDU.
    const r1 = await m.pedir('post', IMPORTAR, 'adm1', archivo(`${CSV}\nARC-9,`));
    const det = (persona: 'qe1' | 'qe2' | 'aud1', q = '') => m.pedir('get', `/v1/integraciones/ejecuciones/${r1.body.id}/detalle${q}`, persona);
    const qe2 = await det('qe2');
    assert.deepEqual([qe2.body.total, qe2.body.filasOcultas], [5, 0]);
    assert.ok(qe2.body.items.filter((f: { resultado: string }) => f.resultado === 'CREADA').every((f: { titulo: string | null }) => f.titulo !== null));
    const qe1 = await det('qe1');
    assert.equal(qe1.status, 200);
    assert.deepEqual([qe1.body.total, qe1.body.filasOcultas, qe1.body.items.length], [1, 4, 1]);
    assert.deepEqual([qe1.body.items[0].codigo, qe1.body.items[0].motivo, qe1.body.items[0].titulo, qe1.body.items[0].referencia], ['ARC-9', 'TITULO_VACIO', null, null]);
    assert.equal((await det('qe1', '?soloErrores=true')).body.filasOcultas, 0);
    assert.equal((await det('qe1', '?resultado=CREADA')).body.total, 0);
    const aud = await det('aud1');
    assert.deepEqual([aud.body.total, aud.body.filasOcultas], [5, 0]);
    assert.notEqual(aud.body.items[0].titulo, null);
    assert.equal((await det('aud1', '?soloErrores=true&resultado=CREADA')).status, 400);
    assert.equal(org.llamadas.filter((l) => l === 'GET /v1/interno/hdu/ambito').length, 4);
  });

  it('E5-B04-T07 Líder y Analista: 403 en todo; un id inexistente es 404 para Administrador y Auditor y 403 para el QE; sin token 401', async () => {
    await listo();
    for (const persona of ['lid1', 'ana1'] as const) {
      for (const ruta of ['/v1/integraciones/ejecuciones', '/v1/integraciones/estado', `/v1/integraciones/ejecuciones/${PERSONAS.adm1.id}`]) {
        assert.equal((await m.pedir('get', ruta, persona)).status, 403, `${persona} ${ruta}`);
      }
    }
    const inexistente = `/v1/integraciones/ejecuciones/${PERSONAS.qe1.id}`;
    assert.equal((await m.pedir('get', inexistente, 'adm1')).status, 404);
    assert.equal((await m.pedir('get', inexistente, 'aud1')).status, 404);
    assert.equal((await m.pedir('get', inexistente, 'qe1')).status, 403);
    assert.equal((await m.pedir('get', `${inexistente}/detalle`, 'qe1')).status, 403);
    assert.equal((await m.pedir('get', '/v1/integraciones/ejecuciones/no-es-uuid', 'adm1')).status, 400);
    assert.equal((await m.pedir('get', '/v1/integraciones/estado', null)).status, 401);
    for (const persona of ['qe1', 'aud1'] as const) assert.equal((await m.pedir('get', '/v1/integraciones/ejecuciones', persona)).status, 200);
  });

  it('GET estado: última, última completada (la INCOMPLETA no cuenta), jiraConfigurado solo para el Administrador y sin continuar', async () => {
    m = await montar({ org });
    const vacio = await m.pedir('get', '/v1/integraciones/estado', 'adm1');
    assert.deepEqual(vacio.body, { ultimaEjecucion: null, ultimaCompletada: null, enCurso: null, jiraConfigurado: false });
    await guardarConfiguracion(m, { proyecto: 'BIG' });
    const completa = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    const incompleta = { body: (await m.pedir('post', CONSULTAR, 'adm1', {})).body.ejecucion };
    assert.equal(incompleta.body.resultado, 'INCOMPLETA');
    const admin = (await m.pedir('get', '/v1/integraciones/estado', 'adm1')).body;
    assert.equal(admin.ultimaEjecucion.id, incompleta.body.id);
    assert.equal(admin.ultimaCompletada.id, completa.body.id);
    assert.equal(admin.jiraConfigurado, true);
    assert.equal('continuar' in admin, false);
    assert.equal(admin.enCurso, null);
    const qe = (await m.pedir('get', '/v1/integraciones/estado', 'qe1')).body;
    assert.equal('jiraConfigurado' in qe, false);
    assert.equal('continuar' in qe, false);
    assert.equal(qe.ultimaEjecucion.id, incompleta.body.id);
  });
});

describe('E5-B04 · fase de la ejecución (D141, D150)', () => {
  it('E5-B04-T16 / T17 el filtro fase separa DIRECTA, CONSULTA y CONFIRMACION; una ejecución de archivo cortada no ofrece CONTINUAR', async () => {
    await listo();
    const { consulta, confirmacion } = await sincronizar();
    const archivoOk = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    const get = async (fase: string) => (await m.pedir('get', `/v1/integraciones/ejecuciones?fase=${fase}`, 'adm1')).body;
    assert.deepEqual((await get('CONSULTA')).items.map((e: { id: string }) => e.id), [consulta.body.ejecucion.id]);
    assert.deepEqual((await get('CONFIRMACION')).items.map((e: { id: string }) => e.id), [confirmacion?.body.ejecucion.id]);
    assert.deepEqual((await get('DIRECTA')).items.map((e: { id: string }) => e.id), [archivoOk.body.id]);
    assert.equal(archivoOk.body.fase, 'DIRECTA');
    assert.equal((await m.pedir('get', '/v1/integraciones/ejecuciones?fase=CONSULTA', 'qe1')).status, 200);

    org.hdus.clear();
    org.fallarUpsertDesde = 1;
    const cortada = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    org.fallarUpsertDesde = null;
    assert.equal(cortada.body.codigoError, 'ORGANIZACION_NO_DISPONIBLE');
    assert.ok(!cortada.body.sugerencias.includes('CONTINUAR'));
  });
});

describe('E5-B04#3 · sin secretos', () => {
  it('E5-B04-T08/T09 ninguna columna de ninguna tabla ni respuesta contiene el token, Authorization, Basic ni el correo en Base64; el error de Organización es el mensaje fijo', async () => {
    await listo({ capturarRegistro: true });
    m.jira.modo = 'TOKEN_REVOCADO';
    const jira = await m.pedir('post', CONSULTAR, 'adm1', {});
    assert.deepEqual([jira.body.ejecucion.resultado, jira.body.ejecucion.codigoError], ['FALLIDA', 'JIRA_CREDENCIAL_INVALIDA']);
    m.jira.modo = 'NORMAL';
    org.fallarUpsertDesde = 1;
    const { confirmacion } = await sincronizar();
    const orgCaida = { body: confirmacion?.body.ejecucion };
    assert.equal(orgCaida.body.mensajeError, 'No pudimos guardar las HDU en este momento.');
    org.fallarUpsertDesde = null;

    const volcado = JSON.stringify(
      await Promise.all(['configuracion_jira', 'evento_configuracion', 'ejecucion_integracion', 'detalle_ejecucion'].map((t) => consultaDuenio(`SELECT * FROM integraciones.${t}`).then((f) => JSON.stringify(f, (_, v) => (typeof v === 'object' && v !== null && v.type === 'Buffer' ? undefined : v))))),
    );
    const secretos = [TOKEN_JIRA, 'Authorization', 'Basic ', Buffer.from(`admin@quality360.local:${TOKEN_JIRA}`).toString('base64')];
    const textos = [volcado, JSON.stringify(jira.body), JSON.stringify(orgCaida.body), m.registro?.lineas.join('\n') ?? ''];
    for (const texto of textos) for (const s of secretos) assert.equal(texto.includes(s), false, s);
    assert.equal(/https?:\/\/127\.0\.0\.1:\d+/.test(JSON.stringify(orgCaida.body)), false);
  });
});

describe('E5-B04 · inmutabilidad y una sola ejecución (D104, D123)', () => {
  it('E5-B04-T10 DELETE, UPDATE de una cerrada, UPDATE del detalle, resultado fuera del catálogo y contadores que no suman fallan', async () => {
    await listo();
    const r = await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV));
    const id = r.body.id as string;
    const intentos: Array<[string, RegExp]> = [
      ['DELETE FROM integraciones.ejecucion_integracion', /permission denied/],
      ['DELETE FROM integraciones.detalle_ejecucion', /permission denied/],
      ['UPDATE integraciones.detalle_ejecucion SET mensaje = \'x\'', /permission denied/],
      ['TRUNCATE integraciones.detalle_ejecucion', /permission denied/],
      [`UPDATE integraciones.ejecucion_integracion SET leidas = 99 WHERE id_ejecucion = '${id}'`, /cerrada|23001|restrict/i],
      [`UPDATE integraciones.ejecucion_integracion SET actor_nombre = 'otro' WHERE id_ejecucion = '${id}'`, /cerrada|23001|restrict/i],
      [`INSERT INTO integraciones.detalle_ejecucion (id_ejecucion, fila, resultado, motivo) VALUES ('${id}', 99, 'OMITIDA', 'SIN_CAMBIOS')`, /cerrada|23001|restrict/i],
    ];
    for (const [sql, patron] of intentos) await assert.rejects(prismaServicio.$executeRawUnsafe(sql), patron, sql);
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, actor_id, actor_nombre, actor_rol, resultado, terminada_en) VALUES ('JIRA', '${PERSONAS.adm1.id}', 'x', 'ADMINISTRADOR', 'INVENTADO', now())`),
      /ejecucion_resultado_ck|check constraint/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, creadas) VALUES ('JIRA', '${PERSONAS.adm1.id}', 'x', 'ADMINISTRADOR', 'EXITOSA', now(), 5, 1)`),
      /ejecucion_contadores_ck|check constraint/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, actor_id, actor_nombre, actor_rol, resultado) VALUES ('CSV', '${PERSONAS.adm1.id}', 'x', 'ADMINISTRADOR', 'EN_CURSO')`),
      /ejecucion_archivo_ck|check constraint/i,
    );
    assert.equal((await consultaDuenio<{ n: number }>('SELECT count(*)::int AS n FROM integraciones.detalle_ejecucion'))[0]?.n, 4);
  });

  it('E5-B04-T11 dos consultas simultáneas: una responde 200 y la otra 409 INTEGRACION_EN_CURSO, con una sola ejecución', async () => {
    await listo();
    m.jira.modo = 'RETARDO';
    m.jira.retardoMs = 700;
    const [a, b] = await Promise.all([m.pedir('post', CONSULTAR, 'adm1', {}), m.pedir('post', CONSULTAR, 'adm1', {})]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const conflicto = a.status === 409 ? a : b;
    assert.equal(conflicto.body.codigo, 'INTEGRACION_EN_CURSO');
    assert.equal(conflicto.body.mensaje, 'Ya hay una consulta o confirmación en curso.');
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 1);
  });

  it('E5-B04-T11 una ejecución EN_CURSO de hace 6 minutos queda INTERRUMPIDA con sus contadores y la nueva se ejecuta; una reciente da 409', async () => {
    await listo();
    await ejecutarDuenio(
      `INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, actor_id, actor_nombre, actor_rol, iniciada_en, resultado)
       VALUES ('0e500000-0000-4000-8000-0000000000e1', 'JIRA', '${PERSONAS.adm1.id}', 'Admin', 'ADMINISTRADOR', now() - interval '6 minutes', 'EN_CURSO')`,
    );
    await ejecutarDuenio(
      `INSERT INTO integraciones.detalle_ejecucion (id_ejecucion, fila, codigo, resultado, id_historia, motivo) VALUES ('0e500000-0000-4000-8000-0000000000e1', 1, 'X-1', 'CREADA', '${PERSONAS.qe1.id}', NULL), ('0e500000-0000-4000-8000-0000000000e1', 2, 'X-2', 'ERROR', NULL, 'TITULO_VACIO')`,
    );
    const estado = (await m.pedir('get', '/v1/integraciones/estado', 'adm1')).body;
    assert.equal(estado.enCurso.abandonada, true);
    const r = await m.pedir('post', CONSULTAR, 'adm1', {});
    assert.equal(r.status, 200);
    const vieja = (await m.pedir('get', '/v1/integraciones/ejecuciones/0e500000-0000-4000-8000-0000000000e1', 'adm1')).body;
    assert.equal(vieja.resultado, 'INTERRUMPIDA');
    assert.deepEqual([vieja.leidas, vieja.creadas, vieja.conError], [2, 1, 1]);

    await ejecutarDuenio(
      `INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, actor_id, actor_nombre, actor_rol, iniciada_en, resultado)
       VALUES ('0e500000-0000-4000-8000-0000000000e2', 'JIRA', '${PERSONAS.adm1.id}', 'Admin', 'ADMINISTRADOR', now() - interval '1 minute', 'EN_CURSO')`,
    );
    const reciente = await m.pedir('post', CONSULTAR, 'adm1', { reemplazar: true });
    assert.deepEqual([reciente.status, reciente.body.codigo], [409, 'INTEGRACION_EN_CURSO']);
    assert.equal((await m.pedir('post', IMPORTAR, 'adm1', archivo(CSV))).status, 409);
  });
});
