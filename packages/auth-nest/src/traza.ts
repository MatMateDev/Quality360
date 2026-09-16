/**
 * Traza de la solicitud. Toda respuesta lleva `x-trace-id` y el mismo valor va
 * en `Error.traceId` (convenciones de `comun.v1.yaml`).
 *
 * La traza entrante se acepta solo si tiene una forma segura: evita inyectar
 * saltos de línea en el log o cabeceras a través de un valor del cliente.
 */
import { randomBytes } from 'node:crypto';

export const CABECERA_TRAZA = 'x-trace-id';

const PATRON_TRAZA = /^[A-Za-z0-9._-]{8,128}$/;

/** 32 hexadecimales, igual que los ejemplos del contrato. */
export function generarTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Devuelve la traza entrante si es aceptable; si no, `null`. */
export function normalizarTraceId(valor: unknown): string | null {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim();
  return PATRON_TRAZA.test(limpio) ? limpio : null;
}

interface SolicitudConTraza {
  headers?: Record<string, string | string[] | undefined>;
  traceId?: string;
}

interface RespuestaConCabeceras {
  setHeader?(nombre: string, valor: string): unknown;
}

/** Traza de la solicitud: la del cliente si es válida, o una nueva. */
export function obtenerTraceId(solicitud: SolicitudConTraza | undefined): string {
  if (solicitud && typeof solicitud.traceId === 'string' && solicitud.traceId.length > 0) {
    return solicitud.traceId;
  }
  const traceId = normalizarTraceId(solicitud?.headers?.[CABECERA_TRAZA]) ?? generarTraceId();
  if (solicitud) solicitud.traceId = traceId;
  return traceId;
}

/** Middleware que fija la traza en la solicitud y en la respuesta. */
export function middlewareTraza(
  solicitud: SolicitudConTraza,
  respuesta: RespuestaConCabeceras,
  siguiente: () => void,
): void {
  const traceId = obtenerTraceId(solicitud);
  respuesta.setHeader?.(CABECERA_TRAZA, traceId);
  siguiente();
}
