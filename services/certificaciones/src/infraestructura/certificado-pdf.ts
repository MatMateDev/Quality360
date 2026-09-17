/**
 * PDF del certificado de cierre (E3-F04#1, E3-B03#1): folio, datos de la HDU y
 * fechas y responsables de cada entregable. Usa pdf-lib con fuentes estándar
 * (sin archivos externos, apto para Vercel).
 */
import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import type { HduParaCertificacion } from './organizacion.cliente.js';

export interface FilaCertificado {
  readonly orden: number;
  readonly nombre: string;
  readonly estado: string;
  readonly completado: { nombre: string; fecha: Date } | null;
  readonly aprobado: { nombre: string; fecha: Date } | null;
}

export interface DatosCertificado {
  readonly folio: string;
  readonly emitidoEn: Date;
  readonly emitidoPor: string;
  readonly hdu: HduParaCertificacion;
  readonly filas: readonly FilaCertificado[];
  readonly urlVerificacion: string;
}

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 48;
const TINTA = rgb(0.13, 0.15, 0.2);
const TENUE = rgb(0.4, 0.43, 0.5);
const ACENTO = rgb(0.16, 0.33, 0.62);
const LINEA = rgb(0.85, 0.87, 0.9);

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function fecha(valor: Date): string {
  return FORMATO_FECHA.format(valor);
}

/** WinAnsi (fuentes estándar) no tiene todos los caracteres: se reemplazan los que no admite. */
function texto(fuente: PDFFont, valor: string): string {
  let resultado = '';
  for (const caracter of valor.normalize('NFC')) {
    try {
      fuente.encodeText(caracter);
      resultado += caracter;
    } catch {
      resultado += '?';
    }
  }
  return resultado;
}

function envolver(fuente: PDFFont, valor: string, tamano: number, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto(fuente, valor).split(/\s+/)) {
    const candidata = actual === '' ? palabra : `${actual} ${palabra}`;
    if (fuente.widthOfTextAtSize(candidata, tamano) <= ancho || actual === '') {
      actual = candidata;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual !== '') lineas.push(actual);
  return lineas;
}

@Injectable()
export class GeneradorCertificadoPdf {
  async generar(datos: DatosCertificado): Promise<Uint8Array> {
    const documento = await PDFDocument.create();
    documento.setTitle(`Certificado ${datos.folio}`);
    documento.setSubject(`Certificado de cierre de pruebas de ${datos.hdu.codigo}`);
    documento.setProducer('Quality360');
    documento.setCreationDate(datos.emitidoEn);

    const normal = await documento.embedFont(StandardFonts.Helvetica);
    const negrita = await documento.embedFont(StandardFonts.HelveticaBold);
    const pagina = documento.addPage([ANCHO, ALTO]);
    let y = ALTO - MARGEN;

    const escribir = (valor: string, x: number, tamano: number, fuente: PDFFont, color = TINTA, p: PDFPage = pagina): void => {
      p.drawText(texto(fuente, valor), { x, y, size: tamano, font: fuente, color });
    };

    // Encabezado
    escribir('QUALITY360', MARGEN, 11, negrita, ACENTO);
    y -= 26;
    escribir('Certificado de cierre de pruebas', MARGEN, 22, negrita);
    y -= 20;
    escribir(`Folio ${datos.folio}`, MARGEN, 12, negrita, ACENTO);
    escribir(`Emitido el ${fecha(datos.emitidoEn)} por ${datos.emitidoPor}`, MARGEN + 190, 10, normal, TENUE);
    y -= 14;
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1, color: LINEA });
    y -= 24;

    // Datos de la HDU
    const campos: Array<[string, string]> = [
      ['Historia de usuario', `${datos.hdu.codigo} · ${datos.hdu.titulo}`],
      ['Célula', datos.hdu.celula],
      ['Sprint', datos.hdu.sprint],
      ['QE responsable', datos.hdu.qeResponsable.nombre],
      ['Analista QA', datos.hdu.analista?.nombre ?? 'Sin asignar'],
    ];
    for (const [etiqueta, valor] of campos) {
      escribir(etiqueta, MARGEN, 9, negrita, TENUE);
      const lineas = envolver(normal, valor, 10, ANCHO - MARGEN * 2 - 120);
      for (const [indice, linea] of lineas.entries()) {
        if (indice > 0) y -= 13;
        escribir(linea, MARGEN + 120, 10, normal);
      }
      y -= 17;
    }
    y -= 10;

    // Tabla de entregables
    const columnas = [MARGEN, MARGEN + 22, MARGEN + 170, MARGEN + 250, MARGEN + 375];
    escribir('Entregables', MARGEN, 13, negrita);
    y -= 20;
    const encabezados = ['#', 'Entregable', 'Estado', 'Completado por', 'Aprobado por'];
    encabezados.forEach((titulo, i) => {
      pagina.drawText(texto(negrita, titulo), { x: columnas[i] ?? MARGEN, y, size: 9, font: negrita, color: TENUE });
    });
    y -= 8;
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.8, color: LINEA });
    y -= 16;

    for (const fila of datos.filas) {
      const celda = (valor: string, columna: number, fuente = normal, color = TINTA, dy = 0): void => {
        pagina.drawText(texto(fuente, valor), { x: columnas[columna] ?? MARGEN, y: y - dy, size: 9, font: fuente, color });
      };
      celda(String(fila.orden), 0, negrita);
      const nombre = envolver(normal, fila.nombre, 9, 140);
      nombre.forEach((linea, i) => celda(linea, 1, normal, TINTA, i * 11));
      celda(fila.estado, 2);
      if (fila.completado !== null) {
        celda(fila.completado.nombre, 3);
        celda(fecha(fila.completado.fecha), 3, normal, TENUE, 11);
      } else {
        celda('-', 3, normal, TENUE);
      }
      if (fila.aprobado !== null) {
        celda(fila.aprobado.nombre, 4);
        celda(fecha(fila.aprobado.fecha), 4, normal, TENUE, 11);
      } else {
        celda('-', 4, normal, TENUE);
      }
      y -= Math.max(28, nombre.length * 11 + 6);
      pagina.drawLine({ start: { x: MARGEN, y: y + 10 }, end: { x: ANCHO - MARGEN, y: y + 10 }, thickness: 0.4, color: LINEA });
    }

    // Pie con verificación
    y = MARGEN + 40;
    pagina.drawLine({ start: { x: MARGEN, y: y + 16 }, end: { x: ANCHO - MARGEN, y: y + 16 }, thickness: 1, color: LINEA });
    escribir('Verificación', MARGEN, 9, negrita, TENUE);
    y -= 14;
    escribir(`Confirma la validez de este certificado en ${datos.urlVerificacion}`, MARGEN, 9, normal);
    y -= 13;
    escribir('La verificación muestra la huella SHA-256 de este PDF para comprobar que no fue alterado.', MARGEN, 8, normal, TENUE);

    return documento.save();
  }
}
