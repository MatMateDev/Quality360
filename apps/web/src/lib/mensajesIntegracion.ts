// E5 · tablas locales de mensajes y etiquetas (D105, D117, D119). El portal NUNCA muestra el texto que llega del
// servidor ni de Jira: todo se indexa por código o enum, y un código desconocido cae al mensaje genérico.
import type {
  AdvertenciaFila,
  AlcanceEjecucion,
  CampoConfiguracionJira,
  FaseEjecucion,
  MotivoFila,
  MetodoConexionJira,
  OrigenEjecucion,
  OrigenHdu,
  ResultadoEjecucion,
  ResultadoFila,
  SugerenciaIntegracion,
} from "@/types/dominio";

export const ETIQUETAS_ORIGEN_EJECUCION: Record<OrigenEjecucion, string> = { JIRA: "Jira", CSV: "CSV", JSON: "JSON" };

/** Fase de una ejecución (D141): «Directa» agrupa las anteriores a D132 y las de archivo. */
export const ETIQUETAS_FASE: Record<FaseEjecucion, string> = { DIRECTA: "Directa", CONSULTA: "Consulta", CONFIRMACION: "Confirmación" };

export const FASES: FaseEjecucion[] = ["CONSULTA", "CONFIRMACION", "DIRECTA"];

/** Alcance de una ejecución (D206): «Una HDU» es la confirmación de una sola fila; «Lote» es todo lo demás. */
export const ETIQUETAS_ALCANCE: Record<AlcanceEjecucion, string> = { LOTE: "Lote", HDU: "Una HDU" };

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

/** Valores de `data-estado` de `chip-conexion` (decisiones-mvp, «Chip de la conexión»; diseño OAuth §3.1). */
export type EstadoChipConexion = "sin-conectar" | "conectado-oauth" | "conectado-api-token" | "reconexion-necesaria" | "falta-sitio" | "fallo";

/** Glifo + palabra + clase por estado del chip: el color nunca es el único canal (diseño OAuth §1). */
export const INFO_CHIP_CONEXION: Record<EstadoChipConexion, { etiqueta: string; glifo: string; clase: "ok" | "fallida" | "incompleta" | "sin-probar" }> = {
  "sin-conectar": { etiqueta: "Sin conectar", glifo: "○", clase: "sin-probar" },
  "conectado-oauth": { etiqueta: "Conectado con Jira (OAuth)", glifo: "✓", clase: "ok" },
  "conectado-api-token": { etiqueta: "Conectado con API token", glifo: "✓", clase: "ok" },
  "reconexion-necesaria": { etiqueta: "Reconexión necesaria", glifo: "⚠", clase: "incompleta" },
  "falta-sitio": { etiqueta: "Falta elegir el sitio", glifo: "◐", clase: "incompleta" },
  fallo: { etiqueta: "Falló la última prueba", glifo: "✕", clase: "fallida" },
};

/** Permisos (scopes) de Atlassian traducidos (diseño OAuth §3.2). Uno desconocido se muestra tal cual. */
export const ETIQUETAS_PERMISO: Record<string, string> = {
  "read:jira-work": "Ver datos de issues",
  "read:jira-user": "Ver perfil del usuario",
  offline_access: "Mantener la conexión",
};

export function etiquetaPermiso(permiso: string): string {
  return ETIQUETAS_PERMISO[permiso] ?? permiso;
}

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
  JIRA_NO_CONFIGURADO: "Configura la conexión con Jira antes de consultar.",
  // E5 · OAuth (diseño OAuth §9.3).
  JIRA_RECONEXION_NECESARIA: "La conexión con Jira venció. Vuelve a conectar con Jira.",
  JIRA_OAUTH_NO_CONFIGURADO: "La conexión automática con Jira no está habilitada en el servidor.",
  JIRA_OAUTH_ESTADO_INVALIDO: "La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».",
  JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO: "No aceptaste los permisos en Atlassian. No se conectó nada.",
  JIRA_OAUTH_CANJE_FALLIDO: "Atlassian no aceptó la autorización. Vuelve a intentarlo.",
  JIRA_OAUTH_SIN_SITIO: "Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.",
  JIRA_OAUTH_SITIO_NO_VALIDO: "El sitio elegido no es válido.",
  JIRA_OAUTH_SIN_CONEXION: "No hay una conexión pendiente.",
  // Códigos que solo existen en el portal.
  OAUTH_NO_ABRIO: "No fue posible abrir Atlassian. Intenta nuevamente.",
  OAUTH_SIN_PERMISO: "Ya no tienes permiso para esta acción",
  OAUTH_ERROR_SERVIDOR: "Hubo un problema del servidor. Intenta nuevamente en unos minutos.",
  OAUTH_SIN_RESPUESTA: "No recibimos respuesta del servidor. La conexión pudo haberse completado: revisa la pestaña Conexión antes de reintentar.",
  OAUTH_SIN_AUTORIZACION: "Para conectar con Jira, pulsa «Conectar con Jira» en la pestaña Conexión.",
  PRESUPUESTO_DE_TIEMPO: "Se alcanzó el tiempo máximo. Continúa para procesar el resto.",
  ORGANIZACION_NO_DISPONIBLE: "No pudimos guardar las HDU en este momento.",
  LLAVE_CIFRADO_NO_DISPONIBLE: "La integración no está habilitada en el servidor.",
  TOKEN_NO_DESCIFRABLE: "Vuelve a ingresar el API token.",
  INTEGRACION_EN_CURSO: "Ya hay una consulta o confirmación en curso.",
  TOPE_DE_CONSULTA: "La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.",
  CONSULTA_LLENA: "La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.",
  CONSULTA_COMPLETA: "La consulta ya leyó todas las historias de Jira.",
  CONSULTA_VENCIDA: "La consulta venció. Consulta Jira de nuevo.",
  CONSULTA_NO_ABIERTA: "Esta consulta ya no está abierta.",
  CONSULTA_NO_ENCONTRADA: "No encontramos esa consulta. Puede que ya no exista.",
  CONSULTA_MODIFICADA: "Otra persona modificó la consulta. Recargamos la consulta con sus cambios; revisa y confirma de nuevo. No se creó ni se actualizó ninguna HDU.",
  SIN_SELECCION: "Marca al menos una fila.",
  QE_INVALIDO: "El QE responsable no es válido.",
  CATALOGO_INVALIDO: "La célula o el sprint elegidos no son válidos.",
  FILA_NO_MARCABLE: "Esta fila no se puede incluir.",
  FILA_NO_ASIGNABLE: "Esta fila no se puede asignar.",
  SIN_RESPUESTA_CONSULTA: "No recibimos respuesta del servidor. La consulta pudo haberse completado: revisa el Historial antes de reintentar.",
  SIN_RESPUESTA: "No recibimos respuesta del servidor. La operación pudo haberse completado: revisa el Historial antes de reintentar.",
  ARCHIVO_VACIO: "El archivo está vacío o no tiene filas de datos.",
  ARCHIVO_MUY_GRANDE: "El archivo supera el máximo de 1 MB.",
  FORMATO_NO_SOPORTADO: "El formato no es compatible. Usa un archivo .csv o .json.",
  ARCHIVO_ILEGIBLE: "No pudimos leer el archivo. Revisa que sea un CSV bien formado o un JSON con una lista de historias.",
  DEMASIADAS_FILAS: "El archivo supera el máximo de 500 filas.",
};

/** Textos de los códigos cuyo mensaje depende del método de conexión (E5-F01-T04 certifica el del API token). */
const MENSAJES_OAUTH: Record<string, string> = {
  JIRA_SIN_PERMISO: "La cuenta de Jira conectada no tiene permiso para leer este proyecto.",
  JIRA_PROYECTO_NO_ENCONTRADO: "No encontramos el proyecto. Revisa la clave; también puede ser que la cuenta de Jira conectada no tenga permiso para verlo.",
};

export interface ContextoMensaje {
  /** Método activo: con OAuth cambian los textos de `JIRA_SIN_PERMISO` y `JIRA_PROYECTO_NO_ENCONTRADO`. */
  metodo?: MetodoConexionJira | null;
  /** Permisos que faltan, para `JIRA_OAUTH_PERMISOS_INSUFICIENTES` (D218). */
  permisosFaltantes?: readonly string[];
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
  if (codigo === "JIRA_OAUTH_PERMISOS_INSUFICIENTES") {
    const lista = (contexto.permisosFaltantes ?? []).map(etiquetaPermiso).join(", ");
    return lista ? `Faltan permisos en Atlassian: ${lista}. Acepta todos los permisos solicitados.` : "Faltan permisos en Atlassian. Acepta todos los permisos solicitados.";
  }
  if (codigo && contexto.metodo === "OAUTH" && MENSAJES_OAUTH[codigo]) return MENSAJES_OAUTH[codigo];
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
  HDU_CREADA_DESPUES: "La HDU se creó mientras revisabas la consulta. No se modificó",
  ASIGNACION_INVALIDA: "La asignación ya no es válida",
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
  metodo: "Método de conexión",
};

export const ETIQUETAS_CAMBIO_HDU: Record<string, string> = { titulo: "Título", descripcion: "Descripción", prioridad: "Prioridad" };

/** Plantilla CSV generada en el cliente (D119): encabezado fijo y una fila de ejemplo sin datos del usuario. */
export const PLANTILLA_CSV = [
  "codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo",
  "EJEMPLO-1,Reemplaza esta fila,Describe aquí la historia,MEDIA,,,",
  "",
].join("\r\n");
