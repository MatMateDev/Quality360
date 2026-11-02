/**
 * Tipos del dominio de Integraciones. Sin dependencias de Nest, Prisma ni `fetch` (informe p. 12).
 * Los catálogos son los de comun.v1.yaml (E5, D93–D128).
 */

export type Rol = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA' | 'LIDER_QA' | 'AUDITOR';

export type OrigenEjecucion = 'JIRA' | 'CSV' | 'JSON';
export type ResultadoEjecucion = 'EN_CURSO' | 'EXITOSA' | 'CON_ERRORES' | 'INCOMPLETA' | 'FALLIDA' | 'INTERRUMPIDA';
export type ResultadoFila = 'CREADA' | 'ACTUALIZADA' | 'OMITIDA' | 'ERROR';
export type EstadoConexion = 'SIN_PROBAR' | 'OK' | 'FALLIDA';
export type PrioridadHdu = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export type MotivoFila =
  | 'SIN_CAMBIOS'
  | 'HDU_CERRADA'
  | 'HDU_MANUAL_EXISTENTE'
  | 'CODIGO_INVALIDO'
  | 'TITULO_VACIO'
  | 'TITULO_LARGO'
  | 'PRIORIDAD_INVALIDA'
  | 'CODIGO_DUPLICADO_EN_ARCHIVO'
  | 'CELULA_NO_ENCONTRADA'
  | 'SPRINT_NO_ENCONTRADO'
  | 'SPRINT_REQUERIDO'
  | 'QE_INVALIDO'
  | 'ERROR_INTERNO';

export type AdvertenciaFila =
  | 'SPRINT_NO_ENCONTRADO'
  | 'PRIORIDAD_AUSENTE'
  | 'PRIORIDAD_DESCONOCIDA'
  | 'TITULO_TRUNCADO'
  | 'DESCRIPCION_TRUNCADA'
  | 'COLUMNA_IGNORADA';

export type CodigoErrorJira =
  | 'JIRA_CREDENCIAL_INVALIDA'
  | 'JIRA_SIN_PERMISO'
  | 'JIRA_SITIO_NO_ENCONTRADO'
  | 'JIRA_PROYECTO_NO_ENCONTRADO'
  | 'JIRA_LIMITE_DE_TASA'
  | 'JIRA_TIEMPO_AGOTADO'
  | 'JIRA_NO_DISPONIBLE'
  | 'JIRA_RESPUESTA_INVALIDA';

export type CodigoErrorArchivo = 'ARCHIVO_VACIO' | 'FORMATO_NO_SOPORTADO' | 'ARCHIVO_ILEGIBLE' | 'COLUMNAS_FALTANTES' | 'DEMASIADAS_FILAS';

/** Error de una ejecución o de una prueba: viaja en una respuesta 200 o en la ejecución registrada (D105). */
export type CodigoErrorIntegracion = CodigoErrorJira | CodigoErrorArchivo | 'PRESUPUESTO_DE_TIEMPO' | 'ORGANIZACION_NO_DISPONIBLE' | 'MODO_ESTRICTO';

export type SugerenciaIntegracion =
  | 'IR_A_CONEXION'
  | 'REVISAR_PERMISOS'
  | 'REINTENTAR'
  | 'CONTINUAR'
  | 'IMPORTAR_ARCHIVO'
  | 'IMPORTAR_MISMO_ARCHIVO'
  | 'CORREGIR_ARCHIVO'
  | 'AVISAR_DESPLIEGUE';

export interface ErrorIntegracion {
  readonly codigo: CodigoErrorIntegracion;
  readonly mensaje: string;
  readonly sugerencias: SugerenciaIntegracion[];
}

export interface CambioValor {
  readonly antes: string | null;
  readonly despues: string | null;
}
export interface CambiosHdu {
  titulo?: CambioValor;
  descripcion?: CambioValor;
  prioridad?: CambioValor;
}
export interface ReferenciaJira {
  readonly estado: string | null;
  readonly responsable: string | null;
}

/** Evento de espera por 429, tal como se guarda en `ejecucion_integracion.eventos` (D105). */
export interface EventoEjecucion {
  readonly tipo: 'JIRA_LIMITE_DE_TASA';
  readonly esperaMs: number;
  readonly fecha: Date;
}

export interface Actor {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Rol;
}

export interface Contadores {
  leidas: number;
  creadas: number;
  actualizadas: number;
  omitidas: number;
  conError: number;
  conAdvertencias: number;
}

export function contadoresVacios(): Contadores {
  return { leidas: 0, creadas: 0, actualizadas: 0, omitidas: 0, conError: 0, conAdvertencias: 0 };
}

export interface ArchivoEjecucion {
  readonly nombre: string;
  readonly tamano: number;
  readonly huella: string;
}

/** Una ejecución tal como se guarda. */
export interface Ejecucion extends Contadores {
  readonly id: string;
  readonly origen: OrigenEjecucion;
  readonly resultado: ResultadoEjecucion;
  readonly actor: Actor;
  readonly iniciadaEn: Date;
  readonly terminadaEn: Date | null;
  readonly duracionMs: number | null;
  readonly estricto: boolean;
  readonly vincularExistentes: boolean;
  readonly reintentos429: number;
  readonly eventos: EventoEjecucion[];
  readonly codigoError: CodigoErrorIntegracion | null;
  readonly mensajeError: string | null;
  readonly proyecto: string | null;
  readonly sitioHost: string | null;
  readonly archivo: ArchivoEjecucion | null;
  readonly hayMas: boolean;
  readonly continuarDesde: string | null;
}

/** Una fila de detalle (una issue o una fila de archivo). */
export interface FilaDetalle {
  readonly fila: number;
  readonly codigo: string | null;
  readonly titulo: string | null;
  readonly idHistoria: string | null;
  readonly resultado: ResultadoFila;
  readonly motivo: MotivoFila | null;
  readonly mensaje: string | null;
  readonly advertencias: AdvertenciaFila[];
  readonly cambios: CambiosHdu | null;
  readonly referencia: ReferenciaJira | null;
}

/** Configuración de Jira tal como se guarda. El token solo viaja cifrado. */
export interface ConfiguracionGuardada {
  readonly sitio: string;
  readonly correo: string;
  readonly proyecto: string;
  readonly tiposIssue: string[];
  readonly campoSprint: string | null;
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly sprintRespaldoId: string;
  readonly token: TokenCifradoGuardado;
  readonly estadoConexion: EstadoConexion;
  readonly ultimaPruebaEn: Date | null;
  readonly ultimaPruebaCodigo: CodigoErrorIntegracion | null;
  readonly actualizadoPor: { id: string; nombre: string };
  readonly actualizadoEn: Date;
}

export interface TokenCifradoGuardado {
  readonly cifrado: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly ultimos4: string;
  readonly llaveVersion: number;
}

export type CampoConfiguracion = 'sitio' | 'correo' | 'token' | 'proyecto' | 'tiposIssue' | 'celulaId' | 'qeResponsableId' | 'sprintRespaldoId';

export interface EventoConfiguracion {
  readonly id: string;
  readonly fecha: Date;
  readonly actor: { id: string; nombre: string };
  readonly camposCambiados: CampoConfiguracion[];
  readonly tokenCambiado: boolean;
  readonly resultadoPrueba: string;
}

export interface Pagina<T> {
  readonly items: T[];
  readonly total: number;
  readonly pagina: number;
  readonly tamanoPagina: number;
}
