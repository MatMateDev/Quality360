/**
 * Generador de CSV de las exportaciones del Auditor (D35, D48): UTF-8 con BOM,
 * separador `;`, fila de encabezado, fechas ISO 8601 en UTC y saltos `\r\n`
 * para que Excel lo abra bien. Sin coincidencias, solo el encabezado.
 */
export const BOM_UTF8 = '﻿';
export const SEPARADOR_CSV = ';';

export type CeldaCsv = string | number | boolean | Date | null | undefined;

// D122 (OWASP CSV Injection): toda celda de TEXTO que empiece con `=`, `+`, `-`, `@`, tabulación o retorno de carro se
// prefija con una comilla simple, ANTES del entrecomillado RFC 4180. Los números, fechas y booleanos que genera el
// servidor no se prefijan: son tipados y así un número negativo sigue siendo un número.
const INICIO_FORMULA = /^[=+\-@\t\r]/;

/** Una celda: fechas en ISO UTC, texto entre comillas si hace falta, y sin que Excel lo trate como fórmula. */
export function celdaCsv(valor: CeldaCsv): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString();
  let texto = typeof valor === 'string' ? valor : String(valor);
  // Un texto que Excel interpretaría como fórmula se antepone con una comilla simple.
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

/** `AAAA-MM-DD` en UTC, para el nombre del archivo. */
export function fechaParaNombre(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function nombreArchivo(recurso: string, fecha: Date): string {
  return `quality360-${recurso}-${fechaParaNombre(fecha)}.csv`;
}
