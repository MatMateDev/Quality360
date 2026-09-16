/**
 * Configuración del servicio. Todo viene del entorno; sin valores por
 * defecto para secretos. Si algo está mal, el proceso no arranca.
 */
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionOrganizacion');

export interface ConfiguracionOrganizacion {
  puerto: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Credencial de servicio a servicio (ADR 0007), cabecera `X-Q360-Servicio-Token`. */
  credencialServicio: string | null;
  /** Habilita `/v1/interno/carga/*`. */
  permitirCargaSemilla: boolean;
  verificador: OpcionesVerificador;
  /** Base de Certificaciones, para `GET /v1/hdu/{id}/checklist` al cerrar una HDU (D11). */
  certificacionesUrl: string;
  certificacionesTimeoutMs: number;
}

function requerido(valor: string | undefined, nombre: string): string {
  if (valor === undefined || valor.trim().length === 0) {
    throw errorInterno(`Falta la variable de entorno ${nombre}.`);
  }
  return valor;
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) {
    throw errorInterno(`${nombre} debe ser un entero >= 1: ${valor}`);
  }
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
    throw errorInterno(`${nombre} no es una URL http(s) válida: ${crudo}`);
  }
  return crudo.replace(/\/+$/, '');
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionOrganizacion {
  return {
    puerto: leerEntero(entorno.PORT, 3001, 'PORT'),
    supabaseUrl: requerido(entorno.SUPABASE_URL, 'SUPABASE_URL'),
    supabaseServiceRoleKey: requerido(entorno.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    credencialServicio: entorno.X_Q360_SERVICIO_TOKEN?.trim().length ? entorno.X_Q360_SERVICIO_TOKEN.trim() : null,
    permitirCargaSemilla: leerBooleano(entorno.PERMITIR_CARGA_SEMILLA),
    verificador: opcionesDesdeEntorno(entorno),
    certificacionesUrl: leerUrl(entorno.CERTIFICACIONES_URL, 'http://localhost:3002', 'CERTIFICACIONES_URL'),
    certificacionesTimeoutMs: leerEntero(entorno.CERTIFICACIONES_TIMEOUT_MS, 2000, 'CERTIFICACIONES_TIMEOUT_MS'),
  };
}
