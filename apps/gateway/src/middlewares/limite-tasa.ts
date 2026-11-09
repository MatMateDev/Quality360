/**
 * Límite de tasa: uno general para `/v1/*` y otro más estricto para las
 * escrituras, que son las rutas sensibles (altas, cambios de rol, supervisión
 * y estados). Responde 429 `DEMASIADAS_SOLICITUDES` con `Retry-After`.
 *
 * La edición de la consulta de Jira (`PATCH /v1/integraciones/jira/consultas/{id}/items`)
 * guarda cada cambio al instante, así que tiene su propio cubo (D152,
 * `maximoConsulta`, misma clave por IP y misma ventana) y no consume el de
 * escritura. La confirmación de una HDU
 * (`POST …/consultas/{id}/items/{itemId}/confirmaciones`, D202 g) comparte ese
 * cubo: confirmar 40 HDU por minuto no debe dar 429. El límite general sí
 * cuenta las dos.
 */
import { CABECERA_TRAZA, MENSAJES, obtenerTraceId } from '@quality360/auth-nest';
import type { Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';

import type { ConfiguracionGateway } from '../configuracion.js';

const METODOS_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function esEscritura(metodo: string): boolean {
  return METODOS_ESCRITURA.has(metodo.toUpperCase());
}

/** `/v1/integraciones/jira/consultas/{id}/items`, con o sin barra final. */
const RUTA_EDICION_CONSULTA = /^\/v1\/integraciones\/jira\/consultas\/[^/]+\/items\/?$/;

/** `/v1/integraciones/jira/consultas/{id}/items/{itemId}/confirmaciones`, con o sin barra final. */
const RUTA_CONFIRMACION_FILA = /^\/v1\/integraciones\/jira\/consultas\/[^/]+\/items\/[^/]+\/confirmaciones\/?$/;

/** `PATCH` de las filas de una consulta (D152). */
export function esEdicionConsulta(solicitud: Pick<Request, 'method' | 'baseUrl' | 'path'>): boolean {
  return solicitud.method.toUpperCase() === 'PATCH' && RUTA_EDICION_CONSULTA.test(`${solicitud.baseUrl}${solicitud.path}`);
}

/** `POST` de la confirmación de una HDU de la consulta (D202 g). */
export function esConfirmacionFila(solicitud: Pick<Request, 'method' | 'baseUrl' | 'path'>): boolean {
  return solicitud.method.toUpperCase() === 'POST' && RUTA_CONFIRMACION_FILA.test(`${solicitud.baseUrl}${solicitud.path}`);
}

/** Rutas que van al cubo de la consulta y no al de escritura (D152, D202 g). */
export function usaCuboConsulta(solicitud: Pick<Request, 'method' | 'baseUrl' | 'path'>): boolean {
  return esEdicionConsulta(solicitud) || esConfirmacionFila(solicitud);
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
  /** `PATCH …/consultas/{id}/items` (D152) y `POST …/items/{itemId}/confirmaciones` (D202 g). */
  consulta: RequestHandler;
}

export function crearLimitadores(configuracion: ConfiguracionGateway): Limitadores {
  const { ventanaMs, maximo, maximoEscritura, maximoConsulta } = configuracion.limiteTasa;

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
      skip: (solicitud) => !esEscritura(solicitud.method) || usaCuboConsulta(solicitud),
      handler: (solicitud, respuesta) => responder429(solicitud, respuesta, ventanaMs),
    }),
    consulta: rateLimit({
      windowMs: ventanaMs,
      limit: maximoConsulta,
      standardHeaders: false,
      legacyHeaders: false,
      skip: (solicitud) => !usaCuboConsulta(solicitud),
      handler: (solicitud, respuesta) => responder429(solicitud, respuesta, ventanaMs),
    }),
  };
}
