/**
 * Generador de CSV de las exportaciones del Auditor (D35, D48): UTF-8 con BOM,
 * separador `;`, fila de encabezado, fechas ISO 8601 en UTC y saltos `\r\n`
 * para que Excel lo abra bien. Sin coincidencias, solo el encabezado.
 *
 * Es la misma regla que aplica Organización en su propio generador: cada servicio
 * exporta lo suyo y no comparten código de dominio (D48).
 */
export const BOM_UTF8 = '﻿';
export const SEPARADOR_CSV = ';';

export type CeldaCsv = string | number | boolean | Date | null | undefined;

const INICIO_FORMULA = /^[=+\-@\t\r]/;

/** Una celda: fechas en ISO UTC, texto entre comillas si hace falta, y sin que Excel lo trate como fórmula. */
export function celdaCsv(valor: CeldaCsv): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString();
  let texto = typeof valor === 'string' ? valor : String(valor);
  if (typeof valor === 'string' && INICIO_FORMULA.test(texto)) texto = `'${texto}`;
  if (/[;"\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function filaCsv(celdas: readonly CeldaCsv[]): string {
  return celdas.map(celdaCsv).join(SEPARADOR_CSV);
}

/** Documento completo: BOM, encabezado y filas. */
export function generarCsv(encabezado: readonly string[], filas: ReadonlyArray<readonly CeldaCsv[]>): string {
  return BOM_UTF8 + [filaCsv(encabezado), ...filas.map(filaCsv)].join('\r\n') + '\r\n';
}

export function nombreArchivo(recurso: string, fecha: Date): string {
  return `quality360-${recurso}-${fecha.toISOString().slice(0, 10)}.csv`;
}
