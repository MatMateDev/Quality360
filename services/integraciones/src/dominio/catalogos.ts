/**
 * Tablas fijas del servicio (D105, D117): los mensajes de error, de fila y las sugerencias salen de aquí.
 * Nunca se copia el texto que devuelve Jira (podría contener el token) ni una URL interna.
 */
import type {
  AdvertenciaFila,
  CodigoErrorIntegracion,
  FaseEjecucion,
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
  TOPE_DE_CONSULTA: 'La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.',
  ARCHIVO_VACIO: 'El archivo está vacío o no tiene filas de datos.',
  FORMATO_NO_SOPORTADO: 'El formato no es compatible. Usa un archivo .csv o .json.',
  ARCHIVO_ILEGIBLE: 'No pudimos leer el archivo. Revisa que sea un CSV bien formado o un JSON con una lista de historias.',
  COLUMNAS_FALTANTES: 'Faltan las columnas: codigo, titulo.',
  DEMASIADAS_FILAS: 'El archivo supera el máximo de 500 filas.',
  JIRA_RECONEXION_NECESARIA: 'La conexión con Jira venció. Vuelve a conectar con Jira.',
  JIRA_OAUTH_PERMISOS_INSUFICIENTES: 'Faltan permisos en Atlassian. Acepta todos los permisos solicitados.',
  JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO: 'No aceptaste los permisos en Atlassian. No se conectó nada.',
  JIRA_OAUTH_CANJE_FALLIDO: 'Atlassian no aceptó la autorización. Vuelve a intentarlo.',
  JIRA_OAUTH_SIN_SITIO: 'Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.',
};

/** Dónde ocurre un error de OAuth: el retorno y la elección de sitio sugieren reintentar; el resto, ir a Conexión (contrato). */
export type ContextoErrorOauth = 'CONEXION' | 'OPERACION';

/**
 * Sugerencias en orden: la primera es la acción principal (D117). `ORGANIZACION_NO_DISPONIBLE` nunca sugiere
 * importar un archivo, porque el archivo también escribe a través de Organización.
 */
export function sugerenciasDe(
  codigo: CodigoErrorIntegracion,
  origen: OrigenEjecucion,
  hayContinuarDesde: boolean,
  fase: FaseEjecucion = 'CONSULTA',
  contexto: ContextoErrorOauth = 'OPERACION',
): SugerenciaIntegracion[] {
  // Las ejecuciones directas anteriores a D132 ya no se continúan (D150).
  const puedeContinuar = fase !== 'DIRECTA';
  const esJira = origen === 'JIRA';
  switch (codigo) {
    case 'JIRA_CREDENCIAL_INVALIDA':
    case 'JIRA_SITIO_NO_ENCONTRADO':
    case 'JIRA_PROYECTO_NO_ENCONTRADO':
      return ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_SIN_PERMISO':
      return ['REVISAR_PERMISOS', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_LIMITE_DE_TASA':
      return [hayContinuarDesde && puedeContinuar ? 'CONTINUAR' : 'REINTENTAR', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_TIEMPO_AGOTADO':
    case 'JIRA_NO_DISPONIBLE':
    case 'JIRA_RESPUESTA_INVALIDA':
      return ['REINTENTAR', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_RECONEXION_NECESARIA':
      return ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_OAUTH_PERMISOS_INSUFICIENTES':
      return contexto === 'CONEXION' ? ['REINTENTAR'] : ['IR_A_CONEXION', 'IMPORTAR_ARCHIVO'];
    case 'JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO':
    case 'JIRA_OAUTH_SIN_SITIO':
      return ['REINTENTAR'];
    case 'JIRA_OAUTH_CANJE_FALLIDO':
      return ['REINTENTAR', 'AVISAR_DESPLIEGUE'];
    case 'PRESUPUESTO_DE_TIEMPO':
      return [esJira ? (puedeContinuar ? 'CONTINUAR' : 'REINTENTAR') : 'IMPORTAR_MISMO_ARCHIVO'];
    case 'TOPE_DE_CONSULTA':
      return [];
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

export function errorIntegracion(
  codigo: CodigoErrorIntegracion,
  origen: OrigenEjecucion,
  hayContinuarDesde = false,
  oauth?: { contexto?: ContextoErrorOauth; permisosFaltantes?: readonly string[] },
): ErrorIntegracion {
  const sugerencias = sugerenciasDe(codigo, origen, hayContinuarDesde, 'CONSULTA', oauth?.contexto ?? 'OPERACION');
  const faltantes = oauth?.permisosFaltantes;
  if (codigo === 'JIRA_OAUTH_PERMISOS_INSUFICIENTES' && faltantes !== undefined && faltantes.length > 0) {
    // «Faltan permisos en Atlassian: <permisos>. Acepta todos los permisos solicitados.» Los permisos son constantes del servicio.
    const lista = faltantes.slice(0, 10);
    return {
      codigo,
      mensaje: `Faltan permisos en Atlassian: ${lista.join(', ')}. Acepta todos los permisos solicitados.`,
      sugerencias,
      permisosFaltantes: [...lista],
    };
  }
  return { codigo, mensaje: MENSAJES_ERROR[codigo], sugerencias };
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
  HDU_CREADA_DESPUES: 'La HDU se creó mientras revisabas la consulta. No se modificó',
  ASIGNACION_INVALIDA: 'La asignación ya no es válida',
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
