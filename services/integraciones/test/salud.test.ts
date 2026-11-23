import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { cargarConfiguracion, leerLlaveCifrado } from '../src/configuracion.js';
import { crearAppDePrueba } from './ayudas-app.js';

let app: NestExpressApplication;
let appSinOrganizacion: NestExpressApplication;

before(async () => {
  app = await crearAppDePrueba();
  appSinOrganizacion = await crearAppDePrueba(null);
});

after(async () => {
  await app.close();
  await appSinOrganizacion.close();
});

describe('GET /health', () => {
  it('responde 200 sin autenticación', async () => {
    const respuesta = await request(app.getHttpServer()).get('/health');
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { estado: 'ok' });
  });

  it('sin ORGANIZACION_URL (producción) /health sigue en 200 y /v1/* responde 503 (D128)', async () => {
    assert.equal((await request(appSinOrganizacion.getHttpServer()).get('/health')).status, 200);
    const respuesta = await request(appSinOrganizacion.getHttpServer()).get('/v1/integraciones/estado');
    assert.equal(respuesta.status, 503);
    assert.equal(respuesta.body.codigo, 'SERVICIO_NO_DISPONIBLE');
  });
});

describe('configuración', () => {
  const base = { DATABASE_URL: 'postgresql://x', SUPABASE_URL: 'http://127.0.0.1:54321' } as NodeJS.ProcessEnv;

  it('solo DATABASE_URL ausente tumba el arranque, y el mensaje no trae valores', () => {
    assert.throws(() => cargarConfiguracion({ SUPABASE_URL: 'http://127.0.0.1:54321' }), (error: Error & { motivo?: string }) => /DATABASE_URL/.test(error.motivo ?? ''));
  });

  it('sin llave, con llave inválida o de otro tamaño arranca con llaveCifrado null (D128)', () => {
    assert.equal(cargarConfiguracion(base).llaveCifrado, null);
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_LLAVE_CIFRADO: 'no-es-base64!' }).llaveCifrado, null);
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_LLAVE_CIFRADO: Buffer.alloc(16).toString('base64') }).llaveCifrado, null);
    assert.equal(leerLlaveCifrado(Buffer.alloc(32, 1).toString('base64'))?.length, 32);
  });

  it('en producción: organizacionUrl null si falta o es inválida, y INTEGRACIONES_PERMITIR_HOST_PRUEBA se ignora (D95)', () => {
    const produccion = { ...base, NODE_ENV: 'production', INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' };
    assert.equal(cargarConfiguracion(produccion).organizacionUrl, null);
    assert.equal(cargarConfiguracion({ ...produccion, ORGANIZACION_URL: 'no es url' }).organizacionUrl, null);
    assert.equal(cargarConfiguracion({ ...produccion, ORGANIZACION_URL: 'https://org.example/' }).organizacionUrl, 'https://org.example');
    assert.equal(cargarConfiguracion(produccion).permitirHostPrueba, false);
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).permitirHostPrueba, true);
  });

  it('INTEGRACIONES_JIRA_TAMANO_PAGINA: 50 por defecto, 10 a 100 vale, fuera de rango o inválido usa 50; la toma de fila dura 30 s (D196, D202)', () => {
    assert.equal(cargarConfiguracion(base).jiraTamanoPagina, 50);
    assert.equal(cargarConfiguracion(base).tomaFilaMs, 30_000);
    for (const [valor, esperado] of [['25', 25], ['10', 10], ['100', 100], ['9', 50], ['101', 50], ['abc', 50], ['', 50], ['25.5', 50]] as const) {
      assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_JIRA_TAMANO_PAGINA: valor }).jiraTamanoPagina, esperado, valor);
    }
    assert.equal(cargarConfiguracion({ ...base, INTEGRACIONES_TOMA_FILA_MS: '2000' }).tomaFilaMs, 2000);
  });

  describe('variables de OAuth (D213, D216)', () => {
    const RETORNO = '/admin/integraciones/jira/oauth/retorno';
    const completas = { ...base, JIRA_OAUTH_CLIENT_ID: 'cliente', JIRA_OAUTH_CLIENT_SECRET: 'secreto-de-prueba', JIRA_OAUTH_REDIRECT_URI: `https://quality360-one.vercel.app${RETORNO}` };

    it('opcionales y no fatales: sin ellas el servicio arranca con oauth.disponible false y los hosts fijos', () => {
      const o = cargarConfiguracion(base).oauth;
      assert.equal(o.disponible, false);
      assert.deepEqual([o.clientId, o.clientSecret, o.redirectUri], [null, null, null]);
      assert.equal(o.urlAutorizacion, 'https://auth.atlassian.com');
      assert.equal(o.urlApi, 'https://api.atlassian.com');
    });

    it('disponible solo con las tres válidas', () => {
      assert.equal(cargarConfiguracion(completas).oauth.disponible, true);
      for (const falta of ['JIRA_OAUTH_CLIENT_ID', 'JIRA_OAUTH_CLIENT_SECRET', 'JIRA_OAUTH_REDIRECT_URI']) {
        const incompleta = { ...completas, [falta]: '  ' } as NodeJS.ProcessEnv;
        assert.equal(cargarConfiguracion(incompleta).oauth.disponible, false, falta);
      }
    });

    it('JIRA_OAUTH_REDIRECT_URI: https con la ruta exacta, sin parámetros, fragmento ni credenciales; inválida cuenta como ausente', () => {
      const con = (uri: string, extra: Record<string, string> = {}) => cargarConfiguracion({ ...completas, JIRA_OAUTH_REDIRECT_URI: uri, ...extra }).oauth;
      assert.equal(con(`https://quality360-one.vercel.app${RETORNO}`).redirectUri, `https://quality360-one.vercel.app${RETORNO}`);
      for (const mala of [
        `http://quality360-one.vercel.app${RETORNO}`,
        `https://quality360-one.vercel.app${RETORNO}/`,
        `https://quality360-one.vercel.app${RETORNO}?x=1`,
        `https://quality360-one.vercel.app${RETORNO}#frag`,
        `https://usuario:clave@quality360-one.vercel.app${RETORNO}`,
        'https://quality360-one.vercel.app/admin/integraciones/jira/oauth',
        `ftp://x.example${RETORNO}`,
        `https://${RETORNO}`,
      ]) {
        const o = con(mala);
        assert.equal(o.redirectUri, null, mala);
        assert.equal(o.disponible, false, mala);
      }
    });

    it('http://localhost y http://127.0.0.1 solo con la bandera de prueba y fuera de producción', () => {
      const local = `http://localhost:5173${RETORNO}`;
      const sin = cargarConfiguracion({ ...completas, JIRA_OAUTH_REDIRECT_URI: local }).oauth;
      assert.equal(sin.redirectUri, null);
      const con = cargarConfiguracion({ ...completas, JIRA_OAUTH_REDIRECT_URI: local, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).oauth;
      assert.equal(con.redirectUri, local);
      assert.equal(cargarConfiguracion({ ...completas, JIRA_OAUTH_REDIRECT_URI: `http://127.0.0.1:5173${RETORNO}`, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).oauth.disponible, true);
      const produccion = cargarConfiguracion({ ...completas, NODE_ENV: 'production', JIRA_OAUTH_REDIRECT_URI: local, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).oauth;
      assert.equal(produccion.redirectUri, null);
    });

    it('los hosts de prueba solo valen con la bandera, fuera de producción y como http://127.0.0.1:<puerto>', () => {
      const pruebas = { ...completas, JIRA_OAUTH_URL_AUTORIZACION: 'http://127.0.0.1:4011', JIRA_OAUTH_URL_API: 'http://127.0.0.1:4011/' };
      const sinBandera = cargarConfiguracion(pruebas).oauth;
      assert.equal(sinBandera.urlAutorizacion, 'https://auth.atlassian.com');
      assert.equal(sinBandera.urlApi, 'https://api.atlassian.com');
      const conBandera = cargarConfiguracion({ ...pruebas, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).oauth;
      assert.equal(conBandera.urlAutorizacion, 'http://127.0.0.1:4011');
      assert.equal(conBandera.urlApi, 'http://127.0.0.1:4011');
      const produccion = cargarConfiguracion({ ...pruebas, NODE_ENV: 'production', INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true' }).oauth;
      assert.equal(produccion.urlAutorizacion, 'https://auth.atlassian.com');
      assert.equal(produccion.urlApi, 'https://api.atlassian.com');
      for (const malo of ['https://evil.example.com', 'http://localhost:4011', 'http://127.0.0.1', 'http://127.0.0.1:4011/ruta', 'http://10.0.0.5:4011']) {
        const o = cargarConfiguracion({ ...completas, INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true', JIRA_OAUTH_URL_AUTORIZACION: malo, JIRA_OAUTH_URL_API: malo }).oauth;
        assert.equal(o.urlAutorizacion, 'https://auth.atlassian.com', malo);
        assert.equal(o.urlApi, 'https://api.atlassian.com', malo);
      }
    });
  });

  it('los valores por defecto son los de D96 y D114', () => {
    const c = cargarConfiguracion(base);
    assert.deepEqual([c.presupuestoMs, c.tiempoLimiteJiraMs, c.esperaMax429Ms, c.topeIssues, c.enCursoMaxMs, c.tiempoLimiteOrganizacionMs], [8000, 3000, 3000, 100, 300_000, 5000]);
  });
});
