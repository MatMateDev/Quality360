/** Construcción de la aplicación. La usan `main.ts`, `api/index.mjs` y las pruebas. */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CABECERA_TRAZA, MENSAJES, middlewareTraza, obtenerTraceId } from '@quality360/auth-nest';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { AppModule, type ExtensionesApp } from './app.module.js';
import type { ConfiguracionIndicadores } from './configuracion.js';

export interface OpcionesApp {
  registro?: boolean;
  /** Reemplazos de la frontera con el tiempo (pruebas). */
  extensiones?: ExtensionesApp;
}

export async function crearApp(configuracion: ConfiguracionIndicadores, opciones: OpcionesApp = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(configuracion, opciones.extensiones), {
    logger: opciones.registro === false ? false : undefined,
    // Por defecto Nest cierra el proceso si falla al crear la app; así el error llega a quien llama.
    abortOnError: false,
    bodyParser: false,
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(middlewareTraza);

  // Sin ORGANIZACION_URL en producción solo `/health` responde: sin ámbito no hay nada que mostrar.
  if (configuracion.organizacionUrl === null) {
    app.use((solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
      if (!solicitud.path.startsWith('/v1/')) return siguiente();
      const traceId = obtenerTraceId(solicitud as never);
      respuesta.setHeader(CABECERA_TRAZA, traceId);
      respuesta.status(503).json({ codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: MENSAJES.SERVICIO_NO_DISPONIBLE, traceId, detalles: [] });
    });
  }

  app.use(json());
  // Errores del analizador del cuerpo (antes de llegar a Nest): demasiado grande o JSON mal formado.
  app.use((error: { type?: string }, solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
    if (error?.type !== 'entity.too.large' && error?.type !== 'entity.parse.failed') return siguiente(error);
    const traceId = obtenerTraceId(solicitud as never);
    respuesta.setHeader(CABECERA_TRAZA, traceId);
    respuesta.status(error.type === 'entity.too.large' ? 413 : 400).json({
      codigo: 'VALIDACION',
      mensaje: MENSAJES.VALIDACION,
      traceId,
      detalles: [{ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: error.type === 'entity.too.large' ? 'El cuerpo es demasiado grande.' : 'El cuerpo no es un JSON válido.' }],
    });
  });

  await app.init();
  return app;
}
