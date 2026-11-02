/**
 * Internos de E5 (`/v1/interno/integraciones/*`): solo un Administrador activo con su propio token de
 * sesión (D100, E5-B03-T13). La credencial de servicio (`X-Q360-Servicio-Token`) NO sirve aquí aunque
 * `PERMITIR_CARGA_SEMILLA` sea `true`: con ella y sin sesión la respuesta es 403; sin ninguna, 401.
 * La ruta va marcada `@Publico()` para que este guard reemplace al de acceso global.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import {
  accesoDenegado,
  extraerTokenBearer,
  noAutenticado,
  obtenerTraceId,
  VerificadorTokenSupabase,
} from '@quality360/auth-nest';

import { ResolutorAccesoOrganizacion } from '../../infraestructura/seguridad/resolutor-acceso.servicio.js';
import type { SolicitudConActor } from './sesion-o-servicio.guard.js';

@Injectable()
export class AdministradorConSesionGuard implements CanActivate {
  constructor(
    private readonly verificador: VerificadorTokenSupabase,
    private readonly resolutor: ResolutorAccesoOrganizacion,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConActor>();

    const token = extraerTokenBearer(solicitud.headers.authorization);
    if (token === null) {
      if (solicitud.headers['x-q360-servicio-token'] !== undefined) throw accesoDenegado('la credencial de servicio no sirve en los internos de E5');
      throw noAutenticado('sin cabecera Authorization Bearer');
    }

    solicitud.identidad = await this.verificador.verificar(token);
    const acceso = await this.resolutor.resolver(solicitud.identidad, {
      traceId: obtenerTraceId(solicitud),
      metodo: solicitud.method ?? null,
      ruta: solicitud.originalUrl ?? solicitud.url ?? null,
    });
    if (acceso === null || !acceso.activo) throw accesoDenegado('usuario inactivo o sin registro en Organización');
    if (acceso.rol !== 'ADMINISTRADOR') throw accesoDenegado(`rol ${acceso.rol} no permitido en los internos de E5`);
    solicitud.acceso = acceso;
    return true;
  }
}
