/**
 * Errores en el formato común de `contracts/comun.v1.yaml`:
 * `{codigo, mensaje, traceId, detalles[]}` con catálogo cerrado de códigos.
 *
 * Regla del backlog: los mensajes son genéricos. Nunca distinguen «usuario no
 * existe», «contraseña incorrecta» ni «usuario desactivado». El motivo real se
 * guarda en `motivo`, que solo va al log junto al `traceId`.
 */
import { HttpException } from '@nestjs/common';

export type CodigoError =
  | 'VALIDACION'
  | 'NO_AUTENTICADO'
  | 'SESION_EXPIRADA'
  | 'ACCESO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'CORREO_DUPLICADO'
  | 'CODIGO_HDU_DUPLICADO'
  | 'ULTIMO_ADMINISTRADOR'
  | 'RELACIONES_INCOMPATIBLES'
  | 'TRANSICION_INVALIDA'
  | 'CHECKLIST_INCOMPLETO'
  | 'CHECKLIST_NO_DISPONIBLE'
  | 'HDU_CERRADA'
  | 'MOTIVO_REQUERIDO'
  | 'SUPERVISION_INVALIDA'
  | 'ANALISTA_INVALIDO'
  | 'ANALISTA_FUERA_DE_EQUIPO'
  | 'QE_INVALIDO'
  | 'CATALOGO_INVALIDO'
  | 'DEMASIADAS_SOLICITUDES'
  | 'ERROR_INTERNO'
  | 'SERVICIO_NO_DISPONIBLE'
  | 'PROVEEDOR_IDENTIDAD_NO_DISPONIBLE'
  | 'CAPACIDAD_NO_DISPONIBLE';

/** Mensajes de referencia del contrato, tal cual la tabla de `comun.v1.yaml`. */
export const MENSAJES: Readonly<Record<CodigoError, string>> = Object.freeze({
  VALIDACION: 'Los datos enviados no son válidos.',
  NO_AUTENTICADO: 'Debes iniciar sesión.',
  SESION_EXPIRADA: 'Tu sesión expiró. Inicia sesión nuevamente.',
  ACCESO_DENEGADO: 'No tienes acceso a este recurso.',
  NO_ENCONTRADO: 'El recurso solicitado no existe.',
  CORREO_DUPLICADO: 'Ya existe un usuario con ese correo.',
  CODIGO_HDU_DUPLICADO: 'Ya existe una HDU con ese identificador.',
  ULTIMO_ADMINISTRADOR: 'La plataforma debe conservar al menos un administrador activo.',
  RELACIONES_INCOMPATIBLES: 'Resuelve las relaciones de supervisión antes de continuar.',
  TRANSICION_INVALIDA: 'La HDU no puede pasar a ese estado.',
  CHECKLIST_INCOMPLETO: 'No se puede cerrar la HDU: el checklist de entregables está incompleto.',
  CHECKLIST_NO_DISPONIBLE:
    'No se puede cerrar la HDU: el checklist de entregables no está disponible para verificarse.',
  HDU_CERRADA: 'La HDU está cerrada y no admite cambios.',
  MOTIVO_REQUERIDO: 'Indica el motivo del cambio.',
  SUPERVISION_INVALIDA: 'El supervisor debe ser QE y el supervisado Analista QA, ambos activos.',
  ANALISTA_INVALIDO: 'El analista debe tener rol Analista QA y estar activo.',
  ANALISTA_FUERA_DE_EQUIPO: 'El analista no pertenece al equipo vigente del QE responsable.',
  QE_INVALIDO: 'El QE responsable debe tener rol QE y estar activo.',
  CATALOGO_INVALIDO: 'La célula o el sprint indicados no existen.',
  DEMASIADAS_SOLICITUDES: 'Demasiadas solicitudes. Intenta más tarde.',
  ERROR_INTERNO: 'Ocurrió un error inesperado.',
  SERVICIO_NO_DISPONIBLE: 'El servicio no está disponible. Intenta nuevamente.',
  PROVEEDOR_IDENTIDAD_NO_DISPONIBLE: 'No fue posible coordinar el cambio con el proveedor de identidad.',
  CAPACIDAD_NO_DISPONIBLE: 'Esta capacidad aún no está disponible.',
});

export type CodigoDetalle =
  | 'REQUERIDO'
  | 'FORMATO_INVALIDO'
  | 'LONGITUD_INVALIDA'
  | 'VALOR_NO_PERMITIDO'
  | 'DUPLICADO'
  | 'NO_EXISTE'
  | 'NO_PERMITIDO';

export interface DetalleError {
  campo: string;
  codigo: CodigoDetalle;
  mensaje: string;
}

/** Cuerpo de error del contrato. */
export interface CuerpoError {
  codigo: CodigoError;
  mensaje: string;
  traceId: string;
  detalles: DetalleError[];
}

export interface OpcionesExcepcion {
  /** Texto para el usuario. Por defecto, el del catálogo. */
  mensaje?: string;
  detalles?: DetalleError[];
  /** Motivo interno: solo para el log, nunca para la respuesta. */
  motivo?: string;
}

/** Excepción con el formato común. El `traceId` lo agrega el filtro. */
export class ExcepcionQ360 extends HttpException {
  readonly codigo: CodigoError;
  readonly detalles: DetalleError[];
  readonly motivo: string | undefined;

  constructor(estado: number, codigo: CodigoError, opciones: OpcionesExcepcion = {}) {
    const mensaje = opciones.mensaje ?? MENSAJES[codigo];
    const detalles = opciones.detalles ?? [];
    super({ codigo, mensaje, detalles }, estado);
    this.codigo = codigo;
    this.detalles = detalles;
    this.motivo = opciones.motivo;
  }
}

export const errorValidacion = (detalles: DetalleError[] = [], motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(400, 'VALIDACION', { detalles, motivo });

export const noAutenticado = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(401, 'NO_AUTENTICADO', { motivo });

export const sesionExpirada = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(401, 'SESION_EXPIRADA', { motivo });

export const accesoDenegado = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(403, 'ACCESO_DENEGADO', { motivo });

export const noEncontrado = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(404, 'NO_ENCONTRADO', { motivo });

export const demasiadasSolicitudes = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(429, 'DEMASIADAS_SOLICITUDES', { motivo });

export const errorInterno = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(500, 'ERROR_INTERNO', { motivo });

export const servicioNoDisponible = (motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(503, 'SERVICIO_NO_DISPONIBLE', { motivo });

export const capacidadNoDisponible = (estado = 501, motivo?: string): ExcepcionQ360 =>
  new ExcepcionQ360(estado, 'CAPACIDAD_NO_DISPONIBLE', { motivo });

/** Código por defecto para un estado HTTP sin código explícito. */
export function codigoPorEstado(estado: number): CodigoError {
  switch (estado) {
    case 400:
    case 413:
    case 415:
      return 'VALIDACION';
    case 401:
      return 'NO_AUTENTICADO';
    case 403:
      return 'ACCESO_DENEGADO';
    case 404:
      return 'NO_ENCONTRADO';
    case 429:
      return 'DEMASIADAS_SOLICITUDES';
    case 501:
      return 'CAPACIDAD_NO_DISPONIBLE';
    case 503:
      return 'SERVICIO_NO_DISPONIBLE';
    default:
      return 'ERROR_INTERNO';
  }
}

export function esCodigoError(valor: unknown): valor is CodigoError {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(MENSAJES, valor);
}
