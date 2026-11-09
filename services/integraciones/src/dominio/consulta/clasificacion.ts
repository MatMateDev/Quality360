/**
 * Clasificación de las filas de una consulta (D136, con la regla de D98). Puro: decide a partir de la fila mapeada
 * y de lo que Organización dice de la HDU con ese código; no llama a nadie.
 */
import type { FilaMapeada } from '../mapeo/tipos.js';
import type { MotivoFila, PrioridadHdu } from '../tipos.js';
import type { CambiosConsulta, GrupoConsulta, OrigenHduConsulta, YaAsignada } from './tipos.js';

/** Lo que `hdu/estado-codigos` responde por un código que existe. */
export interface HduExistente {
  readonly idHistoria: string;
  readonly estado: string;
  readonly origen: OrigenHduConsulta;
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly prioridad: PrioridadHdu;
  readonly qeResponsable: string | null;
  /** Nombre del Analista asignado, o `null` (D204). Una Organización anterior no lo envía: se trata como `null`. */
  readonly analista?: string | null;
}

/**
 * Toda HDU existente tiene QE responsable (D54): la instantánea `yaAsignada` de la fila (D204). Si Organización no
 * informara el QE se guarda un texto neutro, nunca se descarta la alerta.
 */
export function yaAsignadaDe(existente: HduExistente): YaAsignada {
  const qe = existente.qeResponsable?.trim() ?? '';
  const analista = existente.analista?.trim() ?? '';
  return { idHistoria: existente.idHistoria, qe: (qe === '' ? 'Sin QE asignado' : qe).slice(0, 150), analista: analista === '' ? null : analista.slice(0, 150) };
}

export interface Clasificacion {
  readonly grupo: GrupoConsulta;
  readonly motivo: MotivoFila | null;
  readonly cambios: CambiosConsulta | null;
}

/** Los valores de `cambios` llegan hasta 1.000 caracteres (el portal recorta lo que muestra). */
const VALOR_MAXIMO = 1000;
const recortar = (valor: string | null): string | null => (valor === null ? null : valor.slice(0, VALOR_MAXIMO));

/** Texto sin espacios en los extremos; vacío cuenta como ausente (nunca borra, D98). */
function noVacio(valor: string | null | undefined): string | null {
  const recortado = valor?.trim() ?? '';
  return recortado.length === 0 ? null : recortado;
}

/**
 * - Con error de mapeo: `CON_ERROR` (el motivo es el del mapeo).
 * - Sin HDU: `NUEVA`.
 * - HDU `CERRADA`: `SIN_CAMBIOS` con `HDU_CERRADA`, aunque Jira traiga otros valores.
 * - Título, descripción o prioridad no vacíos y distintos: `CAMBIO` con `antes` y `despues`. Una prioridad ausente o
 *   desconocida llega `null` del mapeo y no cuenta como cambio.
 * - Si no: `SIN_CAMBIOS`. Una HDU creada a mano se clasifica igual; vincularla es decisión del Administrador (D144).
 */
export function clasificarFila(fila: Pick<FilaMapeada, 'titulo' | 'descripcion' | 'prioridad' | 'error'>, existente: HduExistente | null): Clasificacion {
  if (fila.error !== null) return { grupo: 'CON_ERROR', motivo: fila.error, cambios: null };
  if (existente === null) return { grupo: 'NUEVA', motivo: null, cambios: null };
  if (existente.estado === 'CERRADA') return { grupo: 'SIN_CAMBIOS', motivo: 'HDU_CERRADA', cambios: null };

  const cambios: CambiosConsulta = {};
  const titulo = noVacio(fila.titulo);
  if (titulo !== null && titulo !== existente.titulo) cambios.titulo = { antes: recortar(existente.titulo), despues: recortar(titulo) };
  const descripcion = noVacio(fila.descripcion);
  if (descripcion !== null && descripcion !== (existente.descripcion ?? null)) cambios.descripcion = { antes: recortar(existente.descripcion), despues: recortar(descripcion) };
  const prioridad = fila.prioridad ?? null;
  if (prioridad !== null && prioridad !== existente.prioridad) cambios.prioridad = { antes: existente.prioridad, despues: prioridad };

  if (Object.keys(cambios).length === 0) return { grupo: 'SIN_CAMBIOS', motivo: 'SIN_CAMBIOS', cambios: null };
  return { grupo: 'CAMBIO', motivo: null, cambios };
}
