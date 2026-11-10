/** Forma común de lo que se exporta (cada vista la arma; el CSV y el PDF solo la presentan). */
export type CeldaExportacion = string | number | null | undefined;

export interface DocumentoExportacion {
  /** Pares (clave, valor) del encabezado: Reporte, Vista, Filtros, Rol y ámbito, Generado (hora de Chile). */
  readonly encabezado: ReadonlyArray<readonly [string, string]>;
  readonly columnas: readonly string[];
  readonly filas: ReadonlyArray<readonly CeldaExportacion[]>;
  /** «Sin datos para los filtros aplicados» cuando no hay filas. */
  readonly textoSinDatos: string;
}

export const TEXTO_SIN_DATOS = 'Sin datos para los filtros aplicados';
