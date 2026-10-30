/**
 * Sprint vigente de una issue (sección 5.1): el `active`; si no hay, el `future` más próximo; si no,
 * el `closed` más reciente. Devuelve el NOMBRE: Organización lo busca entre los sprints de la célula (D120).
 */
import type { SprintJira } from '../puertos/fuente-jira.js';

function instante(fin: string | null): number | null {
  if (fin === null) return null;
  const t = Date.parse(fin);
  return Number.isNaN(t) ? null : t;
}

function nombreValido(s: SprintJira): string | null {
  const n = typeof s.nombre === 'string' ? s.nombre.trim() : '';
  return n === '' ? null : n;
}

export function elegirSprint(sprints: SprintJira[]): string | null {
  const validos = sprints.filter((s) => nombreValido(s) !== null);
  const activo = validos.find((s) => s.estado === 'active');
  if (activo) return nombreValido(activo);

  // future más próximo: el de menor fecha de fin; sin fecha, al final.
  const futuros = validos.filter((s) => s.estado === 'future');
  if (futuros.length > 0) {
    const ordenados = [...futuros].sort((a, b) => (instante(a.fin) ?? Infinity) - (instante(b.fin) ?? Infinity));
    return nombreValido(ordenados[0] as SprintJira);
  }

  // closed más reciente: el de mayor fecha de fin; sin fecha, al final.
  const cerrados = validos.filter((s) => s.estado === 'closed');
  if (cerrados.length > 0) {
    const ordenados = [...cerrados].sort((a, b) => (instante(b.fin) ?? -Infinity) - (instante(a.fin) ?? -Infinity));
    return nombreValido(ordenados[0] as SprintJira);
  }
  return null;
}
