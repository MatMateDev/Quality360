/**
 * Puerto de la frontera con Atlassian para OAuth 2.0 (3LO): canje del `code`, renovación del token y sitios accesibles
 * (D213, D214, ADR 0019). Ninguna operación devuelve texto de Atlassian: el cuerpo de un error nunca se lee y el
 * resultado es una clasificación por estado HTTP.
 */
import type { RecursoAccesible } from '../oauth/sitios.js';
import type { OpcionesLlamada } from './fuente-jira.js';

/**
 * - `DEFINITIVO`: HTTP 400, 401 o 403. En la renovación es `invalid_grant` (90 días, cambio de contraseña, revocación) y
 *   obliga a reconectar; en el canje, el `code` no sirvió.
 * - `LIMITE_DE_TASA`, `TIEMPO_AGOTADO`, `NO_DISPONIBLE` (red o 5xx) y `RESPUESTA_INVALIDA` (2xx con forma inesperada,
 *   redirección u otro estado): pasajeros, no tocan la credencial.
 */
export type FalloAtlassian = 'DEFINITIVO' | 'LIMITE_DE_TASA' | 'TIEMPO_AGOTADO' | 'NO_DISPONIBLE' | 'RESPUESTA_INVALIDA';

export type ResultadoAtlassian<T> = { ok: true; valor: T } | { ok: false; fallo: FalloAtlassian };

/** Lo que entrega `POST /oauth/token`. Los tokens solo viven en memoria durante la petición. */
export interface TokensAtlassian {
  readonly tokenAcceso: string;
  /** Ausente si la app no pidió o no recibió `offline_access` (canje) o si Atlassian no rotó (renovación: se conserva el anterior). */
  readonly tokenRenovacion: string | null;
  /** `expires_in`; `null` si no vino. */
  readonly expiraEnSegundos: number | null;
  /** `scope` separado en permisos; `null` si no vino (se asume lo pedido, RFC 6749 §5.1). */
  readonly scopes: string[] | null;
}

export interface AutorizadorAtlassian {
  /** `grant_type=authorization_code`. Con el Client secret en el cuerpo JSON y la `redirect_uri` del servidor. */
  canjear(codigo: string, o: OpcionesLlamada): Promise<ResultadoAtlassian<TokensAtlassian>>;
  /** `grant_type=refresh_token`. El token de renovación rota: quien llama guarda el nuevo antes de usar el acceso. */
  renovar(tokenRenovacion: string, o: OpcionesLlamada): Promise<ResultadoAtlassian<TokensAtlassian>>;
  /** `GET /oauth/token/accessible-resources` con Bearer. Solo valida la forma; el filtro de sitios es del dominio. */
  sitios(tokenAcceso: string, o: OpcionesLlamada): Promise<ResultadoAtlassian<RecursoAccesible[]>>;
}

export const AUTORIZADOR_ATLASSIAN = Symbol.for('quality360.AutorizadorAtlassian');
