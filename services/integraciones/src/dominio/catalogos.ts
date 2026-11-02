/**
 * Tablas fijas del servicio (D105, D117): los mensajes de error, de fila y las sugerencias salen de aquí.
 * Nunca se copia el texto que devuelve Jira (podría contener el token) ni una URL interna.
 */
import type {
  AdvertenciaFila,
  CodigoErrorIntegracion,
  ErrorIntegracion,
  MotivoFila,
  OrigenEjecucion,
  ResultadoFila,
  SugerenciaIntegracion,
} from './tipos.js';

const MENSAJES_ERROR: Readonly<Record<CodigoErrorIntegracion, string>> = {
  JIRA_CREDENCIAL_INVALIDA: 'Jira rechazó el correo o el API token. Revisa la conexión.',
  JIRA_SIN_PERMISO: 'La cuenta de Jira no tiene permiso para leer este proyecto.',
  JIRA_SITIO_NO_ENCONTRADO: 'No pudimos conectar con ese sitio de Jira. Revisa la dirección.',
  JIRA_PROYECTO_NO_ENCONTRADO: 'No encontramos el proyecto en Jira.',
  JIRA_LIMITE_DE_TASA: 'Jira pidió esperar demasiado. Reintenta en unos minutos.',
  JIRA_TIEMPO_AGOTADO: 'Jira no respondió a tiempo.',
  JIRA_NO_DISPONIBLE: 'Jira no está disponible por ahora.',
  JIRA_RESPUESTA_INVALIDA: 'Jira respondió algo que no entendimos.',
  PRESUPUESTO_DE_TIEMPO: 'Se alcanzó el tiempo máximo. Continúa para procesar el resto.',
  ORGANIZACION_NO_DISPONIBLE: 'No pudimos guardar las HDU en este momento.',
  MODO_ESTRICTO: 'No se importó nada porque el modo estricto detectó filas con error.',
  ARCHIVO_VACIO: 'El archivo está vacío o no tiene filas de datos.',
  FORMATO_NO_SOPORTADO: 'El formato no es compatible. Usa un archivo .csv o .json.',
  ARCHIVO_ILEGIBLE: 'No pudimos leer el archivo. Revisa que sea un CSV bien formado o un JSON con una lista de historias.',
  COLUMNAS_FALTANTES: 'Faltan las columnas: codigo, titulo.',
  DEMASIADAS_FILAS: 'El archivo supera el máximo de 500 filas.',
};

/**
 * Sugerencias en orden: la primera es la acción principal (D117). `ORGANIZACION_NO_DISPONIBLE` nunca sugiere
 * importar un archivo, porque el archivo también escribe a través de Organización.
 */
export function sugerenciasDe(codigo: CodigoErrorIntegracion, origen: OrigenEjecucion, hayContinuarDesde: boolean): SugerenciaIntegracion[] {
  const esJira = origen === 'JIRA';
  switch (codigo) {
    case 'JIRA_CREDENCIAL_INVALIDA':
    case 'JIRA_SITIO_NO_ENCONTRADO':
    case 'JIRA_PROYECTO_NO_ENCONTRADO':
      return ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_SIN_PERMISO':
      return ['REVISAR_PERMISOS', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_LIMITE_DE_TASA':
      return [hayContinuarDesde ? 'CONTINUAR' : 'REINTENTAR', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_TIEMPO_AGOTADO':
    case 'JIRA_NO_DISPONIBLE':
    case 'JIRA_RESPUESTA_INVALIDA':
      return ['REINTENTAR', 'IMPORTAR_ARCHIVO'];
    case 'PRESUPUESTO_DE_TIEMPO':
      return [esJira ? 'CONTINUAR' : 'IMPORTAR_MISMO_ARCHIVO'];
    case 'ORGANIZACION_NO_DISPONIBLE':
      return [esJira ? 'REINTENTAR' : 'IMPORTAR_MISMO_ARCHIVO'];
    case 'MODO_ESTRICTO':
    case 'ARCHIVO_VACIO':
    case 'FORMATO_NO_SOPORTADO':
    case 'ARCHIVO_ILEGIBLE':
    case 'COLUMNAS_FALTANTES':
    case 'DEMASIADAS_FILAS':
      return ['CORREGIR_ARCHIVO'];
  }
}

export function mensajeDeError(codigo: CodigoErrorIntegracion): string {
  return MENSAJES_ERROR[codigo];
}

export function errorIntegracion(codigo: CodigoErrorIntegracion, origen: OrigenEjecucion, hayContinuarDesde = false): ErrorIntegracion {
  return { codigo, mensaje: MENSAJES_ERROR[codigo], sugerencias: sugerenciasDe(codigo, origen, hayContinuarDesde) };
}

export function esCodigoErrorIntegracion(valor: unknown): valor is CodigoErrorIntegracion {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(MENSAJES_ERROR, valor);
}

/** Mensaje fijo de cada motivo de fila (sección 4.2 del backlog E5). */
const MENSAJES_FILA: Readonly<Record<MotivoFila, string>> = {
  SIN_CAMBIOS: 'Sin cambios',
  HDU_CERRADA: 'La HDU está cerrada y no se modifica',
  HDU_MANUAL_EXISTENTE: 'Ya existe una HDU creada a mano con este código',
  CODIGO_INVALIDO: 'El código no es válido',
  TITULO_VACIO: 'El título es obligatorio',
  TITULO_LARGO: 'El título supera los 200 caracteres',
  PRIORIDAD_INVALIDA: 'La prioridad no es válida',
  CODIGO_DUPLICADO_EN_ARCHIVO: 'El código está repetido en el archivo',
  CELULA_NO_ENCONTRADA: 'La célula no existe',
  SPRINT_NO_ENCONTRADO: 'El sprint no existe',
  SPRINT_REQUERIDO: 'Indica un sprint de esa célula',
  QE_INVALIDO: 'El QE responsable no es válido',
  ERROR_INTERNO: 'No pudimos procesar esta fila',
};

export function mensajeDeFila(motivo: MotivoFila): string {
  return MENSAJES_FILA[motivo];
}

const MOTIVOS: ReadonlySet<string> = new Set(Object.keys(MENSAJES_FILA));
export function esMotivoFila(valor: unknown): valor is MotivoFila {
  return typeof valor === 'string' && MOTIVOS.has(valor);
}

const ADVERTENCIAS: ReadonlySet<string> = new Set<AdvertenciaFila>([
  'SPRINT_NO_ENCONTRADO',
  'PRIORIDAD_AUSENTE',
  'PRIORIDAD_DESCONOCIDA',
  'TITULO_TRUNCADO',
  'DESCRIPCION_TRUNCADA',
  'COLUMNA_IGNORADA',
]);
export function esAdvertenciaFila(valor: unknown): valor is AdvertenciaFila {
  return typeof valor === 'string' && ADVERTENCIAS.has(valor);
}

export function esResultadoFila(valor: unknown): valor is ResultadoFila {
  return valor === 'CREADA' || valor === 'ACTUALIZADA' || valor === 'OMITIDA' || valor === 'ERROR';
}
