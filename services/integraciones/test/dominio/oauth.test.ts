/**
 * Dominio OAuth (JO3, E5-B08 #1, #5, #6, #9, #14): permisos por endpoint, sitios, dirección de autorización y la
 * máquina de estados de la conexión. Puro: sin red ni base.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { errorIntegracion } from '../../src/dominio/catalogos.js';
import { armarUrlAutorizacion, PATRON_ESTADO } from '../../src/dominio/oauth/autorizacion.js';
import {
  UMBRAL_RENOVACION_MS,
  calcularVencimiento,
  decidirSitios,
  eventoDeConexion,
  faltantesDelCanje,
  necesitaRenovar,
  obstaculoDeConexion,
  transicionPorFalloDefinitivo,
} from '../../src/dominio/oauth/conexion.js';
import { PERMISOS_POR_ENDPOINT, PERMISOS_REQUERIDOS, endpointDeRuta, parsearPermisos, permisosFaltantes } from '../../src/dominio/oauth/permisos.js';
import { MAX_SITIOS, marcarActual, seleccionarSitios, type RecursoAccesible } from '../../src/dominio/oauth/sitios.js';

const ID_A = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const ID_B = '2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809';
const SCOPES_JIRA = ['read:jira-work', 'read:jira-user'];
const recurso = (id: string, nombre: string, extra: Partial<RecursoAccesible> = {}): RecursoAccesible => ({
  id,
  nombre,
  url: `https://${nombre}.atlassian.net`,
  scopes: SCOPES_JIRA,
  ...extra,
});

describe('permisos (D218)', () => {
  it('pide solo lectura y offline_access; ningún permiso de escritura', () => {
    assert.deepEqual([...PERMISOS_REQUERIDOS], ['read:jira-work', 'read:jira-user', 'offline_access']);
    assert.ok(PERMISOS_REQUERIDOS.every((p) => !/^(write|manage|delete):/.test(p)));
  });

  it('permisos por endpoint de la tabla de D218', () => {
    assert.deepEqual([...PERMISOS_POR_ENDPOINT.myself], ['read:jira-user']);
    for (const e of ['project', 'field', 'search'] as const) assert.deepEqual([...PERMISOS_POR_ENDPOINT[e]], ['read:jira-work']);
    assert.equal(endpointDeRuta('/rest/api/3/myself'), 'myself');
    assert.equal(endpointDeRuta('/rest/api/3/project/QTY'), 'project');
    assert.equal(endpointDeRuta('/rest/api/3/field'), 'field');
    assert.equal(endpointDeRuta('/rest/api/3/search/jql'), 'search');
    assert.equal(endpointDeRuta('/rest/api/3/issue/QTY-1'), null);
  });

  it('permisosFaltantes respeta el orden en que se piden y parsearPermisos separa por espacios', () => {
    assert.deepEqual(permisosFaltantes(['offline_access']), ['read:jira-work', 'read:jira-user']);
    assert.deepEqual(permisosFaltantes(PERMISOS_REQUERIDOS), []);
    assert.deepEqual(parsearPermisos('read:jira-work  read:jira-user\toffline_access read:jira-work'), ['read:jira-work', 'read:jira-user', 'offline_access']);
    assert.deepEqual(parsearPermisos(null), []);
  });
});

describe('sitios (D212, E5-B08 #5)', () => {
  it('un sitio de Jira con los permisos: se toma; los de otro producto se descartan', () => {
    const r = seleccionarSitios([recurso(ID_A, 'empresa'), recurso(ID_B, 'wiki', { scopes: ['read:confluence-content.all'] })]);
    assert.deepEqual(r, { tipo: 'OK', sitios: [{ id: ID_A, nombre: 'empresa', url: 'https://empresa.atlassian.net' }] });
  });

  it('un cloudid que no es UUID o una URL fuera de *.atlassian.net descartan el sitio (SSRF)', () => {
    const r = seleccionarSitios([
      recurso('no-es-uuid', 'uno'),
      recurso(ID_A, 'dos', { url: 'https://evil.example.com' }),
      recurso(ID_B, 'tres', { url: 'https://tres.atlassian.net.evil.com' }),
      recurso(ID_A, 'cuatro', { url: 'http://cuatro.atlassian.net' }),
      recurso(ID_B, 'cinco', { url: 'https://cinco.atlassian.net/ruta' }),
    ]);
    assert.deepEqual(r, { tipo: 'SIN_SITIO' });
  });

  it('ninguno con Jira: SIN_SITIO; con Jira pero sin los permisos: PERMISOS_INSUFICIENTES con lo que falta', () => {
    assert.deepEqual(seleccionarSitios([]), { tipo: 'SIN_SITIO' });
    assert.deepEqual(seleccionarSitios([recurso(ID_A, 'empresa', { scopes: [] })]), { tipo: 'SIN_SITIO' });
    assert.deepEqual(seleccionarSitios([recurso(ID_A, 'empresa', { scopes: ['read:jira-user'] })]), { tipo: 'PERMISOS_INSUFICIENTES', faltantes: ['read:jira-work'] });
  });

  it('ordena por nombre, pasa el id a minúsculas, quita repetidos y tope de 50', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => recurso(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, `sitio${String(59 - i).padStart(2, '0')}`));
    const r = seleccionarSitios(muchos);
    assert.equal(r.tipo, 'OK');
    if (r.tipo !== 'OK') return;
    assert.equal(r.sitios.length, MAX_SITIOS);
    assert.deepEqual(r.sitios.map((s) => s.nombre), [...r.sitios.map((s) => s.nombre)].sort());
    const mayus = seleccionarSitios([recurso(ID_A.toUpperCase(), 'empresa'), recurso(ID_A, 'empresa')]);
    assert.deepEqual(mayus, { tipo: 'OK', sitios: [{ id: ID_A, nombre: 'empresa', url: 'https://empresa.atlassian.net' }] });
  });

  it('un sitio se conecta; varios quedan pendientes y el configurado se marca actual sin elegirse', () => {
    const uno = decidirSitios(seleccionarSitios([recurso(ID_A, 'empresa')]));
    assert.equal(uno.tipo, 'CONECTAR');
    const varios = decidirSitios(seleccionarSitios([recurso(ID_B, 'laboratorio'), recurso(ID_A, 'empresa')]));
    assert.equal(varios.tipo, 'ELEGIR_SITIO');
    if (varios.tipo !== 'ELEGIR_SITIO') return;
    assert.deepEqual(varios.candidatos.map((s) => s.nombre), ['empresa', 'laboratorio']);
    assert.deepEqual(marcarActual(varios.candidatos, 'https://laboratorio.atlassian.net').map((s) => s.actual), [false, true]);
    assert.deepEqual(marcarActual(varios.candidatos, null).map((s) => s.actual), [false, false]);
    assert.deepEqual(decidirSitios({ tipo: 'SIN_SITIO' }), { tipo: 'SIN_SITIO' });
  });
});

describe('dirección de autorización (E5-B08 #1)', () => {
  it('lleva audience, client_id, scopes con offline_access, redirect_uri, state, response_type y prompt=consent', () => {
    const state = 'A'.repeat(43);
    const url = new URL(armarUrlAutorizacion({ base: 'https://auth.atlassian.com', clientId: 'cliente-1', redirectUri: 'https://x.vercel.app/admin/integraciones/jira/oauth/retorno', state }));
    assert.equal(url.origin + url.pathname, 'https://auth.atlassian.com/authorize');
    assert.equal(url.searchParams.get('audience'), 'api.atlassian.com');
    assert.equal(url.searchParams.get('client_id'), 'cliente-1');
    assert.equal(url.searchParams.get('scope'), 'read:jira-work read:jira-user offline_access');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://x.vercel.app/admin/integraciones/jira/oauth/retorno');
    assert.equal(url.searchParams.get('state'), state);
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.match(url.search, /scope=read%3Ajira-work%20read%3Ajira-user%20offline_access/);
    assert.equal([...url.searchParams.keys()].length, 7);
  });

  it('el formato de state es base64url de 32 bytes', () => {
    assert.match('Zm9vYmFyYmF6cXV4MDEyMzQ1Njc4OWFiY2RlZmdoaWo', PATRON_ESTADO);
    for (const malo of ['', 'corto', 'A'.repeat(44), `${'A'.repeat(42)}+`, `${'A'.repeat(42)} `]) assert.doesNotMatch(malo, PATRON_ESTADO);
  });
});

describe('máquina de estados de la conexión (D214, D215, D217)', () => {
  it('renueva si faltan menos de 5 minutos o no hay vencimiento', () => {
    const ahora = new Date('2026-11-22T12:00:00Z');
    assert.equal(necesitaRenovar(null, ahora), true);
    assert.equal(necesitaRenovar(new Date(ahora.getTime() + UMBRAL_RENOVACION_MS - 1), ahora), true);
    assert.equal(necesitaRenovar(new Date(ahora.getTime() + UMBRAL_RENOVACION_MS), ahora), false);
    assert.equal(necesitaRenovar(new Date(ahora.getTime() - 1000), ahora), true);
  });

  it('el vencimiento sale de expires_in, con una hora por defecto y tope de 24 horas', () => {
    const ahora = new Date('2026-11-22T12:00:00Z');
    assert.equal(calcularVencimiento(ahora, 3600).toISOString(), '2026-11-22T13:00:00.000Z');
    assert.equal(calcularVencimiento(ahora, null).toISOString(), '2026-11-22T13:00:00.000Z');
    assert.equal(calcularVencimiento(ahora, -5).toISOString(), '2026-11-22T13:00:00.000Z');
    assert.equal(calcularVencimiento(ahora, 10 ** 9).toISOString(), '2026-11-23T12:00:00.000Z');
  });

  it('los permisos del canje: sin scope se asume lo pedido; sin refresh_token falta offline_access', () => {
    assert.deepEqual(faltantesDelCanje(null, true), []);
    assert.deepEqual(faltantesDelCanje(null, false), ['offline_access']);
    assert.deepEqual(faltantesDelCanje(['read:jira-user', 'offline_access'], true), ['read:jira-work']);
    assert.deepEqual(faltantesDelCanje(['read:jira-work', 'read:jira-user'], true), ['offline_access']);
    assert.deepEqual(faltantesDelCanje([...PERMISOS_REQUERIDOS], true), []);
  });

  it('CONECTAR_OAUTH la primera vez y RECONECTAR después', () => {
    assert.equal(eventoDeConexion(false), 'CONECTAR_OAUTH');
    assert.equal(eventoDeConexion(true), 'RECONECTAR');
  });

  it('un fallo definitivo pasa a RECONEXION_NECESARIA y registra el evento una sola vez, desde CONECTADA', () => {
    assert.deepEqual(transicionPorFalloDefinitivo('CONECTADA'), { estado: 'RECONEXION_NECESARIA', registrarEvento: true });
    assert.deepEqual(transicionPorFalloDefinitivo('PENDIENTE_SITIO'), { estado: 'RECONEXION_NECESARIA', registrarEvento: false });
    assert.deepEqual(transicionPorFalloDefinitivo('RECONEXION_NECESARIA'), { estado: 'RECONEXION_NECESARIA', registrarEvento: false });
  });

  it('qué impide usar la conexión según su estado', () => {
    assert.equal(obstaculoDeConexion(null), 'SIN_CONEXION');
    assert.equal(obstaculoDeConexion({ estado: 'PENDIENTE_SITIO' }), 'PENDIENTE_SITIO');
    assert.equal(obstaculoDeConexion({ estado: 'RECONEXION_NECESARIA' }), 'RECONEXION_NECESARIA');
    assert.equal(obstaculoDeConexion({ estado: 'CONECTADA' }), null);
  });
});

describe('errores nuevos del catálogo (comun.v1.yaml)', () => {
  it('mensajes fijos y sugerencias por código', () => {
    assert.deepEqual(errorIntegracion('JIRA_RECONEXION_NECESARIA', 'JIRA'), { codigo: 'JIRA_RECONEXION_NECESARIA', mensaje: 'La conexión con Jira venció. Vuelve a conectar con Jira.', sugerencias: ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO'] });
    assert.deepEqual(errorIntegracion('JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO', 'JIRA').sugerencias, ['REINTENTAR']);
    assert.deepEqual(errorIntegracion('JIRA_OAUTH_CANJE_FALLIDO', 'JIRA').sugerencias, ['REINTENTAR', 'AVISAR_DESPLIEGUE']);
    assert.deepEqual(errorIntegracion('JIRA_OAUTH_SIN_SITIO', 'JIRA').sugerencias, ['REINTENTAR']);
  });

  it('los permisos insuficientes traen la lista y las sugerencias dependen de dónde ocurren', () => {
    const enRetorno = errorIntegracion('JIRA_OAUTH_PERMISOS_INSUFICIENTES', 'JIRA', false, { contexto: 'CONEXION', permisosFaltantes: ['read:jira-work'] });
    assert.deepEqual(enRetorno, { codigo: 'JIRA_OAUTH_PERMISOS_INSUFICIENTES', mensaje: 'Faltan permisos en Atlassian: read:jira-work. Acepta todos los permisos solicitados.', sugerencias: ['REINTENTAR'], permisosFaltantes: ['read:jira-work'] });
    const enOperacion = errorIntegracion('JIRA_OAUTH_PERMISOS_INSUFICIENTES', 'JIRA', false, { permisosFaltantes: ['read:jira-user', 'read:jira-work'] });
    assert.deepEqual(enOperacion.sugerencias, ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO']);
    assert.equal(enOperacion.mensaje, 'Faltan permisos en Atlassian: read:jira-user, read:jira-work. Acepta todos los permisos solicitados.');
    // Un error que no es de permisos nunca lleva `permisosFaltantes`.
    assert.equal('permisosFaltantes' in errorIntegracion('JIRA_NO_DISPONIBLE', 'JIRA', false, { permisosFaltantes: ['x'] }), false);
  });
});
