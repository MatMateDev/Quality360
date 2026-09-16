/**
 * Límite de tasa: uno general para `/v1/*` y otro más estricto para las
 * escrituras, que son las rutas sensibles (altas, cambios de rol, supervisión
 * y estados). Responde 429 `DEMASIADAS_SOLICITUDES` con `Retry-After`.
 */
import { CABECERA_TRAZA, MENSAJES, obtenerTraceId } from '@quality360/auth-nest';
import type { Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';

import type { ConfiguracionGateway } from '../configuracion.js';

const METODOS_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function esEscritura(metodo: string): boolean {
  return METODOS_ESCRITURA.has(metodo.toUpperCase());
}

function responder429(solicitud: Request, respuesta: Response, ventanaMs: number): void {
  const traceId = obtenerTraceId(solicitud as unknown as { headers: Record<string, string | string[] | undefined> });
  const reinicio = (solicitud as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const segundos =
    reinicio instanceof Date
      ? Math.max(1, Math.ceil((reinicio.getTime() - Date.now()) / 1000))
      : Math.ceil(ventanaMs / 1000);

  respuesta.setHeader('retry-after', String(segundos));
  respuesta.setHeader(CABECERA_TRAZA, traceId);
  respuesta.status(429).json({
    codigo: 'DEMASIADAS_SOLICITUDES',
    mensaje: MENSAJES.DEMASIADAS_SOLICITUDES,
    traceId,
    detalles: [],
  });
}

export interface Limitadores {
  general: RequestHandler;
  escritura: RequestHandler;
}

export function crearLimitadores(configuracion: ConfiguracionGateway): Limitadores {
  const { ventanaMs, maximo, maximoEscritura } = configuracion.limiteTasa;

  return {
    general: rateLimit({
      windowMs: ventanaMs,
      limit: maximo,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (solicitud, respuesta) => responder429(solicitud, respuesta, ventanaMs),
    }),
    escritura: rateLimit({
      windowMs: ventanaMs,
      limit: maximoEscritura,
      standardHeaders: false,
      legacyHeaders: false,
      skip: (solicitud) => !esEscritura(solicitud.method),
      handler: (solicitud, respuesta) => responder429(solicitud, respuesta, ventanaMs),
    }),
  };
}
