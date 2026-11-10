/**
 * Guardas de las rutas sin sesión de usuario (`@Publico()`): el cron (`CRON_SECRET`, D178) y el gancho de pruebas
 * (credencial de la semilla y `PERMITIR_CARGA_SEMILLA`, D184). Comparación en tiempo constante.
 */
import { timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { accesoDenegado, extraerTokenBearer, noAutenticado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIndicadores } from '../../configuracion.js';

export function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

interface SolicitudConCabeceras {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * `GET /v1/cron/indicadores/snapshot`: solo `Authorization: Bearer <CRON_SECRET>`. Sin cabecera, con otro valor, con un
 * JWT de sesión o con `CRON_SECRET` sin configurar: 401 y no se crea ejecución. Nunca queda abierta.
 */
@Injectable()
export class CronGuard implements CanActivate {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConCabeceras>();
    const secreto = this.configuracion.cronSecret;
    const token = extraerTokenBearer(solicitud.headers.authorization);
    if (secreto === null || token === null || !compararSeguro(token, secreto)) throw noAutenticado('CRON_SECRET ausente o inválido');
    return true;
  }
}

/** `POST /v1/interno/carga/snapshots`: deshabilitado → 403; sin credencial de la semilla o inválida → 401. */
@Injectable()
export class CargaSemillaGuard implements CanActivate {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores) {}

  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;
    if (!this.configuracion.permitirCargaSemilla || this.configuracion.produccion) throw accesoDenegado('carga semilla deshabilitada (PERMITIR_CARGA_SEMILLA)');
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConCabeceras>();
    const cabecera = solicitud.headers['x-q360-servicio-token'];
    const token = Array.isArray(cabecera) ? cabecera[0] : cabecera;
    const esperado = this.configuracion.semillaToken;
    if (esperado === null || typeof token !== 'string' || !compararSeguro(token, esperado)) throw noAutenticado('credencial de servicio ausente o inválida');
    return true;
  }
}
