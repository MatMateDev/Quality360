// E5 · tablas locales de mensajes y etiquetas (D105, D117, D119). El portal NUNCA muestra el texto que llega del
// servidor ni de Jira: todo se indexa por código o enum, y un código desconocido cae al mensaje genérico.
import type {
  AdvertenciaFila,
  CampoConfiguracionJira,
  MotivoFila,
  OrigenEjecucion,
  OrigenHdu,
  ResultadoEjecucion,
  ResultadoFila,
  SugerenciaIntegracion,
} from "@/types/dominio";

export const ETIQUETAS_ORIGEN_EJECUCION: Record<OrigenEjecucion, string> = { JIRA: "Jira", CSV: "CSV", JSON: "JSON" };

export const ETIQUETAS_ORIGEN_HDU: Record<OrigenHdu, string> = { MANUAL: "Manual", JIRA: "Jira", CSV: "CSV", JSON: "JSON" };

export type TonoResultado = "exitosa" | "con-errores" | "incompleta" | "fallida" | "neutra";

/** Texto + glifo + tono (diseño E5 §11.2): el color nunca es el único canal. */
export const INFO_RESULTADO_EJECUCION: Record<ResultadoEjecucion, { etiqueta: string; glifo: string; tono: TonoResultado }> = {
  EXITOSA: { etiqueta: "Exitosa", glifo: "✓", tono: "exitosa" },
  CON_ERRORES: { etiqueta: "Con errores", glifo: "◐", tono: "con-errores" },
  INCOMPLETA: { etiqueta: "Incompleta", glifo: "◔", tono: "incompleta" },
  FALLIDA: { etiqueta: "Fallida", glifo: "✕", tono: "fallida" },
  INTERRUMPIDA: { etiqueta: "Interrumpida", glifo: "■", tono: "neutra" },
  EN_CURSO: { etiqueta: "En curso", glifo: "↻", tono: "incompleta" },
};

export const RESULTADOS_EJECUCION: ResultadoEjecucion[] = ["EXITOSA", "CON_ERRORES", "INCOMPLETA", "FALLIDA", "INTERRUMPIDA", "EN_CURSO"];

export const INFO_RESULTADO_FILA: Record<ResultadoFila, { etiqueta: string; glifo: string; tono: TonoResultado }> = {
  CREADA: { etiqueta: "Creada", glifo: "+", tono: "exitosa" },
  ACTUALIZADA: { etiqueta: "Actualizada", glifo: "✎", tono: "incompleta" },
  OMITIDA: { etiqueta: "Omitida", glifo: "–", tono: "neutra" },
  ERROR: { etiqueta: "Error", glifo: "✕", tono: "fallida" },
};

export const INFO_ACCION_VISTA_PREVIA = {
  CREAR: { etiqueta: "Crear", glifo: "+", tono: "exitosa" },
  ACTUALIZAR: { etiqueta: "Actualizar", glifo: "✎", tono: "incompleta" },
  OMITIR: { etiqueta: "Omitir", glifo: "–", tono: "neutra" },
  ERROR: { etiqueta: "Error", glifo: "✕", tono: "fallida" },
} as const satisfies Record<string, { etiqueta: string; glifo: string; tono: TonoResultado }>;

export const INFO_CONEXION = {
  OK: { etiqueta: "Conectado", glifo: "✓", clase: "ok" },
  FALLIDA: { etiqueta: "Falló la última prueba", glifo: "✕", clase: "fallida" },
  SIN_PROBAR: { etiqueta: "Sin probar", glifo: "○", clase: "sin-probar" },
} as const;

export const MENSAJE_GENERICO_JIRA = "No pudimos completar la operación con Jira.";

/** Mensajes fijos por código (diseño §10.1 y §10.2). */
const MENSAJES: Record<string, string> = {
  JIRA_CREDENCIAL_INVALIDA: "Jira rechazó el correo o el API token. Revisa la conexión.",
  JIRA_SIN_PERMISO: "La cuenta de Jira no tiene permiso para leer este proyecto.",
  JIRA_SITIO_NO_ENCONTRADO: "No pudimos conectar con ese sitio de Jira. Revisa la dirección.",
  JIRA_PROYECTO_NO_ENCONTRADO: "No encontramos el proyecto en Jira.",
  JIRA_LIMITE_DE_TASA: "Jira pidió esperar demasiado. Reintenta en unos minutos.",
  JIRA_TIEMPO_AGOTADO: "Jira no respondió a tiempo.",
  JIRA_NO_DISPONIBLE: "Jira no está disponible por ahora.",
  JIRA_RESPUESTA_INVALIDA: "Jira respondió algo que no entendimos.",
  JIRA_NO_CONFIGURADO: "Configura la conexión con Jira antes de sincronizar.",
  PRESUPUESTO_DE_TIEMPO: "Se alcanzó el tiempo máximo. Continúa para procesar el resto.",
  ORGANIZACION_NO_DISPONIBLE: "No pudimos guardar las HDU en este momento.",
  LLAVE_CIFRADO_NO_DISPONIBLE: "La integración no está habilitada en el servidor.",
  TOKEN_NO_DESCIFRABLE: "Vuelve a ingresar el API token.",
  INTEGRACION_EN_CURSO: "Ya hay una sincronización en curso.",
  SIN_RESPUESTA: "No recibimos respuesta del servidor. La operación pudo haberse completado: revisa el Historial antes de reintentar.",
  ARCHIVO_VACIO: "El archivo está vacío o no tiene filas de datos.",
  ARCHIVO_MUY_GRANDE: "El archivo supera el máximo de 1 MB.",
  FORMATO_NO_SOPORTADO: "El formato no es compatible. Usa un archivo .csv o .json.",
  ARCHIVO_ILEGIBLE: "No pudimos leer el archivo. Revisa que sea un CSV bien formado o un JSON con una lista de historias.",
  DEMASIADAS_FILAS: "El archivo supera el máximo de 500 filas.",
};

export interface ContextoMensaje {
  /** Filas con error, para `MODO_ESTRICTO`. */
  conError?: number;
  /** Columnas que faltan, para `COLUMNAS_FALTANTES`. */
  columnasFaltantes?: readonly string[];
}

/** Mensaje del portal para un código del servicio (o del propio portal). Un código desconocido nunca muestra texto ajeno. */
export function mensajeDeError(codigo: string | null | undefined, contexto: ContextoMensaje = {}): string {
  if (codigo === "MODO_ESTRICTO") {
    const n = contexto.conError ?? 0;
    return `No se importó nada porque el modo estricto detectó ${n} ${n === 1 ? "fila con error" : "filas con error"}.`;
  }
  if (codigo === "COLUMNAS_FALTANTES") {
    const lista = contexto.columnasFaltantes ?? [];
    return lista.length > 0 ? `Faltan las columnas: ${lista.join(", ")}` : "Faltan columnas obligatorias en el archivo.";
  }
  return (codigo ? MENSAJES[codigo] : undefined) ?? MENSAJE_GENERICO_JIRA;
}

/** Texto de cada sugerencia (D117). */
export const TEXTO_SUGERENCIA: Record<SugerenciaIntegracion, string> = {
  IR_A_CONEXION: "Ir a Conexión",
  REVISAR_PERMISOS: "Revisa los permisos de la cuenta sobre el proyecto",
  REINTENTAR: "Reintentar",
  CONTINUAR: "Continuar",
  IMPORTAR_ARCHIVO: "Importar un archivo",
  IMPORTAR_MISMO_ARCHIVO: "Importar el mismo archivo",
  CORREGIR_ARCHIVO: "Corrige el archivo y vuelve a seleccionarlo",
  AVISAR_DESPLIEGUE: "Avisa al responsable del despliegue",
};

/** Motivos de fila (sección 4.2 del backlog). */
export const TEXTO_MOTIVO_FILA: Record<MotivoFila, string> = {
  SIN_CAMBIOS: "Sin cambios",
  HDU_CERRADA: "La HDU está cerrada y no se modifica",
  HDU_MANUAL_EXISTENTE: "Ya existe una HDU creada a mano con este código",
  CODIGO_INVALIDO: "El código no es válido",
  TITULO_VACIO: "El título es obligatorio",
  TITULO_LARGO: "El título supera los 200 caracteres",
  PRIORIDAD_INVALIDA: "La prioridad no es válida",
  CODIGO_DUPLICADO_EN_ARCHIVO: "El código está repetido en el archivo",
  CELULA_NO_ENCONTRADA: "La célula no existe",
  SPRINT_NO_ENCONTRADO: "El sprint no existe",
  SPRINT_REQUERIDO: "Indica un sprint de la célula de la fila",
  QE_INVALIDO: "El QE responsable no es válido",
  ERROR_INTERNO: "No pudimos procesar esta fila",
};

export function textoMotivo(motivo: string | null): string {
  if (!motivo) return "—";
  return TEXTO_MOTIVO_FILA[motivo as MotivoFila] ?? TEXTO_MOTIVO_FILA.ERROR_INTERNO;
}

/** Advertencias (D119). */
export const TEXTO_ADVERTENCIA: Record<AdvertenciaFila, string> = {
  SPRINT_NO_ENCONTRADO: "Sprint no encontrado: se usó el de respaldo",
  PRIORIDAD_AUSENTE: "Sin prioridad",
  PRIORIDAD_DESCONOCIDA: "Prioridad no reconocida",
  TITULO_TRUNCADO: "Título recortado a 200 caracteres",
  DESCRIPCION_TRUNCADA: "Descripción recortada a 1.000 caracteres",
  COLUMNA_IGNORADA: "Se ignoraron columnas que el importador no usa",
};

export function textoAdvertencia(codigo: string): string {
  return TEXTO_ADVERTENCIA[codigo as AdvertenciaFila] ?? "Advertencia";
}

/** Campos de configuración en «Cambios de configuración»: el token solo aparece como «cambiado» (E5-F01-T08). */
export const ETIQUETAS_CAMPO_CONFIGURACION: Record<CampoConfiguracionJira, string> = {
  sitio: "Sitio",
  correo: "Correo",
  token: "API token (cambiado)",
  proyecto: "Proyecto",
  tiposIssue: "Tipos de issue",
  celulaId: "Célula",
  qeResponsableId: "QE",
  sprintRespaldoId: "Sprint",
};

export const ETIQUETAS_CAMBIO_HDU: Record<string, string> = { titulo: "Título", descripcion: "Descripción", prioridad: "Prioridad" };

/** Plantilla CSV generada en el cliente (D119): encabezado fijo y una fila de ejemplo sin datos del usuario. */
export const PLANTILLA_CSV = [
  "codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo",
  "EJEMPLO-1,Reemplaza esta fila,Describe aquí la historia,MEDIA,,,",
  "",
].join("\r\n");
