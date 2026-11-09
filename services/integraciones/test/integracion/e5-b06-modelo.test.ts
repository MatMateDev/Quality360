/**
 * E5-B06 #7 · Modelo de datos del detalle y la confirmación por HDU (migración 20261106000000_e5_detalle_hdu). Postgres local
 * real, con el rol del servicio. Retención: el detalle vive solo en `consulta_item` y se va con la purga (D133, D198).
 * Cubre los CHECK nuevos, el `item_hdu_ck` relajado, los permisos y el disparador de ejecuciones `HDU` ya cerradas (D202 a, D206).
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, ejecutarDuenio, limpiarIntegraciones, prismaServicio } from '../ayudas.js';

const ADM = PERSONAS.adm1.id;
const CONSULTA = '0c000000-0000-4000-8000-0000000000d1';
const EJEC = '0e500000-0000-4000-8000-0000000000d2';

const sql = (texto: string) => prismaServicio.$executeRawUnsafe(texto);
const insertarConsulta = () =>
  sql(
    `INSERT INTO integraciones.consulta_jira (id_consulta, estado, creada_por_id, creada_por_nombre, vence_en, proyecto_clave, sitio_host)
     VALUES ('${CONSULTA}', 'ABIERTA', '${ADM}', 'Admin', now() + interval '1 day', 'QTY', '127.0.0.1:4010')`,
  );
const insertarItem = (posicion: number, grupo = 'NUEVA', extra = '', columnas = '') =>
  sql(`INSERT INTO integraciones.consulta_item (id_consulta, posicion, grupo, codigo, titulo, motivo ${columnas}) VALUES ('${CONSULTA}', ${posicion}, '${grupo}', 'QTY-${posicion}', 'T', ${grupo === 'SIN_CAMBIOS' ? "'SIN_CAMBIOS'" : 'NULL'} ${extra})`);
const una = async <T>(consulta: string): Promise<T> => (await consultaDuenio<T>(consulta))[0] as T;

before(limpiarIntegraciones);
afterEach(limpiarIntegraciones);
after(cerrarBases);

describe('E5-B06 #7 · consulta_item: detalle, revision, analista_auto, ya_asignada y aplicación', () => {
  it('las columnas nuevas tienen los valores por defecto que no rompen al código anterior', async () => {
    await insertarConsulta();
    await insertarItem(1);
    const f = await una<Record<string, unknown>>(`SELECT detalle, revision, analista_auto, aplicando_desde, ya_asignada, alcance_aplicacion, aplicado_por_id FROM integraciones.consulta_item`);
    assert.deepEqual(f, { detalle: null, revision: 1, analista_auto: false, aplicando_desde: null, ya_asignada: null, alcance_aplicacion: null, aplicado_por_id: null });
    assert.equal((await una<{ creadas: number }>('SELECT creadas FROM integraciones.consulta_jira')).creadas, 0);
    const col = await una<{ data_type: string; character_maximum_length: number; is_nullable: string }>(
      `SELECT data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_schema = 'integraciones' AND table_name = 'configuracion_jira' AND column_name = 'campo_criterios'`,
    );
    assert.deepEqual(col, { data_type: 'character varying', character_maximum_length: 30, is_nullable: 'YES' });
  });

  it('detalle: solo un objeto JSON de hasta 40 KB (40.960 bytes del texto de jsonb)', async () => {
    await insertarConsulta();
    await insertarItem(1);
    await sql(`UPDATE integraciones.consulta_item SET detalle = '{"resumen": "ok"}'::jsonb WHERE posicion = 1`);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET detalle = '[1]'::jsonb WHERE posicion = 1`), /item_detalle_ck|check constraint/i);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET detalle = '"texto"'::jsonb WHERE posicion = 1`), /item_detalle_ck|check constraint/i);
    // 40.000 bytes caben; 41.000 no.
    await sql(`UPDATE integraciones.consulta_item SET detalle = jsonb_build_object('t', repeat('a', 40000)) WHERE posicion = 1`);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET detalle = jsonb_build_object('t', repeat('a', 41000)) WHERE posicion = 1`), /item_detalle_ck|check constraint/i);
  });

  it('revision >= 1; analista_auto exige analista_id; ya_asignada es un objeto', async () => {
    await insertarConsulta();
    await insertarItem(1);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET revision = 0 WHERE posicion = 1`), /item_revision_ck|check constraint/i);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET analista_auto = true WHERE posicion = 1`), /item_analista_auto_ck|check constraint/i);
    await sql(`UPDATE integraciones.consulta_item SET analista_id = '${ADM}', analista_auto = true WHERE posicion = 1`);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET ya_asignada = '[]'::jsonb WHERE posicion = 1`), /item_ya_asignada_ck|check constraint/i);
    await sql(`UPDATE integraciones.consulta_item SET ya_asignada = '{"idHistoria": "x", "qe": "QE1", "analista": null}'::jsonb WHERE posicion = 1`);
  });

  it('aplicada = alcance_aplicacion no nulo; solo LOTE o HDU; sin aplicación no hay quién ni cuándo', async () => {
    await insertarConsulta();
    await insertarItem(1, 'NUEVA', `, '${ADM}', '${ADM}', '${ADM}', '${ADM}', true`, ', celula_id, qe_id, analista_id, sprint_id, marcada');
    // aplicada sin alcance, alcance sin aplicada y un alcance que no existe.
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET aplicada = true WHERE posicion = 1`), /item_aplicacion_ck|check constraint/i);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET alcance_aplicacion = 'HDU' WHERE posicion = 1`), /item_aplicacion_ck|check constraint/i);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET aplicada = true, alcance_aplicacion = 'OTRO' WHERE posicion = 1`), /item_alcance_aplicacion_ck|item_aplicacion_ck|check constraint/i);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET aplicado_por_id = '${ADM}' WHERE posicion = 1`), /item_aplicacion_ck|check constraint/i);
    for (const alcance of ['HDU', 'LOTE']) {
      await sql(`UPDATE integraciones.consulta_item SET aplicada = true, alcance_aplicacion = '${alcance}', aplicado_por_id = '${ADM}', aplicado_por_nombre = 'Admin', aplicado_en = now() WHERE posicion = 1`);
      await sql(`UPDATE integraciones.consulta_item SET aplicada = false, alcance_aplicacion = NULL, aplicado_por_id = NULL, aplicado_por_nombre = NULL, aplicado_en = NULL WHERE posicion = 1`);
    }
  });

  it('item_hdu_ck relajado: una NUEVA guarda id_historia si está aplicada o ya_asignada; sus demás datos de HDU siguen vacíos', async () => {
    await insertarConsulta();
    const hdu = '0b000000-0000-4000-8000-000000000001';
    // NUEVA con id_historia sin aplicada ni ya_asignada: sigue prohibido.
    await assert.rejects(insertarItem(1, 'NUEVA', `, '${hdu}'`, ', id_historia'), /item_hdu_ck|check constraint/i);
    // Con ya_asignada sí.
    await insertarItem(1, 'NUEVA', `, '${hdu}', '{"idHistoria": "${hdu}", "qe": "QE1", "analista": null}'::jsonb`, ', id_historia, ya_asignada');
    // Pero origen_hdu, estado_hdu y qe_hdu_nombre son solo de CAMBIO y SIN_CAMBIOS.
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET origen_hdu = 'JIRA' WHERE posicion = 1`), /item_hdu_ck|check constraint/i);
    await assert.rejects(sql(`UPDATE integraciones.consulta_item SET qe_hdu_nombre = 'QE1' WHERE posicion = 1`), /item_hdu_ck|check constraint/i);
    // Aplicada (marcada, completa) también lo permite.
    await insertarItem(2, 'NUEVA', `, '${ADM}', '${ADM}', '${ADM}', '${ADM}', true, true, 'HDU', '${ADM}', 'Admin', now(), '${hdu.replace(/1$/, '2')}'`, ', celula_id, qe_id, analista_id, sprint_id, marcada, aplicada, alcance_aplicacion, aplicado_por_id, aplicado_por_nombre, aplicado_en, id_historia');
    // CAMBIO y SIN_CAMBIOS siguen guardando todo.
    await insertarItem(3, 'CAMBIO', `, '${hdu.replace(/1$/, '3')}', 'JIRA', 'PENDIENTE', 'QE1', '{"a":{"antes":"x","despues":"y"}}'::jsonb`, ', id_historia, origen_hdu, estado_hdu, qe_hdu_nombre, cambios');
  });

  it('B06 #7 · el detalle desaparece con la fila: la purga lo borra y no queda en ejecuciones ni en su detalle', async () => {
    await insertarConsulta();
    await insertarItem(1, 'NUEVA', `, '{"descripcion": {"texto": "SECRETO-DE-JIRA-123", "truncado": false}}'::jsonb`, ', detalle');
    assert.equal((await una<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.consulta_item WHERE detalle::text LIKE '%SECRETO-DE-JIRA-123%'`)).n, 1);
    await sql(`UPDATE integraciones.consulta_jira SET estado = 'DESCARTADA', cerrada_en = now(), version = 2, descartadas = 1, creadas = 0 WHERE id_consulta = '${CONSULTA}'`);
    await sql(`DELETE FROM integraciones.consulta_item WHERE id_consulta = '${CONSULTA}'`);
    // Ninguna tabla conserva el texto: se busca en el volcado completo del esquema.
    const tablas = ['consulta_item', 'consulta_jira', 'ejecucion_integracion', 'detalle_ejecucion', 'evento_configuracion'];
    for (const t of tablas) {
      const n = (await una<{ n: number }>(`SELECT count(*)::int AS n FROM integraciones.${t} x WHERE x::text LIKE '%SECRETO-DE-JIRA-123%'`)).n;
      assert.equal(n, 0, t);
    }
    // `consulta_jira.creadas` se conserva tras la purga y no se puede dejar negativa.
    await assert.rejects(sql(`UPDATE integraciones.consulta_jira SET creadas = -1 WHERE id_consulta = '${CONSULTA}'`), /cerrada|consulta_creadas_ck|23001|check constraint/i);
  });
});

describe('ejecucion_integracion.alcance (D206) y el detalle de una ejecución HDU ya cerrada (D202 a)', () => {
  const ejecucionHdu = (extra = '') =>
    ejecutarDuenio(
      `INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, fase, alcance, consulta_id, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, creadas ${extra})
       VALUES ('${EJEC}', 'JIRA', 'CONFIRMACION', 'HDU', '${CONSULTA}', '${ADM}', 'Admin', 'ADMINISTRADOR', 'EXITOSA', now(), 1, 1)`,
    );

  it('alcance nace LOTE; HDU solo en CONFIRMACION, con leidas = 1 y ya cerrada; no admite otro valor', async () => {
    await insertarConsulta();
    await ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, actor_id, actor_nombre, actor_rol, resultado, terminada_en) VALUES ('JIRA', 'CONSULTA', '${ADM}', 'x', 'ADMINISTRADOR', 'EXITOSA', now())`);
    assert.equal((await una<{ alcance: string }>('SELECT alcance FROM integraciones.ejecucion_integracion')).alcance, 'LOTE');
    await assert.rejects(
      ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, alcance, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, creadas) VALUES ('JIRA', 'CONSULTA', 'HDU', '${ADM}', 'x', 'ADMINISTRADOR', 'EXITOSA', now(), 1, 0)`),
      /ejecucion_alcance_fase_ck|check constraint/i,
    );
    await assert.rejects(
      ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, alcance, consulta_id, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, creadas) VALUES ('JIRA', 'CONFIRMACION', 'HDU', '${CONSULTA}', '${ADM}', 'x', 'ADMINISTRADOR', 'EXITOSA', now(), 2, 2)`),
      /ejecucion_alcance_hdu_ck|check constraint/i,
    );
    await assert.rejects(
      ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, alcance, consulta_id, actor_id, actor_nombre, actor_rol, resultado) VALUES ('JIRA', 'CONFIRMACION', 'HDU', '${CONSULTA}', '${ADM}', 'x', 'ADMINISTRADOR', 'EN_CURSO')`),
      /ejecucion_alcance_hdu_ck|check constraint/i,
    );
    await assert.rejects(
      ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, alcance, consulta_id, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, creadas) VALUES ('JIRA', 'CONFIRMACION', 'TODO', '${CONSULTA}', '${ADM}', 'x', 'ADMINISTRADOR', 'EXITOSA', now(), 1, 1)`),
      /ejecucion_alcance_ck|check constraint/i,
    );
    await ejecucionHdu();
  });

  it('una ejecución HDU nace cerrada: no ocupa ejecucion_en_curso_key (una EN_CURSO convive) y su alcance es inmutable', async () => {
    await insertarConsulta();
    await ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, consulta_id, actor_id, actor_nombre, actor_rol, resultado) VALUES ('JIRA', 'CONFIRMACION', '${CONSULTA}', '${ADM}', 'Admin', 'ADMINISTRADOR', 'EN_CURSO')`);
    await ejecucionHdu();
    // Otra EN_CURSO sigue chocando con el índice (D104), pero una HDU más no.
    await assert.rejects(
      sql(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, consulta_id, actor_id, actor_nombre, actor_rol, resultado) VALUES ('JIRA', 'CONFIRMACION', '${CONSULTA}', '${ADM}', 'Admin', 'ADMINISTRADOR', 'EN_CURSO')`),
      /ejecucion_en_curso_key|unique|duplicate|already exists/i,
    );
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.ejecucion_integracion SET alcance = 'LOTE' WHERE id_ejecucion = '${EJEC}'`), /cerrada|23001/i);
    // El alcance de una EN_CURSO tampoco cambia (identidad de la ejecución).
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.ejecucion_integracion SET alcance = 'HDU' WHERE resultado = 'EN_CURSO'`), /alcance|identidad|ejecucion_alcance|23001|check constraint/i);
  });

  it('el disparador admite UNA fila de detalle en una ejecución HDU cerrada y rechaza la segunda; una LOTE cerrada sigue sin admitir ninguna', async () => {
    await insertarConsulta();
    await ejecucionHdu();
    const fila = (n: number) => `INSERT INTO integraciones.detalle_ejecucion (id_ejecucion, fila, codigo, resultado, id_historia) VALUES ('${EJEC}', ${n}, 'QTY-${n}', 'CREADA', '${ADM}')`;
    await sql(fila(1));
    await assert.rejects(sql(fila(2)), /cerrada|23001/i);
    const LOTE = '0e500000-0000-4000-8000-0000000000d3';
    await ejecutarDuenio(`INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, fase, consulta_id, actor_id, actor_nombre, actor_rol, resultado, terminada_en) VALUES ('${LOTE}', 'JIRA', 'CONFIRMACION', '${CONSULTA}', '${ADM}', 'Admin', 'ADMINISTRADOR', 'EXITOSA', now())`);
    await assert.rejects(sql(`INSERT INTO integraciones.detalle_ejecucion (id_ejecucion, fila, codigo, resultado, id_historia) VALUES ('${LOTE}', 1, 'QTY-1', 'CREADA', '${ADM}')`), /cerrada|23001/i);
    // El detalle sigue siendo de solo inserción.
    await assert.rejects(sql(`UPDATE integraciones.detalle_ejecucion SET resultado = 'ERROR', motivo = 'ERROR_INTERNO' WHERE id_ejecucion = '${EJEC}'`), /permission denied/i);
    await assert.rejects(sql(`DELETE FROM integraciones.detalle_ejecucion WHERE id_ejecucion = '${EJEC}'`), /permission denied/i);
  });

  it('las funciones de disparador fijan su search_path (DEF-E5C-05) y TRUNCATE sigue sin concederse', async () => {
    const fns = await consultaDuenio<{ proname: string; proconfig: string[] | null }>(
      `SELECT proname, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'integraciones' AND proname IN ('ejecucion_cerrada_inmutable_fn', 'detalle_solo_en_curso_fn', 'item_solo_consulta_abierta_fn')`,
    );
    assert.equal(fns.length, 3);
    for (const f of fns) assert.ok(f.proconfig?.some((c) => c.startsWith('search_path=')), f.proname);
    for (const t of ['consulta_jira', 'consulta_item', 'ejecucion_integracion', 'configuracion_jira']) {
      await assert.rejects(sql(`TRUNCATE integraciones.${t} CASCADE`), /permission denied/i, t);
    }
  });
});
