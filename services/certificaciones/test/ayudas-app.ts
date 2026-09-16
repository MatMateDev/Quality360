import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';

import { crearApp } from '../src/crear-app.js';
import type { ConfiguracionCertificaciones } from '../src/configuracion.js';
import { AUDIENCIA, EMISOR, SECRETO } from './ayudas.js';

export function configuracionPrueba(organizacionUrl: string): ConfiguracionCertificaciones {
  return {
    puerto: 0,
    organizacionUrl,
    verificador: resolverOpcionesVerificador({ emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO }),
  };
}

export async function crearAppDePrueba(organizacionUrl: string): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(organizacionUrl), { registro: false });
}
