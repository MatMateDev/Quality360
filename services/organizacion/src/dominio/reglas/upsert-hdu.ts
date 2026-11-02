/**
 * Algoritmo por fila del upsert de HDU que usa Integraciones (E5, D97, D98, D100, D120). Funciones puras:
 * deciden qué hacer con una fila a partir de lo que ya existe, sin tocar la base. Sin dependencias de Nest
 * ni Prisma.
 */
import { LARGO_MAXIMO_TITULO_HDU, codigoHduValido } from './alta-hdu.js';
import type { EstadoHdu, OrigenHdu, PrioridadHdu } from '../tipos.js';

export const PRIORIDADES_HDU: readonly PrioridadHdu[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
export const PRIORIDAD_POR_DEFECTO: PrioridadHdu = 'MEDIA';

export type ResultadoFilaUpsert = 'CREADA' | 'ACTUALIZADA' | 'OMITIDA' | 'ERROR';

/** Motivos de una fila `OMITIDA` o `ERROR` (comun.v1.yaml#MotivoFila). */
export type MotivoFilaUpsert =
  | 'SIN_CAMBIOS'
  | 'HDU_CERRADA'
  | 'HDU_MANUAL_EXISTENTE'
  | 'CODIGO_INVALIDO'
  | 'TITULO_VACIO'
  | 'TITULO_LARGO'
  | 'PRIORIDAD_INVALIDA'
  | 'CELULA_NO_ENCONTRADA'
  | 'SPRINT_NO_ENCONTRADO'
  | 'SPRINT_REQUERIDO'
  | 'QE_INVALIDO'
  | 'ERROR_INTERNO';

export type AdvertenciaUpsert = 'SPRINT_NO_ENCONTRADO';

/** Una fila ya mapeada por Integraciones. Organización vuelve a validar: nunca confía en el llamador. */
export interface FilaUpsert {
  readonly fila: number;
  readonly codigo: string;
  readonly titulo: string | null;
  readonly descripcion: string | null;
  readonly prioridad: string | null;
  readonly celula: string | null;
  readonly sprint: string | null;
  readonly qeCorreo: string | null;
  readonly claveExterna: string | null;
  readonly urlExterna: string | null;
}

export interface CambioValor {
  readonly antes: string | null;
  readonly despues: string | null;
}

/** Solo estos tres campos pueden cambiar en una actualización (D98). */
export interface CambiosHdu {
  titulo?: CambioValor;
  descripcion?: CambioValor;
  prioridad?: CambioValor;
}

const VALOR_MAXIMO_CAMBIO = 200;

/** Los valores de `cambios` se recortan a 200 caracteres (D104). */
export function recortarCambio(valor: string | null): string | null {
  return valor === null ? null : valor.slice(0, VALOR_MAXIMO_CAMBIO);
}

/** Texto sin espacios en los extremos; vacío cuenta como ausente. */
export function textoNoVacio(valor: string | null | undefined): string | null {
  const recortado = valor?.trim() ?? '';
  return recortado.length === 0 ? null : recortado;
}

/** Paso 1 del algoritmo: reglas de la fila. Devuelve el motivo del error o `null` si la fila es válida. */
export function validarReglasDeFila(fila: Pick<FilaUpsert, 'codigo' | 'titulo' | 'prioridad'>): MotivoFilaUpsert | null {
  if (!codigoHduValido(fila.codigo.trim())) return 'CODIGO_INVALIDO';
  const titulo = textoNoVacio(fila.titulo);
  if (titulo === null) return 'TITULO_VACIO';
  if (titulo.length > LARGO_MAXIMO_TITULO_HDU) return 'TITULO_LARGO';
  if (fila.prioridad !== null && !(PRIORIDADES_HDU as readonly string[]).includes(fila.prioridad)) return 'PRIORIDAD_INVALIDA';
  return null;
}

/** Lo que se sabe de la HDU que ya existe con ese código. */
export interface HduExistente {
  readonly estado: EstadoHdu;
  readonly origen: OrigenHdu;
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly prioridad: PrioridadHdu;
}

export type DecisionSobreExistente =
  | { readonly tipo: 'OMITIR'; readonly motivo: 'HDU_CERRADA' | 'HDU_MANUAL_EXISTENTE' | 'SIN_CAMBIOS' }
  | {
      readonly tipo: 'ACTUALIZAR';
      readonly cambios: CambiosHdu;
      /** Valores nuevos de los campos que cambian. */
      readonly datos: { titulo?: string; descripcion?: string; prioridad?: PrioridadHdu };
      /** `true` si la fila vincula una HDU creada a mano: su origen pasa al de la solicitud (D97). */
      readonly vincula: boolean;
    };

/**
 * Paso 3: la HDU existe. Una `CERRADA` no se modifica; una `MANUAL` solo se toca si el Administrador pidió
 * vincular; si no, se comparan título, descripción y prioridad y un valor vacío o `null` nunca borra (D98).
 * Nunca decide sobre estado, analista, QE, célula, sprint, checklist ni impedimentos.
 */
export function decidirSobreExistente(
  existente: HduExistente,
  fila: Pick<FilaUpsert, 'titulo' | 'descripcion' | 'prioridad'>,
  opciones: { vincularExistentes: boolean },
): DecisionSobreExistente {
  if (existente.estado === 'CERRADA') return { tipo: 'OMITIR', motivo: 'HDU_CERRADA' };
  const vincula = existente.origen === 'MANUAL';
  if (vincula && !opciones.vincularExistentes) return { tipo: 'OMITIR', motivo: 'HDU_MANUAL_EXISTENTE' };

  const cambios: CambiosHdu = {};
  const datos: { titulo?: string; descripcion?: string; prioridad?: PrioridadHdu } = {};

  const titulo = textoNoVacio(fila.titulo);
  if (titulo !== null && titulo !== existente.titulo) {
    cambios.titulo = { antes: recortarCambio(existente.titulo), despues: recortarCambio(titulo) };
    datos.titulo = titulo;
  }
  const descripcion = textoNoVacio(fila.descripcion);
  if (descripcion !== null && descripcion !== (existente.descripcion ?? null)) {
    cambios.descripcion = { antes: recortarCambio(existente.descripcion), despues: recortarCambio(descripcion) };
    datos.descripcion = descripcion;
  }
  const prioridad = fila.prioridad as PrioridadHdu | null;
  if (prioridad !== null && prioridad !== existente.prioridad) {
    cambios.prioridad = { antes: existente.prioridad, despues: prioridad };
    datos.prioridad = prioridad;
  }

  // Vincular una manual es en sí un cambio (su origen), aunque el contenido coincida.
  if (Object.keys(cambios).length === 0 && !vincula) return { tipo: 'OMITIR', motivo: 'SIN_CAMBIOS' };
  return { tipo: 'ACTUALIZAR', cambios, datos, vincula };
}

export type ResolucionSprint =
  | { readonly ok: true; readonly sprintId: string; readonly advertencia: AdvertenciaUpsert | null }
  | { readonly ok: false; readonly motivo: 'SPRINT_NO_ENCONTRADO' | 'SPRINT_REQUERIDO' };

/**
 * Paso 4: el sprint de una HDU nueva (D120). Se busca por nombre solo entre los sprints de la célula de la
 * fila. Sin coincidencia, `sprintNoEncontrado` decide: `RESPALDO` (Jira) usa el sprint de respaldo con una
 * advertencia, `ERROR` (archivo) es un error de la fila. El respaldo solo sirve si es de esa misma célula.
 */
export function elegirSprint(entrada: {
  nombreEnFila: string | null;
  sprintDeLaCelula: { id: string } | null;
  respaldo: { id: string; celulaId: string } | null;
  celulaId: string;
  sprintNoEncontrado: 'RESPALDO' | 'ERROR';
}): ResolucionSprint {
  if (entrada.nombreEnFila !== null && entrada.sprintDeLaCelula !== null) return { ok: true, sprintId: entrada.sprintDeLaCelula.id, advertencia: null };
  const respaldoValido = entrada.respaldo !== null && entrada.respaldo.celulaId === entrada.celulaId ? entrada.respaldo : null;
  if (entrada.nombreEnFila !== null) {
    if (entrada.sprintNoEncontrado === 'ERROR') return { ok: false, motivo: 'SPRINT_NO_ENCONTRADO' };
    return respaldoValido === null ? { ok: false, motivo: 'SPRINT_REQUERIDO' } : { ok: true, sprintId: respaldoValido.id, advertencia: 'SPRINT_NO_ENCONTRADO' };
  }
  return respaldoValido === null ? { ok: false, motivo: 'SPRINT_REQUERIDO' } : { ok: true, sprintId: respaldoValido.id, advertencia: null };
}
