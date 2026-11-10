/**
 * PDF de las exportaciones de Indicadores (D168, D186) con `pdf-lib` y fuentes estándar (sin archivos externos, apto para
 * Vercel). Título «Quality360 · Indicadores», el encabezado, la tabla con el color escrito en texto y el pie con el
 * número de página. Apaisado, para que quepan las columnas.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import type { DocumentoExportacion } from '../../aplicacion/exportacion.tipos.js';

const ANCHO = 841.89;
const ALTO = 595.28;
const MARGEN = 36;
const TINTA = rgb(0.13, 0.15, 0.2);
const TENUE = rgb(0.4, 0.43, 0.5);
const LINEA = rgb(0.85, 0.87, 0.9);
const TAMANO = 8;
const INTERLINEA = 11;

/** WinAnsi (fuentes estándar) no tiene todos los caracteres: se reemplazan los que no admite. */
function seguro(fuente: PDFFont, valor: string): string {
  let resultado = '';
  for (const caracter of valor.normalize('NFC').replace(/[\r\n\t]+/g, ' ')) {
    try {
      fuente.encodeText(caracter);
      resultado += caracter;
    } catch {
      resultado += '?';
    }
  }
  return resultado;
}

function recortar(fuente: PDFFont, valor: string, ancho: number, tamano: number): string {
  if (fuente.widthOfTextAtSize(valor, tamano) <= ancho) return valor;
  let texto = valor;
  while (texto.length > 1 && fuente.widthOfTextAtSize(`${texto}…`.replace('…', '...'), tamano) > ancho) texto = texto.slice(0, -1);
  return `${texto}...`;
}

export async function generarPdf(documento: DocumentoExportacion): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let pagina: PDFPage;
  let y = 0;

  const nueva = (): void => {
    pagina = pdf.addPage([ANCHO, ALTO]);
    paginas.push(pagina);
    y = ALTO - MARGEN;
  };
  const escribir = (valor: string, x: number, fuente: PDFFont, tamano: number, color = TINTA): void => {
    pagina.drawText(seguro(fuente, valor), { x, y, size: tamano, font: fuente, color });
  };

  nueva();
  escribir('Quality360 · Indicadores', MARGEN, negrita, 16);
  y -= 22;
  for (const [clave, valor] of documento.encabezado) {
    escribir(`${clave}:`, MARGEN, negrita, 9);
    escribir(recortar(normal, seguro(normal, valor), ANCHO - 2 * MARGEN - 130, 9), MARGEN + 130, normal, 9);
    y -= 13;
  }
  y -= 8;

  if (documento.filas.length === 0) {
    escribir(documento.textoSinDatos, MARGEN, normal, 11);
  } else {
    const ancho = (ANCHO - 2 * MARGEN) / documento.columnas.length;
    const cabecera = (): void => {
      documento.columnas.forEach((columna, i) => escribir(recortar(negrita, seguro(negrita, columna), ancho - 4, TAMANO), MARGEN + i * ancho, negrita, TAMANO));
      y -= 3;
      pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.6, color: LINEA });
      y -= INTERLINEA;
    };
    cabecera();
    for (const fila of documento.filas) {
      if (y < MARGEN + 30) {
        nueva();
        cabecera();
      }
      fila.forEach((celda, i) => {
        const texto = celda === null || celda === undefined ? '' : String(celda);
        escribir(recortar(normal, seguro(normal, texto), ancho - 4, TAMANO), MARGEN + i * ancho, normal, TAMANO);
      });
      y -= INTERLINEA;
    }
  }

  // Pie con el número de página.
  paginas.forEach((p, indice) => {
    p.drawText(`Página ${indice + 1} de ${paginas.length}`, { x: ANCHO - MARGEN - 80, y: 18, size: 8, font: normal, color: TENUE });
  });
  return pdf.save({ useObjectStreams: false });
}
