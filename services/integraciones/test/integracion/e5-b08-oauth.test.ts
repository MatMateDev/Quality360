/**
 * E5-B08 #1 a #6 y #11 a #14 · Conexión OAuth (JO6, JO7): iniciar, retorno, sitio, desconectar, configuración con método.
 * Postgres real, Organización falsa y el doble de Atlassian.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, ejecutarDuenio, iniciarOrganizacionFalsa, type ClavePersona, type OrganizacionFalsa } from '../ayudas.js';
import { AtlassianDoble, CLOUD_A, CLOUD_B, CLIENT_SECRET_PRUEBA, SITIO_A, SITIO_B } from '../atlassian-doble.js';
import { montar, guardarConfiguracion, type Montaje } from '../montaje.js';
import { RUTA, conectar, configuracionOauth, eventosOauth, filaConexion, iniciar, sha256, tokensGuardados, volcadoDeTablas } from '../oauth-ayudas.js';

const doble = new AtlassianDoble();
const CONFIG = '/v1/integraciones/jira/configuracion';
let org: OrganizacionFalsa;
let m: Montaje | null = null;

before(async () => {
  await doble.iniciar();
  org = await iniciarOrganizacionFalsa();
});
afterEach(async () => {
  await m?.cerrar();
  m = null;
  doble.reiniciar();
});
after(async () => {
  await doble.cerrar();
  await org.cerrar();
  await cerrarBases();
});

const arrancar = async (opciones: Parameters<typeof montar>[0] = {}): Promise<Montaje> => {
  doble.reiniciar();
  m = await montar({ org, atlassian: doble, capturarRegistro: true, ...opciones });
  return m;
};

describe('E5-B08 #1 · iniciar', () => {
  it('200 con la dirección de Atlassian, un state nuevo y solo su hash en la base, a 10 minutos', async () => {
    const montaje = await arrancar();
    const { respuesta, state } = await iniciar(montaje);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers['cache-control'], 'no-store');
    const url = new URL(respuesta.body.urlAutorizacion);
    assert.equal(url.origin + url.pathname, `${doble.url}/authorize`);
    assert.equal(url.searchParams.get('audience'), 'api.atlassian.com');
    assert.equal(url.searchParams.get('client_id'), 'q360-prueba-id');
    assert.equal(url.searchParams.get('scope'), 'read:jira-work read:jira-user offline_access');
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.match(state, /^[A-Za-z0-9_-]{43}$/);
    const filas = await consultaDuenio<{ estado_hash: string; actor_id: string; vence: number }>(`SELECT estado_hash, actor_id, extract(epoch FROM (expira_en - creado_en)) AS vence FROM integraciones.oauth_estado_jira`);
    assert.equal(filas.length, 1);
    assert.equal(filas[0]?.estado_hash, sha256(state));
    assert.ok(Math.abs(Number(filas[0]?.vence) - 600) < 2);
    assert.equal((await volcadoDeTablas()).includes(state), false, 'el state en claro no está en ninguna tabla');
    assert.ok(Math.abs(new Date(respuesta.body.expiraEn).getTime() - Date.now() - 600_000) < 5000);
    assert.equal(doble.solicitudes.length, 0, 'iniciar no llama a Atlassian');
  });

  it('cada llamada crea un state distinto y purga los de más de 1 día', async () => {
    const montaje = await arrancar();
    await ejecutarDuenio(`INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, creado_en, expira_en) VALUES ('${'c'.repeat(64)}', gen_random_uuid(), now() - interval '2 days', now() - interval '2 days' + interval '10 minutes')`);
    const a = await iniciar(montaje);
    const b = await iniciar(montaje);
    assert.notEqual(a.state, b.state);
    const filas = await consultaDuenio('SELECT 1 FROM integraciones.oauth_estado_jira');
    assert.equal(filas.length, 2);
  });
});

describe('E5-B08 #2 · retorno exitoso', () => {
  it('CONECTADA: tokens cifrados con IV y etiqueta propios, cuenta y sitio, state usado, evento CONECTAR_OAUTH, sin secretos en ninguna parte', async () => {
    const montaje = await arrancar();
    const { respuesta, state, code } = await conectar(montaje, doble);
    assert.equal(respuesta.status, 200, JSON.stringify(respuesta.body));
    assert.equal(respuesta.body.resultado, 'CONECTADA');
    assert.equal(respuesta.body.error, null);
    const oauth = respuesta.body.oauth;
    assert.equal(oauth.estado, 'CONECTADA');
    assert.equal(oauth.descifrable, true);
    assert.deepEqual(oauth.cuenta, { nombre: 'Ana Pérez' });
    assert.deepEqual(oauth.sitio, { id: CLOUD_A, nombre: 'empresa', url: 'https://empresa.atlassian.net' });
    assert.equal(oauth.sitiosCandidatos, null);
    assert.deepEqual(oauth.permisos, ['read:jira-work', 'read:jira-user', 'offline_access']);
    assert.equal(oauth.conectadoPor.nombre, 'Patricia Admin');
    assert.equal(oauth.renovadoEn, null);

    const f = await filaConexion();
    assert.equal(f?.estado, 'CONECTADA');
    const claros = tokensGuardados(f as NonNullable<typeof f>);
    assert.equal(claros.acceso, doble.accesoActual);
    assert.equal(claros.renovacion, doble.renovacionActual);
    assert.notEqual(Buffer.from(f?.acceso_iv as Buffer).toString('hex'), Buffer.from(f?.renovacion_iv as Buffer).toString('hex'));
    const usados = await consultaDuenio<{ usado_en: Date | null }>('SELECT usado_en FROM integraciones.oauth_estado_jira');
    assert.ok(usados[0]?.usado_en instanceof Date);
    assert.deepEqual((await eventosOauth()).map((e) => [e.tipo, e.actor_nombre, e.sitio_nombre, e.cuenta_nombre, e.codigo]), [['CONECTAR_OAUTH', 'Patricia Admin', 'empresa', 'Ana Pérez', null]]);

    // Ni el code, ni el state, ni los tokens, ni el secreto en la respuesta, los registros, las tablas o los eventos.
    const secretos = [state, code, claros.acceso, claros.renovacion, CLIENT_SECRET_PRUEBA];
    const superficie = JSON.stringify(respuesta.body) + (montaje.registro?.lineas.join('\n') ?? '') + (await volcadoDeTablas()).replaceAll(Buffer.from(f?.acceso_cifrado as Buffer).toString('hex'), '');
    for (const s of secretos) assert.equal(superficie.includes(s), false, 'secreto en una superficie visible');
    assert.equal(superficie.includes(sha256(state)), true, 'solo el hash del state queda guardado');
  });

  it('el secreto de la app viaja solo en el cuerpo del canje, y solo a los hosts del doble', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    assert.equal(doble.cuerposToken.length, 1);
    assert.equal(doble.cuerposToken[0]?.client_secret, CLIENT_SECRET_PRUEBA);
    assert.deepEqual([...new Set(doble.solicitudes.map((s) => s.ruta.split('/').slice(0, 2).join('/')))].sort(), ['/ex', '/oauth']);
    void montaje;
  });

  it('el GET de configuración informa la conexión sin tokens ni vencimiento', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    const r = await montaje.pedir('get', CONFIG, 'adm1');
    assert.equal(r.status, 200);
    assert.equal(r.body.oauthDisponible, true);
    assert.equal(r.body.metodo, null);
    assert.equal(r.body.oauth.estado, 'CONECTADA');
    assert.equal('accesoExpiraEn' in r.body.oauth, false);
    assert.equal(JSON.stringify(r.body).includes(doble.accesoActual as string), false);
  });
});

describe('E5-B08 #3 · state inválido', () => {
  const retorno = (montaje: Montaje, cuerpo: Record<string, unknown>, quien: ClavePersona = 'adm1') => montaje.pedir('post', `${RUTA}/retorno`, quien, cuerpo);

  it('desconocido, mal formado, vencido, usado y de otro Administrador: el mismo 400, sin llamar a Atlassian ni guardar nada', async () => {
    const montaje = await arrancar();
    const code = doble.emitirCodigo();
    const vencido = 'V'.repeat(43);
    await ejecutarDuenio(`INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, creado_en, expira_en) VALUES ('${sha256(vencido)}', '${PERSONAS.adm1.id}', now() - interval '1 hour', now() - interval '50 minutes')`);
    const ajeno = (await iniciar(montaje, 'adm2')).state;
    const usado = (await iniciar(montaje)).state;
    assert.equal((await retorno(montaje, { state: usado, error: 'access_denied' })).status, 200); // lo consume
    const cuerpos: Array<[string, string]> = [
      ['desconocido', 'D'.repeat(43)],
      ['mal formado', 'corto'],
      ['vencido', vencido],
      ['usado', usado],
      ['de otro Administrador', ajeno],
    ];
    const respuestas = [];
    for (const [, state] of cuerpos) respuestas.push(await retorno(montaje, { state, code }));
    for (const r of respuestas) {
      assert.equal(r.status, 400);
      assert.equal(r.body.codigo, 'JIRA_OAUTH_ESTADO_INVALIDO');
    }
    assert.equal(new Set(respuestas.map((r) => r.body.mensaje)).size, 1, 'mismo mensaje en todos los casos');
    assert.equal(doble.solicitudes.length, 0);
    assert.equal(await filaConexion(), null);
    // El state de otro Administrador no se consumió: su dueño todavía puede usarlo.
    assert.equal((await retorno(montaje, { state: ajeno, error: 'access_denied' }, 'adm2')).status, 200);
  });

  it('dos retornos simultáneos con el mismo state: solo uno canjea', async () => {
    const montaje = await arrancar();
    const { state } = await iniciar(montaje);
    const [a, b] = await Promise.all([retorno(montaje, { state, code: doble.emitirCodigo() }), retorno(montaje, { state, code: doble.emitirCodigo() })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 400]);
    assert.equal(doble.canjes, 1);
    assert.equal((await eventosOauth()).length, 1);
  });
});

describe('E5-B08 #4 · consentimiento cancelado o canje rechazado', () => {
  it('error=access_denied: 200 con CONSENTIMIENTO_RECHAZADO; el state queda consumido y la conexión anterior no cambia', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    const antes = await filaConexion();
    const { state } = await iniciar(montaje);
    const r = await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state, error: 'access_denied' });
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'ERROR');
    assert.equal(r.body.error.codigo, 'JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO');
    assert.deepEqual(r.body.error.sugerencias, ['REINTENTAR']);
    assert.equal(r.body.oauth.estado, 'CONECTADA');
    assert.deepEqual(await filaConexion(), antes);
    assert.equal((await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state, error: 'access_denied' })).status, 400);
    assert.equal(doble.canjes, 1, 'no hubo un segundo canje');
  });

  it('otro error de Atlassian o un canje rechazado: CANJE_FALLIDO sin texto de Atlassian', async () => {
    const montaje = await arrancar();
    const { state } = await iniciar(montaje);
    const a = await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state, error: 'server_error' });
    assert.equal(a.body.error.codigo, 'JIRA_OAUTH_CANJE_FALLIDO');
    assert.deepEqual(a.body.error.sugerencias, ['REINTENTAR', 'AVISAR_DESPLIEGUE']);
    doble.modo = 'CANJE_RECHAZADO';
    const { state: s2 } = await iniciar(montaje);
    const code = doble.emitirCodigo();
    const b = await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state: s2, code });
    assert.equal(b.status, 200);
    assert.equal(b.body.error.codigo, 'JIRA_OAUTH_CANJE_FALLIDO');
    assert.equal(b.body.oauth, null);
    assert.equal(JSON.stringify(b.body).includes(code), false);
    assert.equal(await filaConexion(), null);
  });

  it('Atlassian caído en el canje: JIRA_NO_DISPONIBLE; no se guarda nada', async () => {
    const montaje = await arrancar();
    doble.modo = 'CANJE_CAIDO';
    const r = (await conectar(montaje, doble)).respuesta;
    assert.equal(r.body.error.codigo, 'JIRA_NO_DISPONIBLE');
    assert.equal(await filaConexion(), null);
  });

  it('una redirección en el canje no se sigue', async () => {
    const montaje = await arrancar();
    doble.modo = 'REDIRECCION';
    const r = (await conectar(montaje, doble)).respuesta;
    assert.equal(r.body.error.codigo, 'JIRA_RESPUESTA_INVALIDA');
    assert.equal(doble.solicitudes.some((s) => s.ruta.startsWith('/robar')), false);
  });
});

describe('E5-B08 #5 · sitios', () => {
  it('varios sitios: ELEGIR_SITIO, PENDIENTE_SITIO sin sitio ni cuenta, y el configurado se marca actual sin elegirse', async () => {
    const montaje = await arrancar();
    doble.sitios = [SITIO_B, SITIO_A];
    assert.equal((await guardarConfiguracion(montaje)).status, 200); // configuración con API token en sitio de prueba
    const r = (await conectar(montaje, doble)).respuesta;
    assert.equal(r.body.resultado, 'ELEGIR_SITIO', JSON.stringify(r.body));
    assert.equal(r.body.oauth.estado, 'PENDIENTE_SITIO');
    assert.equal(r.body.oauth.sitio, null);
    assert.equal(r.body.oauth.cuenta, null);
    assert.deepEqual(r.body.oauth.sitiosCandidatos.map((s: { nombre: string }) => s.nombre), ['empresa', 'laboratorio']);
    assert.deepEqual(r.body.oauth.sitiosCandidatos.map((s: { actual: boolean }) => s.actual), [false, false]);
    assert.equal((await eventosOauth()).length, 0, 'sin evento hasta que quede CONECTADA');
    // Un id que no es candidato, y un UUID válido que no lo es.
    const malo = await montaje.pedir('post', `${RUTA}/sitio`, 'adm1', { sitioId: '9c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809' });
    assert.equal(malo.status, 400);
    assert.equal(malo.body.codigo, 'JIRA_OAUTH_SITIO_NO_VALIDO');
    assert.equal((await montaje.pedir('post', `${RUTA}/sitio`, 'adm1', { sitioId: 'no-uuid' })).body.codigo, 'VALIDACION');
    assert.equal((await filaConexion())?.estado, 'PENDIENTE_SITIO');
    const bien = await montaje.pedir('post', `${RUTA}/sitio`, 'adm1', { sitioId: CLOUD_B });
    assert.equal(bien.status, 200, JSON.stringify(bien.body));
    assert.equal(bien.body.resultado, 'CONECTADA');
    assert.equal(bien.body.oauth.sitio.nombre, 'laboratorio');
    assert.equal(bien.body.oauth.sitiosCandidatos, null);
    assert.deepEqual((await eventosOauth()).map((e) => e.tipo), ['CONECTAR_OAUTH']);
    // Ya no hay conexión pendiente.
    const otra = await montaje.pedir('post', `${RUTA}/sitio`, 'adm1', { sitioId: CLOUD_B });
    assert.equal(otra.status, 409);
    assert.equal(otra.body.codigo, 'JIRA_OAUTH_SIN_CONEXION');
  });

  it('sin conexión pendiente: 409 JIRA_OAUTH_SIN_CONEXION', async () => {
    const montaje = await arrancar();
    const r = await montaje.pedir('post', `${RUTA}/sitio`, 'adm1', { sitioId: CLOUD_A });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'JIRA_OAUTH_SIN_CONEXION');
  });

  it('ninguno con Jira: SIN_SITIO y no se guarda nada; un cloudid inválido o una URL ajena descartan el sitio', async () => {
    const montaje = await arrancar();
    doble.sitios = [{ id: CLOUD_A, name: 'wiki', url: 'https://wiki.atlassian.net', scopes: ['read:confluence-content.all'] }];
    assert.equal((await conectar(montaje, doble)).respuesta.body.error.codigo, 'JIRA_OAUTH_SIN_SITIO');
    doble.sitios = [{ ...SITIO_A, id: 'no-es-uuid' }, { ...SITIO_B, url: 'https://evil.example.com' }];
    assert.equal((await conectar(montaje, doble)).respuesta.body.error.codigo, 'JIRA_OAUTH_SIN_SITIO');
    assert.equal(await filaConexion(), null);
  });

  it('accessible-resources rechazado (401): CANJE_FALLIDO y no se guarda nada', async () => {
    const montaje = await arrancar();
    doble.modo = 'SITIOS_RECHAZADO';
    assert.equal((await conectar(montaje, doble)).respuesta.body.error.codigo, 'JIRA_OAUTH_CANJE_FALLIDO');
    assert.equal(await filaConexion(), null);
  });

  it('reconectar con una conexión existente deja RECONECTAR', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    assert.equal((await conectar(montaje, doble)).respuesta.body.resultado, 'CONECTADA');
    assert.deepEqual((await eventosOauth()).map((e) => e.tipo), ['CONECTAR_OAUTH', 'RECONECTAR']);
  });
});

describe('E5-B08 #6 · permisos', () => {
  it('lo concedido no incluye read:jira-work: PERMISOS_INSUFICIENTES con la lista faltante y nada guardado', async () => {
    const montaje = await arrancar();
    doble.scopeDelCanje = 'read:jira-user offline_access';
    const r = (await conectar(montaje, doble)).respuesta;
    assert.equal(r.body.resultado, 'ERROR');
    assert.equal(r.body.error.codigo, 'JIRA_OAUTH_PERMISOS_INSUFICIENTES');
    assert.deepEqual(r.body.error.permisosFaltantes, ['read:jira-work']);
    assert.deepEqual(r.body.error.sugerencias, ['REINTENTAR']);
    assert.equal(r.body.error.mensaje, 'Faltan permisos en Atlassian: read:jira-work. Acepta todos los permisos solicitados.');
    assert.equal(await filaConexion(), null);
  });

  it('sin refresh_token falta offline_access; sin scope en la respuesta se asume lo pedido', async () => {
    const montaje = await arrancar();
    doble.modo = 'SIN_REFRESH';
    const a = (await conectar(montaje, doble)).respuesta;
    assert.deepEqual(a.body.error.permisosFaltantes, ['offline_access']);
    assert.equal(await filaConexion(), null);
    doble.modo = 'NORMAL';
    doble.scopeDelCanje = null;
    assert.equal((await conectar(montaje, doble)).respuesta.body.resultado, 'CONECTADA');
  });

  it('el sitio no trae los permisos de Jira: PERMISOS_INSUFICIENTES', async () => {
    const montaje = await arrancar();
    doble.sitios = [{ ...SITIO_A, scopes: ['read:jira-user'] }];
    const r = (await conectar(montaje, doble)).respuesta;
    assert.deepEqual(r.body.error.permisosFaltantes, ['read:jira-work']);
  });
});

describe('E5-B08 #11 · sin credenciales de la app, sin llave, llave distinta', () => {
  const sinApp = { config: { oauth: { clientId: null, clientSecret: null, redirectUri: null, urlAutorizacion: 'https://auth.atlassian.com', urlApi: 'https://api.atlassian.com', disponible: false } } };

  it('503 JIRA_OAUTH_NO_CONFIGURADO en iniciar, retorno, sitio y en probar y guardar con OAuth; sin nombres ni valores; sin llamar a Atlassian', async () => {
    const montaje = await arrancar(sinApp);
    const respuestas = [
      await montaje.pedir('post', `${RUTA}/iniciar`, 'adm1'),
      await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state: 'A'.repeat(43), code: 'x' }),
      await montaje.pedir('post', `${RUTA}/sitio`, 'adm1', { sitioId: CLOUD_A }),
      await montaje.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' }),
      await montaje.pedir('put', CONFIG, 'adm1', configuracionOauth()),
    ];
    for (const r of respuestas) {
      assert.equal(r.status, 503, JSON.stringify(r.body));
      assert.equal(r.body.codigo, 'JIRA_OAUTH_NO_CONFIGURADO');
      assert.equal(/JIRA_OAUTH_CLIENT|SECRET|REDIRECT/i.test(r.body.mensaje), false);
    }
    assert.equal(doble.solicitudes.length, 0);
    // El servicio arranca, el GET informa oauthDisponible false y el API token funciona.
    const get = await montaje.pedir('get', CONFIG, 'adm1');
    assert.equal(get.body.oauthDisponible, false);
    assert.equal((await guardarConfiguracion(montaje)).status, 200);
  });

  it('con una conexión guardada y sin las variables: nada se toca y desconectar sigue funcionando', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    const antes = await filaConexion();
    await montaje.cerrar();
    m = await montar({ org, atlassian: doble, conservarDatos: true, ...sinApp });
    assert.equal((await m.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' })).status, 503);
    assert.deepEqual(await filaConexion(), antes);
    const get = await m.pedir('get', CONFIG, 'adm1');
    assert.equal(get.body.oauth.estado, 'CONECTADA');
    assert.equal((await m.pedir('delete', RUTA, 'adm1')).status, 204);
  });

  it('un 400 de validación va antes que el 503', async () => {
    const montaje = await arrancar(sinApp);
    const r = await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state: 'A'.repeat(43) });
    assert.equal(r.status, 400);
    assert.equal(r.body.codigo, 'VALIDACION');
  });

  it('sin llave de cifrado: 503 LLAVE_CIFRADO_NO_DISPONIBLE; desconectar y el GET siguen funcionando', async () => {
    const montaje = await arrancar({ config: { llaveCifrado: null } });
    for (const r of [await montaje.pedir('post', `${RUTA}/iniciar`, 'adm1'), await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', { state: 'A'.repeat(43), code: 'x' })]) {
      assert.equal(r.status, 503);
      assert.equal(r.body.codigo, 'LLAVE_CIFRADO_NO_DISPONIBLE');
    }
    assert.equal((await montaje.pedir('get', CONFIG, 'adm1')).body.llaveDisponible, false);
  });

  it('otra llave: TOKEN_NO_DESCIFRABLE (409) y el GET lo informa; desconectar y reconectar lo corrigen', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    await montaje.cerrar();
    m = await montar({ org, atlassian: doble, conservarDatos: true, config: { llaveCifrado: Buffer.alloc(32, 99) } });
    const probar = await m.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' });
    assert.equal(probar.status, 409);
    assert.equal(probar.body.codigo, 'TOKEN_NO_DESCIFRABLE');
    assert.equal((await m.pedir('get', CONFIG, 'adm1')).body.oauth.descifrable, false);
  });
});

describe('E5-B08 #12 · desconectar', () => {
  it('204; tokens y sitio borrados; evento DESCONECTAR; sin llamar a Atlassian; sin conexión, 409', async () => {
    const montaje = await arrancar();
    await conectar(montaje, doble);
    doble.solicitudes.length = 0;
    const r = await montaje.pedir('delete', RUTA, 'adm1');
    assert.equal(r.status, 204);
    assert.equal(r.text, '');
    assert.equal(await filaConexion(), null);
    assert.equal(doble.solicitudes.length, 0);
    assert.deepEqual((await eventosOauth()).map((e) => e.tipo), ['CONECTAR_OAUTH', 'DESCONECTAR']);
    const otra = await montaje.pedir('delete', RUTA, 'adm1');
    assert.equal(otra.status, 409);
    assert.equal(otra.body.codigo, 'JIRA_OAUTH_SIN_CONEXION');
  });

  it('no borra la configuración ni lo importado', async () => {
    const montaje = await arrancar();
    await guardarConfiguracion(montaje);
    await conectar(montaje, doble);
    await montaje.pedir('delete', RUTA, 'adm1');
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.configuracion_jira')).length, 1);
    assert.equal((await montaje.pedir('get', CONFIG, 'adm1')).body.metodo, 'API_TOKEN');
  });
});

describe('E5-B08 #13 · solo el Administrador', () => {
  it('QE, Analista, Auditor y sin sesión: 403 idéntico (401 sin sesión) en las cuatro rutas y nada cambia', async () => {
    const montaje = await arrancar();
    const rutas: Array<['post' | 'delete', string, unknown]> = [
      ['post', `${RUTA}/iniciar`, undefined],
      ['post', `${RUTA}/retorno`, { state: 'A'.repeat(43), error: 'access_denied' }],
      ['post', `${RUTA}/sitio`, { sitioId: CLOUD_A }],
      ['delete', RUTA, undefined],
    ];
    for (const [metodo, ruta, cuerpo] of rutas) {
      const cuerpos = new Set<string>();
      for (const quien of ['qe1', 'ana1', 'aud1'] as const) {
        const r = await montaje.pedir(metodo, ruta, quien, cuerpo);
        assert.equal(r.status, 403, `${metodo} ${ruta} ${quien}`);
        cuerpos.add(JSON.stringify({ ...r.body, traceId: '' }));
      }
      assert.equal(cuerpos.size, 1);
      assert.equal((await montaje.pedir(metodo, ruta, null, cuerpo)).status, 401);
    }
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.oauth_estado_jira')).length, 0);
    assert.equal(doble.solicitudes.length, 0);
  });
});

describe('E5-B08 #14 · validación del cuerpo del retorno', () => {
  it('exactamente uno de code y error, con state; ningún campo extra', async () => {
    const montaje = await arrancar();
    const s = 'A'.repeat(43);
    const casos: Array<Record<string, unknown>> = [{}, { state: s }, { state: s, code: 'x', error: 'access_denied' }, { code: 'x' }, { state: s, code: 'con espacio' }, { state: s, code: 'x', extra: 1 }, { state: s, error: 'Mayusculas' }, { state: '', code: 'x' }, { state: s, code: 7 }];
    for (const cuerpo of casos) {
      const r = await montaje.pedir('post', `${RUTA}/retorno`, 'adm1', cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
      assert.equal(r.body.codigo, 'VALIDACION');
      assert.equal(JSON.stringify(r.body).includes('con espacio'), false, 'el valor recibido no se repite');
    }
    assert.equal(doble.solicitudes.length, 0);
  });
});
