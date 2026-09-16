/**
 * Último manejador de la pila de Express: atrapa lo que ocurre en los
 * middlewares (por ejemplo, un cuerpo JSON mal formado o demasiado grande),
 * que no pasa por los filtros de Nest, y responde en el formato común.
 */
import { CABECERA_TRAZA, MENSAJES, codigoPorEstado, obtenerTraceId } from '@quality360/auth-nest';
import type { NextFunction, Request, Response } from 'express';

interface ErrorHttp {
  status?: unknown;
  statusCode?: unknown;
}

function estadoDe(error: unknown): number {
  const posible = (error as ErrorHttp | null)?.status ?? (error as ErrorHttp | null)?.statusCode;
  if (typeof posible === 'number' && posible >= 400 && posible <= 599) {
    // 413 y 415 no están en el catálogo del contrato: se tratan como validación.
    return posible === 413 || posible === 415 ? 400 : posible;
  }
  return 500;
}

export function manejadorErrores(
  error: unknown,
  solicitud: Request,
  respuesta: Response,
  siguiente: NextFunction,
): void {
  if (respuesta.headersSent) {
    siguiente(error);
    return;
  }

  const traceId = obtenerTraceId(solicitud as unknown as { headers: Record<string, string | string[] | undefined> });
  const estado = estadoDe(error);
  const codigo = codigoPorEstado(estado);

  respuesta.setHeader(CABECERA_TRAZA, traceId);
  respuesta.status(estado).json({ codigo, mensaje: MENSAJES[codigo], traceId, detalles: [] });
}
