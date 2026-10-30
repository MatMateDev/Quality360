/**
 * Guard de `/v1/interno/carga/*` (credencial de servicio, ADR 0007). Reemplaza a los guards
 * globales de sesión (la ruta se marca `@Publico()`): solo acepta `X-Q360-Servicio-Token` y solo
 * si `PERMITIR_CARGA_SEMILLA` es `true`. Deshabilitada: 403; sin credencial o con una inválida: 401 (contrato). El gateway no publica la ruta, como si no
 * existiera: nunca debe ser alcanzable desde el navegador.
 */
import { timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { accesoDenegado, noAutenticado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionImpedimentos } from '../../configuracion.js';

const CABECERA_SERVICIO = 'x-q360-servicio-token';

function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

@Injectable()
export class CargaSemillaGuard implements CanActivate {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionImpedimentos) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;
    if (!this.configuracion.permitirCargaSemilla) throw accesoDenegado('carga semilla deshabilitada (PERMITIR_CARGA_SEMILLA)');

    const solicitud = contexto.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const cabecera = solicitud.headers[CABECERA_SERVICIO];
    const token = Array.isArray(cabecera) ? cabecera[0] : cabecera;
    if (this.configuracion.credencialServicio === null || typeof token !== 'string' || !compararSeguro(token, this.configuracion.credencialServicio)) {
      throw noAutenticado('credencial de servicio ausente o inválida');
    }
    return true;
  }
}
