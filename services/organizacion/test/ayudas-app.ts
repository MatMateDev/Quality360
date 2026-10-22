import './entorno.js';

import type { NestExpressApplication } from '@nestjs/platform-express';

import { cargarConfiguracion, type ConfiguracionOrganizacion } from '../src/configuracion.js';
import { crearApp } from '../src/crear-app.js';

export async function crearAppDePrueba(sobrescribir: Partial<ConfiguracionOrganizacion> = {}): Promise<NestExpressApplication> {
  return crearApp({ ...cargarConfiguracion(), ...sobrescribir }, { registro: false });
}
