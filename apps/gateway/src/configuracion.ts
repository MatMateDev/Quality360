/**
 * Configuración del gateway. Todo viene del entorno; no hay secretos con
 * valor por defecto. Si algo está mal, el proceso no arranca, salvo las URL de
 * los servicios opcionales (Impedimentos e Integraciones, D127 y D129): si
 * faltan en producción o son inválidas, quedan en `null`, el gateway arranca y
 * solo sus rutas responden 503 `SERVICIO_NO_DISPONIBLE`.
 */
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionGateway');

/**
 * Una URL por bloque compuesto, para poder tumbar una sola fuente sin tocar
 * el resto (E1-B03#3, E1-F06#3). Todas caen por defecto en `ORGANIZACION_URL`,
 * salvo el checklist, que cae en `CERTIFICACIONES_URL`.
 */
export interface FuentesComposicion {
  /** `GET /v1/resumenes/admin/usuarios` */
  usuarios: string;
  /** `GET /v1/resumenes/admin/supervision` */
  supervision: string;
  /** `GET /v1/resumenes/qe/equipo` */
  equipo: string;
  /** `GET /v1/resumenes/qa/supervisor` */
  supervisor: string;
  /** `GET /v1/resumenes/qe/hdu` y `GET /v1/resumenes/qa/hdu` */
  hdu: string;
  /** `GET /v1/hdu/{id}/checklist` de Certificaciones */
  checklist: string;
}

export interface LimiteTasa {
  ventanaMs: number;
  /** Máximo por ventana en todas las rutas `/v1/*`. */
  maximo: number;
  /** Máximo por ventana en escrituras (POST, PUT, PATCH, DELETE). */
  maximoEscritura: number;
}

export interface ConfiguracionGateway {
  puerto: number;
  /** Orígenes del portal admitidos por CORS. */
  origenesPortal: string[];
  /** Saltos de proxy de confianza para el límite de tasa; 0 = ninguno. */
  confiarProxy: number;
  organizacionUrl: string;
  certificacionesUrl: string;
  /**
   * Impedimentos (E4, D85). `null` si falta en producción o es inválida (D129):
   * solo sus rutas responden 503.
   */
  impedimentosUrl: string | null;
  /** Tiempo límite al reenviar a Impedimentos; por defecto, `tiempoLimiteServicioMs`. */
  tiempoLimiteImpedimentosMs: number;
  /**
   * Integraciones (E5, D127). `null` si falta en producción o es inválida: solo
   * `/v1/integraciones/*` responde 503.
   */
  integracionesUrl: string | null;
  /** Tiempo límite al reenviar a Integraciones (12 s por defecto, D115). */
  tiempoLimiteIntegracionesMs: number;
  /**
   * Avisos de configuración, sin valores (por ejemplo, «INTEGRACIONES_URL no
   * configurada o inválida»). `crearApp` los registra una sola vez.
   */
  avisos: string[];
  fuentes: FuentesComposicion;
  /** Tiempo límite por fuente en la composición. */
  tiempoLimiteFuenteMs: number;
  /** Tiempo límite al reenviar a un servicio. */
  tiempoLimiteServicioMs: number;
  limiteTasa: LimiteTasa;
  verificador: OpcionesVerificador;
}

function sinBarraFinal(valor: string): string {
  return valor.replace(/\/+$/, '');
}

function leerUrl(valor: string | undefined, porDefecto: string, nombre: string): string {
  const crudo = valor === undefined || valor.trim().length === 0 ? porDefecto : valor.trim();
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    throw errorInterno(`${nombre} no es una URL válida (valor omitido por seguridad)`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errorInterno(`${nombre} debe ser http o https (valor omitido por seguridad)`);
  }
  return sinBarraFinal(url.toString());
}

/**
 * URL de un servicio opcional (D127, D129). Nunca lanza: si es inválida, o si
 * falta con `NODE_ENV=production`, devuelve `null` y deja un aviso sin el valor.
 * En desarrollo, si falta, usa el valor por defecto.
 */
function leerUrlOpcional(
  valor: string | undefined,
  porDefecto: string,
  nombre: string,
  produccion: boolean,
  avisos: string[],
): string | null {
  const ausente = valor === undefined || valor.trim().length === 0;
  if (!(ausente && produccion)) {
    try {
      return leerUrl(valor, porDefecto, nombre);
    } catch {
      // Se informa abajo, sin el valor.
    }
  }
  avisos.push(`${nombre} no configurada o inválida`);
  return null;
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string, minimo = 1): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) {
    throw errorInterno(`${nombre} debe ser un entero >= ${minimo} (valor omitido por seguridad)`);
  }
  return numero;
}

function leerLista(valor: string | undefined, porDefecto: string[]): string[] {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  return valor
    .split(',')
    .map((elemento) => elemento.trim())
    .filter((elemento) => elemento.length > 0);
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionGateway {
  const organizacionUrl = leerUrl(entorno.ORGANIZACION_URL, 'http://localhost:3001', 'ORGANIZACION_URL');
  const certificacionesUrl = leerUrl(
    entorno.CERTIFICACIONES_URL,
    'http://localhost:3002',
    'CERTIFICACIONES_URL',
  );

  // En la nube no hay un valor por defecto razonable para los servicios opcionales, pero
  // tampoco deben tumbar el portal completo (incidente de E4; D127, D129): sin ellos solo
  // sus rutas responden 503. En desarrollo apuntan a sus puertos locales.
  const produccion = entorno.NODE_ENV === 'production';
  const avisos: string[] = [];
  const impedimentosUrl = leerUrlOpcional(
    entorno.IMPEDIMENTOS_URL,
    'http://localhost:3003',
    'IMPEDIMENTOS_URL',
    produccion,
    avisos,
  );
  const integracionesUrl = leerUrlOpcional(
    entorno.INTEGRACIONES_URL,
    'http://localhost:3004',
    'INTEGRACIONES_URL',
    produccion,
    avisos,
  );
  const tiempoLimiteServicioMs = leerEntero(entorno.TIEMPO_LIMITE_SERVICIO_MS, 10_000, 'TIEMPO_LIMITE_SERVICIO_MS');

  return {
    puerto: leerEntero(entorno.PORT, 3000, 'PORT'),
    origenesPortal: leerLista(entorno.PORTAL_ORIGENES, ['http://localhost:5173']),
    confiarProxy: leerEntero(entorno.CONFIAR_PROXY, 0, 'CONFIAR_PROXY', 0),
    organizacionUrl,
    certificacionesUrl,
    impedimentosUrl,
    tiempoLimiteImpedimentosMs: leerEntero(
      entorno.IMPEDIMENTOS_TIMEOUT_MS,
      tiempoLimiteServicioMs,
      'IMPEDIMENTOS_TIMEOUT_MS',
    ),
    integracionesUrl,
    tiempoLimiteIntegracionesMs: leerEntero(entorno.INTEGRACIONES_TIMEOUT_MS, 12_000, 'INTEGRACIONES_TIMEOUT_MS'),
    avisos,
    fuentes: {
      usuarios: leerUrl(entorno.FUENTE_RESUMEN_USUARIOS_URL, organizacionUrl, 'FUENTE_RESUMEN_USUARIOS_URL'),
      supervision: leerUrl(
        entorno.FUENTE_RESUMEN_SUPERVISION_URL,
        organizacionUrl,
        'FUENTE_RESUMEN_SUPERVISION_URL',
      ),
      equipo: leerUrl(entorno.FUENTE_RESUMEN_EQUIPO_URL, organizacionUrl, 'FUENTE_RESUMEN_EQUIPO_URL'),
      supervisor: leerUrl(
        entorno.FUENTE_RESUMEN_SUPERVISOR_URL,
        organizacionUrl,
        'FUENTE_RESUMEN_SUPERVISOR_URL',
      ),
      hdu: leerUrl(entorno.FUENTE_RESUMEN_HDU_URL, organizacionUrl, 'FUENTE_RESUMEN_HDU_URL'),
      checklist: leerUrl(entorno.FUENTE_CHECKLIST_URL, certificacionesUrl, 'FUENTE_CHECKLIST_URL'),
    },
    tiempoLimiteFuenteMs: leerEntero(entorno.TIEMPO_LIMITE_FUENTE_MS, 2000, 'TIEMPO_LIMITE_FUENTE_MS'),
    tiempoLimiteServicioMs,
    limiteTasa: {
      ventanaMs: leerEntero(entorno.LIMITE_TASA_VENTANA_MS, 60_000, 'LIMITE_TASA_VENTANA_MS'),
      maximo: leerEntero(entorno.LIMITE_TASA_MAX, 300, 'LIMITE_TASA_MAX'),
      maximoEscritura: leerEntero(entorno.LIMITE_TASA_ESCRITURA_MAX, 30, 'LIMITE_TASA_ESCRITURA_MAX'),
    },
    verificador: opcionesDesdeEntorno(entorno),
  };
}
