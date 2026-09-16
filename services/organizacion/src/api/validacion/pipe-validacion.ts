/**
 * `ValidationPipe` global: cuerpos y query rechazan campos desconocidos
 * (400 `VALIDACION`, comun.v1.yaml) y los errores de class-validator se
 * traducen a `DetalleError[]`.
 */
import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { errorValidacion, type CodigoDetalle, type DetalleError } from '@quality360/auth-nest';

const CODIGOS_LONGITUD = new Set(['minLength', 'maxLength', 'min', 'max']);
const CODIGOS_VALOR_NO_PERMITIDO = new Set(['isIn', 'isEnum', 'isBoolean']);
const CODIGOS_REQUERIDO = new Set(['isNotEmpty', 'isDefined']);

function codigoDetalle(restricciones: Record<string, string>): CodigoDetalle {
  const claves = Object.keys(restricciones);
  if (claves.some((c) => CODIGOS_REQUERIDO.has(c))) return 'REQUERIDO';
  if (claves.some((c) => CODIGOS_LONGITUD.has(c))) return 'LONGITUD_INVALIDA';
  if (claves.some((c) => CODIGOS_VALOR_NO_PERMITIDO.has(c))) return 'VALOR_NO_PERMITIDO';
  return 'FORMATO_INVALIDO';
}

function aplanar(errores: ValidationError[], prefijo = ''): DetalleError[] {
  const detalles: DetalleError[] = [];
  for (const error of errores) {
    const campo = prefijo.length > 0 ? `${prefijo}.${error.property}` : error.property;
    if (error.constraints !== undefined) {
      const mensaje = Object.values(error.constraints)[0] ?? 'Valor inválido.';
      detalles.push({ campo, codigo: codigoDetalle(error.constraints), mensaje });
    }
    if (error.children !== undefined && error.children.length > 0) detalles.push(...aplanar(error.children, campo));
  }
  return detalles;
}

export function crearPipeValidacion(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errores) => errorValidacion(aplanar(errores)),
  });
}
