/**
 * DEF-E5O-01 · `oauth.descifrable` en cada estado de la conexión (contrato `ConexionOauthJira`): `false` siempre en
 * `RECONEXION_NECESARIA`; en `CONECTADA` y `PENDIENTE_SITIO`, `true` con la llave que cifró y `false` con otra o sin llave;
 * sin conexión, `oauth` es `null`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { LLAVE_PRUEBA } from '../ayudas-app.js';
import { cerrarBases, ejecutarDuenio, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
import { AtlassianDoble, SITIO_A, SITIO_B } from '../atlassian-doble.js';
import { montar, type Montaje } from '../montaje.js';
import { conectar } from '../oauth-ayudas.js';

const CONFIG = '/v1/integraciones/jira/configuracion';
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
  doble.reiniciar();
});
after(async () => {
  await doble.cerrar();
  await org.cerrar();
  await cerrarBases();
});

const oauthDe = async (montaje: Montaje) => (await montaje.pedir('get', CONFIG, 'adm1')).body.oauth;
const remontar = async (config: Parameters<typeof montar>[0] = {}): Promise<Montaje> => {
  await m?.cerrar();
  m = await montar({ org, atlassian: doble, conservarDatos: true, ...config });
  return m;
};

describe('DEF-E5O-01 · oauth.descifrable por estado', () => {
  it('sin conexión: oauth es null', async () => {
    m = await montar({ org, atlassian: doble });
    assert.equal(await oauthDe(m), null);
  });

  it('CONECTADA: true con la llave que cifró; false con otra llave o sin llave', async () => {
    m = await montar({ org, atlassian: doble });
    await conectar(m, doble);
    const a = await oauthDe(m);
    assert.deepEqual([a.estado, a.descifrable], ['CONECTADA', true]);
    const otra = await oauthDe(await remontar({ config: { llaveCifrado: Buffer.alloc(32, 99) } }));
    assert.deepEqual([otra.estado, otra.descifrable], ['CONECTADA', false]);
    const sin = await oauthDe(await remontar({ config: { llaveCifrado: null } }));
    assert.deepEqual([sin.estado, sin.descifrable], ['CONECTADA', false]);
    assert.equal((await oauthDe(await remontar({ config: { llaveCifrado: LLAVE_PRUEBA } }))).descifrable, true);
  });

  it('PENDIENTE_SITIO: true con la llave que cifró; false con otra llave', async () => {
    doble.sitios = [SITIO_A, SITIO_B];
    m = await montar({ org, atlassian: doble });
    await conectar(m, doble);
    const a = await oauthDe(m);
    assert.deepEqual([a.estado, a.descifrable], ['PENDIENTE_SITIO', true]);
    const otra = await oauthDe(await remontar({ config: { llaveCifrado: Buffer.alloc(32, 99) } }));
    assert.deepEqual([otra.estado, otra.descifrable], ['PENDIENTE_SITIO', false]);
  });

  it('RECONEXION_NECESARIA: false siempre, con cualquier llave y también en las respuestas del retorno y de probar', async () => {
    m = await montar({ org, atlassian: doble });
    await conectar(m, doble);
    await ejecutarDuenio(`UPDATE integraciones.conexion_oauth_jira SET acceso_expira_en = now()`);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const prueba = await m.pedir('post', `${CONFIG}/probar`, 'adm1', { metodo: 'OAUTH' });
    assert.equal(prueba.body.error.codigo, 'JIRA_RECONEXION_NECESARIA');
    for (const llave of [LLAVE_PRUEBA, Buffer.alloc(32, 99), null]) {
      const o = await oauthDe(await remontar({ config: { llaveCifrado: llave } }));
      assert.deepEqual([o.estado, o.descifrable], ['RECONEXION_NECESARIA', false], String(llave === null ? 'sin llave' : 'con llave'));
    }
    // Un retorno con error deja la conexión como estaba y la respuesta informa lo mismo.
    const { iniciar } = await import('../oauth-ayudas.js');
    const activa = await remontar({ config: { llaveCifrado: LLAVE_PRUEBA } });
    const { state } = await iniciar(activa);
    const r = await activa.pedir('post', '/v1/integraciones/jira/oauth/retorno', 'adm1', { state, error: 'access_denied' });
    assert.deepEqual([r.body.oauth.estado, r.body.oauth.descifrable], ['RECONEXION_NECESARIA', false]);
  });
});
