/**
 * Tipos del mapeo hacia Organización (J0). `FilaUpsertHdu` replica el esquema del mismo nombre de
 * `contracts/comun.v1.yaml`; `FilaMapeada` le suma lo que solo usa Integraciones. Dominio puro.
 */
export type PrioridadHdu = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type OrigenEjecucion = 'JIRA' | 'CSV' | 'JSON';

export type MotivoFila =
  | 'SIN_CAMBIOS' | 'HDU_CERRADA' | 'HDU_MANUAL_EXISTENTE' | 'CODIGO_INVALIDO' | 'TITULO_VACIO'
  | 'TITULO_LARGO' | 'PRIORIDAD_INVALIDA' | 'CODIGO_DUPLICADO_EN_ARCHIVO' | 'CELULA_NO_ENCONTRADA'
  | 'SPRINT_NO_ENCONTRADO' | 'SPRINT_REQUERIDO' | 'QE_INVALIDO' | 'ERROR_INTERNO';

export type AdvertenciaFila =
  | 'SPRINT_NO_ENCONTRADO' | 'PRIORIDAD_AUSENTE' | 'PRIORIDAD_DESCONOCIDA' | 'TITULO_TRUNCADO'
  | 'DESCRIPCION_TRUNCADA' | 'COLUMNA_IGNORADA';

export interface FilaUpsertHdu {
  /** Número de fila de datos (la primera es 1) o posición de la issue en la lectura. */
  fila: number;
  codigo: string;
  titulo: string | null;
  descripcion?: string | null;
  prioridad?: PrioridadHdu | null;
  celula?: string | null;
  sprint?: string | null;
  qeCorreo?: string | null;
  claveExterna?: string | null;
  urlExterna?: string | null;
}

/** `ReferenciaJira` del contrato: informativa, no se guarda en la HDU (D101). */
export interface ReferenciaJira { estado: string | null; responsable: string | null }

// ------------------------------------------------------------------ detalle de la HDU (D196-D199, `DetalleHdu` del contrato)
export interface TextoDetalle { texto: string | null; truncado: boolean }
export interface CriteriosDetalle { texto: string | null; origen: 'CAMPO' | 'DESCRIPCION' | null; truncado: boolean }
export interface SprintDetalle { nombre: string; estado: 'ACTIVO' | 'FUTURO' | 'CERRADO'; inicio: string | null; fin: string | null }
export interface DetalleHdu {
  resumen: string | null;
  descripcion: TextoDetalle;
  criterios: CriteriosDetalle;
  estadoJira: string | null;
  prioridadJira: string | null;
  prioridadQ360: PrioridadHdu | null;
  tipo: string | null;
  responsableJira: string | null;
  etiquetas: Array<{ valor: string }>;
  etiquetasTotal: number;
  sprints: SprintDetalle[];
  epica: { clave: string; titulo: string | null } | null;
  fechas: { creada: string | null; actualizada: string | null; vencimiento: string | null; resolucion: string | null };
  urlJira: string | null;
}

export interface FilaMapeada extends FilaUpsertHdu {
  advertencias: AdvertenciaFila[];
  referencia: ReferenciaJira | null;
  /** Si no es `null`, la fila no se envía a Organización. */
  error: MotivoFila | null;
  /** Solo issues de Jira: el detalle saneado de la fila (D198). Ausente en las filas de archivo. */
  detalle?: DetalleHdu | null;
}

/** Deja solo los campos de `FilaUpsertHdu` (para armar el lote hacia Organización). */
export function aFilaUpsert(f: FilaMapeada): FilaUpsertHdu {
  const { advertencias: _a, referencia: _r, error: _e, detalle: _d, ...resto } = f;
  return resto;
}

export const LIMITES = {
  codigoMax: 40,
  tituloMax: 200,
  descripcionMax: 1000,
  celulaMax: 120,
  sprintMax: 120,
  qeCorreoMax: 150,
  archivoMaxBytes: 1_048_576,
  archivoMaxFilas: 500,
} as const;

export const PATRON_CODIGO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type CodigoErrorArchivo =
  | 'ARCHIVO_VACIO' | 'ARCHIVO_MUY_GRANDE' | 'FORMATO_NO_SOPORTADO' | 'ARCHIVO_ILEGIBLE'
  | 'COLUMNAS_FALTANTES' | 'DEMASIADAS_FILAS';

const HTTP_ARCHIVO: Record<CodigoErrorArchivo, number> = {
  ARCHIVO_VACIO: 422, ARCHIVO_MUY_GRANDE: 413, FORMATO_NO_SOPORTADO: 422, ARCHIVO_ILEGIBLE: 422,
  COLUMNAS_FALTANTES: 422, DEMASIADAS_FILAS: 422,
};

/** Error de estructura del archivo (sección 4.3 del backlog): no se importa nada. */
export class ErrorEstructuraArchivo extends Error {
  readonly estadoHttp: number;
  constructor(readonly codigo: CodigoErrorArchivo, readonly columnasFaltantes: string[] = []) {
    super(codigo);
    this.name = 'ErrorEstructuraArchivo';
    this.estadoHttp = HTTP_ARCHIVO[codigo];
  }
}

/** Recorta a `max` unidades sin dejar un par sustituto partido. */
export function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  let corte = texto.slice(0, max);
  const ultimo = corte.charCodeAt(corte.length - 1);
  if (ultimo >= 0xd800 && ultimo <= 0xdbff) corte = corte.slice(0, -1);
  return corte;
}

/**
 * Quita caracteres de control (incluido NUL, que PostgreSQL rechaza), salvo \n y \t, y los sustitutos UTF-16 huérfanos
 * (una mitad sin pareja: PostgreSQL rechaza el `jsonb` que la contiene).
 */
export function limpiarControl(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
}

/** Texto de una línea: control fuera, espacios colapsados y recortado en los bordes. */
export function limpiarLinea(texto: string): string {
  return limpiarControl(texto).replace(/\s+/g, ' ').trim();
}
