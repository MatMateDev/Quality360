/**
 * Configuración del servicio. Todo viene del entorno y ninguna variable propia impide el arranque
 * (plan E6, X0): un valor ausente o inválido deja inhabilitada su capacidad (el cron responde 401 si
 * falta `CRON_SECRET`; el snapshot queda `FALLIDA` si falta `INDICADORES_SERVICIO_TOKEN`) y el resto
 * funciona. Los mensajes nombran la variable, nunca su valor.
 */
import { opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionIndicadores');

export interface ConfiguracionIndicadores {
  puerto: number;
  produccion: boolean;
  /**
   * Base de Organización. `null` solo con `NODE_ENV=production` y la variable ausente o inválida: todo
   * `/v1/*` responde 503 `SERVICIO_NO_DISPONIBLE` y `/health` sigue en 200.
   */
  organizacionUrl: string | null;
  /** `null` si falta o es inválida: los bloques que dependen de Certificaciones van `indisponible` (D169). */
  certificacionesUrl: string | null;
  impedimentosUrl: string | null;
  /** Tiempo por llamada a una fuente (D154). */
  fuenteTimeoutMs: number;
  /** Tiempo por llamada en el snapshot (D178), con 1 reintento. */
  snapshotTimeoutMs: number;
  /** Secreto del cron (D178). `null`: la ruta del cron responde siempre 401. */
  cronSecret: string | null;
  /** Credencial de Indicadores hacia las tres rutas de lectura global (D177). `null`: el snapshot queda `FALLIDA`. */
  servicioToken: string | null;
  /** Credencial de la semilla (ADR 0007) y habilitación del gancho de prueba (D184). */
  semillaToken: string | null;
  permitirCargaSemilla: boolean;
  umbralDefecto: number;
  umbralMin: number;
  umbralMax: number;
  /** Tope de HDU por corrida del snapshot (D164). */
  topeHdu: number;
  csvLimiteFilas: number;
  pdfLimiteFilas: number;
  /** «Ahora» fijado para pruebas (D172). Siempre `null` con `NODE_ENV=production`. */
  fechaReferencia: Date | null;
  verificador: OpcionesVerificador;
}

function leerEntero(valor: string | undefined, porDefecto: number, minimo = 1): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo ? numero : porDefecto;
}

function leerUrl(valor: string | undefined): string | null {
  const crudo = valor?.trim();
  if (crudo === undefined || crudo.length === 0) return null;
  try {
    const url = new URL(crudo);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return crudo.replace(/\/+$/, '');
}

function leerSecreto(valor: string | undefined): string | null {
  const crudo = valor?.trim();
  return crudo === undefined || crudo.length === 0 ? null : crudo;
}

function leerFecha(valor: string | undefined, produccion: boolean): Date | null {
  if (produccion) return null;
  const crudo = valor?.trim();
  if (crudo === undefined || crudo.length === 0) return null;
  const fecha = new Date(/^\d{4}-\d{2}-\d{2}$/.test(crudo) ? `${crudo}T12:00:00Z` : crudo);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionIndicadores {
  const produccion = entorno.NODE_ENV === 'production';
  const organizacion = leerUrl(entorno.ORGANIZACION_URL);
  const umbralMin = leerEntero(entorno.INDICADORES_UMBRAL_MIN, 1);
  const umbralMax = Math.max(umbralMin, leerEntero(entorno.INDICADORES_UMBRAL_MAX, 50));
  const umbralDefecto = Math.min(umbralMax, Math.max(umbralMin, leerEntero(entorno.INDICADORES_UMBRAL_DEFECTO, 5)));
  return {
    puerto: leerEntero(entorno.PORT, 3005),
    produccion,
    organizacionUrl: produccion ? organizacion : (organizacion ?? 'http://localhost:3001'),
    certificacionesUrl: produccion ? leerUrl(entorno.CERTIFICACIONES_URL) : (leerUrl(entorno.CERTIFICACIONES_URL) ?? 'http://localhost:3002'),
    impedimentosUrl: produccion ? leerUrl(entorno.IMPEDIMENTOS_URL) : (leerUrl(entorno.IMPEDIMENTOS_URL) ?? 'http://localhost:3003'),
    fuenteTimeoutMs: leerEntero(entorno.INDICADORES_FUENTE_TIMEOUT_MS, 2000),
    snapshotTimeoutMs: leerEntero(entorno.INDICADORES_SNAPSHOT_TIMEOUT_MS, 8000),
    cronSecret: leerSecreto(entorno.CRON_SECRET),
    servicioToken: leerSecreto(entorno.INDICADORES_SERVICIO_TOKEN),
    semillaToken: leerSecreto(entorno.X_Q360_SERVICIO_TOKEN),
    permitirCargaSemilla: entorno.PERMITIR_CARGA_SEMILLA?.trim().toLowerCase() === 'true',
    umbralDefecto,
    umbralMin,
    umbralMax,
    topeHdu: leerEntero(entorno.INDICADORES_TOPE_HDU, 1000),
    csvLimiteFilas: leerEntero(entorno.EXPORTACION_LIMITE_FILAS, 50_000),
    pdfLimiteFilas: leerEntero(entorno.EXPORTACION_PDF_LIMITE_FILAS, 200),
    fechaReferencia: leerFecha(entorno.Q360_FECHA_REFERENCIA, produccion),
    verificador: opcionesDesdeEntorno(entorno),
  };
}
