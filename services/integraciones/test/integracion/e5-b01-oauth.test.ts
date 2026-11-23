/**
 * E5-B01 #1, #2, #4 a #6 y E5-B02 #7 con el método OAuth (JO7): configuración, prueba, cambio de método, consulta y eventos.
 * Con el API token todo sigue como lo certificó e5-b01-configuracion.test.ts.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
import { AtlassianDoble } from '../atlassian-doble.js';
import { configuracionBase, guardarConfiguracion, montar, type Montaje } from '../montaje.js';
import { RUTA, conectar, configuracionOauth, eventosOauth, filaConexion, volcadoDeTablas } from '../oauth-ayudas.js';

const CONFIG = '/v1/integraciones/jira/configuracion';
const CONSULTAS = '/v1/integraciones/jira/consultas';
const doble = new AtlassianDoble();
let org: OrganizacionFalsa;
let m: Montaje | null = null;

before(async () => {
  await doble.iniciar();
  org = await iniciarOrganizacionFalsa();
});
afterEach(async () => {
  await m?.cerrar();
  m = null;
  org.hdus.clear();
  doble.reiniciar();
});
after(async () => {
  await doble.cerrar();
  await org.cerrar();
  await cerrarBases();
});

async function conectado(): Promise<Montaje> {
  doble.reiniciar();
  m = await montar({ org, atlassian: doble, capturarRegistro: true });
  assert.equal((await conectar(m, doble)).respuesta.body.resultado, 'CONECTADA');
  doble.solicitudes.length = 0;
  return m;
}

const filaConfig = async () => (await consultaDuenio<{ metodo: string; correo: string | null; token_cifrado: unknown; sitio_url: string; estado_conexion: string; ultima_prueba_en: Date | null }>('SELECT metodo, correo, token_cifrado, sitio_url, estado_conexion, ultima_prueba_en FROM integraciones.configuracion_jira'))[0];

describe('E5-B01 #4 · guardar con OAuth', () => {
  it('sin conexión OAuth: 409 JIRA_NO_CONFIGURADO y nada se guarda', async () => {
    doble.reiniciar();
    m = await montar({ org, atlassian: doble });
    const r = await m.pedir('put', CONFIG, 'adm1', configuracionOauth());
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'JIRA_NO_CONFIGURADO');
    assert.equal(await filaConfig(), undefined);
  });

  it('con la conexión lista: prueba, guarda con metodo OAUTH, sitio del sitio OAuth, correo y API token nulos, y el evento trae metodo', async () => {
    const montaje = await conectado();
    const r = await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.guardado, true);
    assert.equal(r.body.prueba.ok, true);
    const c = r.body.configuracion;
    assert.deepEqual([c.metodo, c.correo, c.sitio, c.estadoConexion, c.oauth.estado], ['OAUTH', null, 'https://empresa.atlassian.net', 'OK', 'CONECTADA']);
    assert.deepEqual(c.token, { configurado: false, ultimos4: null, descifrable: false });
    const f = await filaConfig();
    assert.deepEqual([f?.metodo, f?.correo, f?.token_cifrado, f?.sitio_url], ['OAUTH', null, null, 'https://empresa.atlassian.net']);
    const ev = await montaje.pedir('get', `${CONFIG}/eventos`, 'adm1');
    assert.equal(ev.body.items[0].tipo, 'CONFIGURACION');
    assert.ok(ev.body.items[0].camposCambiados.includes('metodo'));
    assert.equal(ev.body.items[0].oauth, null);
    // Guardar detectó el campo Sprint con las llamadas del sitio OAuth.
    const rutas = doble.solicitudes.map((s) => s.ruta);
    for (const esperada of ['/rest/api/3/myself', '/rest/api/3/project/QTY', '/rest/api/3/field']) assert.ok(rutas.some((x) => x.endsWith(esperada)), esperada);
    assert.ok(doble.solicitudes.filter((s) => s.ruta.startsWith('/ex/')).every((s) => s.bearerValido === true));
  });

  it('sitio, correo o token en el cuerpo: 400 VALOR_NO_PERMITIDO en ese campo', async () => {
    const montaje = await conectado();
    const r = await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth({ correo: 'a@quality360.local', token: 'x'.repeat(10) }));
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.detalles.map((d: { campo: string; codigo: string }) => [d.campo, d.codigo]).sort(), [['correo', 'VALOR_NO_PERMITIDO'], ['token', 'VALOR_NO_PERMITIDO']]);
  });

  it('con el sitio pendiente: 409 JIRA_NO_CONFIGURADO', async () => {
    doble.reiniciar();
    doble.sitios = [(await import('../atlassian-doble.js')).SITIO_A, (await import('../atlassian-doble.js')).SITIO_B];
    m = await montar({ org, atlassian: doble });
    await conectar(m, doble);
    assert.equal((await m.pedir('put', CONFIG, 'adm1', configuracionOauth())).body.codigo, 'JIRA_NO_CONFIGURADO');
    assert.equal((await m.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' })).body.codigo, 'JIRA_NO_CONFIGURADO');
  });

  it('con la reconexión necesaria: 200 guardado false con JIRA_RECONEXION_NECESARIA y nada cambia', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    doble.expiresIn = 60;
    await (await import('../ayudas.js')).ejecutarDuenio(`UPDATE integraciones.conexion_oauth_jira SET acceso_expira_en = now()`);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const r = await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth({ proyecto: 'QTX' }));
    assert.equal(r.status, 200);
    assert.equal(r.body.guardado, false);
    assert.equal(r.body.prueba.error.codigo, 'JIRA_RECONEXION_NECESARIA');
    assert.equal(r.body.configuracion.oauth.estado, 'RECONEXION_NECESARIA');
    assert.equal(r.body.configuracion.proyecto, 'QTY');
    assert.equal((await filaConfig())?.estado_conexion, 'FALLIDA', 'el método activo ya era OAuth: se registra la prueba fallida');
  });
});

describe('E5-B01 #2 y #6 · probar con OAuth', () => {
  it('con proyecto: las mismas dos llamadas, mismo formato de resultado, sin tocar la configuración', async () => {
    const montaje = await conectado();
    const r = await montaje.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH', proyecto: 'QTY' });
    assert.deepEqual(r.body, { ok: true, usuarioJira: 'Ana Pérez', proyecto: { clave: 'QTY', nombre: 'Quality 360' }, error: null });
    assert.deepEqual(doble.solicitudes.filter((s) => s.ruta.startsWith('/ex/')).map((s) => s.ruta.split('/rest/api/3/')[1]), ['myself', 'project/QTY']);
    assert.equal(await filaConfig(), undefined);
  });

  it('sin proyecto en el cuerpo ni guardado: solo myself y proyecto null', async () => {
    const montaje = await conectado();
    const r = await montaje.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' });
    assert.deepEqual(r.body, { ok: true, usuarioJira: 'Ana Pérez', proyecto: null, error: null });
    assert.equal(doble.solicitudes.filter((s) => s.ruta.startsWith('/ex/')).length, 1);
  });

  it('sin permiso o proyecto inexistente: 200 ok false con JIRA_PROYECTO_NO_ENCONTRADO; no guarda y la conexión sigue CONECTADA', async () => {
    const montaje = await conectado();
    const r = await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth({ proyecto: 'NOPE' }));
    assert.equal(r.status, 200);
    assert.equal(r.body.guardado, false);
    assert.equal(r.body.prueba.error.codigo, 'JIRA_PROYECTO_NO_ENCONTRADO');
    assert.equal(await filaConfig(), undefined);
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
  });

  it('un 401 que persiste tras renovar: JIRA_OAUTH_PERMISOS_INSUFICIENTES con permisosFaltantes', async () => {
    const montaje = await conectado();
    doble.jiraRechazaSiempre = true;
    const r = await montaje.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH', proyecto: 'QTY' });
    assert.equal(r.body.error.codigo, 'JIRA_OAUTH_PERMISOS_INSUFICIENTES');
    assert.deepEqual(r.body.error.permisosFaltantes, ['read:jira-user']);
  });

  it('los textos del API token no cambian: sin metodo es API_TOKEN', async () => {
    doble.reiniciar();
    m = await montar({ org, atlassian: doble });
    const r = await m.pedir('post', `${CONFIG}/probar`, 'adm1', { sitio: 'http://127.0.0.1:4010', correo: 'a@quality360.local', token: 'q360-token-valido-AB12', proyecto: 'QTY' });
    assert.equal(r.body.ok, true);
    assert.equal(doble.solicitudes.length, 0);
  });
});

describe('E5-B01 #5 · convivencia y cambio de método', () => {
  it('«Lista, sin activar»: con el API token activo, GET informa metodo API_TOKEN y la conexión CONECTADA; probar OAuth no cambia la configuración', async () => {
    const montaje = await conectado();
    assert.equal((await guardarConfiguracion(montaje)).status, 200);
    const antes = await filaConfig();
    const get = await montaje.pedir('get', CONFIG, 'adm1');
    assert.deepEqual([get.body.metodo, get.body.oauth.estado, get.body.token.configurado], ['API_TOKEN', 'CONECTADA', true]);
    assert.equal((await montaje.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' })).body.ok, true);
    assert.deepEqual(await filaConfig(), antes);
    // Desconectar con el API token activo: el token sigue en uso.
    assert.equal((await montaje.pedir('delete', RUTA, 'adm1')).status, 204);
    assert.equal((await montaje.pedir('get', CONFIG, 'adm1')).body.token.configurado, true);
  });

  it('de API token a OAuth: tras la prueba exitosa el token cifrado se descarta; si la prueba falla, ambos quedan como estaban', async () => {
    const montaje = await conectado();
    await guardarConfiguracion(montaje);
    const antes = await filaConfig();
    const falla = await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth({ proyecto: 'NOPE' }));
    assert.equal(falla.body.guardado, false);
    assert.deepEqual(await filaConfig(), antes, 'incluido estado_conexion y ultima_prueba_en: el método activo no se probó');
    const ok = await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    assert.equal(ok.body.guardado, true);
    const f = await filaConfig();
    assert.deepEqual([f?.metodo, f?.correo, f?.token_cifrado], ['OAUTH', null, null]);
    const ev = (await montaje.pedir('get', `${CONFIG}/eventos`, 'adm1')).body.items[0];
    assert.ok(ev.camposCambiados.includes('metodo') && ev.camposCambiados.includes('token') && ev.tokenCambiado);
  });

  it('de OAuth a API token: exige sitio, correo y token (400); tras la prueba exitosa se borra la conexión OAuth y se registra DESCONECTAR', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    const sinToken = await montaje.pedir('put', CONFIG, 'adm1', configuracionBase({ token: undefined }));
    assert.equal(sinToken.status, 400);
    assert.equal(sinToken.body.detalles[0].campo, 'token');
    assert.ok(await filaConexion());
    // Si la prueba falla, nada cambia: ni la conexión ni el método.
    montaje.jira.modo = 'TOKEN_REVOCADO';
    const falla = await montaje.pedir('put', CONFIG, 'adm1', configuracionBase());
    assert.equal(falla.body.guardado, false);
    assert.ok(await filaConexion());
    assert.equal((await filaConfig())?.metodo, 'OAUTH');
    montaje.jira.modo = 'NORMAL';
    const ok = await montaje.pedir('put', CONFIG, 'adm1', configuracionBase());
    assert.equal(ok.body.guardado, true, JSON.stringify(ok.body));
    assert.equal(ok.body.configuracion.metodo, 'API_TOKEN');
    assert.equal(ok.body.configuracion.oauth, null);
    assert.equal(await filaConexion(), null);
    assert.deepEqual((await eventosOauth()).map((e) => e.tipo), ['CONECTAR_OAUTH', 'DESCONECTAR']);
  });
});

describe('E5-B01 #1 · eventos y secretos', () => {
  it('los eventos mezclan por fecha los guardados y los de la conexión, sin tokens ni valores', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    await montaje.pedir('delete', RUTA, 'adm1');
    const r = await montaje.pedir('get', `${CONFIG}/eventos?tamanoPagina=2`, 'adm1');
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 3);
    assert.equal(r.body.items.length, 2);
    assert.deepEqual(r.body.items.map((e: { tipo: string }) => e.tipo), ['DESCONECTAR', 'CONFIGURACION']);
    assert.deepEqual(r.body.items[0].oauth, { cuenta: 'Ana Pérez', sitio: 'empresa' });
    assert.deepEqual(r.body.items[0].camposCambiados, []);
    const p2 = await montaje.pedir('get', `${CONFIG}/eventos?tamanoPagina=2&pagina=2`, 'adm1');
    assert.equal(p2.body.items[0].tipo, 'CONECTAR_OAUTH');
    const texto = JSON.stringify(r.body) + JSON.stringify(p2.body) + (await volcadoDeTablas());
    assert.equal(texto.includes(doble.accesoActual as string), false);
  });
});

describe('E5-B02 #7 · consultar con OAuth', () => {
  it('lee con Bearer del sitio OAuth y guarda la tanda; sitioHost y enlaces salen del sitio OAuth', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    doble.solicitudes.length = 0;
    const r = await montaje.pedir('post', CONSULTAS, 'adm1', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ejecucion.resultado, 'EXITOSA', JSON.stringify(r.body.ejecucion));
    assert.equal(r.body.ejecucion.sitioHost, 'empresa.atlassian.net');
    assert.equal(r.body.consulta.sitioHost, 'empresa.atlassian.net');
    assert.equal(r.body.ejecucion.leidas, 3);
    const busquedas = doble.solicitudes.filter((s) => s.ruta.endsWith('/rest/api/3/search/jql'));
    assert.equal(busquedas.length, 1);
    assert.equal(busquedas[0]?.bearerValido, true);
    assert.equal(doble.llamadasA('/oauth/token'), 0, 'acceso vigente: sin renovar');
  });

  it('con la renovación vencida, renueva dentro del presupuesto y consulta', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    await (await import('../ayudas.js')).ejecutarDuenio(`UPDATE integraciones.conexion_oauth_jira SET acceso_expira_en = now() + interval '1 minute'`);
    const r = await montaje.pedir('post', CONSULTAS, 'adm1', {});
    assert.equal(r.body.ejecucion.resultado, 'EXITOSA', JSON.stringify(r.body.ejecucion));
    assert.equal(doble.renovaciones, 1);
  });

  it('RECONEXION_NECESARIA: 200 con la tanda FALLIDA y JIRA_RECONEXION_NECESARIA, sin guardar nada ni tocar la consulta abierta', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    const primera = await montaje.pedir('post', CONSULTAS, 'adm1', {});
    const consultaId = primera.body.consulta.id;
    await (await import('../ayudas.js')).ejecutarDuenio(`UPDATE integraciones.conexion_oauth_jira SET acceso_expira_en = now()`);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const r = await montaje.pedir('post', CONSULTAS, 'adm1', { reemplazar: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ejecucion.resultado, 'FALLIDA');
    assert.equal(r.body.ejecucion.codigoError, 'JIRA_RECONEXION_NECESARIA');
    assert.deepEqual(r.body.ejecucion.sugerencias, ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO']);
    const abierta = await consultaDuenio<{ id_consulta: string }>(`SELECT id_consulta FROM integraciones.consulta_jira WHERE estado = 'ABIERTA'`);
    assert.deepEqual(abierta.map((a) => a.id_consulta), [consultaId]);
    // Y sigue igual en las siguientes, sin llamar a Atlassian.
    const llamadas = doble.llamadasA('/oauth/token');
    const otra = await montaje.pedir('post', CONSULTAS, 'adm1', { reemplazar: true });
    assert.equal(otra.body.ejecucion.codigoError, 'JIRA_RECONEXION_NECESARIA');
    assert.equal(doble.llamadasA('/oauth/token'), llamadas);
  });

  it('tras desconectar con OAuth activo: 409 JIRA_NO_CONFIGURADO en consultar y en continuar', async () => {
    const montaje = await conectado();
    await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth());
    const primera = await montaje.pedir('post', CONSULTAS, 'adm1', {});
    await montaje.pedir('delete', RUTA, 'adm1');
    const a = await montaje.pedir('post', CONSULTAS, 'adm1', { reemplazar: true });
    assert.equal(a.status, 409);
    assert.equal(a.body.codigo, 'JIRA_NO_CONFIGURADO');
    const b = await montaje.pedir('post', `${CONSULTAS}/${primera.body.consulta.id}/continuaciones`, 'adm1', {});
    assert.equal(b.status === 409 || b.body.codigo === 'CONSULTA_LLENA' || b.body.codigo === 'CONSULTA_COMPLETA', true, JSON.stringify(b.body));
  });

  it('con el API token todo igual que siempre: no toca Atlassian', async () => {
    doble.reiniciar();
    m = await montar({ org, atlassian: doble });
    await guardarConfiguracion(m);
    const r = await m.pedir('post', CONSULTAS, 'adm1', {});
    assert.equal(r.body.ejecucion.resultado, 'CON_ERRORES'); // el proyecto QTY del Jira falso trae filas con error
    assert.equal(doble.solicitudes.length, 0);
  });
});
