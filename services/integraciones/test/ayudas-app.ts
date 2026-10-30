import './entorno.js';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';

import { crearApp } from '../src/crear-app.js';
import type { ConfiguracionIntegraciones } from '../src/configuracion.js';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';
/** Llave de prueba (32 bytes). No es la de ningún entorno. */
export const LLAVE_PRUEBA = Buffer.alloc(32, 7);

export function configuracionPrueba(organizacionUrl: string | null, cambios: Partial<ConfiguracionIntegraciones> = {}): ConfiguracionIntegraciones {
  return {
    puerto: 0,
    organizacionUrl,
    tiempoLimiteOrganizacionMs: 2000,
    llaveCifrado: LLAVE_PRUEBA,
    presupuestoMs: 8000,
    tiempoLimiteJiraMs: 3000,
    esperaMax429Ms: 3000,
    topeIssues: 100,
    enCursoMaxMs: 300_000,
    permitirHostPrueba: true,
    verificador: resolverOpcionesVerificador({ emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO }),
    ...cambios,
  };
}

export async function crearAppDePrueba(
  organizacionUrl: string | null = 'http://127.0.0.1:0',
  cambios: Partial<ConfiguracionIntegraciones> = {},
): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(organizacionUrl, cambios), { registro: false });
}
