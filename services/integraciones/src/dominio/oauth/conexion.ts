/**
 * La conexión OAuth con Jira como máquina de estados (D214, D215, D217). Puro: decide qué estado y qué evento
 * corresponde a cada resultado; no habla con Atlassian ni con la base.
 *
 * Estados: `CONECTADA`, `PENDIENTE_SITIO` (varios sitios, falta elegir) y `RECONEXION_NECESARIA` (la renovación falló de
 * forma definitiva: los tokens se borran). «Sin conectar» no es un estado: es la ausencia de la fila.
 */
import type { SecretoCifrado } from '../tipos.js';
import { PERMISO_RENOVAR, PERMISOS_REQUERIDOS, permisosFaltantes } from './permisos.js';
import type { ResultadoSitios, SitioJira } from './sitios.js';

export type EstadoConexionOauth = 'CONECTADA' | 'PENDIENTE_SITIO' | 'RECONEXION_NECESARIA';
export type TipoEventoOauth = 'CONECTAR_OAUTH' | 'RECONECTAR' | 'DESCONECTAR' | 'REFRESCO_FALLIDO';

/** Datos asociados de AES-GCM (D214): un token no se descifra como el otro. */
export const DATO_ASOCIADO_ACCESO = 'q360:jira:oauth:acceso:v1';
export const DATO_ASOCIADO_RENOVACION = 'q360:jira:oauth:renovacion:v1';

/** Si faltan menos de 5 minutos para el vencimiento, se renueva antes de usar el acceso (D214). */
export const UMBRAL_RENOVACION_MS = 5 * 60 * 1000;
/** `expires_in` que se asume si Atlassian no lo trae (una hora) y tope aceptado. */
export const VIDA_ACCESO_POR_DEFECTO_S = 3600;
export const VIDA_ACCESO_MAXIMA_S = 24 * 3600;

export interface PersonaOauth {
  readonly id: string;
  readonly nombre: string;
}

/** La conexión tal como se guarda: los tokens, cifrados. */
export interface ConexionOauth {
  readonly estado: EstadoConexionOauth;
  /** `cloudid` del sitio elegido, en minúsculas. `null` si falta elegir el sitio. */
  readonly cloudId: string | null;
  readonly sitio: SitioJira | null;
  readonly candidatos: SitioJira[] | null;
  readonly cuentaId: string | null;
  readonly cuentaNombre: string | null;
  readonly permisos: string[];
  readonly acceso: SecretoCifrado | null;
  readonly renovacion: SecretoCifrado | null;
  readonly accesoExpiraEn: Date | null;
  readonly renovadoEn: Date | null;
  readonly conectadoPor: PersonaOauth;
  readonly conectadoEn: Date;
  readonly actualizadoEn: Date;
}

export function necesitaRenovar(accesoExpiraEn: Date | null, ahora: Date): boolean {
  return accesoExpiraEn === null || accesoExpiraEn.getTime() - ahora.getTime() < UMBRAL_RENOVACION_MS;
}

/** `expires_in` (segundos) de Atlassian a un vencimiento; ausente o absurdo usa una hora, y nunca más de 24 h. */
export function calcularVencimiento(ahora: Date, expiraEnSegundos: number | null): Date {
  const segundos = expiraEnSegundos !== null && Number.isFinite(expiraEnSegundos) && expiraEnSegundos > 0 ? Math.min(Math.floor(expiraEnSegundos), VIDA_ACCESO_MAXIMA_S) : VIDA_ACCESO_POR_DEFECTO_S;
  return new Date(ahora.getTime() + segundos * 1000);
}

/**
 * Permisos que faltan tras el canje o la renovación (D218). Si la respuesta no trae `scope`, se asume lo pedido (RFC 6749
 * §5.1) y manda la comparación por sitio. Si no trae `refresh_token`, falta `offline_access`.
 */
export function faltantesDelCanje(scopeRespuesta: readonly string[] | null, traeRenovacion: boolean): string[] {
  const concedidos = scopeRespuesta ?? [...PERMISOS_REQUERIDOS];
  const faltan = new Set(permisosFaltantes(concedidos, PERMISOS_REQUERIDOS));
  if (!traeRenovacion) faltan.add(PERMISO_RENOVAR);
  return PERMISOS_REQUERIDOS.filter((p) => faltan.has(p));
}

export type DecisionSitios =
  | { readonly tipo: 'CONECTAR'; readonly sitio: SitioJira }
  | { readonly tipo: 'ELEGIR_SITIO'; readonly candidatos: SitioJira[] }
  | { readonly tipo: 'SIN_SITIO' }
  | { readonly tipo: 'PERMISOS_INSUFICIENTES'; readonly faltantes: string[] };

/** Un sitio: se conecta. Varios: queda pendiente; el ya configurado se marca `actual` al mostrarlos, sin elegirse solo (D212). */
export function decidirSitios(resultado: ResultadoSitios): DecisionSitios {
  if (resultado.tipo === 'SIN_SITIO') return { tipo: 'SIN_SITIO' };
  if (resultado.tipo === 'PERMISOS_INSUFICIENTES') return { tipo: 'PERMISOS_INSUFICIENTES', faltantes: resultado.faltantes };
  const [unico] = resultado.sitios;
  if (resultado.sitios.length === 1 && unico !== undefined) return { tipo: 'CONECTAR', sitio: unico };
  return { tipo: 'ELEGIR_SITIO', candidatos: resultado.sitios };
}

/** `CONECTAR_OAUTH` es la primera conexión registrada; las siguientes, `RECONECTAR` (D217). */
export function eventoDeConexion(hayConexionRegistrada: boolean): 'CONECTAR_OAUTH' | 'RECONECTAR' {
  return hayConexionRegistrada ? 'RECONECTAR' : 'CONECTAR_OAUTH';
}

export interface TransicionPorFallo {
  readonly estado: 'RECONEXION_NECESARIA';
  /** `REFRESCO_FALLIDO` se registra una sola vez, en la transición desde `CONECTADA` (D215). */
  readonly registrarEvento: boolean;
}

/** Un fallo definitivo de la renovación (HTTP 400, 401 o 403 del endpoint de token) borra los tokens (D215). */
export function transicionPorFalloDefinitivo(estadoActual: EstadoConexionOauth): TransicionPorFallo {
  return { estado: 'RECONEXION_NECESARIA', registrarEvento: estadoActual === 'CONECTADA' };
}

/** Códigos de error de una operación que usa la conexión, según su estado, antes de llamar a nadie (D215). */
export type ObstaculoDeConexion = 'SIN_CONEXION' | 'PENDIENTE_SITIO' | 'RECONEXION_NECESARIA' | null;

export function obstaculoDeConexion(conexion: Pick<ConexionOauth, 'estado'> | null): ObstaculoDeConexion {
  if (conexion === null) return 'SIN_CONEXION';
  if (conexion.estado === 'PENDIENTE_SITIO') return 'PENDIENTE_SITIO';
  if (conexion.estado === 'RECONEXION_NECESARIA') return 'RECONEXION_NECESARIA';
  return null;
}
