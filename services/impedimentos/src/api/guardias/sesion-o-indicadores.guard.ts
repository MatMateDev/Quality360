/**
 * Guard de la única ruta de este servicio que acepta `sesionSupabase` O `credencialIndicadores`
 * (`POST /v1/interno/impedimentos/evaluacion`, E6, D177). Reemplaza a `IdentidadGuard` y `AccesoGuard` SOLO en la ruta
 * marcada `@Publico()` + `@UseGuards(SesionOIndicadoresGuard)`: la credencial nunca puede saltarse la sesión en otra ruta.
 *
 * - Con la cabecera `X-Q360-Servicio-Token`: se compara en tiempo constante con `INDICADORES_SERVICIO_TOKEN`; sin la
 *   variable configurada, o con otro valor, 401. Es lectura global: no hay usuario ni ámbito.
 * - Sin la cabecera: sesión de usuario con el rol resuelto por Organización, igual que el resto.
 *
 * La guardia se copia en cada servicio (Certificaciones, Impedimentos): no se comparte código entre servicios.
 */
import { timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  RESOLUTOR_DE_ACCESO,
  VerificadorTokenSupabase,
  accesoDenegado,
  errorInterno,
  extraerTokenBearer,
  noAutenticado,
  obtenerTraceId,
  rolesPermitidos,
  type ResolutorDeAcceso,
  type SolicitudAutenticada,
} from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionImpedimentos } from '../../configuracion.js';

const CABECERA_SERVICIO = 'x-q360-servicio-token';

export type SolicitudConCredencial = SolicitudAutenticada & { servicioIndicadores?: boolean };

function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

@Injectable()
export class SesionOIndicadoresGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorTokenSupabase,
    private readonly moduleRef: ModuleRef,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionImpedimentos,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConCredencial>();

    const cabecera = solicitud.headers?.[CABECERA_SERVICIO];
    const tokenServicio = Array.isArray(cabecera) ? cabecera[0] : cabecera;
    if (typeof tokenServicio === 'string' && tokenServicio.length > 0) {
      const esperado = this.configuracion.indicadoresServicioToken;
      if (esperado === null || !compararSeguro(tokenServicio, esperado)) throw noAutenticado('credencial de Indicadores inválida');
      solicitud.servicioIndicadores = true;
      return true;
    }

    const token = extraerTokenBearer(solicitud.headers?.authorization);
    if (token === null) throw noAutenticado('sin cabecera Authorization Bearer ni credencial de Indicadores');
    solicitud.identidad = await this.verificador.verificar(token);

    let resolutor: ResolutorDeAcceso | undefined;
    try {
      resolutor = this.moduleRef.get<ResolutorDeAcceso>(RESOLUTOR_DE_ACCESO, { strict: false });
    } catch {
      resolutor = undefined;
    }
    if (resolutor === undefined) throw errorInterno('No hay ResolutorDeAcceso registrado con el token RESOLUTOR_DE_ACCESO.');

    const acceso = await resolutor.resolver(solicitud.identidad, {
      traceId: obtenerTraceId(solicitud),
      metodo: solicitud.method ?? null,
      ruta: solicitud.originalUrl ?? solicitud.url ?? null,
    });
    if (acceso === null || !acceso.activo) throw accesoDenegado('usuario inactivo o sin registro en Organización');
    const permitidos = rolesPermitidos(this.reflector, contexto);
    if (permitidos.length > 0 && !permitidos.includes(acceso.rol)) throw accesoDenegado(`rol ${acceso.rol} no permitido`);
    solicitud.acceso = acceso;
    return true;
  }
}
