/**
 * Lector y validador de archivos CSV/JSON (J3, D102, sección 5.2 del backlog E5).
 *
 * Orden de validación (plan I4): tamaño → formato → estructura (contenido, columnas, filas) → filas.
 * Los errores de estructura lanzan `ErrorEstructuraArchivo` (nada se importa). Los de fila quedan en
 * `FilaMapeada.error` y no detienen a las demás. No guarda el contenido ni lo escribe en ningún registro.
 */
import { createHash } from 'node:crypto';
import { COLUMNAS_ARCHIVO, COLUMNAS_OBLIGATORIAS, validarFilasArchivo, type ColumnaArchivo, type FilaCruda } from '../../dominio/mapeo/fila-archivo.js';
import { normalizarTexto } from '../../dominio/mapeo/prioridad.js';
import { ErrorEstructuraArchivo, LIMITES, type AdvertenciaFila, type FilaMapeada, type OrigenEjecucion } from '../../dominio/mapeo/tipos.js';
import { detectarSeparador, parsearCsv } from './csv.js';

export type FormatoArchivo = 'CSV' | 'JSON';

export interface EntradaArchivo {
  /** Valor recibido en `formato` (se compara tal cual: solo `CSV` o `JSON`). */
  formato: unknown;
  contenido: string;
}

export interface ArchivoLeido {
  origen: OrigenEjecucion;
  filas: FilaMapeada[];
  /** `['COLUMNA_IGNORADA']` una sola vez si el archivo trae columnas que no se usan. */
  advertenciasArchivo: AdvertenciaFila[];
  columnasIgnoradas: string[];
  /** SHA-256 en hexadecimal del contenido recibido (D104: el contenido no se guarda). */
  huella: string;
  bytes: number;
}

/** Nombre canónico de una columna (`código`, `Qe_Correo`, `qeCorreo` → `qe_correo`), o `null`. */
export function columnaCanonica(encabezado: string): ColumnaArchivo | null {
  const llave = normalizarTexto(encabezado).replace(/[\s_-]+/g, '');
  for (const c of COLUMNAS_ARCHIVO) if (c.replace('_', '') === llave) return c;
  return null;
}

export function huellaDe(contenido: string): string {
  return createHash('sha256').update(contenido, 'utf8').digest('hex');
}

function sinBom(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Solo las comprobaciones previas al contenido: tamaño y formato. */
export function validarEnvoltorio(entrada: EntradaArchivo): { formato: FormatoArchivo; bytes: number } {
  const contenido = typeof entrada.contenido === 'string' ? entrada.contenido : '';
  const bytes = Buffer.byteLength(contenido, 'utf8');
  if (bytes > LIMITES.archivoMaxBytes) throw new ErrorEstructuraArchivo('ARCHIVO_MUY_GRANDE');
  if (entrada.formato !== 'CSV' && entrada.formato !== 'JSON') throw new ErrorEstructuraArchivo('FORMATO_NO_SOPORTADO');
  return { formato: entrada.formato, bytes };
}

export function leerArchivo(entrada: EntradaArchivo): ArchivoLeido {
  const { formato, bytes } = validarEnvoltorio(entrada);
  const contenido = typeof entrada.contenido === 'string' ? entrada.contenido : '';
  const texto = sinBom(contenido);
  if (texto.trim() === '') throw new ErrorEstructuraArchivo('ARCHIVO_VACIO');

  const { crudas, ignoradas } = formato === 'CSV' ? leerCsv(texto) : leerJson(texto);
  if (crudas.length > LIMITES.archivoMaxFilas) throw new ErrorEstructuraArchivo('DEMASIADAS_FILAS');

  return {
    origen: formato,
    filas: validarFilasArchivo(crudas),
    advertenciasArchivo: ignoradas.length > 0 ? ['COLUMNA_IGNORADA'] : [],
    columnasIgnoradas: ignoradas,
    huella: huellaDe(contenido),
    bytes,
  };
}

interface Lectura { crudas: FilaCruda[]; ignoradas: string[] }

function faltantes(presentes: Set<ColumnaArchivo>): ColumnaArchivo[] {
  return COLUMNAS_OBLIGATORIAS.filter((c) => !presentes.has(c));
}

function leerCsv(texto: string): Lectura {
  const filas = parsearCsv(texto, detectarSeparador(texto));
  const encabezado = filas[0];
  if (!encabezado) throw new ErrorEstructuraArchivo('ARCHIVO_VACIO');

  const indice = new Map<ColumnaArchivo, number>();
  const ignoradas: string[] = [];
  encabezado.forEach((nombre, i) => {
    const canonica = columnaCanonica(nombre);
    if (canonica === null) {
      if (nombre.trim() !== '') ignoradas.push(nombre.trim().slice(0, 60));
    } else if (!indice.has(canonica)) {
      indice.set(canonica, i);
    }
  });
  const faltan = faltantes(new Set(indice.keys()));
  if (faltan.length > 0) throw new ErrorEstructuraArchivo('COLUMNAS_FALTANTES', faltan);

  const datos = filas.slice(1);
  if (datos.length === 0) throw new ErrorEstructuraArchivo('ARCHIVO_VACIO');
  const crudas = datos.map((celdas, n): FilaCruda => {
    const valores: Partial<Record<ColumnaArchivo, unknown>> = {};
    for (const [columna, i] of indice) valores[columna] = celdas[i] ?? '';
    return { fila: n + 1, valores };
  });
  return { crudas, ignoradas };
}

function leerJson(texto: string): Lectura {
  let raiz: unknown;
  try {
    raiz = JSON.parse(texto);
  } catch {
    throw new ErrorEstructuraArchivo('ARCHIVO_ILEGIBLE');
  }
  const lista = Array.isArray(raiz)
    ? raiz
    : typeof raiz === 'object' && raiz !== null && Array.isArray((raiz as { historias?: unknown }).historias)
      ? (raiz as { historias: unknown[] }).historias
      : null;
  if (lista === null) throw new ErrorEstructuraArchivo('ARCHIVO_ILEGIBLE');
  if (lista.some((e) => typeof e !== 'object' || e === null || Array.isArray(e))) throw new ErrorEstructuraArchivo('ARCHIVO_ILEGIBLE');
  if (lista.length === 0) throw new ErrorEstructuraArchivo('ARCHIVO_VACIO');

  const presentes = new Set<ColumnaArchivo>();
  const ignoradas: string[] = [];
  const crudas = (lista as Record<string, unknown>[]).map((objeto, n): FilaCruda => {
    const valores: Partial<Record<ColumnaArchivo, unknown>> = {};
    for (const [clave, valor] of Object.entries(objeto)) {
      const canonica = columnaCanonica(clave);
      if (canonica === null) {
        const corta = clave.trim().slice(0, 60);
        if (corta !== '' && !ignoradas.includes(corta)) ignoradas.push(corta);
      } else {
        presentes.add(canonica);
        const actual = valores[canonica];
        if (actual === undefined || actual === null || actual === '') valores[canonica] = valor;
      }
    }
    return { fila: n + 1, valores };
  });
  const faltan = faltantes(presentes);
  if (faltan.length > 0) throw new ErrorEstructuraArchivo('COLUMNAS_FALTANTES', faltan);
  return { crudas, ignoradas };
}
