/**
 * Guard para rutas que aceptan `sesionSupabase` O `credencialServicio`
 * (`PUT /v1/analistas/{id}/supervisor`, `PUT /v1/hdu/{id}/analista`,
 * `POST /v1/hdu/{id}/estado`). Reemplaza a `IdentidadGuard`+`AccesoGuard`
 * SOLO en las rutas marcadas `@Publico()` + `@PermiteServicio()`: el token de
 * servicio nunca debe poder saltarse la verificación de sesión en el resto.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  accesoDenegado,
  extraerTokenBearer,
  noAutenticado,
  obtenerTraceId,
  rolesPermitidos,
  VerificadorTokenSupabase,
  type SolicitudAutenticada,
} from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';
import { compararSeguro } from '../../infraestructura/seguridad/comparar-seguro.js';
import { ResolutorAccesoOrganizacion } from '../../infraestructura/seguridad/resolutor-acceso.servicio.js';
import { PERMITE_SERVICIO } from '../decoradores/permite-servicio.decorator.js';

const CABECERA_SERVICIO = 'x-q360-servicio-token';

export type SolicitudConActor = SolicitudAutenticada & {
  actorServicio?: boolean;
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
};

@Injectable()
export class SesionOServicioGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorTokenSupabase,
    private readonly resolutor: ResolutorAccesoOrganizacion,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConActor>();

    const permiteServicio = this.reflector.getAllAndOverride<boolean>(PERMITE_SERVICIO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]) === true;
    const cabeceraServicio = solicitud.headers[CABECERA_SERVICIO];
    const tokenServicio = Array.isArray(cabeceraServicio) ? cabeceraServicio[0] : cabeceraServicio;

    if (permiteServicio && typeof tokenServicio === 'string' && tokenServicio.length > 0) {
      if (this.configuracion.credencialServicio === null || !compararSeguro(tokenServicio, this.configuracion.credencialServicio)) {
        throw accesoDenegado('credencial de servicio inválida');
      }
      solicitud.actorServicio = true;
      return true;
    }

    const token = extraerTokenBearer(solicitud.headers.authorization);
    if (token === null) throw noAutenticado('sin cabecera Authorization Bearer ni credencial de servicio');

    solicitud.identidad = await this.verificador.verificar(token);
    const contextoAcceso = {
      traceId: obtenerTraceId(solicitud),
      metodo: solicitud.method ?? null,
      ruta: solicitud.originalUrl ?? solicitud.url ?? null,
    };
    const acceso = await this.resolutor.resolver(solicitud.identidad, contextoAcceso);
    if (acceso === null || !acceso.activo) throw accesoDenegado('usuario inactivo o sin registro en Organización');

    const permitidos = rolesPermitidos(this.reflector, contexto);
    if (permitidos.length > 0 && !permitidos.includes(acceso.rol)) throw accesoDenegado(`rol ${acceso.rol} no permitido`);

    solicitud.acceso = acceso;
    return true;
  }
}
