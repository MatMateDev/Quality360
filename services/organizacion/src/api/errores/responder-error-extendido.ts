/**
 * Escribe un error con campos adicionales al esquema común
 * (`ErrorTransicionInvalida`, `ErrorCierreRechazado`,
 * `ErrorRelacionesIncompatibles`). Ver aplicacion/errores-extendidos.ts.
 */
import { CABECERA_TRAZA, MENSAJES, obtenerTraceId, type CodigoError, type SolicitudAutenticada } from '@quality360/auth-nest';
import type { Response } from 'express';

export function responderErrorExtendido(
  respuesta: Response,
  solicitud: SolicitudAutenticada,
  estado: number,
  codigo: CodigoError,
  extra: Record<string, unknown>,
): void {
  const traceId = obtenerTraceId(solicitud);
  respuesta.setHeader(CABECERA_TRAZA, traceId);
  respuesta.status(estado).json({ codigo, mensaje: MENSAJES[codigo], traceId, detalles: [], ...extra });
}
