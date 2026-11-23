/**
 * E5-B08 · Modelo de datos de la conexión OAuth (JO1; B08 #2, #3, #12, #14 en su parte de modelo). Postgres real, con el rol
 * `svc_integraciones`: CHECK de las tablas nuevas, disparador de `usado_en`, privilegios y compatibilidad con una fila
 * `API_TOKEN` que ya existía.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, ejecutarDuenio, limpiarIntegraciones, prismaServicio } from '../ayudas.js';

const ADM = PERSONAS.adm1.id;
const CLOUD = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const BYTES = (n: number): string => `decode('${'ab'.repeat(n)}', 'hex')`;
const TOKENS = `${BYTES(20)}, ${BYTES(12)}, ${BYTES(16)}, ${BYTES(20)}, ${BYTES(12)}, ${BYTES(16)}, now() + interval '1 hour'`;
const COLUMNAS_TOKENS = 'acceso_cifrado, acceso_iv, acceso_tag, renovacion_cifrada, renovacion_iv, renovacion_tag, acceso_expira_en';

const insertarConexion = (valores: { estado?: string; cloud?: string; sitio?: string; candidatos?: string; cuenta?: string; tokens?: boolean; extra?: string }) =>
  prismaServicio.$executeRawUnsafe(
    `INSERT INTO integraciones.conexion_oauth_jira (estado, cloud_id, sitio_url, sitio_nombre, sitios_candidatos, cuenta_id, cuenta_nombre, scopes_concedidos,
       ${valores.tokens === false ? 'llave_version' : COLUMNAS_TOKENS}, conectado_por_id, conectado_por_nombre, conectado_en)
     VALUES ('${valores.estado ?? 'CONECTADA'}', ${valores.cloud === undefined ? `'${CLOUD}'` : valores.cloud}, ${valores.sitio === undefined ? `'https://empresa.atlassian.net'` : valores.sitio}, ${valores.sitio === 'NULL' ? 'NULL' : "'empresa'"},
       ${valores.candidatos ?? 'NULL'}, ${valores.cuenta === undefined ? `'cuenta-1'` : valores.cuenta}, ${valores.cuenta === 'NULL' ? 'NULL' : "'Ana Pérez'"}, 'read:jira-work read:jira-user offline_access',
       ${valores.tokens === false ? '1' : TOKENS}, '${ADM}', 'Admin', now())`,
  );

const CANDIDATOS = (n: number): string =>
  `'${JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, nombre: `s${i}`, url: `https://s${i}.atlassian.net` })))}'::jsonb`;

const insertarEstado = (hash: string) =>
  prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, expira_en) VALUES ('${hash}', '${ADM}', now() + interval '10 minutes')`);

const insertarEvento = (tipo: string, codigo: string | null = null) =>
  prismaServicio.$executeRawUnsafe(
    `INSERT INTO integraciones.evento_oauth_jira (actor_id, actor_nombre, tipo, sitio_nombre, cuenta_nombre, codigo) VALUES ('${ADM}', 'Admin', '${tipo}', 'empresa', 'Ana', ${codigo === null ? 'NULL' : `'${codigo}'`})`,
  );

before(limpiarIntegraciones);
afterEach(limpiarIntegraciones);
after(cerrarBases);

describe('E5-B08 · configuracion_jira con método (D209)', () => {
  const insertarConfiguracion = (metodo: string, correo: string | null, conToken: boolean) =>
    prismaServicio.$executeRawUnsafe(
      `INSERT INTO integraciones.configuracion_jira (metodo, sitio_url, correo, proyecto_clave, celula_id, qe_responsable_id, sprint_respaldo_id, token_cifrado, token_iv, token_tag, token_ultimos4,
         estado_conexion, actualizado_por_id, actualizado_por_nombre)
       VALUES ('${metodo}', 'https://empresa.atlassian.net', ${correo === null ? 'NULL' : `'${correo}'`}, 'QTY', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
         ${conToken ? `${BYTES(20)}, ${BYTES(12)}, ${BYTES(16)}, 'AB12'` : 'NULL, NULL, NULL, NULL'}, 'OK', '${ADM}', 'Admin')`,
    );

  it('una fila API_TOKEN existente sigue valiendo: el código anterior no escribe `metodo` y queda API_TOKEN', async () => {
    await prismaServicio.$executeRawUnsafe(
      `INSERT INTO integraciones.configuracion_jira (sitio_url, correo, proyecto_clave, celula_id, qe_responsable_id, sprint_respaldo_id, token_cifrado, token_iv, token_tag, token_ultimos4,
         estado_conexion, actualizado_por_id, actualizado_por_nombre)
       VALUES ('https://empresa.atlassian.net', 'a@quality360.local', 'QTY', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${BYTES(20)}, ${BYTES(12)}, ${BYTES(16)}, 'AB12', 'OK', '${ADM}', 'Admin')`,
    );
    const [fila] = await consultaDuenio<{ metodo: string }>('SELECT metodo FROM integraciones.configuracion_jira');
    assert.equal(fila?.metodo, 'API_TOKEN');
  });

  it('API_TOKEN exige correo y token completos; OAUTH exige que sean todos nulos (CHECK)', async () => {
    await assert.rejects(insertarConfiguracion('API_TOKEN', null, true), /configuracion_jira_metodo_credencial_ck|check constraint/i);
    await assert.rejects(insertarConfiguracion('API_TOKEN', 'a@quality360.local', false), /configuracion_jira_metodo_credencial_ck|check constraint/i);
    await assert.rejects(insertarConfiguracion('OAUTH', 'a@quality360.local', false), /configuracion_jira_metodo_credencial_ck|check constraint/i);
    await assert.rejects(insertarConfiguracion('OAUTH', null, true), /configuracion_jira_metodo_credencial_ck|check constraint/i);
    await insertarConfiguracion('OAUTH', null, false);
    const [fila] = await consultaDuenio<{ metodo: string; correo: string | null; token_cifrado: unknown }>('SELECT metodo, correo, token_cifrado FROM integraciones.configuracion_jira');
    assert.deepEqual([fila?.metodo, fila?.correo, fila?.token_cifrado], ['OAUTH', null, null]);
  });

  it('el catálogo de método, el IV de 12 bytes y la etiqueta de 16 siguen exigidos; sigue sin DELETE', async () => {
    await assert.rejects(insertarConfiguracion('OTRO', null, false), /configuracion_jira_metodo_ck|check constraint/i);
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(
        `INSERT INTO integraciones.configuracion_jira (sitio_url, correo, proyecto_clave, celula_id, qe_responsable_id, sprint_respaldo_id, token_cifrado, token_iv, token_tag, token_ultimos4, estado_conexion, actualizado_por_id, actualizado_por_nombre)
         VALUES ('https://e.atlassian.net', 'a@q.local', 'QTY', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${BYTES(20)}, ${BYTES(11)}, ${BYTES(16)}, 'AB12', 'OK', '${ADM}', 'Admin')`,
      ),
      /configuracion_jira_iv_ck|check constraint/i,
    );
    await insertarConfiguracion('OAUTH', null, false);
    await assert.rejects(prismaServicio.$executeRawUnsafe('DELETE FROM integraciones.configuracion_jira'), /permission denied/i);
  });
});

describe('E5-B08 #2 · conexion_oauth_jira (una sola fila)', () => {
  it('una conexión CONECTADA con tokens cifrados completos se guarda; una segunda fila no (id = 1)', async () => {
    await insertarConexion({});
    await assert.rejects(insertarConexion({}), /conexion_oauth_jira_pkey|conexion_oauth_unica_ck|duplicate|unique|already exists|23505/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.conexion_oauth_jira SET id = 2`), /conexion_oauth_unica_ck|check constraint/i);
  });

  it('IV de 12 bytes y etiqueta de 16 por cada token; cloud_id en minúsculas y URL de *.atlassian.net', async () => {
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(
        `INSERT INTO integraciones.conexion_oauth_jira (estado, cloud_id, sitio_url, sitio_nombre, cuenta_id, cuenta_nombre, scopes_concedidos, ${COLUMNAS_TOKENS}, conectado_por_id, conectado_por_nombre, conectado_en)
         VALUES ('CONECTADA', '${CLOUD}', 'https://e.atlassian.net', 'e', 'c', 'C', 's', ${BYTES(20)}, ${BYTES(11)}, ${BYTES(16)}, ${BYTES(20)}, ${BYTES(12)}, ${BYTES(16)}, now(), '${ADM}', 'A', now())`,
      ),
      /conexion_oauth_iv_ck|check constraint/i,
    );
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(
        `INSERT INTO integraciones.conexion_oauth_jira (estado, cloud_id, sitio_url, sitio_nombre, cuenta_id, cuenta_nombre, scopes_concedidos, ${COLUMNAS_TOKENS}, conectado_por_id, conectado_por_nombre, conectado_en)
         VALUES ('CONECTADA', '${CLOUD}', 'https://e.atlassian.net', 'e', 'c', 'C', 's', ${BYTES(20)}, ${BYTES(12)}, ${BYTES(15)}, ${BYTES(20)}, ${BYTES(12)}, ${BYTES(16)}, now(), '${ADM}', 'A', now())`,
      ),
      /conexion_oauth_tag_ck|check constraint/i,
    );
    await assert.rejects(insertarConexion({ cloud: `'${CLOUD.toUpperCase()}'` }), /conexion_oauth_cloud_ck|check constraint/i);
    await assert.rejects(insertarConexion({ cloud: `'no-es-uuid'` }), /conexion_oauth_cloud_ck|check constraint/i);
    for (const url of ['https://evil.example.com', 'http://e.atlassian.net', 'https://e.atlassian.net/ruta', 'https://e.atlassian.net.evil.com', 'https://E.atlassian.net']) {
      await assert.rejects(insertarConexion({ sitio: `'${url}'` }), /conexion_oauth_sitio_ck|check constraint/i, url);
    }
  });

  it('los tokens son nulos si y solo si el estado es RECONEXION_NECESARIA (se conservan cuenta y sitio)', async () => {
    await assert.rejects(insertarConexion({ estado: 'RECONEXION_NECESARIA' }), /conexion_oauth_tokens_ck|check constraint/i);
    await assert.rejects(insertarConexion({ estado: 'CONECTADA', tokens: false }), /conexion_oauth_tokens_ck|check constraint/i);
    await assert.rejects(insertarConexion({ estado: 'PENDIENTE_SITIO', tokens: false, cloud: 'NULL', sitio: 'NULL', cuenta: 'NULL', candidatos: CANDIDATOS(2) }), /conexion_oauth_tokens_ck|check constraint/i);
    await insertarConexion({ estado: 'RECONEXION_NECESARIA', tokens: false });
    const [fila] = await consultaDuenio<{ estado: string; cuenta_nombre: string; sitio_url: string; acceso_cifrado: unknown }>('SELECT estado, cuenta_nombre, sitio_url, acceso_cifrado FROM integraciones.conexion_oauth_jira');
    assert.deepEqual([fila?.estado, fila?.cuenta_nombre, fila?.sitio_url, fila?.acceso_cifrado], ['RECONEXION_NECESARIA', 'Ana Pérez', 'https://empresa.atlassian.net', null]);
  });

  it('CONECTADA exige sitio y cuenta; PENDIENTE_SITIO exige candidatos (2 a 50) y no lleva sitio ni cuenta', async () => {
    await assert.rejects(insertarConexion({ cuenta: 'NULL' }), /conexion_oauth_conectada_ck|check constraint/i);
    await assert.rejects(insertarConexion({ cloud: 'NULL' }), /conexion_oauth_conectada_ck|check constraint/i);
    // PENDIENTE_SITIO con sitio y cuenta, sin candidatos, con un solo candidato o con 51.
    await assert.rejects(insertarConexion({ estado: 'PENDIENTE_SITIO', candidatos: CANDIDATOS(2) }), /conexion_oauth_pendiente_ck|check constraint/i);
    await assert.rejects(insertarConexion({ estado: 'PENDIENTE_SITIO', cloud: 'NULL', sitio: 'NULL', cuenta: 'NULL' }), /conexion_oauth_pendiente_ck|check constraint/i);
    await assert.rejects(insertarConexion({ estado: 'PENDIENTE_SITIO', cloud: 'NULL', sitio: 'NULL', cuenta: 'NULL', candidatos: CANDIDATOS(1) }), /conexion_oauth_candidatos_ck|check constraint/i);
    await assert.rejects(insertarConexion({ estado: 'PENDIENTE_SITIO', cloud: 'NULL', sitio: 'NULL', cuenta: 'NULL', candidatos: CANDIDATOS(51) }), /conexion_oauth_candidatos_ck|check constraint/i);
    await assert.rejects(insertarConexion({ candidatos: CANDIDATOS(2) }), /conexion_oauth_pendiente_ck|check constraint/i);
    await assert.rejects(insertarConexion({ estado: 'OTRO' }), /conexion_oauth_estado_ck|check constraint/i);
    await insertarConexion({ estado: 'PENDIENTE_SITIO', cloud: 'NULL', sitio: 'NULL', cuenta: 'NULL', candidatos: CANDIDATOS(50) });
  });

  it('el servicio puede borrar la conexión (desconectar) pero no vaciar la tabla', async () => {
    await insertarConexion({});
    await assert.rejects(prismaServicio.$executeRawUnsafe('TRUNCATE integraciones.conexion_oauth_jira'), /permission denied/i);
    await prismaServicio.$executeRawUnsafe('DELETE FROM integraciones.conexion_oauth_jira');
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.conexion_oauth_jira')).length, 0);
  });
});

describe('E5-B08 #3 · oauth_estado_jira (state de un solo uso)', () => {
  it('solo guarda el SHA-256 en hexadecimal (64 caracteres minúsculas) y es único', async () => {
    await insertarEstado(HASH_A);
    await assert.rejects(insertarEstado(HASH_A), /oauth_estado_jira_estado_hash_key|unique|duplicate|already exists|23505/i);
    for (const malo of ['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64), 'valor-de-state-en-claro-nunca-se-guarda']) {
      await assert.rejects(prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, expira_en) VALUES ('${malo}', '${ADM}', now() + interval '10 minutes')`), /oauth_estado_hash_ck|check constraint|value too long/i, malo);
    }
  });

  it('el vencimiento debe ser posterior a la creación', async () => {
    await assert.rejects(
      prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, expira_en) VALUES ('${HASH_B}', '${ADM}', now() - interval '1 hour')`),
      /oauth_estado_vigencia_ck|check constraint/i,
    );
  });

  it('el consumo atómico: solo uno de dos retornos simultáneos con el mismo state gana', async () => {
    await insertarEstado(HASH_A);
    const consumir = () =>
      prismaServicio.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE "integraciones"."oauth_estado_jira" SET "usado_en" = now() WHERE "estado_hash" = '${HASH_A}' AND "actor_id" = '${ADM}'::uuid AND "usado_en" IS NULL AND "expira_en" > now() RETURNING "id"`,
      );
    const resultados = await Promise.all([consumir(), consumir()]);
    assert.deepEqual(resultados.map((r) => r.length).sort(), [0, 1]);
    assert.equal((await consumir()).length, 0);
  });

  it('el disparador solo deja pasar usado_en de nulo a una fecha, una vez (23001)', async () => {
    await insertarEstado(HASH_A);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.oauth_estado_jira SET actor_id = gen_random_uuid()`), /solo admite marcar usado_en|23001/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.oauth_estado_jira SET expira_en = now() + interval '1 day'`), /solo admite marcar usado_en|23001/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.oauth_estado_jira SET estado_hash = '${HASH_B}'`), /solo admite marcar usado_en|23001/i);
    await prismaServicio.$executeRawUnsafe(`UPDATE integraciones.oauth_estado_jira SET usado_en = now()`);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.oauth_estado_jira SET usado_en = NULL`), /solo admite marcar usado_en|23001/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.oauth_estado_jira SET usado_en = now() + interval '1 day'`), /solo admite marcar usado_en|23001/i);
  });

  it('el servicio conserva DELETE (purga de más de 1 día) y no TRUNCATE', async () => {
    await prismaServicio.$executeRawUnsafe(`INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, creado_en, expira_en) VALUES ('${HASH_B}', '${ADM}', now() - interval '2 days', now() - interval '2 days' + interval '10 minutes')`);
    await prismaServicio.$executeRawUnsafe(`DELETE FROM integraciones.oauth_estado_jira WHERE creado_en < now() - interval '1 day'`);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.oauth_estado_jira WHERE estado_hash = \'' + HASH_B + '\'')).length, 0);
    await assert.rejects(prismaServicio.$executeRawUnsafe('TRUNCATE integraciones.oauth_estado_jira'), /permission denied/i);
  });
});

describe('E5-B08 #12 y #14 · evento_oauth_jira (solo inserción)', () => {
  it('admite los cuatro tipos; REFRESCO_FALLIDO exige código y los demás no lo llevan', async () => {
    await insertarEvento('CONECTAR_OAUTH');
    await insertarEvento('RECONECTAR');
    await insertarEvento('DESCONECTAR');
    await insertarEvento('REFRESCO_FALLIDO', 'RENOVACION_RECHAZADA');
    await assert.rejects(insertarEvento('REFRESCO_FALLIDO'), /evento_oauth_codigo_ck|check constraint/i);
    await assert.rejects(insertarEvento('DESCONECTAR', 'RENOVACION_RECHAZADA'), /evento_oauth_codigo_ck|check constraint/i);
    await assert.rejects(insertarEvento('REFRESCO_FALLIDO', 'minusculas'), /evento_oauth_codigo_ck|check constraint/i);
    await assert.rejects(insertarEvento('OTRO'), /evento_oauth_tipo_ck|check constraint/i);
  });

  it('ni UPDATE, ni DELETE, ni TRUNCATE para el servicio', async () => {
    await insertarEvento('CONECTAR_OAUTH');
    await assert.rejects(prismaServicio.$executeRawUnsafe(`UPDATE integraciones.evento_oauth_jira SET actor_nombre = 'x'`), /permission denied/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe('DELETE FROM integraciones.evento_oauth_jira'), /permission denied/i);
    await assert.rejects(prismaServicio.$executeRawUnsafe('TRUNCATE integraciones.evento_oauth_jira'), /permission denied/i);
  });
});

describe('E5-B08 · sin llaves foráneas ni acceso a otros esquemas, funciones con su search_path', () => {
  it('ninguna de las tablas nuevas tiene llaves foráneas', async () => {
    const filas = await consultaDuenio<{ n: bigint }>(
      `SELECT count(*) AS n FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace s ON s.oid = t.relnamespace
       WHERE s.nspname = 'integraciones' AND c.contype = 'f' AND t.relname IN ('conexion_oauth_jira', 'oauth_estado_jira', 'evento_oauth_jira')`,
    );
    assert.equal(Number(filas[0]?.n), 0);
  });

  it('la función del disparador fija su search_path (no depende de la conexión)', async () => {
    const filas = await consultaDuenio<{ proconfig: string[] | null }>(`SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'integraciones' AND proname = 'oauth_estado_solo_consumo_fn'`);
    assert.ok(filas[0]?.proconfig?.some((c) => /search_path=integraciones, pg_catalog/.test(c)));
  });

  it('el rol no alcanza otro esquema', async () => {
    await assert.rejects(prismaServicio.$queryRawUnsafe('SELECT 1 FROM organizacion.historia_usuario'), /permission denied|42501/i);
    await ejecutarDuenio('SELECT 1');
  });
});
