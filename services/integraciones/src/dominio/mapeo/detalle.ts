/**
 * Detalle de una HDU de Jira (D196-D199): todo lo que trae la misma llamada de la consulta, saneado a texto plano y
 * acotado. Dominio puro. Un campo ausente o raro queda `null` o vacío; nunca lanza ni manda la fila a `CON_ERROR` (E5-B06 #5).
 * El resultado nunca se escribe en logs ni en `detalle_ejecucion` (D198).
 */
import type { IssueJira, SprintJira } from '../puertos/fuente-jira.js';
import { adfADetalle } from './adf-a-texto.js';
import { limitarTexto, resolverCriterios } from './criterios.js';
import { resolverPrioridad } from './prioridad.js';
import { limpiarLinea, recortar, type DetalleHdu, type SprintDetalle } from './tipos.js';

export const LIMITES_DETALLE = {
  resumenMax: 255,
  descripcionMax: 8000,
  criteriosMax: 4000,
  estadoMax: 100,
  prioridadMax: 60,
  tipoMax: 60,
  responsableMax: 150,
  epicaClaveMax: 60,
  epicaTituloMax: 200,
  etiquetas: 20,
  etiquetaMax: 50,
  sprints: 10,
  sprintNombreMax: 120,
  urlMax: 300,
  /** `consulta_item.detalle` admite 40.960 bytes en la forma textual de `jsonb`; aquí queda margen para sus espacios. */
  bytesMax: 36_000,
} as const;

const ESTADO_SPRINT: Record<SprintJira['estado'], SprintDetalle['estado']> = { active: 'ACTIVO', future: 'FUTURO', closed: 'CERRADO' };

/** Texto de una línea acotado; `null` si queda vacío (nunca cadena vacía). */
function linea(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const t = recortar(limpiarLinea(valor), max).trim();
  return t === '' ? null : t;
}

/** Fecha y hora de Jira (`2026-11-04T18:30:00.000-0300`) a ISO 8601 UTC; `null` si no es una fecha válida. */
export function fechaHoraIso(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > 40) return null;
  // Jira escribe el desfase sin dos puntos (-0300); Date.parse lo acepta solo con ellos.
  const normal = valor.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(normal);
  return Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2}/.test(normal) ? new Date(ms).toISOString() : null;
}

/** `duedate` de Jira: `AAAA-MM-DD` real; si llega con hora, se toma el día; otra cosa es `null`. */
export function fechaIso(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(valor.trim());
  if (m === null) return null;
  const dia = m[1] as string;
  const d = new Date(`${dia}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia ? null : dia;
}

function etiquetasDe(valor: unknown): { etiquetas: Array<{ valor: string }>; total: number } {
  if (!Array.isArray(valor)) return { etiquetas: [], total: 0 };
  const limpias: string[] = [];
  for (const e of valor) {
    const t = linea(e, LIMITES_DETALLE.etiquetaMax);
    if (t !== null) limpias.push(t);
  }
  return { etiquetas: limpias.slice(0, LIMITES_DETALLE.etiquetas).map((valor) => ({ valor })), total: limpias.length };
}

function sprintsDe(valor: unknown): SprintDetalle[] {
  if (!Array.isArray(valor)) return [];
  const salida: SprintDetalle[] = [];
  for (const s of valor as Array<Partial<SprintJira> | null>) {
    const nombre = linea(s?.nombre, LIMITES_DETALLE.sprintNombreMax);
    const estado = s?.estado === undefined ? undefined : ESTADO_SPRINT[s.estado];
    if (nombre === null || estado === undefined) continue;
    salida.push({ nombre, estado, inicio: fechaHoraIso(s?.inicio), fin: fechaHoraIso(s?.fin) });
    if (salida.length >= LIMITES_DETALLE.sprints) break;
  }
  return salida;
}

/** Cuántos bytes ocupa en UTF-8 (lo que mide el CHECK de la base, salvo los espacios de `jsonb`). */
export function bytesDe(detalle: unknown): number {
  return Buffer.byteLength(JSON.stringify(detalle), 'utf8');
}

/**
 * Con 12.000 caracteres de descripción y criterios de 4 bytes cada uno se pasaría de 40 KB: si no cabe, se recorta la
 * descripción y luego los criterios, y se marca `truncado`. Una fila nunca se rechaza por esto.
 */
export function ajustarTamano(detalle: DetalleHdu, extra = 0, bytesMax: number = LIMITES_DETALLE.bytesMax): DetalleHdu {
  let actual = detalle;
  for (let vuelta = 0; vuelta < 40 && bytesDe(actual) + extra > bytesMax; vuelta++) {
    const d = actual.descripcion.texto;
    const c = actual.criterios.texto;
    if (d !== null && (c === null || d.length >= c.length)) {
      const { texto } = limitarTexto(d, Math.max(0, Math.floor(d.length * 0.75)));
      actual = { ...actual, descripcion: { texto: texto === '' ? null : texto, truncado: true } };
    } else if (c !== null) {
      const { texto } = limitarTexto(c, Math.max(0, Math.floor(c.length * 0.75)));
      actual = { ...actual, criterios: { ...actual.criterios, texto: texto === '' ? null : texto, origen: texto === '' ? null : actual.criterios.origen, truncado: true } };
    } else {
      break;
    }
  }
  return actual;
}

/**
 * @param urlJira la URL `…/browse/CLAVE` ya armada con el sitio validado (D95), o `null` si la clave no es válida.
 */
export function construirDetalle(issue: IssueJira, urlJira: string | null): DetalleHdu {
  const descripcionCompleta = adfADetalle(issue.descripcionAdf);
  const descripcion = descripcionCompleta === '' ? { texto: null, truncado: false } : limitarTexto(descripcionCompleta, LIMITES_DETALLE.descripcionMax);
  const { etiquetas, total } = etiquetasDe(issue.labels);
  const prioridadJira = linea(issue.prioridad, LIMITES_DETALLE.prioridadMax);
  const padre = issue.padre ?? null;
  const detalle: DetalleHdu = {
    resumen: linea(issue.titulo, LIMITES_DETALLE.resumenMax),
    descripcion: { texto: descripcion.texto === '' ? null : descripcion.texto, truncado: descripcion.truncado },
    criterios: resolverCriterios(issue.criteriosAdf, issue.descripcionAdf, LIMITES_DETALLE.criteriosMax),
    estadoJira: linea(issue.estado, LIMITES_DETALLE.estadoMax),
    prioridadJira,
    prioridadQ360: prioridadJira === null ? null : resolverPrioridad(prioridadJira),
    tipo: linea(issue.tipo, LIMITES_DETALLE.tipoMax),
    responsableJira: linea(issue.responsable, LIMITES_DETALLE.responsableMax),
    etiquetas,
    etiquetasTotal: total,
    sprints: sprintsDe(issue.sprints),
    epica:
      padre !== null && padre.esEpica === true && linea(padre.clave, LIMITES_DETALLE.epicaClaveMax) !== null
        ? { clave: linea(padre.clave, LIMITES_DETALLE.epicaClaveMax) as string, titulo: linea(padre.titulo, LIMITES_DETALLE.epicaTituloMax) }
        : null,
    fechas: {
      creada: fechaHoraIso(issue.creada),
      actualizada: fechaHoraIso(issue.actualizada),
      vencimiento: fechaIso(issue.vencimiento),
      resolucion: fechaHoraIso(issue.resolucion),
    },
    urlJira: urlJira === null || urlJira.length > LIMITES_DETALLE.urlMax ? null : urlJira,
  };
  return ajustarTamano(detalle);
}

/** Como `construirDetalle`, pero una entrada imposible de leer deja `null` en vez de lanzar (E5-B06 #5). */
export function construirDetalleSeguro(issue: IssueJira, urlJira: string | null): DetalleHdu | null {
  try {
    return construirDetalle(issue, urlJira);
  } catch {
    return null;
  }
}
