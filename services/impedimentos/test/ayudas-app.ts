import './entorno.js';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';

import { crearApp } from '../src/crear-app.js';
import type { ConfiguracionImpedimentos } from '../src/configuracion.js';

const EMISOR = 'http://127.0.0.1:54321/auth/v1';
const AUDIENCIA = 'authenticated';
const SECRETO = 'secreto-hs256-solo-para-pruebas-locales-0000';

export function configuracionPrueba(organizacionUrl: string, cambios: Partial<ConfiguracionImpedimentos> = {}): ConfiguracionImpedimentos {
  return {
    puerto: 0,
    organizacionUrl,
    tiempoLimiteOrganizacionMs: 2000,
    certificacionesUrl: 'http://127.0.0.1:1',
    tiempoLimiteCertificacionesMs: 1000,
    verificador: resolverOpcionesVerificador({ emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO }),
    riesgo: { diasImpedimentoAlto: 5, diasSprintAlto: 3, avanceAlto: 70, diasSprintMedio: 7, avanceMedio: 50 },
    fechaReferencia: null,
    exportacionLimiteFilas: 50_000,
    credencialServicio: 'token-servicio-local-de-pruebas-0123456789',
    permitirCargaSemilla: true,
    ...cambios,
  };
}

export async function crearAppDePrueba(
  organizacionUrl = 'http://127.0.0.1:0',
  cambios: Partial<ConfiguracionImpedimentos> = {},
): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(organizacionUrl, cambios), { registro: false });
}
