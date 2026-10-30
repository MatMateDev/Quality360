/** Construcción de la aplicación. La usan `main.ts`, `api/index.mjs` y las pruebas. */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CABECERA_TRAZA, MENSAJES, middlewareTraza, obtenerTraceId } from '@quality360/auth-nest';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { AppModule, type ExtensionesApp } from './app.module.js';
import type { ConfiguracionIntegraciones } from './configuracion.js';

export interface OpcionesApp {
  registro?: boolean;
  /** Reemplazos de la frontera con Jira y archivos (pruebas o integración con q360-integraciones). */
  extensiones?: ExtensionesApp;
}

/** Cuerpo JSON de 1,5 MB solo para archivos (D102, D127); el resto conserva el valor por defecto. */
const RUTA_ARCHIVOS = '/v1/integraciones/archivos';
const LIMITE_ARCHIVOS = '1.5mb';

export async function crearApp(configuracion: ConfiguracionIntegraciones, opciones: OpcionesApp = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(configuracion, opciones.extensiones), {
    logger: opciones.registro === false ? false : undefined,
    // Por defecto Nest cierra el proceso si falla al crear la app; así el error llega a quien llama.
    abortOnError: false,
    bodyParser: false,
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(middlewareTraza);

  // Sin ORGANIZACION_URL en producción solo `/health` responde (D128).
  if (configuracion.organizacionUrl === null) {
    app.use((solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
      if (!solicitud.path.startsWith('/v1/')) return siguiente();
      const traceId = obtenerTraceId(solicitud as never);
      respuesta.setHeader(CABECERA_TRAZA, traceId);
      respuesta.status(503).json({ codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: MENSAJES.SERVICIO_NO_DISPONIBLE, traceId, detalles: [] });
    });
  }

  app.use(RUTA_ARCHIVOS, json({ limit: LIMITE_ARCHIVOS }));
  app.use(json());
  // Errores del analizador del cuerpo (antes de llegar a Nest): demasiado grande o JSON mal formado.
  app.use((error: { type?: string }, solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
    if (error?.type !== 'entity.too.large' && error?.type !== 'entity.parse.failed') return siguiente(error);
    const traceId = obtenerTraceId(solicitud as never);
    respuesta.setHeader(CABECERA_TRAZA, traceId);
    if (error.type === 'entity.too.large' && solicitud.path.startsWith(RUTA_ARCHIVOS)) {
      respuesta.status(413).json({ codigo: 'ARCHIVO_MUY_GRANDE', mensaje: MENSAJES.ARCHIVO_MUY_GRANDE, traceId, detalles: [], ejecucionId: null, columnasFaltantes: [] });
      return;
    }
    respuesta.status(error.type === 'entity.too.large' ? 413 : 400).json({ codigo: 'VALIDACION', mensaje: MENSAJES.VALIDACION, traceId, detalles: [{ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: error.type === 'entity.too.large' ? 'El cuerpo es demasiado grande.' : 'El cuerpo no es un JSON válido.' }] });
  });

  await app.init();
  return app;
}
