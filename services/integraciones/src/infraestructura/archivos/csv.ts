/**
 * CSV RFC 4180 escrito a mano (J3, sin dependencias): campos entre comillas dobles con comas,
 * comillas duplicadas y saltos de línea dentro del campo; fin de línea CRLF, LF o CR.
 * Es tolerante con una comilla en medio de un campo sin comillas (se toma literal).
 * Comillas sin cerrar: `ARCHIVO_ILEGIBLE`.
 */
import { ErrorEstructuraArchivo } from '../../dominio/mapeo/tipos.js';

export type Separador = ',' | ';';

/** Detecta `,` o `;` contando los que están fuera de comillas en la primera línea (el encabezado). */
export function detectarSeparador(texto: string): Separador {
  let comas = 0;
  let puntoycoma = 0;
  let entreComillas = false;
  for (const c of texto) {
    if (c === '"') entreComillas = !entreComillas;
    else if (!entreComillas) {
      if (c === '\n' || c === '\r') break;
      if (c === ',') comas += 1;
      else if (c === ';') puntoycoma += 1;
    }
  }
  return puntoycoma > comas ? ';' : ',';
}

/** Filas de campos. Las líneas totalmente vacías se descartan. */
export function parsearCsv(texto: string, separador: Separador): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  let campoEntrecomillado = false;
  let hayContenidoEnLinea = false;

  const cerrarCampo = (): void => {
    fila.push(campo);
    campo = '';
    campoEntrecomillado = false;
  };
  const cerrarFila = (): void => {
    cerrarCampo();
    // Una línea sin nada (un solo campo vacío sin comillas) no es una fila.
    if (hayContenidoEnLinea || fila.length > 1) filas.push(fila);
    fila = [];
    hayContenidoEnLinea = false;
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] as string;
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 1; } else { entreComillas = false; }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === '' && !campoEntrecomillado) {
      entreComillas = true;
      campoEntrecomillado = true;
      hayContenidoEnLinea = true;
    } else if (c === separador) {
      cerrarCampo();
      hayContenidoEnLinea = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      cerrarFila();
    } else {
      campo += c;
      hayContenidoEnLinea = true;
    }
  }
  if (entreComillas) throw new ErrorEstructuraArchivo('ARCHIVO_ILEGIBLE');
  if (campo !== '' || campoEntrecomillado || fila.length > 0 || hayContenidoEnLinea) cerrarFila();
  return filas;
}
