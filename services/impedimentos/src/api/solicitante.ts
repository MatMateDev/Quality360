/** Arma el `Solicitante` de la aplicación a partir de la identidad y la resolución de acceso de la solicitud. */
import { noAutenticado, obtenerTraceId, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import type { Solicitante } from '../aplicacion/autorizador.js';

export function solicitanteDe(identidad: Identidad | undefined, acceso: ResolucionAcceso | undefined, solicitud: Request): Solicitante {
  if (identidad === undefined || acceso === undefined) throw noAutenticado('ruta sin identidad verificada');
  return {
    usuarioId: acceso.usuarioId,
    rol: acceso.rol,
    celulasIds: acceso.ambito.celulasIds,
    contexto: { token: identidad.token, traceId: obtenerTraceId(solicitud as never) },
  };
}
