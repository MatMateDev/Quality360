import './entorno.js';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';

import { crearApp } from '../src/crear-app.js';
import type { ConfiguracionImpedimentos } from '../src/configuracion.js';

const EMISOR = 'http://127.0.0.1:54321/auth/v1';
const AUDIENCIA = 'authenticated';
const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';

export function configuracionPrueba(organizacionUrl: string): ConfiguracionImpedimentos {
  return {
    puerto: 0,
    organizacionUrl,
    verificador: resolverOpcionesVerificador({ emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO }),
  };
}

export async function crearAppDePrueba(organizacionUrl = 'http://127.0.0.1:0'): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(organizacionUrl), { registro: false });
}
