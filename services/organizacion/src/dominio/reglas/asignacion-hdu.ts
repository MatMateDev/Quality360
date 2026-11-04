/**
 * Reglas de la asignación de una HDU (E2-B02, D54, D138): las comparten la asignación de analista de `PATCH /v1/hdu`,
 * la validación de la consulta de Jira (`asignaciones/validar`) y la escritura de la confirmación (`hdu/upsert`),
 * para que ninguna duplique ni se salte una regla. Funciones puras, sin dependencias de Nest ni Prisma.
 */
import type { Rol } from '../tipos.js';

export type CodigoErrorAsignacion = 'QE_INVALIDO' | 'ANALISTA_INVALIDO' | 'ANALISTA_FUERA_DE_EQUIPO' | 'CATALOGO_INVALIDO';
export type CampoAsignacion = 'celulaId' | 'qeResponsableId' | 'analistaId' | 'sprintId';

export interface ErrorAsignacion {
  readonly campo: CampoAsignacion;
  readonly codigo: CodigoErrorAsignacion;
}

interface UsuarioAsignable {
  readonly rol: Rol;
  readonly activo: boolean;
}

/** El analista asignable debe tener rol Analista QA y estar activo (E2-B02, `ANALISTA_INVALIDO`). */
export function esAnalistaAsignable(usuario: UsuarioAsignable | null): boolean {
  return usuario !== null && usuario.rol === 'ANALISTA_QA' && usuario.activo;
}

/** El analista debe estar en el equipo vigente del QE (E2-B02, `ANALISTA_FUERA_DE_EQUIPO`). */
export function analistaEstaEnEquipo(equipoVigenteIds: readonly string[], analistaId: string): boolean {
  return equipoVigenteIds.includes(analistaId);
}

/** Lo que se sabe de una combinación y de las entidades que nombra. `null` = no existe. */
export interface EntidadesDeAsignacion {
  readonly celula: { readonly id: string } | null;
  readonly qe: (UsuarioAsignable & { readonly id: string }) | null;
  readonly analista: (UsuarioAsignable & { readonly id: string }) | null;
  readonly sprint: { readonly id: string; readonly celulaId: string } | null;
  /** Analistas del equipo vigente del QE; solo se lee si hay un QE válido. */
  readonly equipoDelQe: readonly string[] | null;
}

export interface CamposPresentes {
  readonly celulaId: boolean;
  readonly qeResponsableId: boolean;
  readonly analistaId: boolean;
  readonly sprintId: boolean;
}

/**
 * D138, solo para los campos presentes. El analista debe ser del equipo vigente del QE de la misma combinación
 * (más estricto que lo permitido al Administrador en E2); un analista sin QE no tiene equipo contra el cual
 * validarse. Si el QE es inválido solo se informa el QE: sin QE válido no hay equipo que comprobar.
 */
export function validarAsignacion(presentes: CamposPresentes, entidades: EntidadesDeAsignacion): ErrorAsignacion[] {
  const errores: ErrorAsignacion[] = [];
  const celulaValida = presentes.celulaId && entidades.celula !== null;
  if (presentes.celulaId && entidades.celula === null) errores.push({ campo: 'celulaId', codigo: 'CATALOGO_INVALIDO' });

  const qeValido = presentes.qeResponsableId && entidades.qe !== null && entidades.qe.rol === 'QE' && entidades.qe.activo;
  if (presentes.qeResponsableId && !qeValido) errores.push({ campo: 'qeResponsableId', codigo: 'QE_INVALIDO' });

  if (presentes.analistaId) {
    if (!esAnalistaAsignable(entidades.analista)) errores.push({ campo: 'analistaId', codigo: 'ANALISTA_INVALIDO' });
    else if (!presentes.qeResponsableId) errores.push({ campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' });
    else if (qeValido && !analistaEstaEnEquipo(entidades.equipoDelQe ?? [], (entidades.analista as { id: string }).id)) {
      errores.push({ campo: 'analistaId', codigo: 'ANALISTA_FUERA_DE_EQUIPO' });
    }
  }

  if (presentes.sprintId) {
    if (entidades.sprint === null) errores.push({ campo: 'sprintId', codigo: 'CATALOGO_INVALIDO' });
    // D120: el sprint debe ser de la célula de la misma combinación.
    else if (celulaValida && entidades.sprint.celulaId !== (entidades.celula as { id: string }).id) errores.push({ campo: 'sprintId', codigo: 'CATALOGO_INVALIDO' });
  }
  return errores;
}

export interface PropuestaSprint {
  readonly sprintId: string | null;
  readonly origen: 'JIRA' | 'RESPALDO' | null;
  /** Había `nombreJira` y no existe en la célula. */
  readonly sprintJiraNoEncontrado: boolean;
}

/**
 * D137: el sprint de la célula cuyo nombre coincide con el de Jira; si no, el de respaldo si es de la célula; si no,
 * ninguno. La búsqueda por nombre ya se hizo solo entre los sprints de la célula (D120).
 */
export function proponerSprint(entrada: {
  nombreJira: string | null;
  sprintDeLaCelulaConEseNombre: { id: string } | null;
  respaldo: { id: string; celulaId: string } | null;
  celulaId: string;
}): PropuestaSprint {
  const hayNombre = entrada.nombreJira !== null && entrada.nombreJira.trim().length > 0;
  if (hayNombre && entrada.sprintDeLaCelulaConEseNombre !== null) {
    return { sprintId: entrada.sprintDeLaCelulaConEseNombre.id, origen: 'JIRA', sprintJiraNoEncontrado: false };
  }
  const respaldoValido = entrada.respaldo !== null && entrada.respaldo.celulaId === entrada.celulaId ? entrada.respaldo : null;
  return {
    sprintId: respaldoValido === null ? null : respaldoValido.id,
    origen: respaldoValido === null ? null : 'RESPALDO',
    sprintJiraNoEncontrado: hayNombre,
  };
}
