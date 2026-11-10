/**
 * Semáforo por célula (3.4, D157, D188) y motivos del drill-down (D158, D181). Puro.
 *
 * Solo cuentan las HDU no cerradas. Rojo: riesgo vigente `ALTO` o algún impedimento `ESCALADO`. Amarillo: riesgo `MEDIO`
 * o algún impedimento `ABIERTO`. Verde: ninguno. Una fuente caída nunca produce VERDE: solo el rojo es concluyente.
 */
import type { ColorSemaforo, EvaluacionHdu, HduAmbito, ImpedimentoBloqueante, NivelRiesgo } from './tipos.js';

export type EstadoSemaforo = 'ok' | 'indisponible' | 'SIN_HDU';

export interface SemaforoCelula {
  readonly estado: EstadoSemaforo;
  readonly color: ColorSemaforo | null;
  readonly alMenos: 'AMARILLO' | null;
  readonly calculoParcial: boolean;
  readonly riesgoMaximo: NivelRiesgo | null;
  readonly impedimentosAbiertos: number | null;
  readonly impedimentosEscalados: number | null;
  readonly hduActivas: number;
}

const RANGO_NIVEL: Readonly<Record<NivelRiesgo, number>> = { BAJO: 0, MEDIO: 1, ALTO: 2 };

export function nivelMaximo(niveles: ReadonlyArray<NivelRiesgo | null>): NivelRiesgo | null {
  let maximo: NivelRiesgo | null = null;
  for (const nivel of niveles) {
    if (nivel !== null && (maximo === null || RANGO_NIVEL[nivel] > RANGO_NIVEL[maximo])) maximo = nivel;
  }
  return maximo;
}

export function rangoNivel(nivel: NivelRiesgo | null): number {
  return nivel === null ? -1 : RANGO_NIVEL[nivel];
}

/** Impedimentos estrictamente `ABIERTO` (la evaluación cuenta `ABIERTO` + `ESCALADO` en `abiertos`). */
export const soloAbiertos = (evaluacion: EvaluacionHdu): number => Math.max(0, evaluacion.abiertos - evaluacion.escalados);

export interface EntradaSemaforo {
  /** HDU de la célula en el ámbito (cualquier estado). */
  readonly hdu: readonly HduAmbito[];
  /** `null` si Impedimentos no respondió. */
  readonly evaluaciones: ReadonlyMap<string, EvaluacionHdu> | null;
  /** `true` si Certificaciones no respondió: el riesgo por atraso no se pudo calcular (D188). */
  readonly certificacionesCaida: boolean;
}

export function evaluarCelula(entrada: EntradaSemaforo): SemaforoCelula {
  const activas = entrada.hdu.filter((hdu) => hdu.estado !== 'CERRADA');
  if (entrada.hdu.length === 0) {
    return { estado: 'SIN_HDU', color: null, alMenos: null, calculoParcial: false, riesgoMaximo: null, impedimentosAbiertos: null, impedimentosEscalados: null, hduActivas: 0 };
  }
  // La célula solo tiene HDU cerradas: nada aporta color y nada depende de otra fuente.
  if (activas.length === 0) {
    return { estado: 'ok', color: 'VERDE', alMenos: null, calculoParcial: false, riesgoMaximo: null, impedimentosAbiertos: 0, impedimentosEscalados: 0, hduActivas: 0 };
  }
  if (entrada.evaluaciones === null) {
    return { estado: 'indisponible', color: null, alMenos: null, calculoParcial: false, riesgoMaximo: null, impedimentosAbiertos: null, impedimentosEscalados: null, hduActivas: activas.length };
  }

  let rojo = false;
  let amarillo = false;
  let abiertos = 0;
  let escalados = 0;
  let sinEvaluar = false;
  const niveles: Array<NivelRiesgo | null> = [];
  for (const hdu of activas) {
    const evaluacion = entrada.evaluaciones.get(hdu.id);
    if (evaluacion === undefined) {
      sinEvaluar = true;
      continue;
    }
    const nivel = evaluacion.riesgo.nivelVigente;
    niveles.push(nivel);
    if (evaluacion.riesgo.estado === 'indisponible') sinEvaluar = true;
    if (nivel === 'ALTO' || evaluacion.escalados > 0) rojo = true;
    if (nivel === 'MEDIO' || soloAbiertos(evaluacion) > 0) amarillo = true;
    abiertos += soloAbiertos(evaluacion);
    escalados += evaluacion.escalados;
  }
  const base = { riesgoMaximo: nivelMaximo(niveles), impedimentosAbiertos: abiertos, impedimentosEscalados: escalados, hduActivas: activas.length };

  if (rojo) {
    // Un rojo conocido no se oculta; si faltó una fuente, el cálculo es parcial.
    return { ...base, estado: 'ok', color: 'ROJO', alMenos: null, calculoParcial: entrada.certificacionesCaida || sinEvaluar };
  }
  if (entrada.certificacionesCaida || sinEvaluar) {
    return { ...base, estado: 'indisponible', color: null, alMenos: amarillo ? 'AMARILLO' : null, calculoParcial: false };
  }
  return { ...base, estado: 'ok', color: amarillo ? 'AMARILLO' : 'VERDE', alMenos: null, calculoParcial: false };
}

/** Orden de las tarjetas: ROJO, AMARILLO, VERDE, luego las grises; dentro, por nombre (contrato). */
export function grupoDeOrden(celula: Pick<SemaforoCelula, 'estado' | 'color'>): number {
  if (celula.estado === 'ok' && celula.color === 'ROJO') return 0;
  if (celula.estado === 'ok' && celula.color === 'AMARILLO') return 1;
  if (celula.estado === 'ok' && celula.color === 'VERDE') return 2;
  return 3;
}

// ------------------------------------------------------------------ drill-down

export type MotivoSemaforo = 'RIESGO_ALTO' | 'IMPEDIMENTO_ESCALADO' | 'RIESGO_MEDIO' | 'IMPEDIMENTO_ABIERTO';
const GRAVEDAD: readonly MotivoSemaforo[] = ['RIESGO_ALTO', 'IMPEDIMENTO_ESCALADO', 'RIESGO_MEDIO', 'IMPEDIMENTO_ABIERTO'];

export interface ItemDrilldown {
  readonly hdu: HduAmbito;
  readonly evaluacion: EvaluacionHdu;
  readonly motivos: MotivoSemaforo[];
  readonly impedimentoPrincipal: ImpedimentoBloqueante | null;
}

/** Impedimento más grave: `ESCALADO` antes que `ABIERTO`; a igual estado, el más antiguo (D181). */
export function impedimentoPrincipal(impedimentos: readonly ImpedimentoBloqueante[]): ImpedimentoBloqueante | null {
  const ordenados = [...impedimentos].sort(
    (a, b) => Number(b.estado === 'ESCALADO') - Number(a.estado === 'ESCALADO') || b.diasAbierto - a.diasAbierto || a.id.localeCompare(b.id),
  );
  return ordenados[0] ?? null;
}

const MOTIVOS_ROJOS: readonly MotivoSemaforo[] = ['RIESGO_ALTO', 'IMPEDIMENTO_ESCALADO'];

/**
 * Motivos de una HDU: a lo sumo uno de riesgo y uno de impedimento (D181). Solo los que generan el color de la célula
 * (D158): en una célula roja, los rojos; en una amarilla (o sin color por una fuente caída), los amarillos.
 */
export function motivosDe(evaluacion: EvaluacionHdu, color: ColorSemaforo | null): MotivoSemaforo[] {
  const motivos: MotivoSemaforo[] = [];
  const nivel = evaluacion.riesgo.nivelVigente;
  if (nivel === 'ALTO') motivos.push('RIESGO_ALTO');
  if (evaluacion.escalados > 0) motivos.push('IMPEDIMENTO_ESCALADO');
  else if (soloAbiertos(evaluacion) > 0) motivos.push('IMPEDIMENTO_ABIERTO');
  if (nivel === 'MEDIO') motivos.push('RIESGO_MEDIO');
  if (color === 'VERDE') return [];
  const buscados = color === 'ROJO' ? motivos.filter((m) => MOTIVOS_ROJOS.includes(m)) : motivos.filter((m) => !MOTIVOS_ROJOS.includes(m));
  return buscados.sort((a, b) => GRAVEDAD.indexOf(a) - GRAVEDAD.indexOf(b));
}

/** HDU que generan el color de la célula, con su motivo, en el orden de D181. */
export function armarDrilldown(
  color: ColorSemaforo | null,
  activas: readonly HduAmbito[],
  evaluaciones: ReadonlyMap<string, EvaluacionHdu>,
  impedimentos: readonly ImpedimentoBloqueante[],
): ItemDrilldown[] {
  const porHdu = new Map<string, ImpedimentoBloqueante[]>();
  for (const impedimento of impedimentos) porHdu.set(impedimento.hduId, [...(porHdu.get(impedimento.hduId) ?? []), impedimento]);
  const items: ItemDrilldown[] = [];
  for (const hdu of activas) {
    const evaluacion = evaluaciones.get(hdu.id);
    if (evaluacion === undefined) continue;
    const motivos = motivosDe(evaluacion, color);
    if (motivos.length === 0) continue;
    items.push({ hdu, evaluacion, motivos, impedimentoPrincipal: impedimentoPrincipal(porHdu.get(hdu.id) ?? []) });
  }
  return items.sort((a, b) => {
    const gravedad = GRAVEDAD.indexOf(a.motivos[0] as MotivoSemaforo) - GRAVEDAD.indexOf(b.motivos[0] as MotivoSemaforo);
    if (gravedad !== 0) return gravedad;
    const nivel = rangoNivel(b.evaluacion.riesgo.nivelVigente) - rangoNivel(a.evaluacion.riesgo.nivelVigente);
    if (nivel !== 0) return nivel;
    const dias = (b.impedimentoPrincipal?.diasAbierto ?? -1) - (a.impedimentoPrincipal?.diasAbierto ?? -1);
    if (dias !== 0) return dias;
    return a.hdu.codigo.localeCompare(b.hdu.codigo, 'es');
  });
}
