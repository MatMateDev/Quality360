/** Tabla de prioridades de la sección 5.1 del backlog E5 (sin distinguir mayúsculas ni tildes). */
import type { AdvertenciaFila, PrioridadHdu } from './tipos.js';

const TABLA: Record<string, PrioridadHdu> = {
  highest: 'CRITICA', blocker: 'CRITICA', critical: 'CRITICA', 'mas alta': 'CRITICA', critica: 'CRITICA',
  high: 'ALTA', alta: 'ALTA',
  medium: 'MEDIA', media: 'MEDIA',
  low: 'BAJA', lowest: 'BAJA', baja: 'BAJA', 'mas baja': 'BAJA',
};

export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** `null` si el valor no está en la tabla. */
export function resolverPrioridad(valor: string): PrioridadHdu | null {
  const clave = normalizarTexto(valor);
  return Object.prototype.hasOwnProperty.call(TABLA, clave) ? (TABLA[clave] as PrioridadHdu) : null;
}

/**
 * Prioridad de una issue de Jira. `prioridad: null` significa «ausente o desconocida»: Organización
 * usa MEDIA al crear y no cambia nada al actualizar.
 */
export function mapearPrioridadJira(nombre: string | null): { prioridad: PrioridadHdu | null; advertencia: AdvertenciaFila | null } {
  if (nombre === null || nombre.trim() === '') return { prioridad: null, advertencia: 'PRIORIDAD_AUSENTE' };
  const prioridad = resolverPrioridad(nombre);
  return prioridad === null
    ? { prioridad: null, advertencia: 'PRIORIDAD_DESCONOCIDA' }
    : { prioridad, advertencia: null };
}
