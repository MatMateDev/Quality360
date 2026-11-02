/**
 * E5-B01 · Configuración de Jira (cifrado, prueba de conexión, solo Administrador). Postgres local real con el rol
 * `svc_integraciones`; Organización y Jira son implementaciones falsas (ver ayudas.ts). Los IDs son los de
 * `docs/backlog/e5-integracion-jira.md`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  CELULA_C,
  PERSONAS,
  SPRINT_1,
  SPRINT_2,
  SPRINT_DE_A,
  TOKEN_JIRA,
  TOKEN_JIRA_NUEVO,
  cerrarBases,
  consultaDuenio,
  iniciarOrganizacionFalsa,
  prismaServicio,
  type OrganizacionFalsa,
} from '../ayudas.js';
import { LLAVE_PRUEBA } from '../ayudas-app.js';
import { configuracionBase, guardarConfiguracion, montar, type Montaje } from '../montaje.js';

/** El cuerpo de «probar» (SolicitudPruebaJira) no lleva el destino. */
const cuerpoPrueba = (cambios: Record<string, unknown> = {}): Record<string, unknown> => {
  const { sitio, correo, token, proyecto, tiposIssue } = configuracionBase(cambios);
  return { sitio, correo, token, proyecto, tiposIssue };
};

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});

afterEach(async () => {
  await m?.cerrar();
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

async function filaConfiguracion() {
  const filas = await consultaDuenio<{
    token_cifrado: Buffer;
    token_iv: Buffer;
    token_tag: Buffer;
    llave_version: number;
    token_ultimos4: string;
    estado_conexion: string;
    celula_id: string;
    campo_sprint: string | null;
  }>('SELECT * FROM integraciones.configuracion_jira');
  return filas[0];
}

describe('E5-B01#1 · cifrado', () => {
  it('E5-B01-T01 guarda el token cifrado (AES-256-GCM) y nunca lo devuelve; solo expone configurado y los últimos 4', async () => {
    m = await montar({ org });
    const r = await guardarConfiguracion(m);
    assert.equal(r.status, 200);
    assert.equal(r.body.guardado, true);
    assert.deepEqual(r.body.configuracion.token, { configurado: true, ultimos4: 'AB12', descifrable: true });
    assert.equal(JSON.stringify(r.body).includes(TOKEN_JIRA), false);
    assert.equal(r.body.configuracion.campoSprint, undefined);

    const fila = await filaConfiguracion();
    assert.ok(fila);
    assert.equal(Buffer.from(fila.token_cifrado).includes(Buffer.from(TOKEN_JIRA)), false);
    assert.notEqual(Buffer.from(fila.token_cifrado).toString('utf8'), TOKEN_JIRA);
    assert.equal(fila.token_iv.length, 12);
    assert.equal(fila.token_tag.length, 16);
    assert.equal(fila.llave_version, 1);
    assert.equal(fila.token_ultimos4, 'AB12');
    assert.equal(fila.estado_conexion, 'OK');
    assert.equal(fila.campo_sprint, 'customfield_10020');
  });

  it('E5-B01-T02 el GET no trae el token ni su cifrado, y dos guardados del mismo token dan IV y cifrado distintos', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const primera = await filaConfiguracion();
    const get = await m.pedir('get', '/v1/integraciones/jira/configuracion', 'adm1');
    assert.equal(get.status, 200);
    const texto = JSON.stringify(get.body);
    assert.equal(texto.includes(TOKEN_JIRA), false);
    for (const prohibido of ['tokenCifrado', 'token_cifrado', 'tokenIv', 'tokenTag', 'cifrado']) assert.equal(texto.includes(prohibido), false, prohibido);
    assert.deepEqual(get.body.token, { configurado: true, ultimos4: 'AB12', descifrable: true });
    assert.equal(get.body.llaveDisponible, true);
    assert.equal(get.body.configurado, true);
    assert.equal(get.body.celula.nombre, CELULA_C.nombre);
    assert.equal(get.body.qeResponsable.id, PERSONAS.qe2.id);
    assert.equal(get.body.sprintRespaldo.nombre, SPRINT_1.nombre);
    assert.deepEqual(get.body.avisosDestino, []);
    assert.equal(get.body.actualizadoPor.id, PERSONAS.adm1.id);

    await guardarConfiguracion(m);
    const segunda = await filaConfiguracion();
    assert.ok(primera && segunda);
    assert.notDeepEqual(Buffer.from(primera.token_iv), Buffer.from(segunda.token_iv));
    assert.notDeepEqual(Buffer.from(primera.token_cifrado), Buffer.from(segunda.token_cifrado));
  });

  it('GET sin configuración guardada: configurado false, tiposIssue por defecto y token sin configurar', async () => {
    m = await montar({ org });
    const get = await m.pedir('get', '/v1/integraciones/jira/configuracion', 'adm1');
    assert.equal(get.status, 200);
    assert.equal(get.body.configurado, false);
    assert.deepEqual(get.body.tiposIssue, ['Story', 'Historia']);
    assert.deepEqual(get.body.token, { configurado: false, ultimos4: null, descifrable: false });
    assert.equal(get.body.sitio, null);
    assert.equal(get.body.estadoConexion, 'SIN_PROBAR');
    assert.equal(get.body.actualizadoPor, null);
  });

  it('E5-B01-T03 sin INTEGRACIONES_LLAVE_CIFRADO: 503 LLAVE_CIFRADO_NO_DISPONIBLE; no guarda ni consulta a Jira; GET informa llaveDisponible false', async () => {
    m = await montar({ org, config: { llaveCifrado: null } });
    const r = await guardarConfiguracion(m);
    assert.equal(r.status, 503);
    assert.equal(r.body.codigo, 'LLAVE_CIFRADO_NO_DISPONIBLE');
    assert.equal(r.body.mensaje, 'La integración no está habilitada en el servidor.');
    assert.equal(JSON.stringify(r.body).includes('INTEGRACIONES_LLAVE'), false);
    assert.equal(m.jira.llamadas.length, 0);
    assert.equal(await filaConfiguracion(), undefined);

    const get = await m.pedir('get', '/v1/integraciones/jira/configuracion', 'adm1');
    assert.equal(get.status, 200);
    assert.equal(get.body.llaveDisponible, false);
    assert.equal(get.body.token.descifrable, false);
  });

  it('E5-B01-T04 con una llave distinta: sincronizar y probar (sin token en el cuerpo) dan 409 TOKEN_NO_DESCIFRABLE sin llamar a Jira; con la llave original vuelve a funcionar', async () => {
    const a = await montar({ org });
    assert.equal((await guardarConfiguracion(a)).status, 200);

    // La instancia «B» comparte la base de la «A» pero tiene otra llave.
    const b = await montar({ org, conservarDatos: true, config: { llaveCifrado: Buffer.alloc(32, 99) } });
    const sincronizar = await b.pedir('post', '/v1/integraciones/jira/sincronizaciones', 'adm1', {});
    const probar = await b.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', {});
    const get = await b.pedir('get', '/v1/integraciones/jira/configuracion', 'adm1');
    const llamadasB = b.jira.llamadas.length;
    await b.cerrar();

    assert.equal(sincronizar.status, 409);
    assert.equal(sincronizar.body.codigo, 'TOKEN_NO_DESCIFRABLE');
    assert.equal(sincronizar.body.mensaje, 'Vuelve a ingresar el API token.');
    assert.equal(probar.status, 409);
    assert.equal(probar.body.codigo, 'TOKEN_NO_DESCIFRABLE');
    assert.equal(llamadasB, 0);
    assert.deepEqual(get.body.token, { configurado: true, ultimos4: 'AB12', descifrable: false });
    for (const cuerpo of [sincronizar.body, probar.body]) assert.equal(JSON.stringify(cuerpo).includes(TOKEN_JIRA), false);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);

    // Con la llave A vuelve a funcionar.
    const probarA = await a.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', {});
    assert.equal(probarA.status, 200);
    assert.equal(probarA.body.ok, true);
    m = a;
  });

  it('volver a ingresar el token después de TOKEN_NO_DESCIFRABLE: el PUT con token nuevo guarda con la llave actual', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const sinToken = await guardarConfiguracion(m, { token: undefined });
    assert.equal(sinToken.status, 200);
    assert.equal(sinToken.body.guardado, true);
    assert.equal(sinToken.body.configuracion.token.ultimos4, 'AB12');
    const nuevo = await guardarConfiguracion(m, { token: TOKEN_JIRA_NUEVO });
    assert.equal(nuevo.body.configuracion.token.ultimos4, 'CD34');
  });
});

describe('E5-B01#2 · prueba de conexión', () => {
  it('E5-B01-T05 probar con los datos válidos: 200 con el usuario y el proyecto; solo llama a Jira para probar; no cambia la configuración', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const antes = await filaConfiguracion();
    m.jira.llamadas.length = 0;
    const r = await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', cuerpoPrueba());
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, usuarioJira: 'Admin Jira Falso', proyecto: { clave: 'QTY', nombre: 'Proyecto QTY' }, error: null });
    assert.deepEqual(m.jira.llamadas, ['probar']);
    assert.equal(JSON.stringify(r.body).includes(TOKEN_JIRA), false);
    const despues = await filaConfiguracion();
    assert.deepEqual(Buffer.from(despues?.token_iv ?? []), Buffer.from(antes?.token_iv ?? []));
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.evento_configuracion')).length, 1);
  });

  it('probar sin cuerpo usa lo guardado; sin configuración y con campos faltantes es 400', async () => {
    m = await montar({ org });
    const sin = await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', {});
    assert.equal(sin.status, 400);
    assert.equal(sin.body.codigo, 'VALIDACION');
    assert.deepEqual(sin.body.detalles.map((d: { campo: string }) => d.campo).sort(), ['correo', 'proyecto', 'sitio', 'token']);
    await guardarConfiguracion(m);
    const con = await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1');
    assert.equal(con.status, 200);
    assert.equal(con.body.ok, true);
  });

  it('E5-B01-T06 cada falla de Jira da 200 ok false con el código y el mensaje fijo, sin credenciales', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const casos: Array<[string, () => void, Record<string, unknown>, string]> = [
      ['token malo', () => undefined, { token: 'token-que-jira-rechaza' }, 'JIRA_CREDENCIAL_INVALIDA'],
      ['sitio inexistente', () => (m.jira.modo = 'SITIO_INEXISTENTE'), {}, 'JIRA_SITIO_NO_ENCONTRADO'],
      ['proyecto inexistente', () => undefined, { proyecto: 'NOEXISTE' }, 'JIRA_PROYECTO_NO_ENCONTRADO'],
      ['sin permiso', () => (m.jira.modo = 'SIN_PERMISO'), {}, 'JIRA_SIN_PERMISO'],
      ['límite de tasa persistente', () => (m.jira.modo = 'LIMITE_PAGINA_2'), {}, 'JIRA_LIMITE_DE_TASA'],
      ['lento', () => (m.jira.modo = 'LENTO'), {}, 'JIRA_TIEMPO_AGOTADO'],
      ['caído', () => (m.jira.modo = 'CAIDO'), {}, 'JIRA_NO_DISPONIBLE'],
      ['respuesta inválida', () => (m.jira.modo = 'RESPUESTA_INVALIDA'), {}, 'JIRA_RESPUESTA_INVALIDA'],
    ];
    for (const [nombre, preparar, cuerpo, codigo] of casos) {
      m.jira.reiniciar();
      preparar();
      const r = await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', cuerpo);
      assert.equal(r.status, 200, nombre);
      assert.equal(r.body.ok, false, nombre);
      assert.equal(r.body.error.codigo, codigo, nombre);
      assert.equal(r.body.usuarioJira, null);
      assert.ok(Array.isArray(r.body.error.sugerencias) && r.body.error.sugerencias.length > 0, nombre);
      const texto = JSON.stringify(r.body);
      for (const secreto of [TOKEN_JIRA, 'Authorization', 'Basic ', Buffer.from(`admin@quality360.local:${TOKEN_JIRA}`).toString('base64')]) assert.equal(texto.includes(secreto), false, `${nombre}: ${secreto}`);
    }
  });
});

describe('E5-B01 · PUT: probar y guardar (D112)', () => {
  it('si la prueba falla: 200 guardado false, la configuración anterior intacta y solo cambia el estado de la conexión', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const antes = await filaConfiguracion();
    m.jira.modo = 'CAIDO';
    const r = await guardarConfiguracion(m, { proyecto: 'BIG', token: TOKEN_JIRA_NUEVO });
    assert.equal(r.status, 200);
    assert.equal(r.body.guardado, false);
    assert.equal(r.body.prueba.ok, false);
    assert.equal(r.body.prueba.error.codigo, 'JIRA_NO_DISPONIBLE');
    assert.equal(r.body.configuracion.proyecto, 'QTY');
    assert.equal(r.body.configuracion.token.ultimos4, 'AB12');
    assert.equal(r.body.configuracion.estadoConexion, 'FALLIDA');
    assert.equal(r.body.configuracion.ultimaPruebaCodigo, 'JIRA_NO_DISPONIBLE');
    const despues = await filaConfiguracion();
    assert.deepEqual(Buffer.from(despues?.token_cifrado ?? []), Buffer.from(antes?.token_cifrado ?? []));
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.evento_configuracion')).length, 1);
  });

  it('una prueba fallida sin configuración previa no inserta nada', async () => {
    m = await montar({ org });
    m.jira.modo = 'TOKEN_REVOCADO';
    const r = await guardarConfiguracion(m);
    assert.equal(r.status, 200);
    assert.equal(r.body.guardado, false);
    assert.equal(r.body.configuracion.configurado, false);
    assert.equal(await filaConfiguracion(), undefined);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.evento_configuracion')).length, 0);
  });

  it('la primera vez el token es obligatorio (400) y después, ausente o vacío, conserva el guardado', async () => {
    m = await montar({ org });
    const sin = await guardarConfiguracion(m, { token: undefined });
    assert.equal(sin.status, 400);
    assert.equal(sin.body.detalles[0].campo, 'token');
    await guardarConfiguracion(m);
    const vacio = await guardarConfiguracion(m, { token: '' });
    assert.equal(vacio.status, 200);
    assert.equal(vacio.body.guardado, true);
    assert.equal(vacio.body.configuracion.token.ultimos4, 'AB12');
  });
});

describe('E5-B01 · validaciones', () => {
  it('E5-B01-T07 el sitio solo puede ser https://<subdominio>.atlassian.net: 400 sin ninguna llamada saliente; 127.0.0.1 solo en la instancia de pruebas', async () => {
    m = await montar({ org, config: { permitirHostPrueba: false } });
    for (const sitio of ['https://evil.example.com', 'http://169.254.169.254', 'https://x.atlassian.net.evil.com', 'https://usuario@x.atlassian.net', 'https://x.atlassian.net/ruta', 'https://x.atlassian.net:8443', 'http://127.0.0.1:4010']) {
      const r = await guardarConfiguracion(m, { sitio });
      assert.equal(r.status, 400, sitio);
      assert.equal(r.body.codigo, 'VALIDACION');
      assert.deepEqual([r.body.detalles[0].campo, r.body.detalles[0].codigo], ['sitio', 'VALOR_NO_PERMITIDO'], sitio);
      const probar = await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', cuerpoPrueba({ sitio }));
      assert.equal(probar.status, 400, sitio);
    }
    assert.equal(m.jira.llamadas.length, 0);
    assert.equal((await guardarConfiguracion(m, { sitio: 'https://equipo-qa.atlassian.net' })).status, 200);
    await m.cerrar();

    m = await montar({ org, config: { permitirHostPrueba: true } });
    assert.equal((await guardarConfiguracion(m, { sitio: 'http://127.0.0.1:4010' })).status, 200);
  });

  it('E5-B01-T09 destino inválido es 422 y formato inválido es 400; lo válido se guarda con el valor por defecto de los tipos', async () => {
    m = await montar({ org });
    const inexistente = '9d7e1a52-0b7c-4f3e-8a55-2c4b6d8e9f10';
    const catalogo1 = await guardarConfiguracion(m, { celulaId: inexistente });
    assert.equal(catalogo1.status, 422);
    assert.equal(catalogo1.body.codigo, 'CATALOGO_INVALIDO');
    const catalogo2 = await guardarConfiguracion(m, { sprintRespaldoId: inexistente });
    assert.equal(catalogo2.status, 422);
    assert.equal(catalogo2.body.codigo, 'CATALOGO_INVALIDO');
    assert.equal(catalogo2.body.detalles[0].campo, 'sprintRespaldoId');
    const deOtraCelula = await guardarConfiguracion(m, { sprintRespaldoId: SPRINT_DE_A.id });
    assert.equal(deOtraCelula.status, 422);
    assert.equal(deOtraCelula.body.detalles[0].codigo, 'NO_PERMITIDO');
    for (const qe of [PERSONAS.ana1.id, PERSONAS.inact1.id]) {
      const r = await guardarConfiguracion(m, { qeResponsableId: qe });
      assert.equal(r.status, 422);
      assert.equal(r.body.codigo, 'QE_INVALIDO');
    }
    for (const [cambio, campo] of [
      [{ correo: 'sin-arroba' }, 'correo'],
      [{ proyecto: 'qty' }, 'proyecto'],
      [{ token: 'abc' }, 'token'],
    ] as const) {
      const r = await guardarConfiguracion(m, cambio);
      assert.equal(r.status, 400);
      assert.equal(r.body.codigo, 'VALIDACION');
      assert.equal(r.body.detalles[0].campo, campo);
    }
    assert.equal(await filaConfiguracion(), undefined);
    assert.equal(m.jira.llamadas.length, 0);

    const sinTipos = await guardarConfiguracion(m, { tiposIssue: undefined });
    assert.equal(sinTipos.status, 200);
    assert.deepEqual(sinTipos.body.configuracion.tiposIssue, ['Story', 'Historia']);
    const vacios = await guardarConfiguracion(m, { tiposIssue: [] });
    assert.equal(vacios.status, 400);
    const demasiados = await guardarConfiguracion(m, { tiposIssue: ['A', 'B', 'C', 'D', 'E', 'F'] });
    assert.equal(demasiados.status, 400);
  });

  it('un campo desconocido en el cuerpo es 400', async () => {
    m = await montar({ org });
    const r = await guardarConfiguracion(m, { jql: 'project = X' });
    assert.equal(r.status, 400);
    assert.equal(r.body.detalles[0].campo, 'jql');
  });
});

describe('E5-B01#3 · solo el Administrador', () => {
  it('E5-B01-T08 QE, Analista, Líder y Auditor: 403 ACCESO_DENEGADO en PUT, GET y probar, con cuerpo idéntico; sin token 401; nada cambia', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const antes = await filaConfiguracion();
    const cuerpos = new Set<string>();
    for (const persona of ['qe1', 'ana1', 'lid1', 'aud1'] as const) {
      for (const [metodo, ruta, cuerpo] of [
        ['put', '/v1/integraciones/jira/configuracion', configuracionBase({ proyecto: 'BIG' })],
        ['get', '/v1/integraciones/jira/configuracion', undefined],
        ['post', '/v1/integraciones/jira/configuracion/probar', {}],
        ['get', '/v1/integraciones/jira/configuracion/eventos', undefined],
      ] as const) {
        const r = await m.pedir(metodo, ruta, persona, cuerpo);
        assert.equal(r.status, 403, `${persona} ${metodo} ${ruta}`);
        assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
        cuerpos.add(JSON.stringify({ codigo: r.body.codigo, mensaje: r.body.mensaje, detalles: r.body.detalles }));
      }
    }
    assert.equal(cuerpos.size, 1);
    const sin = await m.pedir('get', '/v1/integraciones/jira/configuracion', null);
    assert.equal(sin.status, 401);
    assert.equal(sin.body.codigo, 'NO_AUTENTICADO');
    assert.equal((await m.pedir('put', '/v1/integraciones/jira/configuracion', null, configuracionBase())).status, 401);
    const despues = await filaConfiguracion();
    assert.deepEqual(Buffer.from(despues?.token_iv ?? []), Buffer.from(antes?.token_iv ?? []));
    assert.equal(m.jira.llamadas.filter((l) => l === 'probar').length, 1);
  });

  it('un Administrador desactivado tampoco puede (el rol y el estado salen de Organización, no del token)', async () => {
    m = await montar({ org });
    org.inactivas.add('adm1');
    try {
      assert.equal((await m.pedir('get', '/v1/integraciones/jira/configuracion', 'adm1')).status, 403);
    } finally {
      org.inactivas.delete('adm1');
    }
  });
});

describe('E5-B01 · eventos de configuración (D111)', () => {
  it('E5-B01-T10 cada guardado registra quién, cuándo y qué campos cambiaron; token cambiado true solo si cambia el token; sin valores ni token', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    await guardarConfiguracion(m, { token: undefined, celulaId: CELULA_C.id, sprintRespaldoId: SPRINT_2.id });
    await guardarConfiguracion(m, { token: TOKEN_JIRA_NUEVO, sprintRespaldoId: SPRINT_2.id });
    const r = await m.pedir('get', '/v1/integraciones/jira/configuracion/eventos', 'adm1');
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 3);
    assert.equal(r.body.items.length, 3);
    const [ultimo, medio, primero] = r.body.items;
    assert.deepEqual(primero.camposCambiados, ['sitio', 'correo', 'token', 'proyecto', 'tiposIssue', 'celulaId', 'qeResponsableId', 'sprintRespaldoId']);
    assert.equal(primero.tokenCambiado, true);
    assert.deepEqual(medio.camposCambiados, ['sprintRespaldoId']);
    assert.equal(medio.tokenCambiado, false);
    assert.deepEqual(ultimo.camposCambiados, ['token']);
    assert.equal(ultimo.tokenCambiado, true);
    for (const evento of r.body.items) {
      assert.equal(evento.actor.id, PERSONAS.adm1.id);
      assert.equal(evento.resultadoPrueba, 'OK');
      assert.ok(!Number.isNaN(Date.parse(evento.fecha)));
    }
    const texto = JSON.stringify(r.body);
    for (const secreto of [TOKEN_JIRA, TOKEN_JIRA_NUEVO, 'admin@quality360.local', '127.0.0.1']) assert.equal(texto.includes(secreto), false, secreto);
    assert.ok(new Date(primero.fecha) <= new Date(medio.fecha));
  });

  it('pagina los eventos y rechaza un tamaño de página mayor a 100', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    await guardarConfiguracion(m, { token: TOKEN_JIRA_NUEVO });
    const pagina = await m.pedir('get', '/v1/integraciones/jira/configuracion/eventos?tamanoPagina=1&pagina=2', 'adm1');
    assert.equal(pagina.body.items.length, 1);
    assert.equal(pagina.body.total, 2);
    assert.equal(pagina.body.pagina, 2);
    assert.equal((await m.pedir('get', '/v1/integraciones/jira/configuracion/eventos?tamanoPagina=101', 'adm1')).status, 400);
    assert.equal((await m.pedir('get', '/v1/integraciones/jira/configuracion/eventos?pagina=0', 'adm1')).status, 400);
  });
});

describe('E5-B01-T11 · sin secretos en el registro', () => {
  it('ni la salida del servicio durante las operaciones de configuración contiene el token, Authorization, Basic ni el correo en Base64', async () => {
    m = await montar({ org, capturarRegistro: true });
    await guardarConfiguracion(m);
    await guardarConfiguracion(m, { token: TOKEN_JIRA_NUEVO });
    await m.pedir('post', '/v1/integraciones/jira/configuracion/probar', 'adm1', cuerpoPrueba());
    m.jira.modo = 'TOKEN_REVOCADO';
    await guardarConfiguracion(m);
    await m.pedir('get', '/v1/integraciones/jira/configuracion', 'qe1');
    await m.pedir('put', '/v1/integraciones/jira/configuracion', 'qe1', configuracionBase());
    const registro = m.registro?.lineas.join('\n') ?? '';
    assert.ok(registro.length > 0, 'el registro capturado no debe estar vacío');
    const secretos = [TOKEN_JIRA, TOKEN_JIRA_NUEVO, 'Authorization', 'authorization: Basic', 'Basic ', Buffer.from(`admin@quality360.local:${TOKEN_JIRA}`).toString('base64'), Buffer.from(`admin@quality360.local:${TOKEN_JIRA_NUEVO}`).toString('base64'), LLAVE_PRUEBA.toString('base64')];
    for (const secreto of secretos) assert.equal(registro.includes(secreto), false, `el registro contiene ${secreto.slice(0, 8)}…`);
  });
});

describe('E5-B01-T12 · el esquema y los privilegios del rol svc_integraciones', () => {
  it('sin llaves foráneas hacia otros esquemas; sin acceso a otro esquema; DELETE y UPDATE sobre evento_configuracion fallan por privilegios', async () => {
    m = await montar({ org });
    await guardarConfiguracion(m);
    const foraneas = await prismaServicio.$queryRawUnsafe<Array<{ tabla: string; referenciada: string }>>(
      `SELECT c.conrelid::regclass::text AS tabla, c.confrelid::regclass::text AS referenciada
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'integraciones'`,
    );
    for (const fk of foraneas) {
      assert.match(fk.referenciada, /^(integraciones\.)?(ejecucion_integracion)$/, `FK inesperada ${fk.tabla} → ${fk.referenciada}`);
    }
    await assert.rejects(prismaServicio.$queryRawUnsafe('SELECT 1 FROM organizacion.historia_usuario'), /permission denied|42501/);
    await assert.rejects(prismaServicio.$executeRawUnsafe('DELETE FROM integraciones.evento_configuracion'), /permission denied|42501/);
    await assert.rejects(prismaServicio.$executeRawUnsafe("UPDATE integraciones.evento_configuracion SET actor_nombre = 'x'"), /permission denied|42501/);
    await assert.rejects(prismaServicio.$executeRawUnsafe('DELETE FROM integraciones.configuracion_jira'), /permission denied|42501/);
  });
});
