/**
 * Series de tendencia (D166, D167, D185). Puro. Una serie por (célula, sprint) con un punto por fecha con snapshot,
 * por fecha ascendente; un día sin snapshot es un hueco, no se interpola. El cumplimiento del punto es
 * `suma_avance / hdu_total` con 1 decimal (nunca promedio de promedios).
 */
import { promedioRedondeado } from './cumplimiento.js';
import type { FilaSnapshotGuardada } from './repositorios.js';

export const MAXIMO_SERIES = 6;

export interface SerieTendenciaDominio {
  readonly celula: { id: string; nombre: string };
  readonly sprint: { id: string; nombre: string; inicio: string; fin: string; cerrado: boolean };
  readonly puntos: Array<{ fecha: string; cumplimiento: number; hduTotal: number }>;
}

export interface ResultadoSeries {
  readonly totalSeries: number;
  readonly series: SerieTendenciaDominio[];
}

/**
 * Arma las series. Con filtros (`conFiltros`) entran todas las que coinciden; sin filtros, los sprints vigentes de las
 * células visibles (`inicio ≤ hoy ≤ fin`) y, si no hay ninguno, el sprint con snapshot más reciente de cada célula.
 */
export function armarSeries(filas: readonly FilaSnapshotGuardada[], hoy: string, conFiltros: boolean): ResultadoSeries {
  const grupos = new Map<string, FilaSnapshotGuardada[]>();
  for (const fila of filas) {
    const clave = `${fila.idCelula}|${fila.idSprint}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
  }
  // Los datos del sprint y de la célula salen del snapshot más reciente de la serie (D184).
  const completas = [...grupos.values()].map((grupo) => {
    const ordenadas = [...grupo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultima = ordenadas[ordenadas.length - 1] as FilaSnapshotGuardada;
    const serie: SerieTendenciaDominio = {
      celula: { id: ultima.idCelula, nombre: ultima.celulaNombre },
      sprint: { id: ultima.idSprint, nombre: ultima.sprintNombre, inicio: ultima.sprintInicio, fin: ultima.sprintFin, cerrado: ultima.sprintFin < hoy },
      puntos: ordenadas.map((fila) => ({ fecha: fila.fecha, cumplimiento: promedioRedondeado(fila.sumaAvance, fila.hduTotal) ?? 0, hduTotal: fila.hduTotal })),
    };
    return { serie, ultimaFecha: ultima.fecha };
  });

  let elegidas = completas;
  if (!conFiltros) {
    const vigentes = completas.filter(({ serie }) => serie.sprint.inicio <= hoy && hoy <= serie.sprint.fin);
    if (vigentes.length > 0) elegidas = vigentes;
    else {
      // Sin sprint vigente: el sprint con snapshot más reciente de cada célula.
      const porCelula = new Map<string, (typeof completas)[number]>();
      for (const candidata of completas) {
        const actual = porCelula.get(candidata.serie.celula.id);
        if (actual === undefined || candidata.ultimaFecha > actual.ultimaFecha || (candidata.ultimaFecha === actual.ultimaFecha && candidata.serie.sprint.inicio > actual.serie.sprint.inicio)) {
          porCelula.set(candidata.serie.celula.id, candidata);
        }
      }
      elegidas = [...porCelula.values()];
    }
  }

  const ordenadas = elegidas
    .map(({ serie }) => serie)
    .sort((a, b) => a.celula.nombre.localeCompare(b.celula.nombre, 'es') || b.sprint.inicio.localeCompare(a.sprint.inicio) || a.sprint.nombre.localeCompare(b.sprint.nombre, 'es'));
  return { totalSeries: ordenadas.length, series: ordenadas.slice(0, MAXIMO_SERIES) };
}
