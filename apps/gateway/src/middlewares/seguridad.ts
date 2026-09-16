/**
 * Middlewares de seguridad del borde.
 */
import type { NextFunction, Request, Response } from 'express';

/**
 * Credencial de servicio a servicio (Integraciones → Organización). El
 * gateway la **elimina** de toda solicitud que llegue desde afuera: nadie
 * puede pasar por servicio desde el navegador. Tampoco se agrega nunca en el
 * reenvío, que arma sus cabeceras con lista blanca.
 */
export const CABECERA_SERVICIO = 'x-q360-servicio-token';

export function quitarCabeceraServicio(solicitud: Request, _respuesta: Response, siguiente: NextFunction): void {
  for (const nombre of Object.keys(solicitud.headers)) {
    if (nombre.toLowerCase() === CABECERA_SERVICIO) {
      delete solicitud.headers[nombre];
    }
  }
  siguiente();
}

/** Datos de sesión: nunca se cachean (E1-B06#3). */
export function sinCache(_solicitud: Request, respuesta: Response, siguiente: NextFunction): void {
  respuesta.setHeader('cache-control', 'no-store');
  siguiente();
}
