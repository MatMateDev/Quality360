/**
 * Construcción de la aplicación. La usan `main.ts` y las pruebas, así que lo
 * que se prueba es exactamente lo que se despliega. Sin CORS: solo el
 * gateway (u otro servicio interno) llama a Organización, nunca el navegador.
 */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { middlewareTraza } from '@quality360/auth-nest';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { ConfiguracionOrganizacion } from './configuracion.js';
import { crearPipeValidacion } from './api/validacion/pipe-validacion.js';

export interface OpcionesApp {
  /** `false` apaga el logger; las pruebas lo usan. */
  registro?: boolean;
}

export async function crearApp(configuracion: ConfiguracionOrganizacion, opciones: OpcionesApp = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(configuracion), {
    logger: opciones.registro === false ? false : undefined,
    // Por defecto Nest cierra el proceso si falla al crear la app; así el error llega a quien llama.
    abortOnError: false,
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(middlewareTraza);
  app.useGlobalPipes(crearPipeValidacion());

  await app.init();
  return app;
}
