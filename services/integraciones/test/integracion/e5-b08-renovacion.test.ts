/**
 * E5-B08 #7 a #10 · Renovación del token de acceso (JO5, D214, D215). Postgres real, Organización falsa y el doble de
 * Atlassian con ROTACIÓN: cada renovación invalida el token de renovación y el de acceso anteriores, así que quien no guarda el
 * nuevo, o renueva dos veces a la vez, rompe la conexión y la prueba lo ve.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { CredencialesJira } from '../../src/aplicacion/credenciales-jira.js';
import { Presupuesto } from '../../src/dominio/ejecucion.js';
import type { CredencialFuenteJira, FuenteJira, OpcionesLlamada, ResultadoJira } from '../../src/dominio/puertos/fuente-jira.js';
import { ClienteAtlassianHttp } from '../../src/infraestructura/atlassian/cliente-atlassian-http.js';
import { CifradorAesGcm } from '../../src/infraestructura/cifrado/cifrador-aes-gcm.js';
import { ClienteJiraHttp } from '../../src/infraestructura/jira/cliente-jira-http.js';
import { ConexionOauthPrismaRepositorio } from '../../src/infraestructura/prisma/conexion-oauth.prisma.repositorio.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { LLAVE_PRUEBA, configuracionPrueba } from '../ayudas-app.js';
import { PERSONAS, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, retenerFilaConexion, type OrganizacionFalsa } from '../ayudas.js';
import { AtlassianDoble, CLIENT_ID_PRUEBA, CLIENT_SECRET_PRUEBA, REDIRECT_PRUEBA } from '../atlassian-doble.js';
import { configuracionOauth, montar, type Montaje } from '../montaje.js';
import { conectar, eventosOauth, filaConexion, tokensGuardados } from '../oauth-ayudas.js';

const PROBAR = '/v1/integraciones/jira/configuracion/probar';
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

/** Monta el servicio y deja la conexión CONECTADA con el acceso que vence en `expiresIn` segundos. */
async function conectado(expiresIn: number, config: Parameters<typeof montar>[0] = {}): Promise<Montaje> {
  doble.reiniciar();
  doble.expiresIn = expiresIn;
  m = await montar({ org, atlassian: doble, capturarRegistro: true, ...config });
  const r = await conectar(m, doble);
  assert.equal(r.respuesta.status, 200, JSON.stringify(r.respuesta.body));
  assert.equal(r.respuesta.body.resultado, 'CONECTADA');
  doble.solicitudes.length = 0;
  doble.expiresIn = 3600;
  return m;
}

const probar = (montaje: Montaje, cuerpo: Record<string, unknown> = { metodo: 'OAUTH', proyecto: 'QTY' }) => montaje.pedir('post', PROBAR, 'adm1', cuerpo);

describe('E5-B08 #7 · renovación automática', () => {
  it('con más de 5 minutos de vida usa el acceso guardado: no llama a /oauth/token', async () => {
    const montaje = await conectado(3600);
    const r = await probar(montaje);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(doble.llamadasA('/oauth/token'), 0);
    assert.equal(doble.renovaciones, 0);
  });

  it('con menos de 5 minutos renueva UNA vez, guarda ambos tokens nuevos cifrados y usa el acceso nuevo', async () => {
    const montaje = await conectado(60);
    const antes = await filaConexion();
    assert.equal(antes?.renovado_en, null);
    const r = await probar(montaje);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(doble.renovaciones, 1);
    const despues = await filaConexion();
    assert.ok(despues?.renovado_en instanceof Date);
    const guardados = tokensGuardados(despues as NonNullable<typeof despues>);
    assert.equal(guardados.acceso, doble.accesoActual);
    assert.equal(guardados.renovacion, doble.renovacionActual);
    assert.notEqual(Buffer.from(despues?.renovacion_cifrada as Buffer).toString('hex'), Buffer.from(antes?.renovacion_cifrada as Buffer).toString('hex'));
    // IV y etiqueta propios en cada renovación.
    assert.notEqual(Buffer.from(despues?.acceso_iv as Buffer).toString('hex'), Buffer.from(antes?.acceso_iv as Buffer).toString('hex'));
    // La llamada a Jira usó el acceso NUEVO (el viejo ya no valía).
    const aJira = doble.solicitudes.filter((s) => s.ruta.startsWith('/ex/jira/'));
    assert.ok(aJira.length >= 1);
    assert.ok(aJira.every((s) => s.bearerValido === true));
    // Con vencimiento de una hora, la siguiente operación ya no renueva.
    const otra = await probar(montaje);
    assert.equal(otra.body.ok, true);
    assert.equal(doble.renovaciones, 1);
  });

  it('el token de renovación nuevo está guardado ANTES de usar el acceso nuevo (rotación)', async () => {
    doble.reiniciar();
    doble.expiresIn = 60;
    const http = new ClienteJiraHttp({ permitirHostPrueba: true, urlApiOauth: doble.url });
    let renovacionAlLlamar: string | null = null;
    // Se mira la base con otra conexión, como lo haría otro proceso: lo guardado debe ser ya el token vigente.
    const mirar = async (c: CredencialFuenteJira): Promise<void> => {
      const fila = await filaConexion();
      if (fila?.renovacion_cifrada != null && 'tokenAcceso' in c && c.tokenAcceso === doble.accesoActual) renovacionAlLlamar = tokensGuardados(fila).renovacion;
    };
    const espia: FuenteJira = {
      async probar(c, p, o) {
        await mirar(c);
        return http.probar(c, p, o);
      },
      detectarCampoSprint: (c, o) => http.detectarCampoSprint(c, o),
      detectarCampos: (c, o) => http.detectarCampos(c, o),
      buscarPagina: (c, q, o) => http.buscarPagina(c, q, o),
      async probarCuenta(c: CredencialFuenteJira, o: OpcionesLlamada) {
        await mirar(c);
        return http.probarCuenta(c, o);
      },
    };
    m = await montar({ org, atlassian: doble, fuenteJira: espia });
    const r = await conectar(m, doble);
    assert.equal(r.respuesta.body.resultado, 'CONECTADA');
    doble.expiresIn = 3600;
    renovacionAlLlamar = null;
    const prueba = await probar(m);
    assert.equal(prueba.body.ok, true);
    assert.equal(doble.renovaciones, 1);
    assert.equal(renovacionAlLlamar, doble.renovacionActual, 'al usar el acceso nuevo, el token de renovación nuevo ya estaba confirmado en la base');
  });

  it('un 401 con un acceso que se creía vigente: UNA renovación forzada y UN reintento', async () => {
    const montaje = await conectado(3600);
    doble.invalidarAcceso();
    const r = await probar(montaje);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(doble.renovaciones, 1);
    const myself = doble.solicitudes.filter((s) => s.ruta.endsWith('/rest/api/3/myself'));
    assert.deepEqual(myself.map((s) => s.bearerValido), [false, true]);
  });

  it('el 401 sigue tras renovar: JIRA_OAUTH_PERMISOS_INSUFICIENTES con los permisos de esa llamada, sin más reintentos', async () => {
    const montaje = await conectado(3600);
    doble.jiraRechazaSiempre = true;
    const r = await probar(montaje);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error.codigo, 'JIRA_OAUTH_PERMISOS_INSUFICIENTES');
    assert.deepEqual(r.body.error.permisosFaltantes, ['read:jira-user']);
    assert.deepEqual(r.body.error.sugerencias, ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO']);
    assert.equal(doble.renovaciones, 1, 'una sola renovación forzada');
    assert.equal(doble.solicitudes.filter((s) => s.ruta.endsWith('/rest/api/3/myself')).length, 2, 'una llamada y un reintento');
    // La conexión no se marcó como vencida: la renovación funcionó.
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
    assert.equal((await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO').length, 0);
  });

  it('si la respuesta de la renovación no trae refresh_token se conserva el anterior', async () => {
    const montaje = await conectado(60);
    doble.rotarRenovacion = false;
    const antes = tokensGuardados((await filaConexion()) as NonNullable<Awaited<ReturnType<typeof filaConexion>>>);
    const r = await probar(montaje);
    assert.equal(r.body.ok, true);
    assert.equal(doble.renovaciones, 1);
    const despues = tokensGuardados((await filaConexion()) as NonNullable<Awaited<ReturnType<typeof filaConexion>>>);
    assert.equal(despues.renovacion, antes.renovacion);
    assert.notEqual(despues.acceso, antes.acceso);
    // Y la conexión sigue sirviendo en la siguiente renovación.
    doble.expiresIn = 60;
    await probar(montaje);
    const tercera = await probar(montaje);
    assert.equal(tercera.body.ok, true);
  });

  it('los tokens nunca aparecen en los registros ni en la respuesta', async () => {
    const montaje = await conectado(60);
    const r = await probar(montaje);
    const secretos = [doble.accesoActual as string, doble.renovacionActual as string];
    const texto = JSON.stringify(r.body) + (montaje.registro?.lineas.join('\n') ?? '');
    for (const s of secretos) assert.equal(texto.includes(s), false);
  });
});

describe('E5-B08 #8 · renovaciones simultáneas', () => {
  it('dos peticiones que necesitan renovar a la vez: solo una llama a Atlassian; la otra espera, relee y usa lo renovado', async () => {
    const montaje = await conectado(60);
    doble.retardoRenovacionMs = 300; // abre la ventana: sin candado, la segunda llegaría con el token ya rotado
    const [a, b] = await Promise.all([probar(montaje), probar(montaje)]);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(a.body.ok, true, JSON.stringify(a.body));
    assert.equal(b.body.ok, true, JSON.stringify(b.body));
    assert.equal(doble.renovaciones, 1, 'una sola renovación');
    assert.equal(doble.llamadasA('/oauth/token'), 1);
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
    assert.equal((await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO').length, 0);
    assert.deepEqual(tokensGuardados((await filaConexion()) as NonNullable<Awaited<ReturnType<typeof filaConexion>>>), { acceso: doble.accesoActual, renovacion: doble.renovacionActual });
  });

  it('cinco a la vez también renuevan una sola vez', async () => {
    const montaje = await conectado(60);
    doble.retardoRenovacionMs = 250;
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => probar(montaje)));
    for (const r of respuestas) assert.equal(r.body.ok, true, JSON.stringify(r.body));
    assert.equal(doble.renovaciones, 1);
  });

  it('si el candado no se obtiene en 3 s: JIRA_TIEMPO_AGOTADO sin tocar la credencial', async () => {
    const montaje = await conectado(60);
    const antes = await filaConexion();
    const liberar = await retenerFilaConexion(8000);
    const inicio = Date.now();
    const r = await probar(montaje);
    const duracion = Date.now() - inicio;
    await liberar();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error.codigo, 'JIRA_TIEMPO_AGOTADO');
    assert.ok(duracion >= 2500 && duracion < 7000, `esperó ${duracion} ms`);
    assert.equal(doble.renovaciones, 0);
    const despues = await filaConexion();
    assert.equal(despues?.estado, 'CONECTADA');
    assert.equal(Buffer.from(despues?.renovacion_cifrada as Buffer).toString('hex'), Buffer.from(antes?.renovacion_cifrada as Buffer).toString('hex'));
    // Nada cambió: al liberar el candado la siguiente operación renueva con normalidad.
    const siguiente = await probar(montaje);
    assert.equal(siguiente.body.ok, true);
    assert.equal(doble.renovaciones, 1);
  });
});

describe('E5-B08 #9 · renovación rechazada (invalid_grant)', () => {
  it('pasa a RECONEXION_NECESARIA, borra los tokens, registra REFRESCO_FALLIDO una vez y las operaciones responden 200 con JIRA_RECONEXION_NECESARIA', async () => {
    const montaje = await conectado(60);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const r = await probar(montaje);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error.codigo, 'JIRA_RECONEXION_NECESARIA');
    assert.deepEqual(r.body.error.sugerencias, ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO']);
    const f = await filaConexion();
    assert.equal(f?.estado, 'RECONEXION_NECESARIA');
    assert.deepEqual([f?.acceso_cifrado, f?.renovacion_cifrada, f?.acceso_expira_en], [null, null, null]);
    assert.equal(f?.cuenta_nombre, 'Ana Pérez', 'se conservan cuenta y sitio');
    // Más intentos: la misma respuesta, sin llamar a Atlassian ni repetir el evento.
    const llamadas = doble.llamadasA('/oauth/token');
    for (let i = 0; i < 3; i++) assert.equal((await probar(montaje)).body.error.codigo, 'JIRA_RECONEXION_NECESARIA');
    assert.equal(doble.llamadasA('/oauth/token'), llamadas);
    const eventos = (await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO');
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0]?.actor_nombre, 'Patricia Admin', 'el Administrador cuya operación disparó la renovación');
    assert.equal(eventos[0]?.codigo, 'RENOVACION_RECHAZADA');
  });

  it('tres operaciones a la vez con la renovación vencida: una transición y un solo evento', async () => {
    const montaje = await conectado(60);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const respuestas = await Promise.all([probar(montaje), probar(montaje), probar(montaje)]);
    for (const r of respuestas) assert.equal(r.body.error.codigo, 'JIRA_RECONEXION_NECESARIA', JSON.stringify(r.body));
    assert.equal((await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO').length, 1);
    assert.equal(doble.llamadasA('/oauth/token'), 1, 'las demás esperaron el candado, releyeron y vieron la reconexión necesaria');
  });

  it('reconectar restablece la conexión y deja el evento RECONECTAR', async () => {
    const montaje = await conectado(60);
    doble.modo = 'RENOVACION_INVALID_GRANT';
    await probar(montaje);
    doble.modo = 'NORMAL';
    const r = await conectar(montaje, doble);
    assert.equal(r.respuesta.body.resultado, 'CONECTADA', JSON.stringify(r.respuesta.body));
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
    assert.deepEqual((await eventosOauth()).map((e) => e.tipo), ['CONECTAR_OAUTH', 'REFRESCO_FALLIDO', 'RECONECTAR']);
    assert.equal((await probar(montaje)).body.ok, true);
  });

  it('un acceso revocado en Atlassian y renovación rechazada: JIRA_RECONEXION_NECESARIA (no permisos insuficientes)', async () => {
    const montaje = await conectado(3600);
    doble.invalidarAcceso();
    doble.modo = 'RENOVACION_INVALID_GRANT';
    const r = await probar(montaje);
    assert.equal(r.body.error.codigo, 'JIRA_RECONEXION_NECESARIA');
  });
});

describe('E5-B08 #10 · Atlassian no disponible', () => {
  it('5xx: JIRA_NO_DISPONIBLE; la credencial no se borra ni cambia de estado y la siguiente operación reintenta', async () => {
    const montaje = await conectado(60);
    const antes = await filaConexion();
    doble.modo = 'RENOVACION_CAIDA';
    const r = await probar(montaje);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error.codigo, 'JIRA_NO_DISPONIBLE');
    const f = await filaConexion();
    assert.equal(f?.estado, 'CONECTADA');
    assert.equal(Buffer.from(f?.renovacion_cifrada as Buffer).toString('hex'), Buffer.from(antes?.renovacion_cifrada as Buffer).toString('hex'));
    assert.equal((await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO').length, 0);
    doble.modo = 'NORMAL';
    assert.equal((await probar(montaje)).body.ok, true);
    assert.equal(doble.renovaciones, 1);
  });

  it('429: JIRA_LIMITE_DE_TASA, sin tocar la credencial', async () => {
    const montaje = await conectado(60);
    doble.modo = 'RENOVACION_429';
    const r = await probar(montaje);
    assert.equal(r.body.error.codigo, 'JIRA_LIMITE_DE_TASA');
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
  });

  it('sin respuesta dentro del tiempo límite: JIRA_TIEMPO_AGOTADO, sin tocar la credencial', async () => {
    const montaje = await conectado(60, { config: { tiempoLimiteJiraMs: 400 } });
    doble.colgarRenovacion = true;
    const inicio = Date.now();
    const r = await probar(montaje);
    assert.ok(Date.now() - inicio < 3000);
    assert.equal(r.body.error.codigo, 'JIRA_TIEMPO_AGOTADO');
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
    assert.equal((await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO').length, 0);
    doble.colgarRenovacion = false;
    assert.equal((await probar(montaje)).body.ok, true);
  });

  it('una respuesta de Atlassian sin la forma esperada: JIRA_RESPUESTA_INVALIDA, sin tocar la credencial', async () => {
    const montaje = await conectado(60);
    doble.modo = 'RENOVACION_RESPUESTA_INVALIDA';
    const r = await probar(montaje);
    assert.equal(r.body.error.codigo, 'JIRA_RESPUESTA_INVALIDA');
    assert.equal((await filaConexion())?.estado, 'CONECTADA');
    assert.equal((await eventosOauth()).filter((e) => e.tipo === 'REFRESCO_FALLIDO').length, 0);
  });
});

describe('E5-B08 #7 · la renovación forzada tras un 401 solo ocurre si el vencimiento guardado sigue siendo el del acceso usado', () => {
  it('si otro proceso ya renovó, se reintenta con su acceso y no se renueva de nuevo', async () => {
    await conectado(3600);
    const prisma = new PrismaService();
    try {
      const config = configuracionPrueba(org.url, { oauth: configuracionOauth(doble) });
      const armar = () =>
        new CredencialesJira(
          new ConexionOauthPrismaRepositorio(prisma),
          new CifradorAesGcm(LLAVE_PRUEBA),
          new ClienteAtlassianHttp({ clientId: CLIENT_ID_PRUEBA, clientSecret: CLIENT_SECRET_PRUEBA, redirectUri: REDIRECT_PRUEBA, urlAutorizacion: doble.url, urlApi: doble.url, permitirHostPrueba: true }),
          { ahora: () => new Date() },
          { perfil: async () => ({ id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre }) } as never,
          config,
        );
      const contexto = { presupuesto: new Presupuesto(8000), actor: async () => ({ id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre }) };
      const nuestra = armar();
      const apertura = await nuestra.abrir(contexto);
      assert.equal(apertura.ok, true);
      if (!apertura.ok) return;
      const vistos: string[] = [];
      const operacion = async (c: CredencialFuenteJira): Promise<ResultadoJira<string>> => {
        const token = 'tokenAcceso' in c ? c.tokenAcceso : '';
        vistos.push(token);
        return token === doble.accesoActual
          ? { ok: true, valor: 'listo', eventos: [] }
          : { ok: false, codigo: 'JIRA_CREDENCIAL_INVALIDA', eventos: [], permisosFaltantes: ['read:jira-user'] };
      };
      // Otro proceso renueva (forzado, con el mismo vencimiento que usó nuestra sesión) y el acceso que tenemos queda inválido.
      const vencimiento = (await filaConexion())?.acceso_expira_en as Date;
      const otro = await armar().accesoParaSesion(contexto, vencimiento, false);
      assert.equal(otro.ok, true);
      assert.equal(doble.renovaciones, 1);
      const r = await apertura.sesion.llamar(operacion);
      assert.deepEqual(r, { ok: true, valor: 'listo', eventos: [] });
      assert.equal(doble.renovaciones, 1, 'no renovó otra vez: usó el acceso que dejó el otro proceso');
      assert.equal(vistos.length, 2);
      assert.notEqual(vistos[0], vistos[1]);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('E5-B08 · la fila de la base y la transacción', () => {
  it('la renovación no deja transacciones abiertas ni candados retenidos', async () => {
    const montaje = await conectado(60);
    for (let i = 0; i < 3; i++) {
      doble.expiresIn = 60;
      assert.equal((await probar(montaje)).body.ok, true);
    }
    const bloqueos = await consultaDuenio<{ n: bigint }>(
      `SELECT count(*) AS n FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'conexion_oauth_jira' AND l.mode = 'RowShareLock' AND NOT l.granted`,
    );
    assert.equal(Number(bloqueos[0]?.n), 0);
    assert.equal(doble.renovaciones, 3);
  });
});
