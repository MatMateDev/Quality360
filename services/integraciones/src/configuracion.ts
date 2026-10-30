/**
 * Configuración del servicio. Todo viene del entorno. Solo un `DATABASE_URL` ausente tumba el arranque
 * (D127, D128): una variable de E5 que falte deja inhabilitada su capacidad, no el servicio. Los mensajes
 * nombran la variable y la regla, nunca el valor.
 */
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionIntegraciones');

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
  /** Admite `http://127.0.0.1:<puerto>` como sitio de Jira. Siempre `false` con `NODE_ENV=production` (D95). */
  permitirHostPrueba: boolean;
  verificador: OpcionesVerificador;
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string, minimo = 1): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) throw errorInterno(`${nombre} debe ser un entero >= ${minimo} (valor omitido por seguridad)`);
  return numero;
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

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionIntegraciones {
  const produccion = entorno.NODE_ENV === 'production';
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
    permitirHostPrueba: !produccion && leerBooleano(entorno.INTEGRACIONES_PERMITIR_HOST_PRUEBA),
    verificador: opcionesDesdeEntorno(entorno),
  };
}
