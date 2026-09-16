/**
 * Decoradores de las rutas: roles permitidos, rutas públicas y acceso cómodo a
 * la identidad y a la resolución de acceso.
 */
import { SetMetadata, createParamDecorator, type CustomDecorator, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { Identidad, ResolucionAcceso, Rol, SolicitudAutenticada } from './tipos.js';

export const CLAVE_ROLES = 'quality360:roles';
export const CLAVE_PUBLICO = 'quality360:publico';

/**
 * Roles permitidos en la operación (`x-roles` del contrato). El rol se compara
 * contra el que entrega Organización, nunca contra el token.
 */
export const Roles = (...roles: Rol[]): CustomDecorator<string> => SetMetadata(CLAVE_ROLES, roles);

/** Ruta sin sesión, como `GET /health`. */
export const Publico = (): CustomDecorator<string> => SetMetadata(CLAVE_PUBLICO, true);

export function esPublico(reflector: Reflector, contexto: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [contexto.getHandler(), contexto.getClass()]) === true
  );
}

export function rolesPermitidos(reflector: Reflector, contexto: ExecutionContext): Rol[] {
  return reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, [contexto.getHandler(), contexto.getClass()]) ?? [];
}

/** Identidad verificada de la solicitud. */
export const IdentidadActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): Identidad | undefined =>
    contexto.switchToHttp().getRequest<SolicitudAutenticada>().identidad,
);

/** Rol vigente, estado y ámbito resueltos para la solicitud. */
export const AccesoActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): ResolucionAcceso | undefined =>
    contexto.switchToHttp().getRequest<SolicitudAutenticada>().acceso,
);
