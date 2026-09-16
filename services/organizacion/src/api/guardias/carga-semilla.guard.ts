/**
 * Guard de `/v1/interno/carga/*` (SERVICIO, ADR 0007). Reemplaza a los
 * guards globales de sesión (la ruta se marca `@Publico()`): solo acepta la
 * cabecera `X-Q360-Servicio-Token`, y solo si `PERMITIR_CARGA_SEMILLA` es
 * `true`. Cualquier otro caso (deshabilitada, sin cabecera, token
 * incorrecto) responde 404, como si la ruta no existiera — nunca debe ser
 * alcanzable desde el navegador ni revelar que existe.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { noEncontrado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';
import { compararSeguro } from '../../infraestructura/seguridad/comparar-seguro.js';
import type { SolicitudConActor } from './sesion-o-servicio.guard.js';

const CABECERA_SERVICIO = 'x-q360-servicio-token';

@Injectable()
export class CargaSemillaGuard implements CanActivate {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;
    if (this.configuracion.permitirCargaSemilla !== true) throw noEncontrado('carga semilla deshabilitada (PERMITIR_CARGA_SEMILLA)');

    const solicitud = contexto.switchToHttp().getRequest<SolicitudConActor>();
    const cabecera = solicitud.headers[CABECERA_SERVICIO];
    const token = Array.isArray(cabecera) ? cabecera[0] : cabecera;
    if (this.configuracion.credencialServicio === null || typeof token !== 'string' || !compararSeguro(token, this.configuracion.credencialServicio)) {
      throw noEncontrado('credencial de servicio ausente o inválida');
    }

    solicitud.actorServicio = true;
    return true;
  }
}
