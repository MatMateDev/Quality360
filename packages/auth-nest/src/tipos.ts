/**
 * Tipos compartidos de identidad y acceso.
 *
 * D4: el rol vigente y el estado activo NO viajan en el token; los entrega
 * Organización a través de `ResolutorDeAcceso`. Nada de este archivo lee
 * `user_metadata` ni `app_metadata`.
 */

/** Catálogo cerrado de roles (`comun.v1.yaml#/components/schemas/Rol`). */
export type Rol = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA';

export const ROLES: readonly Rol[] = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA'];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/**
 * Identidad probada del token de Supabase. Solo datos de autenticación:
 * quién es y hasta cuándo vale su sesión. Nunca incluye rol ni permisos.
 */
export interface Identidad {
  /** `sub` del token; es el `id` del usuario en Organización. */
  readonly id: string;
  /** `email` del token, en minúsculas, o `null` si el token no lo trae. */
  readonly correo: string | null;
  /** Access token original, para propagarlo a los servicios. */
  readonly token: string;
  /** `exp` en segundos desde epoch. */
  readonly expiraEn: number;
  /** `iss` verificado. */
  readonly emisor: string;
  /** `session_id` del token, útil solo para trazas. */
  readonly sesionId: string | null;
}

/** Ámbito vigente del usuario (`organizacion.v1.yaml#/components/schemas/ResolucionAcceso`). */
export interface AmbitoAcceso {
  /** QE vigente si el rol es `ANALISTA_QA`; si no, `null`. */
  readonly qeSupervisorId: string | null;
  /** Analistas vigentes si el rol es `QE`; si no, vacío. */
  readonly analistasSupervisadosIds: readonly string[];
}

/** Rol vigente, estado y ámbito que resuelve Organización en cada solicitud. */
export interface ResolucionAcceso {
  readonly usuarioId: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly ambito: AmbitoAcceso;
}

/** Contexto de la solicitud que se pasa al resolutor (para trazas y propagación). */
export interface ContextoAcceso {
  readonly traceId: string;
  readonly metodo: string | null;
  readonly ruta: string | null;
}

/**
 * Contrato que cada servicio implementa para autorizar.
 *
 * - Organización lo implementa contra su propia base de datos.
 * - Los demás servicios usan `ResolutorDeAccesoRemoto`, que consulta
 *   `GET /v1/interno/acceso` de Organización. Nunca leen su esquema.
 *
 * Devuelve `null` cuando el usuario autenticado no tiene registro en
 * Organización: el guard responde 403 `ACCESO_DENEGADO`, igual que si
 * estuviera inactivo (D12: mensaje genérico, sin revelar el motivo).
 */
export interface ResolutorDeAcceso {
  resolver(identidad: Identidad, contexto: ContextoAcceso): Promise<ResolucionAcceso | null>;
}

/** Token de inyección del `ResolutorDeAcceso` del servicio. */
export const RESOLUTOR_DE_ACCESO = Symbol.for('quality360.ResolutorDeAcceso');

/** Forma mínima de la solicitud HTTP que usan los guards y la traza. */
export interface SolicitudAutenticada {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  traceId?: string;
  identidad?: Identidad;
  acceso?: ResolucionAcceso;
}

/** Forma mínima de la respuesta HTTP que usa el filtro de errores. */
export interface RespuestaHttp {
  headersSent?: boolean;
  setHeader?(nombre: string, valor: string): unknown;
  status(codigo: number): RespuestaHttp;
  json(cuerpo: unknown): unknown;
}
