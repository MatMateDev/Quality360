/** Configuración del servicio. Todo viene del entorno; sin valores por defecto para secretos. */
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionImpedimentos');

/** Umbrales del riesgo sugerido (D67). */
export interface UmbralesRiesgo {
  /** Días abiertos desde los que un impedimento `ABIERTO` da `ALTO` (`RIESGO_DIAS_IMPEDIMENTO_ALTO`). */
  readonly diasImpedimentoAlto: number;
  /** Días al fin del sprint o menos que, con avance bajo, dan `ALTO` (`RIESGO_DIAS_SPRINT_ALTO`). */
  readonly diasSprintAlto: number;
  /** Avance (%) por debajo del cual aplica `ATRASO_SPRINT_ALTO` (`RIESGO_AVANCE_ALTO`). */
  readonly avanceAlto: number;
  readonly diasSprintMedio: number;
  readonly avanceMedio: number;
}

export interface ConfiguracionImpedimentos {
  puerto: number;
  organizacionUrl: string;
  tiempoLimiteOrganizacionMs: number;
  certificacionesUrl: string;
  tiempoLimiteCertificacionesMs: number;
  verificador: OpcionesVerificador;
  riesgo: UmbralesRiesgo;
  /**
   * «Hoy» fijo (AAAA-MM-DD) para pruebas (D68). `null` en producción: se ignora con
   * `NODE_ENV=production` (D90).
   */
  fechaReferencia: string | null;
  /** Máximo de filas de una exportación CSV del Auditor (D35, D48, `EXPORTACION_LIMITE_FILAS`). */
  exportacionLimiteFilas: number;
  /** Credencial de servicio a servicio (ADR 0007), cabecera `X-Q360-Servicio-Token`. */
  credencialServicio: string | null;
  /** Habilita `/v1/interno/carga/*`. */
  permitirCargaSemilla: boolean;
}

function requerido(valor: string | undefined, nombre: string): string {
  if (valor === undefined || valor.trim().length === 0) throw errorInterno(`Falta la variable de entorno ${nombre}.`);
  return valor.trim();
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string, minimo = 1): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) throw errorInterno(`${nombre} debe ser un entero >= ${minimo} (valor omitido por seguridad)`);
  return numero;
}

function leerPorcentaje(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) throw errorInterno(`${nombre} debe estar entre 0 y 100 (valor omitido por seguridad)`);
  return numero;
}

function leerBooleano(valor: string | undefined): boolean {
  return valor?.trim().toLowerCase() === 'true';
}

function leerUrl(valor: string | undefined, porDefecto: string, nombre: string): string {
  const crudo = valor === undefined || valor.trim().length === 0 ? porDefecto : valor.trim();
  try {
    const url = new URL(crudo);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo');
  } catch {
    throw errorInterno(`${nombre} no es una URL http(s) válida (valor omitido por seguridad)`);
  }
  return crudo.replace(/\/+$/, '');
}

function leerFechaReferencia(valor: string | undefined, entorno: NodeJS.ProcessEnv): string | null {
  if (entorno.NODE_ENV === 'production') return null;
  if (valor === undefined || valor.trim().length === 0) return null;
  const fecha = valor.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(new Date(`${fecha}T00:00:00Z`).getTime())) {
    throw errorInterno(`Q360_FECHA_REFERENCIA debe ser AAAA-MM-DD (valor omitido por seguridad)`);
  }
  return fecha;
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionImpedimentos {
  return {
    puerto: leerEntero(entorno.PORT, 3003, 'PORT'),
    organizacionUrl: leerUrl(requerido(entorno.ORGANIZACION_URL, 'ORGANIZACION_URL'), '', 'ORGANIZACION_URL'),
    tiempoLimiteOrganizacionMs: leerEntero(entorno.ORGANIZACION_TIMEOUT_MS, 5000, 'ORGANIZACION_TIMEOUT_MS'),
    certificacionesUrl: leerUrl(entorno.CERTIFICACIONES_URL, 'http://localhost:3002', 'CERTIFICACIONES_URL'),
    tiempoLimiteCertificacionesMs: leerEntero(entorno.CERTIFICACIONES_TIMEOUT_MS, 2000, 'CERTIFICACIONES_TIMEOUT_MS'),
    verificador: opcionesDesdeEntorno(entorno),
    riesgo: {
      diasImpedimentoAlto: leerEntero(entorno.RIESGO_DIAS_IMPEDIMENTO_ALTO, 5, 'RIESGO_DIAS_IMPEDIMENTO_ALTO', 0),
      diasSprintAlto: leerEntero(entorno.RIESGO_DIAS_SPRINT_ALTO, 3, 'RIESGO_DIAS_SPRINT_ALTO', 0),
      avanceAlto: leerPorcentaje(entorno.RIESGO_AVANCE_ALTO, 70, 'RIESGO_AVANCE_ALTO'),
      diasSprintMedio: leerEntero(entorno.RIESGO_DIAS_SPRINT_MEDIO, 7, 'RIESGO_DIAS_SPRINT_MEDIO', 0),
      avanceMedio: leerPorcentaje(entorno.RIESGO_AVANCE_MEDIO, 50, 'RIESGO_AVANCE_MEDIO'),
    },
    fechaReferencia: leerFechaReferencia(entorno.Q360_FECHA_REFERENCIA, entorno),
    exportacionLimiteFilas: leerEntero(entorno.EXPORTACION_LIMITE_FILAS, 50_000, 'EXPORTACION_LIMITE_FILAS'),
    credencialServicio: entorno.X_Q360_SERVICIO_TOKEN?.trim().length ? entorno.X_Q360_SERVICIO_TOKEN.trim() : null,
    permitirCargaSemilla: leerBooleano(entorno.PERMITIR_CARGA_SEMILLA),
  };
}
