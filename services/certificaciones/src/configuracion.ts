/** Configuración del servicio. Todo viene del entorno; sin valores por defecto para secretos. */
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionCertificaciones');

export interface ConfiguracionCertificaciones {
  puerto: number;
  organizacionUrl: string;
  tiempoLimiteOrganizacionMs: number;
  /** Supabase Storage para evidencias y certificados (D20). */
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Base pública del portal, para el enlace de verificación impreso en el certificado (D21). */
  portalUrl: string;
  verificador: OpcionesVerificador;
  /** Máximo de filas de una exportación CSV del Auditor (D35, D48, `EXPORTACION_LIMITE_FILAS`). */
  exportacionLimiteFilas: number;
}

function requerido(valor: string | undefined, nombre: string): string {
  if (valor === undefined || valor.trim().length === 0) throw errorInterno(`Falta la variable de entorno ${nombre}.`);
  return valor.trim();
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw errorInterno(`${nombre} debe ser un entero >= 1 (valor omitido por seguridad)`);
  return numero;
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

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionCertificaciones {
  return {
    puerto: leerEntero(entorno.PORT, 3002, 'PORT'),
    organizacionUrl: requerido(entorno.ORGANIZACION_URL, 'ORGANIZACION_URL'),
    tiempoLimiteOrganizacionMs: leerEntero(entorno.ORGANIZACION_TIMEOUT_MS, 5000, 'ORGANIZACION_TIMEOUT_MS'),
    supabaseUrl: leerUrl(requerido(entorno.SUPABASE_URL, 'SUPABASE_URL'), '', 'SUPABASE_URL'),
    supabaseServiceRoleKey: requerido(entorno.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    portalUrl: leerUrl(entorno.PORTAL_URL, 'http://localhost:5173', 'PORTAL_URL'),
    verificador: opcionesDesdeEntorno(entorno),
    exportacionLimiteFilas: leerEntero(entorno.EXPORTACION_LIMITE_FILAS, 50_000, 'EXPORTACION_LIMITE_FILAS'),
  };
}
