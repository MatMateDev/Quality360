/**
 * Armado de la dirección de autorización de Atlassian (D210, D211). Puro: la aleatoriedad y el hash del `state`
 * (`node:crypto`) viven en la aplicación. La `redirect_uri` la pone el servidor; el cliente no la manda.
 */
import { PERMISOS_REQUERIDOS } from './permisos.js';

/** Vigencia del `state`: 10 minutos (D211). */
export const VIGENCIA_ESTADO_MS = 10 * 60 * 1000;
/** Los estados de más de 1 día se purgan en `oauth/iniciar` (D211). */
export const RETENCION_ESTADO_MS = 24 * 60 * 60 * 1000;
export const BYTES_ESTADO = 32;
/** 32 bytes en base64url, sin relleno. Otro formato es un `state` inválido sin tocar la base. */
export const PATRON_ESTADO = /^[A-Za-z0-9_-]{43}$/;

export interface ParametrosAutorizacion {
  /** Base de `/authorize` (fija, o la de prueba con la bandera). */
  readonly base: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly permisos?: readonly string[];
}

/**
 * `<base>/authorize?audience=api.atlassian.com&client_id=…&scope=read%3Ajira-work%20…&redirect_uri=…&state=…&response_type=code&prompt=consent`.
 * Se codifica con `encodeURIComponent` (el espacio de `scope` es `%20`, como en el contrato).
 */
export function armarUrlAutorizacion(p: ParametrosAutorizacion): string {
  const codificar = encodeURIComponent;
  const permisos = (p.permisos ?? PERMISOS_REQUERIDOS).join(' ');
  const consulta = [
    ['audience', 'api.atlassian.com'],
    ['client_id', p.clientId],
    ['scope', permisos],
    ['redirect_uri', p.redirectUri],
    ['state', p.state],
    ['response_type', 'code'],
    ['prompt', 'consent'],
  ]
    .map(([clave, valor]) => `${clave}=${codificar(valor as string)}`)
    .join('&');
  return `${p.base}/authorize?${consulta}`;
}
