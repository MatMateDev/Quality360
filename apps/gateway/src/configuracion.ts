/**
 * Configuración del gateway. Todo viene del entorno; no hay secretos con
 * valor por defecto. Si algo está mal, el proceso no arranca.
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
    throw errorInterno(`${nombre} no es una URL válida: ${crudo}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errorInterno(`${nombre} debe ser http o https: ${crudo}`);
  }
  return sinBarraFinal(url.toString());
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string, minimo = 1): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) {
    throw errorInterno(`${nombre} debe ser un entero >= ${minimo}: ${valor}`);
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

  return {
    puerto: leerEntero(entorno.PORT, 3000, 'PORT'),
    origenesPortal: leerLista(entorno.PORTAL_ORIGENES, ['http://localhost:5173']),
    confiarProxy: leerEntero(entorno.CONFIAR_PROXY, 0, 'CONFIAR_PROXY', 0),
    organizacionUrl,
    certificacionesUrl,
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
    tiempoLimiteServicioMs: leerEntero(entorno.TIEMPO_LIMITE_SERVICIO_MS, 10_000, 'TIEMPO_LIMITE_SERVICIO_MS'),
    limiteTasa: {
      ventanaMs: leerEntero(entorno.LIMITE_TASA_VENTANA_MS, 60_000, 'LIMITE_TASA_VENTANA_MS'),
      maximo: leerEntero(entorno.LIMITE_TASA_MAX, 300, 'LIMITE_TASA_MAX'),
      maximoEscritura: leerEntero(entorno.LIMITE_TASA_ESCRITURA_MAX, 30, 'LIMITE_TASA_ESCRITURA_MAX'),
    },
    verificador: opcionesDesdeEntorno(entorno),
  };
}
