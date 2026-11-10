/**
 * Guard de `GET /v1/interno/indicadores/snapshot` (E6, D177). La ruta se marca `@Publico()`: no acepta sesión de
 * usuario, solo la cabecera `X-Q360-Servicio-Token` comparada en tiempo constante con `INDICADORES_SERVICIO_TOKEN`
 * (distinta del token de la semilla). Sin la variable configurada, la cabecera ausente o un valor distinto: 401.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { noAutenticado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';
import { compararSeguro } from '../../infraestructura/seguridad/comparar-seguro.js';
import type { SolicitudConActor } from './sesion-o-servicio.guard.js';

const CABECERA_SERVICIO = 'x-q360-servicio-token';

@Injectable()
export class IndicadoresServicioGuard implements CanActivate {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConActor>();
    const cabecera = solicitud.headers[CABECERA_SERVICIO];
    const token = Array.isArray(cabecera) ? cabecera[0] : cabecera;
    const esperado = this.configuracion.indicadoresServicioToken;
    if (esperado === null || typeof token !== 'string' || !compararSeguro(token, esperado)) {
      throw noAutenticado('credencial de Indicadores ausente o inválida');
    }
    solicitud.actorServicio = true;
    return true;
  }
}
