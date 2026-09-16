import { SetMetadata } from '@nestjs/common';

export const PERMITE_SERVICIO = 'quality360-organizacion:permite-servicio';

/** Marca una ruta que, además de `sesionSupabase`, acepta `credencialServicio` (ADR 0007). */
export const PermiteServicio = (): MethodDecorator & ClassDecorator => SetMetadata(PERMITE_SERVICIO, true);
