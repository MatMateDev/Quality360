/**
 * Validación por fila de un archivo CSV/JSON (J3, secciones 4.2 y 5.2 del backlog E5, D102).
 * Dominio puro: recibe las filas ya separadas en columnas por el lector y devuelve `FilaMapeada`.
 * Un valor que empieza con `=`, `+`, `-` o `@` se conserva tal cual (D122: se neutraliza al exportar).
 */
import { resolverPrioridad } from './prioridad.js';
import {
  LIMITES, PATRON_CODIGO, limpiarControl, limpiarLinea, recortar,
  type AdvertenciaFila, type FilaMapeada, type MotivoFila,
} from './tipos.js';

export const COLUMNAS_ARCHIVO = ['codigo', 'titulo', 'descripcion', 'prioridad', 'celula', 'sprint', 'qe_correo'] as const;
export type ColumnaArchivo = (typeof COLUMNAS_ARCHIVO)[number];
export const COLUMNAS_OBLIGATORIAS: readonly ColumnaArchivo[] = ['codigo', 'titulo'];

/** Fila tal como salió del lector: `fila` es la posición entre las filas de datos (la primera es 1). */
export interface FilaCruda {
  fila: number;
  valores: Partial<Record<ColumnaArchivo, unknown>>;
}

/** `null` = el valor no es un texto, número ni booleano (por ejemplo un objeto de un JSON). */
function aTexto(v: unknown): string | null {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

const opcional = (v: unknown): string => limpiarLinea(aTexto(v) ?? '');

export function validarFilasArchivo(filas: FilaCruda[]): FilaMapeada[] {
  const vistos = new Set<string>();
  return filas.map((f) => validarFila(f, vistos));
}

function validarFila(cruda: FilaCruda, vistos: Set<string>): FilaMapeada {
  const v = cruda.valores;
  const advertencias: AdvertenciaFila[] = [];
  let error: MotivoFila | null = null;

  const codigo = limpiarLinea(aTexto(v.codigo) ?? '');
  const codigoValido = codigo.length > 0 && codigo.length <= LIMITES.codigoMax && PATRON_CODIGO.test(codigo);
  if (!codigoValido) {
    error = 'CODIGO_INVALIDO';
  } else {
    const llave = codigo.toLowerCase();
    if (vistos.has(llave)) error = 'CODIGO_DUPLICADO_EN_ARCHIVO'; // gana la primera aparición
    else vistos.add(llave);
  }

  let titulo: string | null = limpiarLinea(aTexto(v.titulo) ?? '');
  if (titulo === '') {
    titulo = null;
    error ??= 'TITULO_VACIO';
  } else if (titulo.length > LIMITES.tituloMax) {
    error ??= 'TITULO_LARGO'; // en archivo no se trunca
    titulo = recortar(titulo, LIMITES.tituloMax);
  }

  let descripcion: string | null = limpiarControl(aTexto(v.descripcion) ?? '').replace(/\r\n?/g, '\n').trim();
  if (descripcion === '') {
    descripcion = null;
  } else if (descripcion.length > LIMITES.descripcionMax) {
    descripcion = recortar(descripcion, LIMITES.descripcionMax).trimEnd();
    advertencias.push('DESCRIPCION_TRUNCADA');
  }

  // Prioridad vacía: MEDIA al crear y sin cambio al actualizar (lo decide Organización con null).
  let prioridad: FilaMapeada['prioridad'] = null;
  const prioridadTexto = aTexto(v.prioridad);
  if (prioridadTexto === null) {
    error ??= 'PRIORIDAD_INVALIDA';
  } else if (limpiarLinea(prioridadTexto) !== '') {
    prioridad = resolverPrioridad(limpiarLinea(prioridadTexto));
    if (prioridad === null) error ??= 'PRIORIDAD_INVALIDA';
  }

  // Valores más largos que el límite del contrato se rechazan aquí: un 400 de Organización tumbaría el lote.
  const celula = opcional(v.celula);
  if (celula.length > LIMITES.celulaMax) error ??= 'CELULA_NO_ENCONTRADA';
  const sprint = opcional(v.sprint);
  if (sprint.length > LIMITES.sprintMax) error ??= 'SPRINT_NO_ENCONTRADO';
  const qeCorreo = opcional(v.qe_correo);
  if (qeCorreo.length > LIMITES.qeCorreoMax) error ??= 'QE_INVALIDO';

  return {
    fila: cruda.fila,
    codigo: recortar(codigo, 200),
    titulo,
    descripcion,
    prioridad,
    celula: celula === '' || celula.length > LIMITES.celulaMax ? null : celula,
    sprint: sprint === '' || sprint.length > LIMITES.sprintMax ? null : sprint,
    qeCorreo: qeCorreo === '' || qeCorreo.length > LIMITES.qeCorreoMax ? null : qeCorreo,
    claveExterna: null,
    urlExterna: null,
    advertencias,
    referencia: null,
    error,
  };
}
