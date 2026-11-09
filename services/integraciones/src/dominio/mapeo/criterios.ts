/**
 * Criterios de aceptación de una issue (D199), en este orden: (1) el campo personalizado detectado al guardar la
 * conexión, (2) la sección de la descripción que empieza en el encabezado «Criterios de aceptación», (3) ninguno.
 * Puro y sin llamadas: todo sale de la misma respuesta de `search/jql`.
 */
import { adfADetalle, criteriosDeDescripcion } from './adf-a-texto.js';
import type { CriteriosDetalle } from './tipos.js';

export const CRITERIOS_MAX = 4000;

/** Recorta sin partir un par sustituto y avisa si recortó. */
export function limitarTexto(texto: string, max: number): { texto: string; truncado: boolean } {
  if (texto.length <= max) return { texto, truncado: false };
  let corte = texto.slice(0, max);
  const ultimo = corte.charCodeAt(corte.length - 1);
  if (ultimo >= 0xd800 && ultimo <= 0xdbff) corte = corte.slice(0, -1);
  return { texto: corte.trimEnd(), truncado: true };
}

export function resolverCriterios(campoAdf: unknown, descripcionAdf: unknown, max = CRITERIOS_MAX): CriteriosDetalle {
  const delCampo = campoAdf === undefined || campoAdf === null ? '' : adfADetalle(campoAdf);
  if (delCampo !== '') {
    const { texto, truncado } = limitarTexto(delCampo, max);
    return { texto, origen: 'CAMPO', truncado };
  }
  const deDescripcion = criteriosDeDescripcion(descripcionAdf);
  if (deDescripcion !== null) {
    const { texto, truncado } = limitarTexto(deDescripcion, max);
    return { texto, origen: 'DESCRIPCION', truncado };
  }
  return { texto: null, origen: null, truncado: false };
}
