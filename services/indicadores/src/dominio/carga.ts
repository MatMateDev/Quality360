/**
 * Carga por analista y sobrecarga (3.5, D159, D160, D182, D190). Puro.
 *
 * `activas` y `sobrecargado` cuentan siempre todas las HDU no cerradas del analista en el ámbito; los filtros solo
 * cambian `porEstado` y `cumplimiento`. Sobrecarga = activas MAYORES que el umbral (5 no lo es; 6 sí).
 */
import { avanceDe, promedioRedondeado } from './cumplimiento.js';
import { ESTADOS_HDU, type AnalistaAmbito, type AvanceHdu, type EstadoHdu, type HduAmbito, type Ref } from './tipos.js';

export type ConteoPorEstado = Record<EstadoHdu, number>;

export function conteoVacio(): ConteoPorEstado {
  return Object.fromEntries(ESTADOS_HDU.map((estado) => [estado, 0])) as ConteoPorEstado;
}

export function contarPorEstado(hdus: readonly HduAmbito[]): ConteoPorEstado {
  const conteo = conteoVacio();
  for (const hdu of hdus) conteo[hdu.estado] += 1;
  return conteo;
}

export const esActiva = (hdu: Pick<HduAmbito, 'estado'>): boolean => hdu.estado !== 'CERRADA';

export const estaSobrecargado = (activas: number, umbral: number): boolean => activas > umbral;

export interface FilaCarga {
  readonly analista: AnalistaAmbito;
  readonly supervisadoPorMi: boolean | null;
  readonly porEstado: ConteoPorEstado;
  readonly activas: number;
  readonly sinHdu: boolean;
  /** `null` si ninguna HDU del analista cumple los filtros («—»); se calcula solo si hay `avance`. */
  readonly cumplimiento: number | null;
  readonly sobrecargado: boolean;
}

export interface GrupoCarga {
  /** `null` = grupo «Sin QE supervisor» (umbral por defecto). */
  readonly qe: Ref | null;
  readonly umbral: number;
  readonly umbralPorDefecto: boolean;
  readonly filas: FilaCarga[];
}

export interface ResultadoCarga {
  readonly grupos: GrupoCarga[];
  readonly sinAnalista: { porEstado: ConteoPorEstado; activas: number } | null;
}

export interface EntradaCarga {
  readonly rol: 'QE' | 'LIDER_QA' | 'AUDITOR';
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly hdu: readonly HduAmbito[];
  readonly analistas: readonly AnalistaAmbito[];
  /** HDU que cumplen los filtros (subconjunto de `hdu`). */
  readonly filtradas: readonly HduAmbito[];
  /** `null` si Certificaciones no respondió: `cumplimiento` queda `null` y lo marca quien llama. */
  readonly avance: ReadonlyMap<string, AvanceHdu> | null;
  /** Umbral guardado de cada QE; el que falta usa `umbralDefecto`. */
  readonly umbrales: ReadonlyMap<string, number>;
  readonly umbralDefecto: number;
}

function cumplimientoDe(hdus: readonly HduAmbito[], avance: ReadonlyMap<string, AvanceHdu> | null): number | null {
  if (avance === null || hdus.length === 0) return null;
  const suma = hdus.reduce((total, hdu) => total + avanceDe(avance.get(hdu.id)), 0);
  return promedioRedondeado(suma, hdus.length);
}

/** Orden de las filas de un grupo: sobrecargados primero, `activas` descendente y nombre (D182). */
export function ordenarFilas(filas: FilaCarga[]): FilaCarga[] {
  return filas.sort((a, b) => Number(b.sobrecargado) - Number(a.sobrecargado) || b.activas - a.activas || a.analista.nombre.localeCompare(b.analista.nombre, 'es'));
}

export function calcularCarga(entrada: EntradaCarga): ResultadoCarga {
  const hduDe = new Map<string, HduAmbito[]>();
  for (const hdu of entrada.hdu) {
    if (hdu.analista === null) continue;
    hduDe.set(hdu.analista.id, [...(hduDe.get(hdu.analista.id) ?? []), hdu]);
  }
  const idsFiltradas = new Set(entrada.filtradas.map((hdu) => hdu.id));

  const umbralDe = (qeId: string | null): { valor: number; porDefecto: boolean } => {
    const guardado = qeId === null ? undefined : entrada.umbrales.get(qeId);
    return guardado === undefined ? { valor: entrada.umbralDefecto, porDefecto: true } : { valor: guardado, porDefecto: false };
  };

  const grupos = new Map<string, GrupoCarga>();
  const grupo = (qe: Ref | null): GrupoCarga => {
    const clave = qe === null ? 'sin-qe' : qe.id;
    let existente = grupos.get(clave);
    if (existente === undefined) {
      const umbral = umbralDe(qe?.id ?? null);
      existente = { qe, umbral: umbral.valor, umbralPorDefecto: umbral.porDefecto, filas: [] };
      grupos.set(clave, existente);
    }
    return existente;
  };
  // El QE ve un solo grupo, con su umbral, también para los analistas «No supervisado por ti».
  if (entrada.rol === 'QE') grupo({ id: entrada.usuarioId, nombre: entrada.usuarioNombre });

  for (const analista of entrada.analistas) {
    const propias = hduDe.get(analista.id) ?? [];
    const activas = propias.filter(esActiva).length;
    const enFiltro = propias.filter((hdu) => idsFiltradas.has(hdu.id));
    const destino = entrada.rol === 'QE' ? grupo({ id: entrada.usuarioId, nombre: entrada.usuarioNombre }) : grupo(analista.supervisor);
    destino.filas.push({
      analista,
      supervisadoPorMi: entrada.rol === 'QE' ? analista.supervisor?.id === entrada.usuarioId : null,
      porEstado: contarPorEstado(enFiltro),
      activas,
      sinHdu: propias.length === 0,
      cumplimiento: cumplimientoDe(enFiltro, entrada.avance),
      sobrecargado: estaSobrecargado(activas, destino.umbral),
    });
  }

  const ordenados = [...grupos.values()]
    .filter((g) => g.filas.length > 0 || entrada.rol === 'QE')
    .sort((a, b) => (a.qe === null ? 1 : 0) - (b.qe === null ? 1 : 0) || (a.qe?.nombre ?? '').localeCompare(b.qe?.nombre ?? '', 'es'));
  for (const g of ordenados) ordenarFilas(g.filas);

  const huerfanas = entrada.hdu.filter((hdu) => hdu.analista === null);
  const sinAnalista =
    huerfanas.length === 0 ? null : { porEstado: contarPorEstado(huerfanas.filter((hdu) => idsFiltradas.has(hdu.id))), activas: huerfanas.filter(esActiva).length };
  return { grupos: ordenados, sinAnalista };
}
