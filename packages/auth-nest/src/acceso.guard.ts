/**
 * Autorización: pregunta a Organización por el rol vigente, el estado activo y
 * el ámbito del usuario en CADA solicitud (D4), y aplica `@Roles(...)`.
 *
 * Deniega con 403 `ACCESO_DENEGADO` y mensaje genérico (D12) cuando:
 * - el usuario no tiene registro en Organización,
 * - está inactivo, aunque su token siga siendo válido (E1-B07#3),
 * - su rol vigente no está en `@Roles(...)`.
 *
 * Si Organización no responde, falla cerrado con 503: nunca concede acceso.
 */
import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';

import { esPublico, rolesPermitidos } from './decoradores.js';
import { ExcepcionQ360, accesoDenegado, errorInterno, noAutenticado } from './errores.js';
import { RESOLUTOR_DE_ACCESO, type ContextoAcceso, type ResolutorDeAcceso, type SolicitudAutenticada } from './tipos.js';
import { obtenerTraceId } from './traza.js';

@Injectable()
export class AccesoGuard implements CanActivate {
  private readonly registro = new Logger(AccesoGuard.name);
  private resolutor: ResolutorDeAcceso | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    if (esPublico(this.reflector, contexto)) return true;

    const solicitud = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
    const identidad = solicitud.identidad;
    if (identidad === undefined) {
      // IdentidadGuard no corrió antes: se falla cerrado.
      throw noAutenticado('la solicitud no tiene identidad verificada');
    }

    const contextoAcceso: ContextoAcceso = {
      traceId: obtenerTraceId(solicitud),
      metodo: solicitud.method ?? null,
      ruta: solicitud.originalUrl ?? solicitud.url ?? null,
    };

    const acceso = await this.obtenerResolutor().resolver(identidad, contextoAcceso);

    if (acceso === null) {
      throw this.denegar(contextoAcceso, 'sin registro en Organización');
    }
    if (!acceso.activo) {
      throw this.denegar(contextoAcceso, 'usuario inactivo');
    }

    const permitidos = rolesPermitidos(this.reflector, contexto);
    if (permitidos.length > 0 && !permitidos.includes(acceso.rol)) {
      throw this.denegar(contextoAcceso, `rol ${acceso.rol} no permitido en la operación`);
    }

    solicitud.acceso = acceso;
    return true;
  }

  private obtenerResolutor(): ResolutorDeAcceso {
    if (this.resolutor !== null) return this.resolutor;
    let resolutor: ResolutorDeAcceso | undefined;
    try {
      resolutor = this.moduleRef.get<ResolutorDeAcceso>(RESOLUTOR_DE_ACCESO, { strict: false });
    } catch {
      resolutor = undefined;
    }
    if (resolutor === undefined) {
      throw errorInterno('No hay ResolutorDeAcceso registrado con el token RESOLUTOR_DE_ACCESO.');
    }
    this.resolutor = resolutor;
    return resolutor;
  }

  private denegar(contexto: ContextoAcceso, motivo: string): ExcepcionQ360 {
    this.registro.warn(
      `ACCESO_DENEGADO en ${contexto.metodo ?? '-'} ${contexto.ruta ?? '-'} · traceId=${contexto.traceId} · motivo=${motivo}`,
    );
    return accesoDenegado(motivo);
  }
}
