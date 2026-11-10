import './entorno.js';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';

import type { ConfiguracionIndicadores } from '../src/configuracion.js';
import { crearApp, type OpcionesApp } from '../src/crear-app.js';

export const EMISOR = 'http://127.0.0.1:54321/auth/v1';
export const AUDIENCIA = 'authenticated';
export const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';

export function configuracionPrueba(cambios: Partial<ConfiguracionIndicadores> = {}): ConfiguracionIndicadores {
  return {
    puerto: 0,
    produccion: false,
    organizacionUrl: 'http://127.0.0.1:0',
    certificacionesUrl: 'http://127.0.0.1:0',
    impedimentosUrl: 'http://127.0.0.1:0',
    fuenteTimeoutMs: 2000,
    snapshotTimeoutMs: 8000,
    cronSecret: null,
    servicioToken: null,
    semillaToken: null,
    permitirCargaSemilla: false,
    umbralDefecto: 5,
    umbralMin: 1,
    umbralMax: 50,
    topeHdu: 1000,
    csvLimiteFilas: 50_000,
    pdfLimiteFilas: 200,
    fechaReferencia: null,
    verificador: resolverOpcionesVerificador({ emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO }),
    ...cambios,
  };
}

export async function crearAppDePrueba(cambios: Partial<ConfiguracionIndicadores> = {}, opciones: OpcionesApp = {}): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(cambios), { registro: false, ...opciones });
}
