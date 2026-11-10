/**
 * CSV de las exportaciones de Indicadores (D168, D186): UTF-8 con BOM, separador `;` (igual que E7, D48), saltos CRLF,
 * RFC 4180 y neutralización de fórmulas (D122) en toda celda de TEXTO, encabezado incluido. Los números y las fechas
 * ISO no se prefijan. Primero un bloque de dos columnas (`Reporte`, `Vista`, `Filtros`, `Rol y ámbito`, `Generado`),
 * una línea en blanco y la tabla. Cada servicio exporta lo suyo; el código no se comparte entre servicios.
 */
import type { DocumentoExportacion, CeldaExportacion } from '../../aplicacion/exportacion.tipos.js';

export const BOM_UTF8 = '﻿';
export const SEPARADOR_CSV = ';';
const INICIO_FORMULA = /^[=+\-@\t\r]/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

export function celdaCsv(valor: CeldaExportacion): string {
  if (valor === null || valor === undefined) return '';
  let texto = typeof valor === 'string' ? valor : String(valor);
  if (typeof valor === 'string' && INICIO_FORMULA.test(texto) && !FECHA_ISO.test(texto)) texto = `'${texto}`;
  if (/[;"\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export const filaCsv = (celdas: readonly CeldaExportacion[]): string => celdas.map(celdaCsv).join(SEPARADOR_CSV);

export function generarCsv(documento: DocumentoExportacion): string {
  const lineas: string[] = documento.encabezado.map(([clave, valor]) => filaCsv([clave, valor]));
  lineas.push('');
  if (documento.filas.length === 0) lineas.push(filaCsv([documento.textoSinDatos]));
  else lineas.push(filaCsv(documento.columnas), ...documento.filas.map(filaCsv));
  return BOM_UTF8 + lineas.join('\r\n') + '\r\n';
}
