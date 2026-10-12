/** Validación de ruta y cuerpo: 400 `VALIDACION` con el campo que falla. */
import { errorValidacion, type DetalleError } from '@quality360/auth-nest';

import { esClaveEntregable, type ClaveEntregable } from '../dominio/entregables.js';
import type { EntradaEvidencia } from '../aplicacion/checklist.servicio.js';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function invalido(detalle: DetalleError): never {
  throw errorValidacion([detalle], `${detalle.campo}: ${detalle.mensaje}`);
}

export function hduIdDeRuta(valor: string): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    invalido({ campo: 'path.hduId', codigo: 'FORMATO_INVALIDO', mensaje: 'El identificador debe ser un UUID.' });
  }
  return valor.toLowerCase();
}

export function claveDeRuta(valor: string): ClaveEntregable {
  if (!esClaveEntregable(valor)) {
    invalido({ campo: 'path.clave', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'El entregable indicado no existe.' });
  }
  return valor;
}

function objeto(cuerpo: unknown): Record<string, unknown> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    invalido({ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: 'El cuerpo debe ser un objeto JSON.' });
  }
  return cuerpo as Record<string, unknown>;
}

/** `{evidencia: {tipo: 'ENLACE', url} | {tipo: 'ARCHIVO', ruta}}`. */
export function leerMarca(cuerpo: unknown): EntradaEvidencia {
  const evidencia = objeto(objeto(cuerpo).evidencia ?? invalido({ campo: 'evidencia', codigo: 'REQUERIDO', mensaje: 'Adjunta un enlace o un archivo como evidencia.' }));
  if (evidencia.tipo === 'ENLACE') {
    const url = typeof evidencia.url === 'string' ? evidencia.url.trim() : '';
    let valida = false;
    try {
      valida = url.length <= 500 && new URL(url).protocol === 'https:';
    } catch {
      valida = false;
    }
    if (!valida) invalido({ campo: 'evidencia.url', codigo: 'FORMATO_INVALIDO', mensaje: 'El enlace debe comenzar con https://.' });
    return { tipo: 'ENLACE', url };
  }
  if (evidencia.tipo === 'ARCHIVO') {
    const ruta = typeof evidencia.ruta === 'string' ? evidencia.ruta.trim() : '';
    if (ruta.length === 0 || ruta.length > 500) {
      invalido({ campo: 'evidencia.ruta', codigo: 'REQUERIDO', mensaje: 'Indica la ruta del archivo subido.' });
    }
    return { tipo: 'ARCHIVO', ruta };
  }
  return invalido({ campo: 'evidencia.tipo', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'La evidencia debe ser ENLACE o ARCHIVO.' });
}

export function leerTexto(cuerpo: unknown, campo: 'motivo' | 'comentario', maximo: number): unknown {
  const valor = objeto(cuerpo ?? {})[campo];
  if (typeof valor === 'string' && valor.length > maximo) {
    invalido({ campo, codigo: 'LONGITUD_INVALIDA', mensaje: `Máximo ${maximo} caracteres.` });
  }
  return valor;
}

export function leerSubida(cuerpo: unknown): { nombreArchivo: string; tipoContenido: string; tamanoBytes: number } {
  const datos = objeto(cuerpo);
  const nombreArchivo = typeof datos.nombreArchivo === 'string' ? datos.nombreArchivo.trim() : '';
  if (nombreArchivo.length === 0 || nombreArchivo.length > 200) {
    invalido({ campo: 'nombreArchivo', codigo: 'REQUERIDO', mensaje: 'Indica el nombre del archivo.' });
  }
  if (typeof datos.tipoContenido !== 'string') {
    invalido({ campo: 'tipoContenido', codigo: 'REQUERIDO', mensaje: 'Indica el tipo de archivo.' });
  }
  if (typeof datos.tamanoBytes !== 'number' || !Number.isInteger(datos.tamanoBytes)) {
    invalido({ campo: 'tamanoBytes', codigo: 'REQUERIDO', mensaje: 'Indica el tamaño del archivo en bytes.' });
  }
  return { nombreArchivo, tipoContenido: datos.tipoContenido, tamanoBytes: datos.tamanoBytes };
}
