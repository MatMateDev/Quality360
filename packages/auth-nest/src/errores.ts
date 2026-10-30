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
  | 'ROL_INCOMPATIBLE'
  | 'EXPORTACION_EXCEDE_LIMITE'
  // E5 · integración con Jira y archivos (comun.v1.yaml#CodigoError)
  | 'JIRA_NO_CONFIGURADO'
  | 'INTEGRACION_EN_CURSO'
  | 'TOKEN_NO_DESCIFRABLE'
  | 'ARCHIVO_MUY_GRANDE'
  | 'ARCHIVO_VACIO'
  | 'FORMATO_NO_SOPORTADO'
  | 'ARCHIVO_ILEGIBLE'
  | 'COLUMNAS_FALTANTES'
  | 'DEMASIADAS_FILAS'
  | 'LLAVE_CIFRADO_NO_DISPONIBLE'
  | 'TRANSICION_INVALIDA'
  | 'CHECKLIST_INCOMPLETO'
  | 'CHECKLIST_NO_DISPONIBLE'
  | 'HDU_CERRADA'
  | 'ORDEN_ENTREGABLES'
  | 'ENTREGABLE_YA_REGISTRADO'
  | 'ESTADO_ENTREGABLE_INVALIDO'
  | 'ENTREGABLE_AUTOMATICO'
  | 'ENTREGABLES_PENDIENTES'
  | 'CERTIFICADO_EXISTENTE'
  | 'HDU_BLOQUEADA'
  | 'MOTIVO_REQUERIDO'
  | 'COMENTARIO_REQUERIDO'
  | 'JUSTIFICACION_REQUERIDA'
  | 'RESPONSABLE_INVALIDO'
  | 'SUPERVISION_INVALIDA'
  | 'ANALISTA_INVALIDO'
  | 'ANALISTA_FUERA_DE_EQUIPO'
  | 'QE_INVALIDO'
  | 'CATALOGO_INVALIDO'
  | 'EVIDENCIA_INVALIDA'
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
  ROL_INCOMPATIBLE: 'El usuario no tiene el rol Líder QA.',
  EXPORTACION_EXCEDE_LIMITE: 'La exportación supera las 50.000 filas. Acota los filtros.',
  JIRA_NO_CONFIGURADO: 'Configura la conexión con Jira antes de sincronizar.',
  INTEGRACION_EN_CURSO: 'Ya hay una sincronización en curso.',
  TOKEN_NO_DESCIFRABLE: 'Vuelve a ingresar el API token.',
  ARCHIVO_MUY_GRANDE: 'El archivo supera el máximo de 1 MB.',
  ARCHIVO_VACIO: 'El archivo está vacío o no tiene filas de datos.',
  FORMATO_NO_SOPORTADO: 'El formato no es compatible. Usa un archivo .csv o .json.',
  ARCHIVO_ILEGIBLE: 'No pudimos leer el archivo. Revisa que sea un CSV bien formado o un JSON con una lista de historias.',
  COLUMNAS_FALTANTES: 'Faltan las columnas: codigo, titulo.',
  DEMASIADAS_FILAS: 'El archivo supera el máximo de 500 filas.',
  LLAVE_CIFRADO_NO_DISPONIBLE: 'La integración no está habilitada en el servidor.',
  TRANSICION_INVALIDA: 'La HDU no puede pasar a ese estado.',
  CHECKLIST_INCOMPLETO: 'No se puede cerrar la HDU: el checklist de entregables está incompleto.',
  CHECKLIST_NO_DISPONIBLE:
    'No se puede cerrar la HDU: el checklist de entregables no está disponible para verificarse.',
  HDU_CERRADA: 'La HDU está cerrada y no admite cambios.',
  ORDEN_ENTREGABLES: 'Completa el entregable anterior antes de continuar.',
  ENTREGABLE_YA_REGISTRADO: 'El entregable ya está registrado para esta HDU.',
  ESTADO_ENTREGABLE_INVALIDO: 'El entregable no está en un estado que permita esta acción.',
  ENTREGABLE_AUTOMATICO: 'Este entregable se completa al generar el certificado.',
  ENTREGABLES_PENDIENTES: 'No se puede generar el certificado: faltan entregables por aprobar.',
  CERTIFICADO_EXISTENTE: 'La HDU ya tiene un certificado emitido.',
  HDU_BLOQUEADA: 'No se puede cerrar la HDU: tiene impedimentos abiertos o escalados.',
  MOTIVO_REQUERIDO: 'Indica el motivo del cambio.',
  COMENTARIO_REQUERIDO: 'Indica la acción tomada.',
  JUSTIFICACION_REQUERIDA: 'La justificación es obligatoria.',
  RESPONSABLE_INVALIDO: 'El responsable indicado no está entre los candidatos de esta HDU.',
  SUPERVISION_INVALIDA: 'El supervisor debe ser QE y el supervisado Analista QA, ambos activos.',
  ANALISTA_INVALIDO: 'El analista debe tener rol Analista QA y estar activo.',
  ANALISTA_FUERA_DE_EQUIPO: 'El analista no pertenece al equipo vigente del QE responsable.',
  QE_INVALIDO: 'El QE responsable debe tener rol QE y estar activo.',
  CATALOGO_INVALIDO: 'La célula o el sprint indicados no existen.',
  EVIDENCIA_INVALIDA: 'La evidencia debe ser un enlace https o un archivo PDF, PNG o JPEG de hasta 10 MB.',
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
