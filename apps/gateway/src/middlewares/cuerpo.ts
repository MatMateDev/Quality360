/**
 * Lectura del cuerpo JSON (reemplaza la de Nest, que se apaga en `crear-app.ts`).
 *
 * - `/v1/integraciones/archivos/*` admite hasta 1,5 MB (D127): el archivo de
 *   hasta 1 MB viaja como texto dentro del JSON. Si lo supera, 413
 *   `ARCHIVO_MUY_GRANDE` con la forma de `ErrorArchivo` (`ejecucionId: null`,
 *   `columnasFaltantes: []`), sin llegar a Integraciones.
 * - El resto conserva el límite por defecto de Express (100 KB), igual que antes
 *   de E5; un cuerpo mayor sigue respondiendo 400 en `errores-express.ts`.
 */
import { CABECERA_TRAZA, obtenerTraceId } from '@quality360/auth-nest';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

export const RUTA_ARCHIVOS = '/v1/integraciones/archivos';
/** 1,5 MB en bytes (1,5 × 1024 × 1024). */
export const LIMITE_CUERPO_ARCHIVOS_BYTES = 1_572_864;

const MENSAJE_ARCHIVO_MUY_GRANDE = 'El archivo supera el máximo de 1 MB.';

/** Lector de JSON de `archivos/*`, con su límite propio. */
export function lectorCuerpoArchivos(): RequestHandler {
  return express.json({ limit: LIMITE_CUERPO_ARCHIVOS_BYTES });
}

/** Convierte el «demasiado grande» del lector de `archivos/*` en 413 `ARCHIVO_MUY_GRANDE`. */
export const archivoMuyGrande: ErrorRequestHandler = (
  error: unknown,
  solicitud: Request,
  respuesta: Response,
  siguiente: NextFunction,
) => {
  const tipo = (error as { type?: unknown } | null)?.type;
  if (tipo !== 'entity.too.large' || respuesta.headersSent) {
    siguiente(error);
    return;
  }
  const traceId = obtenerTraceId(solicitud as unknown as { headers: Record<string, string | string[] | undefined> });
  respuesta.setHeader(CABECERA_TRAZA, traceId);
  respuesta.status(413).json({
    codigo: 'ARCHIVO_MUY_GRANDE',
    mensaje: MENSAJE_ARCHIVO_MUY_GRANDE,
    traceId,
    detalles: [],
    ejecucionId: null,
    columnasFaltantes: [],
  });
};

/** Lectores por defecto (los mismos que registra Nest): JSON y formulario, 100 KB. */
export function lectoresCuerpoGenerales(): RequestHandler[] {
  return [express.json(), express.urlencoded({ extended: true })];
}
