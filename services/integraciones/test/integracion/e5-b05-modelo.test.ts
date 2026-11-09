/**
 * E5-B05 · Modelo de datos de la consulta (IC1). Postgres local real. IDs de `docs/backlog/e5-consulta-asignacion.md`.
 * E5-B05-T35 (índice de una sola abierta, disparadores, permisos y RLS) y la parte de base de E5-B04-T16
 * (el `UPDATE` de una ejecución cerrada, también de fase `CONSULTA`).
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, ejecutarDuenio, limpiarIntegraciones, prismaServicio } from '../ayudas.js';

const ADM = PERSONAS.adm1.id;
const CONSULTA_A = '0c000000-0000-4000-8000-0000000000a1';
const CONSULTA_B = '0c000000-0000-4000-8000-0000000000b1';

const insertarConsulta = (id: string, estado = 'ABIERTA') =>
  prismaServicio.$executeRawUnsafe(
    `INSERT INTO integraciones.consulta_jira (id_consulta, estado, creada_por_id, creada_por_nombre, vence_en, cerrada_en, proyecto_clave, sitio_host)
     VALUES ('${id}', '${estado}', '${ADM}', 'Admin', now() + interval '1 day', ${estado === 'ABIERTA' ? 'NULL' : 'now()'}, 'QTY', '127.0.0.1:4010')`,
  );

const insertarItem = (consultaId: string, posicion: number, extra = '', columnas = '') =>
  prismaServicio.$executeRawUnsafe(
    `INSERT INTO integraciones.consulta_item (id_consulta, posicion, grupo, codigo, titulo ${columnas}) VALUES ('${consultaId}', ${posicion}, 'NUEVA', 'QTY-${posicion}', 'Titulo' ${extra})`,
  );

before(limpiarIntegraciones);
afterEach(limpiarIntegraciones);
after(cerrarBases);

describe('E5-B05-T35 · consulta_jira y consulta_item', () => {
  it('una segunda consulta ABIERTA viola el índice parcial (23505); con la primera cerrada sí se puede', async () => {
    await insertarConsulta(CONSULTA_A);
    await assert.rejects(insertarConsulta(CONSULTA_B), /consulta_abierta_key|unique|duplicate|already exists/i);
    await prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_jira SET estado = 'REEMPLAZADA', cerrada_en = now(), version = version + 1 WHERE id_consulta = '${CONSULTA_A}'`);
    await insertarConsulta(CONSULTA_B);
  });

  it('una consulta cerrada no se modifica, no se borra y no admite filas; el CHECK de cierre y de contadores se cumple', async () => {
    await insertarConsulta(CONSULTA_A);
    await prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_jira SET estado = 'CONFIRMADA', cerrada_en = now(), version = 2 WHERE id_consulta = '${CONSULTA_A}'`);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_jira SET descartadas = 3 WHERE id_consulta = '${CONSULTA_A}'`), /cerrada|23001/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`DELETE FROM integraciones.consulta_jira WHERE id_consulta = '${CONSULTA_A}'`), /permission denied/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe('TRUNCATE integraciones.consulta_jira CASCADE'), /permission denied/i);
    await assert.rejects(insertarItem(CONSULTA_A, 1), /no está abierta|23001/i);
    // estado ABIERTA con cerrada_en, contadores que no suman y más de 500 filas.
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.consulta_jira (estado, creada_por_id, creada_por_nombre, vence_en, cerrada_en, proyecto_clave, sitio_host) VALUES ('ABIERTA', '${ADM}', 'x', now(), now(), 'QTY', 'h')`),
      /consulta_cierre_ck|check constraint/i,
    );
    await insertarConsulta(CONSULTA_B);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_jira SET nuevas = 2, total_filas = 1 WHERE id_consulta = '${CONSULTA_B}'`), /consulta_contadores_ck|check constraint/i);
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_jira SET nuevas = 501, total_filas = 501 WHERE id_consulta = '${CONSULTA_B}'`),
      /consulta_tope_ck|check constraint/i,
    );
  });

  it('las filas: DELETE permitido al servicio (purga), código único sin distinguir mayúsculas, CHECK de asignación y de marcada', async () => {
    await insertarConsulta(CONSULTA_A);
    await insertarItem(CONSULTA_A, 1);
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.consulta_item (id_consulta, posicion, grupo, codigo, titulo) VALUES ('${CONSULTA_A}', 2, 'NUEVA', 'qty-1', 'Otra')`),
      /consulta_item_codigo_key|unique|duplicate|already exists/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.consulta_item (id_consulta, posicion, grupo, codigo, titulo) VALUES ('${CONSULTA_A}', 1, 'NUEVA', 'QTY-9', 'Misma posición')`),
      /consulta_item_posicion_key|unique|duplicate|already exists/i,
    );
    // Marcar una NUEVA incompleta, asignar en un grupo que no es NUEVA, aplicada sin marcada, grupo y motivo incoherentes.
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_item SET marcada = true WHERE posicion = 1`), /marcada_valida|check constraint/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_item SET aplicada = true WHERE posicion = 1`), /aplicada_marcada|check constraint/i);
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.consulta_item (id_consulta, posicion, grupo, codigo, motivo, celula_id) VALUES ('${CONSULTA_A}', 5, 'CAMBIO', 'QTY-5', NULL, '${ADM}')`),
      /item_asignacion_ck|check constraint/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.consulta_item (id_consulta, posicion, grupo, codigo) VALUES ('${CONSULTA_A}', 6, 'SIN_CAMBIOS', 'QTY-6')`),
      /item_motivo_ck|check constraint/i,
    );
    await assert.rejects(insertarItem(CONSULTA_A, 7, ", 'URGENTE'", ', prioridad'), /item_prioridad_ck|check constraint/i);
    // Completa y marcada sí.
    await prismaServicio.$executeRawUnsafe(
      `UPDATE integraciones.consulta_item SET celula_id = '${ADM}', qe_id = '${ADM}', analista_id = '${ADM}', sprint_id = '${ADM}', marcada = true WHERE posicion = 1`,
    );
    // La purga: DELETE de filas con la consulta ya cerrada.
    await prismaServicio.$executeRawUnsafe(`UPDATE integraciones.consulta_jira SET estado = 'DESCARTADA', cerrada_en = now(), version = 2 WHERE id_consulta = '${CONSULTA_A}'`);
    await prismaServicio.$executeRawUnsafe(`DELETE FROM integraciones.consulta_item WHERE id_consulta = '${CONSULTA_A}'`);
    assert.equal((await consultaDuenio<{ n: number }>('SELECT count(*)::int AS n FROM integraciones.consulta_item'))[0]?.n, 0);
    await assert.rejects(prismaServicio.$executeRawUnsafe('TRUNCATE integraciones.consulta_item'), /permission denied/i);
  });

  it('el rol anónimo no lee ninguna de las dos tablas', async () => {
    for (const tabla of ['consulta_jira', 'consulta_item']) {
      await assert.rejects(
        consultaDuenio(`DO $$ BEGIN SET LOCAL ROLE anon; PERFORM 1 FROM integraciones.${tabla}; END $$`),
        /permission denied/i,
        tabla,
      );
    }
  });
});

describe('E5-B04-T16 · ejecución por fase', () => {
  const EJEC = '0e500000-0000-4000-8000-0000000000c1';

  it('el UPDATE de una ejecución cerrada de fase CONSULTA o CONFIRMACION lo rechaza el disparador; el invariante es por fase', async () => {
    await insertarConsulta(CONSULTA_A);
    await ejecutarDuenio(
      `INSERT INTO integraciones.ejecucion_integracion (id_ejecucion, origen, fase, consulta_id, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, nuevas, cambiaron, sin_cambios, con_error)
       VALUES ('${EJEC}', 'JIRA', 'CONSULTA', '${CONSULTA_A}', '${ADM}', 'Admin', 'ADMINISTRADOR', 'EXITOSA', now(), 4, 2, 1, 1, 0)`,
    );
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.ejecucion_integracion SET leidas = 9 WHERE id_ejecucion = '${EJEC}'`), /cerrada|23001/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.ejecucion_integracion SET fase = 'DIRECTA' WHERE id_ejecucion = '${EJEC}'`), /cerrada|23001/i);
    // CONSULTA: las filas de la tanda suman `leidas` y no hay creadas.
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, creadas) VALUES ('JIRA', 'CONSULTA', '${ADM}', 'x', 'ADMINISTRADOR', 'EXITOSA', now(), 1, 1)`),
      /ejecucion_contadores_ck|check constraint/i,
    );
    // Las demás fases no usan los contadores de consulta.
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, actor_id, actor_nombre, actor_rol, resultado, terminada_en, leidas, nuevas) VALUES ('JIRA', 'DIRECTA', '${ADM}', 'x', 'ADMINISTRADOR', 'EXITOSA', now(), 1, 1)`),
      /ejecucion_contadores_ck|check constraint/i,
    );
    // Una importación de archivo es DIRECTA; CONFIRMACION exige consulta y origen Jira; DIRECTA no lleva consulta.
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, actor_id, actor_nombre, actor_rol, resultado, archivo_nombre, archivo_tamano, archivo_huella) VALUES ('CSV', 'CONSULTA', '${ADM}', 'x', 'ADMINISTRADOR', 'EN_CURSO', 'a.csv', 1, '${'a'.repeat(64)}')`),
      /ejecucion_fase_origen_ck|check constraint/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, actor_id, actor_nombre, actor_rol, resultado) VALUES ('JIRA', 'CONFIRMACION', '${ADM}', 'x', 'ADMINISTRADOR', 'EN_CURSO')`),
      /ejecucion_confirmacion_ck|check constraint/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.ejecucion_integracion (origen, fase, consulta_id, actor_id, actor_nombre, actor_rol, resultado) VALUES ('JIRA', 'DIRECTA', '${CONSULTA_A}', '${ADM}', 'x', 'ADMINISTRADOR', 'EN_CURSO')`),
      /ejecucion_consulta_ck|check constraint/i,
    );
  });
});
