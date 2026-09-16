/**
 * Autenticación: verifica el access token de Supabase y deja la identidad en
 * la solicitud. No autoriza nada; de eso se encarga `AccesoGuard` con los
 * datos de Organización (regla «autenticar no es autorizar»).
 */
import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { esPublico } from './decoradores.js';
import { ExcepcionQ360, noAutenticado } from './errores.js';
import type { SolicitudAutenticada } from './tipos.js';
import { obtenerTraceId } from './traza.js';
import { VerificadorTokenSupabase } from './verificador-token.js';

/** Extrae el token de `Authorization: Bearer <token>`. */
export function extraerTokenBearer(valor: string | string[] | undefined): string | null {
  const cabecera = Array.isArray(valor) ? valor[0] : valor;
  if (typeof cabecera !== 'string') return null;
  const partes = cabecera.trim().split(/\s+/);
  if (partes.length !== 2) return null;
  const [esquema, token] = partes;
  if (esquema === undefined || token === undefined) return null;
  if (esquema.toLowerCase() !== 'bearer' || token.length === 0) return null;
  return token;
}

@Injectable()
export class IdentidadGuard implements CanActivate {
  private readonly registro = new Logger(IdentidadGuard.name);

  constructor(
    private readonly verificador: VerificadorTokenSupabase,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (contexto.getType() !== 'http') return true;
    if (esPublico(this.reflector, contexto)) return true;

    const solicitud = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
    const token = extraerTokenBearer(solicitud.headers?.authorization);
    if (token === null) {
      throw this.registrar(solicitud, noAutenticado('sin cabecera Authorization Bearer'));
    }

    try {
      solicitud.identidad = await this.verificador.verificar(token);
    } catch (error) {
      throw this.registrar(solicitud, error);
    }
    return true;
  }

  /** Deja el motivo real en el log con su traza; la respuesta sigue siendo genérica. */
  private registrar(solicitud: SolicitudAutenticada, error: unknown): unknown {
    if (error instanceof ExcepcionQ360) {
      const traceId = obtenerTraceId(solicitud);
      const ruta = `${solicitud.method ?? '-'} ${solicitud.originalUrl ?? solicitud.url ?? '-'}`;
      this.registro.warn(`${error.codigo} en ${ruta} · traceId=${traceId} · motivo=${error.motivo ?? '-'}`);
    }
    return error;
  }
}
