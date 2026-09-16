import type { NestExpressApplication } from '@nestjs/platform-express';

import { cargarConfiguracion } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';

export async function crearAppDePrueba(): Promise<NestExpressApplication> {
  return crearApp(cargarConfiguracion(), { registro: false });
}
