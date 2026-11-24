/**
 * Configuración del servicio. Todo viene del entorno. Solo un `DATABASE_URL` ausente tumba el arranque
 * (D127, D128): una variable de E5 que falte deja inhabilitada su capacidad, no el servicio. Los mensajes
 * nombran la variable y la regla, nunca el valor.
 */
import { Logger } from '@nestjs/common';
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionIntegraciones');

/** Hosts fijos de Atlassian (D213). Son los únicos destinos salvo los de prueba. */
export const URL_AUTORIZACION_ATLASSIAN = 'https://auth.atlassian.com';
export const URL_API_ATLASSIAN = 'https://api.atlassian.com';
/** Ruta exacta de la página de retorno del portal (D210, D216). */
export const RUTA_RETORNO_OAUTH = '/admin/integraciones/jira/oauth/retorno';

/**
 * Credenciales de la app de Atlassian (D216). Todas opcionales y no fatales: sin las tres, `disponible` es `false` y
 * solo la conexión OAuth queda inhabilitada. `clientSecret` nunca se registra ni se devuelve.
 */
export interface ConfiguracionOauth {
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  readonly redirectUri: string | null;
  /** Base de `/authorize` y `/oauth/token`. Solo difiere de `https://auth.atlassian.com` con host de prueba (D213). */
  readonly urlAutorizacion: string;
  /** Base de `/oauth/token/accessible-resources` y de `/ex/jira/{cloudid}`. */
  readonly urlApi: string;
  /** `true` solo con las tres credenciales presentes y válidas. */
  readonly disponible: boolean;
}

export interface ConfiguracionIntegraciones {
  puerto: number;
  /**
   * Base de Organización. `null` solo con `NODE_ENV=production` y la variable ausente o inválida: todo
   * `/v1/*` responde 503 `SERVICIO_NO_DISPONIBLE` y `/health` sigue en 200.
   */
  organizacionUrl: string | null;
  tiempoLimiteOrganizacionMs: number;
  /** Llave AES-256 (32 bytes). `null` si falta o no decodifica a 32 bytes: solo cifrar y descifrar fallan (D128). */
  llaveCifrado: Buffer | null;
  /** Presupuesto de una sincronización o importación, medido desde que llega la petición (D96, D114). */
  presupuestoMs: number;
  tiempoLimiteJiraMs: number;
  esperaMax429Ms: number;
  topeIssues: number;
  /** Una ejecución `EN_CURSO` de más de este tiempo se cierra como `INTERRUMPIDA` (D104). */
  enCursoMaxMs: number;
  /** Vigencia de una consulta desde la última llamada a Jira (D134). */
  consultaVigenciaMs: number;
  /** Tope de filas de una consulta (D135). */
  consultaTopeItems: number;
  /** Issues por página de `search/jql` (D196): 50 por defecto, entre 10 y 100; fuera de rango vale 50. */
  jiraTamanoPagina: number;
  /** Cuánto dura la toma de una fila (`aplicando_desde`, D202): 30 s por defecto; en pruebas de carrera, 2 s. */
  tomaFilaMs: number;
  /** Admite `http://127.0.0.1:<puerto>` como sitio de Jira. Siempre `false` con `NODE_ENV=production` (D95). */
  permitirHostPrueba: boolean;
  /** Conexión con Jira por OAuth 2.0 (3LO). */
  oauth: ConfiguracionOauth;
  verificador: OpcionesVerificador;
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string, minimo = 1): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) throw errorInterno(`${nombre} debe ser un entero >= ${minimo} (valor omitido por seguridad)`);
  return numero;
}

/** `INTEGRACIONES_JIRA_TAMANO_PAGINA`: un entero entre 10 y 100; vacío, no numérico o fuera de rango usa 50 (D196). */
export function leerTamanoPagina(valor: string | undefined): number {
  const crudo = valor?.trim() ?? '';
  if (!/^\d{1,4}$/.test(crudo)) return 50;
  const numero = Number(crudo);
  return numero >= 10 && numero <= 100 ? numero : 50;
}

function leerBooleano(valor: string | undefined): boolean {
  return valor?.trim().toLowerCase() === 'true';
}

function leerUrl(valor: string): string | null {
  try {
    const url = new URL(valor);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return valor.replace(/\/+$/, '');
}

/** La URL de Organización: en desarrollo hay valor por defecto y un valor inválido es un error; en producción, `null`. */
function leerOrganizacionUrl(valor: string | undefined, produccion: boolean): string | null {
  const crudo = valor === undefined || valor.trim().length === 0 ? undefined : valor.trim();
  if (produccion) return crudo === undefined ? null : leerUrl(crudo);
  const url = leerUrl(crudo ?? 'http://localhost:3001');
  if (url === null) throw errorInterno('ORGANIZACION_URL no es una URL http(s) válida (valor omitido por seguridad)');
  return url;
}

/** 32 bytes en Base64. Cualquier otra cosa es «sin llave»: el servicio arranca igual (D128). */
export function leerLlaveCifrado(valor: string | undefined): Buffer | null {
  const crudo = valor?.trim();
  if (crudo === undefined || crudo.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(crudo)) return null;
  const llave = Buffer.from(crudo, 'base64');
  return llave.length === 32 ? llave : null;
}

const avisados = new Set<string>();
/** Un aviso por variable y por proceso; nunca incluye el valor. */
function avisarUnaVez(nombre: string, motivo: string): void {
  if (avisados.has(nombre)) return;
  avisados.add(nombre);
  new Logger('Configuracion').warn(`${nombre} ${motivo}; se ignora (valor omitido por seguridad).`);
}

const PATRON_ORIGEN_HTTPS = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[1-9][0-9]{0,4})?$/;
const PATRON_ORIGEN_LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1):([1-9][0-9]{0,4})$/;
const PATRON_BASE_PRUEBA = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/;

/**
 * `JIRA_OAUTH_REDIRECT_URI` (D216): `https://`, ruta exacta, sin parámetros, fragmento ni credenciales. Con la bandera de
 * prueba también `http://localhost:<puerto>` o `http://127.0.0.1:<puerto>`. Inválido equivale a ausente.
 */
export function leerRedirectUri(valor: string | undefined, permitirHostPrueba: boolean): string | null {
  const crudo = valor?.trim() ?? '';
  if (crudo.length === 0) return null;
  let valida = false;
  if (crudo.endsWith(RUTA_RETORNO_OAUTH) && !/[?#@\s]/.test(crudo)) {
    const origen = crudo.slice(0, crudo.length - RUTA_RETORNO_OAUTH.length);
    const puertoLocal = PATRON_ORIGEN_LOCAL.exec(origen)?.[1];
    if (PATRON_ORIGEN_HTTPS.test(origen)) valida = true;
    else if (permitirHostPrueba && puertoLocal !== undefined && Number(puertoLocal) <= 65535) valida = true;
  }
  if (!valida) {
    avisarUnaVez('JIRA_OAUTH_REDIRECT_URI', 'no cumple la forma exigida');
    return null;
  }
  return crudo;
}

/** Base de pruebas de Atlassian: solo con la bandera, fuera de producción y con la forma `http://127.0.0.1:<puerto>` (D213). */
export function leerBaseOauth(nombre: string, valor: string | undefined, porDefecto: string, permitirHostPrueba: boolean): string {
  const crudo = valor?.trim().replace(/\/+$/, '') ?? '';
  if (crudo.length === 0) return porDefecto;
  const puerto = PATRON_BASE_PRUEBA.exec(crudo)?.[1];
  if (permitirHostPrueba && puerto !== undefined && Number(puerto) <= 65535) return crudo;
  avisarUnaVez(nombre, 'solo se admite con el host de prueba habilitado, fuera de producción y como http://127.0.0.1:<puerto>');
  return porDefecto;
}

function leerTextoOpcional(valor: string | undefined): string | null {
  const crudo = valor?.trim() ?? '';
  return crudo.length === 0 ? null : crudo;
}

export function leerOauth(entorno: NodeJS.ProcessEnv, permitirHostPrueba: boolean): ConfiguracionOauth {
  const clientId = leerTextoOpcional(entorno.JIRA_OAUTH_CLIENT_ID);
  const clientSecret = leerTextoOpcional(entorno.JIRA_OAUTH_CLIENT_SECRET);
  const redirectUri = leerRedirectUri(entorno.JIRA_OAUTH_REDIRECT_URI, permitirHostPrueba);
  return {
    clientId,
    clientSecret,
    redirectUri,
    urlAutorizacion: leerBaseOauth('JIRA_OAUTH_URL_AUTORIZACION', entorno.JIRA_OAUTH_URL_AUTORIZACION, URL_AUTORIZACION_ATLASSIAN, permitirHostPrueba),
    urlApi: leerBaseOauth('JIRA_OAUTH_URL_API', entorno.JIRA_OAUTH_URL_API, URL_API_ATLASSIAN, permitirHostPrueba),
    disponible: clientId !== null && clientSecret !== null && redirectUri !== null,
  };
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionIntegraciones {
  const produccion = entorno.NODE_ENV === 'production';
  const permitirHostPrueba = !produccion && leerBooleano(entorno.INTEGRACIONES_PERMITIR_HOST_PRUEBA);
  const databaseUrl = entorno.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) throw errorInterno('Falta la variable de entorno DATABASE_URL.');

  return {
    puerto: leerEntero(entorno.PORT, 3004, 'PORT'),
    organizacionUrl: leerOrganizacionUrl(entorno.ORGANIZACION_URL, produccion),
    tiempoLimiteOrganizacionMs: leerEntero(entorno.ORGANIZACION_TIMEOUT_MS, 5000, 'ORGANIZACION_TIMEOUT_MS'),
    llaveCifrado: leerLlaveCifrado(entorno.INTEGRACIONES_LLAVE_CIFRADO),
    presupuestoMs: leerEntero(entorno.INTEGRACIONES_PRESUPUESTO_MS, 8000, 'INTEGRACIONES_PRESUPUESTO_MS'),
    tiempoLimiteJiraMs: leerEntero(entorno.JIRA_TIEMPO_LIMITE_MS, 3000, 'JIRA_TIEMPO_LIMITE_MS'),
    esperaMax429Ms: leerEntero(entorno.JIRA_ESPERA_MAX_429_MS, 3000, 'JIRA_ESPERA_MAX_429_MS', 0),
    topeIssues: leerEntero(entorno.JIRA_TOPE_ISSUES, 100, 'JIRA_TOPE_ISSUES'),
    enCursoMaxMs: leerEntero(entorno.INTEGRACIONES_EN_CURSO_MAX_MS, 300_000, 'INTEGRACIONES_EN_CURSO_MAX_MS'),
    consultaVigenciaMs: leerEntero(entorno.INTEGRACIONES_CONSULTA_VIGENCIA_MS, 86_400_000, 'INTEGRACIONES_CONSULTA_VIGENCIA_MS'),
    consultaTopeItems: leerEntero(entorno.INTEGRACIONES_CONSULTA_TOPE_ITEMS, 500, 'INTEGRACIONES_CONSULTA_TOPE_ITEMS'),
    jiraTamanoPagina: leerTamanoPagina(entorno.INTEGRACIONES_JIRA_TAMANO_PAGINA),
    tomaFilaMs: leerEntero(entorno.INTEGRACIONES_TOMA_FILA_MS, 30_000, 'INTEGRACIONES_TOMA_FILA_MS'),
    permitirHostPrueba,
    oauth: leerOauth(entorno, permitirHostPrueba),
    verificador: opcionesDesdeEntorno(entorno),
  };
}
