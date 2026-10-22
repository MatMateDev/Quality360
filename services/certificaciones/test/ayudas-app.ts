import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolverOpcionesVerificador } from '@quality360/auth-nest';

import { crearApp } from '../src/crear-app.js';
import type { ConfiguracionCertificaciones } from '../src/configuracion.js';
import { ALMACEN_ARCHIVOS } from '../src/infraestructura/almacen.js';
import { AlmacenEnMemoria, AUDIENCIA, EMISOR, SECRETO } from './ayudas.js';

export function configuracionPrueba(organizacionUrl: string): ConfiguracionCertificaciones {
  return {
    puerto: 0,
    organizacionUrl,
    tiempoLimiteOrganizacionMs: 2000,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseServiceRoleKey: 'clave-de-servicio-falsa-para-pruebas',
    portalUrl: 'http://localhost:5173',
    verificador: resolverOpcionesVerificador({ emisor: EMISOR, audiencia: AUDIENCIA, secretoHs256: SECRETO }),
    exportacionLimiteFilas: 50_000,
  };
}

export async function crearAppDePrueba(
  organizacionUrl: string,
  almacen: AlmacenEnMemoria = new AlmacenEnMemoria(),
): Promise<NestExpressApplication> {
  return crearApp(configuracionPrueba(organizacionUrl), {
    registro: false,
    almacen: { provide: ALMACEN_ARCHIVOS, useValue: almacen },
  });
}
