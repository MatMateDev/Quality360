/** Construcción de la aplicación. La usan `main.ts` y las pruebas. */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { middlewareTraza } from '@quality360/auth-nest';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { ConfiguracionCertificaciones } from './configuracion.js';

export interface OpcionesApp {
  registro?: boolean;
}

export async function crearApp(configuracion: ConfiguracionCertificaciones, opciones: OpcionesApp = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(configuracion), {
    logger: opciones.registro === false ? false : undefined,
    // Por defecto Nest cierra el proceso si falla al crear la app; así el error llega a quien llama.
    abortOnError: false,
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(middlewareTraza);

  await app.init();
  return app;
}
