/**
 * Quién puede cambiar el estado o reasignar una HDU (E2-F02, E2-F04#3,
 * "Cambio de estado" y "Asignación" en decisiones-mvp.md).
 */
import { evaluarAccesoHdu } from './ambito.js';
import type { AmbitoAcceso, EstadoHdu, Rol } from '../tipos.js';

export interface HduMinima {
  readonly estado: EstadoHdu;
  readonly qeResponsableId: string;
  readonly analistaId: string | null;
}

/** El analista asignado, el QE del ámbito (responsable o supervisor del analista) y el Administrador. */
export function puedeCambiarEstadoHdu(rol: Rol, actorId: string, ambito: AmbitoAcceso, hdu: HduMinima): boolean {
  if (rol === 'ADMINISTRADOR') return true;
  if (rol === 'ANALISTA_QA') return hdu.analistaId === actorId;
  return evaluarAccesoHdu('QE', actorId, ambito, hdu).permitido;
}

/** Solo el QE responsable de la HDU puede asignar; el Administrador, cualquiera. */
export function puedeAsignarAnalistaHdu(rol: Rol, actorId: string, hdu: HduMinima): boolean {
  if (rol === 'ADMINISTRADOR') return true;
  if (rol === 'QE') return hdu.qeResponsableId === actorId;
  return false;
}
