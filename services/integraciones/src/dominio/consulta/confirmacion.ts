/**
 * Confirmación de una consulta (D140, D141): qué filas se escriben, en qué lotes y cómo se traduce lo que responde
 * Organización a las filas de detalle. Puro: no llama a Organización ni toca la base.
 */
import { mensajeDeFila } from '../catalogos.js';
import { TAMANO_LOTE, recortar } from '../ejecucion.js';
import type { AdvertenciaFila, AsignacionNombres, CambiosHdu, FilaDetalle, MotivoFila, ResultadoFila } from '../tipos.js';
import { estaCompleta } from './asignacion.js';
import type { ItemConsulta } from './tipos.js';

export type OperacionConfirmacion = 'CREAR' | 'ACTUALIZAR';

/** Una fila marcada y sin aplicar, con lo que hay que hacer con ella. */
export interface PasoDeConfirmacion {
  readonly item: ItemConsulta;
  readonly operacion: OperacionConfirmacion;
}

/** Marcadas y sin aplicar, por posición: `NUEVA` crea y `CAMBIO` actualiza; el resto nunca se escribe (D140). */
export function pasosPendientes(items: readonly ItemConsulta[]): PasoDeConfirmacion[] {
  return items
    .filter((item) => item.marcada && !item.aplicada && (item.grupo === 'NUEVA' || item.grupo === 'CAMBIO'))
    .sort((a, b) => a.posicion - b.posicion)
    .map((item) => ({ item, operacion: item.grupo === 'NUEVA' ? ('CREAR' as const) : ('ACTUALIZAR' as const) }));
}

/** Lotes de 25 (D100). */
export function planDeLotes(pasos: readonly PasoDeConfirmacion[], tamano = TAMANO_LOTE): PasoDeConfirmacion[][] {
  const lotes: PasoDeConfirmacion[][] = [];
  for (let desde = 0; desde < pasos.length; desde += tamano) lotes.push(pasos.slice(desde, desde + tamano));
  return lotes;
}

/** Ids de la asignación de una fila `NUEVA` completa; `null` si le falta algo (no debería: solo se marca lo completo). */
export function asignacionParaUpsert(item: ItemConsulta): { celulaId: string; qeResponsableId: string; analistaId: string; sprintId: string } | null {
  const a = item.asignacion;
  if (!estaCompleta(a)) return null;
  return { celulaId: (a.celula as { id: string }).id, qeResponsableId: (a.qe as { id: string }).id, analistaId: (a.analista as { id: string }).id, sprintId: (a.sprint as { id: string }).id };
}

/** Nombres de la asignación para el detalle de la confirmación (D141). */
export function nombresDeAsignacion(item: ItemConsulta): AsignacionNombres | null {
  const a = item.asignacion;
  if (!estaCompleta(a)) return null;
  return { celula: (a.celula as { nombre: string }).nombre, qe: (a.qe as { nombre: string }).nombre, analista: (a.analista as { nombre: string }).nombre, sprint: (a.sprint as { nombre: string }).nombre };
}

/** Lo que Organización responde por una fila del upsert en modo confirmación. */
export interface ResultadoUpsertFila {
  readonly resultado: ResultadoFila;
  readonly motivo: MotivoFila | null;
  readonly idHistoria: string | null;
  readonly advertencias: AdvertenciaFila[];
  readonly cambios: CambiosHdu | null;
}

/** Fila de detalle de la confirmación para un paso, con los textos recortados a lo que guarda `detalle_ejecucion`. */
export function detalleDeConfirmacion(paso: PasoDeConfirmacion, r: ResultadoUpsertFila): FilaDetalle {
  const { item } = paso;
  return {
    fila: item.posicion,
    codigo: recortar(item.codigo, 60),
    titulo: recortar(item.titulo, 200),
    idHistoria: r.idHistoria ?? (r.resultado === 'CREADA' || r.resultado === 'ACTUALIZADA' ? item.idHistoria : null),
    resultado: r.resultado,
    motivo: r.motivo,
    mensaje: r.motivo === null ? null : mensajeDeFila(r.motivo),
    advertencias: [...new Set([...item.advertencias, ...r.advertencias])],
    cambios: r.cambios,
    referencia: item.referencia,
    asignacion: r.resultado === 'CREADA' ? nombresDeAsignacion(item) : null,
  };
}

/** Una fila que Organización no devolvió (respuesta incompleta) es error interno, nunca éxito. */
export function detalleDeErrorInterno(paso: PasoDeConfirmacion): FilaDetalle {
  return detalleDeConfirmacion(paso, { resultado: 'ERROR', motivo: 'ERROR_INTERNO', idHistoria: null, advertencias: [], cambios: null });
}
