/**
 * DEF-E5C-05 para los caminos nuevos de OAuth: una sola conexión (`connection_limit=1`) con `SET search_path TO public`
 * (como el pooler de Supabase en modo transacción). Si alguna SQL cruda no nombra su esquema, o si algo abre una segunda
 * conexión mientras se mantiene el candado, estas pruebas fallan o se cuelgan.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { CredencialesJira } from '../../src/aplicacion/credenciales-jira.js';
import { Presupuesto } from '../../src/dominio/ejecucion.js';
import { DATO_ASOCIADO_ACCESO, DATO_ASOCIADO_RENOVACION, type ConexionOauth } from '../../src/dominio/oauth/conexion.js';
import { ClienteAtlassianHttp } from '../../src/infraestructura/atlassian/cliente-atlassian-http.js';
import { CifradorAesGcm } from '../../src/infraestructura/cifrado/cifrador-aes-gcm.js';
import { ConexionOauthPrismaRepositorio } from '../../src/infraestructura/prisma/conexion-oauth.prisma.repositorio.js';
import { ConfiguracionPrismaRepositorio } from '../../src/infraestructura/prisma/configuracion.prisma.repositorio.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { LLAVE_PRUEBA, configuracionPrueba } from '../ayudas-app.js';
import { PERSONAS, cerrarBases, consultaDuenio, limpiarIntegraciones } from '../ayudas.js';
import { AtlassianDoble, CLIENT_ID_PRUEBA, CLIENT_SECRET_PRUEBA, CLOUD_A, REDIRECT_PRUEBA } from '../atlassian-doble.js';
import { configuracionOauth } from '../montaje.js';

const doble = new AtlassianDoble();
const cifrador = new CifradorAesGcm(LLAVE_PRUEBA);
const ADM = { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre };
let sinEsquema: PrismaService;
let repo: ConexionOauthPrismaRepositorio;

before(async () => {
  await doble.iniciar();
  const base = process.env.DATABASE_URL as string;
  sinEsquema = new PrismaService({ datasourceUrl: `${base}${base.includes('?') ? '&' : '?'}connection_limit=1` });
  await sinEsquema.$connect();
  await sinEsquema.$executeRawUnsafe('SET search_path TO public');
  repo = new ConexionOauthPrismaRepositorio(sinEsquema);
});
beforeEach(async () => {
  await limpiarIntegraciones();
  doble.reiniciar();
});
after(async () => {
  await sinEsquema.$disconnect();
  await doble.cerrar();
  await cerrarBases();
});

const atlassian = () => new ClienteAtlassianHttp({ clientId: CLIENT_ID_PRUEBA, clientSecret: CLIENT_SECRET_PRUEBA, redirectUri: REDIRECT_PRUEBA, urlAutorizacion: doble.url, urlApi: doble.url, permitirHostPrueba: true });
const opciones = { tiempoLimiteMs: 3000, esperaMax429Ms: 0, restanteMs: () => 8000 };

/** Canjea un code en el doble y guarda la conexión con el repositorio bajo prueba (sin pasar por el servicio HTTP). */
async function guardarConexion(expiresIn: number): Promise<ConexionOauth> {
  doble.expiresIn = expiresIn;
  const canje = await atlassian().canjear(doble.emitirCodigo(), opciones);
  assert.equal(canje.ok, true);
  if (!canje.ok) throw new Error('canje');
  const ahora = new Date();
  const conexion: ConexionOauth = {
    estado: 'CONECTADA',
    cloudId: CLOUD_A,
    sitio: { id: CLOUD_A, nombre: 'empresa', url: 'https://empresa.atlassian.net' },
    candidatos: null,
    cuentaId: 'c1',
    cuentaNombre: 'Ana Pérez',
    permisos: ['read:jira-work', 'read:jira-user', 'offline_access'],
    acceso: cifrador.cifrarSecreto(canje.valor.tokenAcceso, DATO_ASOCIADO_ACCESO),
    renovacion: cifrador.cifrarSecreto(canje.valor.tokenRenovacion as string, DATO_ASOCIADO_RENOVACION),
    accesoExpiraEn: new Date(ahora.getTime() + expiresIn * 1000),
    renovadoEn: null,
    conectadoPor: ADM,
    conectadoEn: ahora,
    actualizadoEn: ahora,
  };
  doble.expiresIn = 3600; // lo que entregue la renovación dura una hora
  await repo.guardar(conexion, { tipo: 'CONECTAR_OAUTH', actor: ADM, sitioNombre: 'empresa', cuentaNombre: 'Ana Pérez', codigo: null, fecha: ahora });
  return conexion;
}

describe('DEF-E5C-05 · OAuth con connection_limit=1 y search_path=public', () => {
  it('la sesión de la prueba realmente no incluye el esquema integraciones', async () => {
    const [fila] = await sinEsquema.$queryRawUnsafe<Array<{ search_path: string }>>('SHOW search_path');
    assert.equal(fila?.search_path, 'public');
    await assert.rejects(sinEsquema.$queryRawUnsafe('SELECT 1 FROM conexion_oauth_jira'), /conexion_oauth_jira|42P01/);
  });

  it('el state: crear (con purga), consumir una sola vez y rechazar el vencido o de otro Administrador', async () => {
    const ahora = new Date();
    await repo.crearEstado('a'.repeat(64), ADM.id, ahora, new Date(ahora.getTime() + 600_000), new Date(ahora.getTime() - 86_400_000));
    assert.equal(await repo.consumirEstado('a'.repeat(64), PERSONAS.adm2.id), false);
    assert.equal(await repo.consumirEstado('a'.repeat(64), ADM.id), true);
    assert.equal(await repo.consumirEstado('a'.repeat(64), ADM.id), false);
    // Otro `state` creado con más de un día se purga al crear uno nuevo.
    await consultaDuenio(`SELECT 1`);
    await sinEsquema.$executeRaw`INSERT INTO "integraciones"."oauth_estado_jira" ("estado_hash", "actor_id", "creado_en", "expira_en") VALUES (${'b'.repeat(64)}, ${ADM.id}::uuid, now() - interval '3 days', now() - interval '3 days' + interval '10 minutes')`;
    await repo.crearEstado('c'.repeat(64), ADM.id, ahora, new Date(ahora.getTime() + 600_000), new Date(ahora.getTime() - 86_400_000));
    const hashes = (await consultaDuenio<{ estado_hash: string }>('SELECT estado_hash FROM integraciones.oauth_estado_jira')).map((f) => f.estado_hash).sort();
    assert.deepEqual(hashes, ['a'.repeat(64), 'c'.repeat(64)]);
  });

  it('guardar, obtener, hayConexionRegistrada y eliminar con su evento', async () => {
    assert.equal(await repo.hayConexionRegistrada(), false);
    await guardarConexion(3600);
    assert.equal((await repo.obtener())?.estado, 'CONECTADA');
    assert.equal(await repo.hayConexionRegistrada(), true);
    assert.equal(await repo.eliminar({ tipo: 'DESCONECTAR', actor: ADM, sitioNombre: 'empresa', cuentaNombre: 'Ana', codigo: null, fecha: new Date() }), true);
    assert.equal(await repo.obtener(), null);
    assert.equal(await repo.eliminar({ tipo: 'DESCONECTAR', actor: ADM, sitioNombre: null, cuentaNombre: null, codigo: null, fecha: new Date() }), false);
  });

  it('el candado: FOR UPDATE, relectura y escritura dentro de la misma transacción, con una sola conexión', async () => {
    await guardarConexion(3600);
    const resultado = await repo.conCandado(async () => {
      const dentro = await repo.obtener();
      await repo.marcarReconexion(new Date(), { tipo: 'REFRESCO_FALLIDO', actor: ADM, sitioNombre: 'empresa', cuentaNombre: 'Ana', codigo: 'RENOVACION_RECHAZADA', fecha: new Date() });
      return [dentro?.estado, (await repo.obtener())?.estado];
    });
    assert.deepEqual(resultado, ['CONECTADA', 'RECONEXION_NECESARIA']);
    assert.equal((await repo.obtener())?.acceso, null);
  });

  it('una renovación completa, y dos a la vez, con una sola conexión: una llamada a Atlassian', async () => {
    await guardarConexion(60);
    const config = configuracionPrueba('http://127.0.0.1:0', { oauth: configuracionOauth(doble) });
    const creds = new CredencialesJira(repo, cifrador, atlassian(), { ahora: () => new Date() }, { perfil: async () => ADM } as never, config);
    const ctx = () => ({ presupuesto: new Presupuesto(8000), actor: async () => ADM });
    doble.retardoRenovacionMs = 200;
    const [a, b] = await Promise.all([creds.abrir(ctx()), creds.abrir(ctx())]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(doble.renovaciones, 1);
    const f = await repo.obtener();
    assert.equal(cifrador.descifrarSecreto(f?.renovacion as NonNullable<typeof f>['renovacion'] & object, DATO_ASOCIADO_RENOVACION), doble.renovacionActual);
  });

  it('una renovación rechazada con una sola conexión: RECONEXION_NECESARIA y un evento', async () => {
    await guardarConexion(60);
    const config = configuracionPrueba('http://127.0.0.1:0', { oauth: configuracionOauth(doble) });
    const creds = new CredencialesJira(repo, cifrador, atlassian(), { ahora: () => new Date() }, { perfil: async () => ADM } as never, config);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const r = await creds.abrir({ presupuesto: new Presupuesto(8000), actor: async () => ADM });
    assert.deepEqual(r, { ok: false, codigo: 'JIRA_RECONEXION_NECESARIA' });
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.evento_oauth_jira WHERE tipo = \'REFRESCO_FALLIDO\'')).length, 1);
  });

  it('los eventos de configuración mezclados con los de OAuth, y el guardado que descarta la conexión, con search_path=public', async () => {
    await guardarConexion(3600);
    const config = new ConfiguracionPrismaRepositorio(sinEsquema);
    const ahora = new Date();
    await config.guardar(
      {
        metodo: 'API_TOKEN', sitio: 'http://127.0.0.1:4010', correo: 'a@quality360.local', proyecto: 'QTY', tiposIssue: ['Story'], campoSprint: null, campoCriterios: null,
        celulaId: PERSONAS.adm1.id, qeResponsableId: PERSONAS.adm1.id, sprintRespaldoId: PERSONAS.adm1.id, token: cifrador.cifrar('q360-token-valido-AB12'), actor: ADM, fecha: ahora,
        descartarOauth: { tipo: 'DESCONECTAR', actor: ADM, sitioNombre: 'empresa', cuentaNombre: 'Ana Pérez', codigo: null, fecha: ahora },
      },
      { actor: ADM, camposCambiados: ['sitio', 'metodo'], tokenCambiado: true, resultadoPrueba: 'OK', fecha: ahora },
    );
    assert.equal(await repo.obtener(), null);
    const pagina = await config.listarEventos(1, 10);
    assert.equal(pagina.total, 3);
    assert.deepEqual(pagina.items.map((e) => e.tipo).sort(), ['CONECTAR_OAUTH', 'CONFIGURACION', 'DESCONECTAR']);
  });
});
