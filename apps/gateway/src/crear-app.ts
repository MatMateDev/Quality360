/**
 * Construcción de la aplicación. La usan `main.ts` y las pruebas, así que lo
 * que se prueba es exactamente lo que se despliega.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { middlewareTraza } from '@quality360/auth-nest';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { ConfiguracionGateway } from './configuracion.js';
import { RUTA_ARCHIVOS, archivoMuyGrande, lectorCuerpoArchivos, lectoresCuerpoGenerales } from './middlewares/cuerpo.js';
import { manejadorErrores } from './middlewares/errores-express.js';
import { crearLimitadores } from './middlewares/limite-tasa.js';
import { quitarCabeceraServicio, sinCache } from './middlewares/seguridad.js';

export interface OpcionesApp {
  /** `false` apaga el logger; las pruebas lo usan. */
  registro?: boolean;
}

export async function crearApp(
  configuracion: ConfiguracionGateway,
  opciones: OpcionesApp = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(configuracion), {
    logger: opciones.registro === false ? false : undefined,
    // Por defecto Nest cierra el proceso si falla al crear la app; así el error llega a quien llama.
    abortOnError: false,
    // El cuerpo se lee abajo, con un límite propio para archivos/* (D127).
    bodyParser: false,
  });

  // Servicios opcionales sin URL (D127, D129): se dice una sola vez, sin el valor.
  if (opciones.registro !== false) {
    const registro = new Logger('Configuracion');
    for (const aviso of configuracion.avisos) registro.warn(`${aviso}: sus rutas responderán 503`);
  }

  app.disable('x-powered-by');
  if (configuracion.confiarProxy > 0) app.set('trust proxy', configuracion.confiarProxy);

  // Cabeceras de seguridad, traza y no-cache antes que cualquier ruta.
  app.use(helmet());
  app.use(middlewareTraza);
  app.use(sinCache);
  // La credencial de servicio se descarta apenas entra.
  app.use(quitarCabeceraServicio);

  app.enableCors({
    origin: configuracion.origenesPortal,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-trace-id'],
    exposedHeaders: ['x-trace-id', 'retry-after'],
    credentials: false,
    maxAge: 600,
  });

  const limitadores = crearLimitadores(configuracion);
  app.use('/v1', limitadores.general);
  app.use('/v1', limitadores.escritura);

  // Cuerpo: 1,5 MB solo en /v1/integraciones/archivos/* (413 ARCHIVO_MUY_GRANDE);
  // el resto, el límite por defecto. Va después del límite de tasa.
  app.use(RUTA_ARCHIVOS, lectorCuerpoArchivos(), archivoMuyGrande);
  for (const lector of lectoresCuerpoGenerales()) app.use(lector);
  // Los errores de lectura (JSON mal formado, cuerpo demasiado grande) se responden
  // aquí: si llegaran a la capa de excepciones de Nest, un 413 saldría como 500.
  app.use(manejadorErrores);

  // init() registra las rutas; el manejador de errores va después para quedar
  // al final de la pila de Express.
  await app.init();
  app.use(manejadorErrores);

  return app;
}
