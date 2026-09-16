/**
 * Ámbito de acceso por rol (informe/backlog, D12):
 * - Un Analista QA ve solo lo suyo (sus HDU, su propio resumen).
 * - Un QE ve su equipo vigente y las HDU donde es responsable o cuyo
 *   analista supervisa hoy; no ve equipos ni HDU de otro QE.
 * - Un Administrador ve todo.
 */
import type { AmbitoAcceso, Rol, RelacionAccesoHdu } from '../tipos.js';

/** Construye el ámbito (`ResolucionAcceso.ambito`) a partir de las relaciones vigentes. */
export function calcularAmbito(
  rol: Rol,
  analistasSupervisadosIds: readonly string[],
  qeSupervisorId: string | null,
): AmbitoAcceso {
  if (rol === 'QE') return { qeSupervisorId: null, analistasSupervisadosIds };
  if (rol === 'ANALISTA_QA') return { qeSupervisorId, analistasSupervisadosIds: [] };
  return { qeSupervisorId: null, analistasSupervisadosIds: [] };
}

export interface ResultadoAccesoHdu {
  readonly permitido: boolean;
  readonly relacion: RelacionAccesoHdu | null;
}

/** ¿Puede `actorId` (con `rol` y `ambito`) acceder a esta HDU? (E2-B03, D12). */
export function evaluarAccesoHdu(
  rol: Rol,
  actorId: string,
  ambito: AmbitoAcceso,
  hdu: { readonly qeResponsableId: string; readonly analistaId: string | null },
): ResultadoAccesoHdu {
  if (rol === 'ADMINISTRADOR') return { permitido: true, relacion: 'ADMINISTRADOR' };

  if (rol === 'ANALISTA_QA') {
    if (hdu.analistaId !== null && hdu.analistaId === actorId) {
      return { permitido: true, relacion: 'ANALISTA_ASIGNADO' };
    }
    return { permitido: false, relacion: null };
  }

  // QE
  if (hdu.qeResponsableId === actorId) return { permitido: true, relacion: 'QE_RESPONSABLE' };
  if (hdu.analistaId !== null && ambito.analistasSupervisadosIds.includes(hdu.analistaId)) {
    return { permitido: true, relacion: 'QE_SUPERVISOR_DEL_ANALISTA' };
  }
  return { permitido: false, relacion: null };
}

export type FiltroAmbitoHdu =
  | { readonly tipo: 'TODAS' }
  | { readonly tipo: 'ANALISTA'; readonly analistaId: string }
  | { readonly tipo: 'QE'; readonly qeResponsableId: string; readonly analistasSupervisadosIds: readonly string[] };

/** Filtro de ámbito para el listado de HDU (E2-B03), aplicado antes de los filtros de la consulta. */
export function filtroAmbitoHdu(rol: Rol, actorId: string, ambito: AmbitoAcceso): FiltroAmbitoHdu {
  if (rol === 'ADMINISTRADOR') return { tipo: 'TODAS' };
  if (rol === 'ANALISTA_QA') return { tipo: 'ANALISTA', analistaId: actorId };
  return { tipo: 'QE', qeResponsableId: actorId, analistasSupervisadosIds: ambito.analistasSupervisadosIds };
}

/** ¿El analista pertenece al equipo vigente del QE? (asignación E2-F02, E2-B04). */
export function perteneceAlEquipo(analistaId: string, analistasSupervisadosIds: readonly string[]): boolean {
  return analistasSupervisadosIds.includes(analistaId);
}

/** Un QE solo ve su propio equipo; el Administrador puede pedir cualquiera (E1-B04). */
export function puedeConsultarEquipoDe(rol: Rol, actorId: string, qeIdConsultado: string): boolean {
  if (rol === 'ADMINISTRADOR') return true;
  if (rol === 'QE') return actorId === qeIdConsultado;
  return false;
}

/** Ámbito del resumen de QA (E1-B05): el propio analista, o el Administrador con `analistaId`. */
export function puedeConsultarResumenDeAnalista(rol: Rol, actorId: string, analistaIdConsultado: string): boolean {
  if (rol === 'ADMINISTRADOR') return true;
  if (rol === 'ANALISTA_QA') return actorId === analistaIdConsultado;
  return false;
}
