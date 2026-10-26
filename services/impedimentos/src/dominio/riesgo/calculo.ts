/**
 * Riesgo sugerido de una HDU (D66–D68, D76, D90, tabla 3.4 del backlog E4). Función pura:
 * no consulta nada ni lee el reloj; recibe «hoy» y los umbrales.
 *
 * | Factor                 | Condición                                                 | Nivel |
 * | ---------------------- | --------------------------------------------------------- | ----- |
 * | IMPEDIMENTO_ABIERTO    | al menos un impedimento ABIERTO o ESCALADO                | MEDIO |
 * | IMPEDIMENTO_ANTIGUO    | algún ABIERTO con `diasImpedimentoAlto` días o más        | ALTO  |
 * | IMPEDIMENTO_ESCALADO   | al menos un ESCALADO                                      | ALTO  |
 * | SPRINT_VENCIDO         | el fin del sprint es anterior a hoy                       | ALTO  |
 * | ATRASO_SPRINT_ALTO     | faltan `diasSprintAlto` días o menos y avance < umbral    | ALTO  |
 * | ATRASO_SPRINT_MEDIO    | faltan `diasSprintMedio` días o menos y avance < umbral   | MEDIO |
 *
 * El nivel sugerido es el máximo de los factores. Los umbrales son exclusivos del valor (70 %
 * exacto no es atraso) y el día de término cuenta como 0 días restantes. Los dos factores de
 * atraso son excluyentes: si aplica el ALTO no se informa el MEDIO.
 */
import { diasEntre, fechaSantiago } from '../dias.js';
import type { EstadoImpedimento, NivelRiesgo } from '../tipos.js';

export type CodigoFactor =
  | 'IMPEDIMENTO_ABIERTO'
  | 'IMPEDIMENTO_ANTIGUO'
  | 'IMPEDIMENTO_ESCALADO'
  | 'SPRINT_VENCIDO'
  | 'ATRASO_SPRINT_ALTO'
  | 'ATRASO_SPRINT_MEDIO';

export interface UmbralesCalculo {
  readonly diasImpedimentoAlto: number;
  readonly diasSprintAlto: number;
  readonly avanceAlto: number;
  readonly diasSprintMedio: number;
  readonly avanceMedio: number;
}

export interface ImpedimentoParaRiesgo {
  readonly id: string;
  readonly estado: EstadoImpedimento;
  readonly abiertoDesde: Date;
}

export interface EntradaRiesgo {
  readonly hduCerrada: boolean;
  /** Solo se consideran `ABIERTO` y `ESCALADO`. */
  readonly impedimentos: readonly ImpedimentoParaRiesgo[];
  /** Sprint vigente; `null` si la HDU no tiene (no aplican los factores de sprint, D90). */
  readonly sprint: { readonly id: string; readonly nombre: string } | null;
  /** Fecha de fin del sprint (`AAAA-MM-DD`) o `null`. */
  readonly sprintFin: string | null;
  /** `aprobados/10 × 100`; `null` si Certificaciones no respondió (D68). */
  readonly avance: number | null;
  /** «Hoy» (`AAAA-MM-DD`). */
  readonly hoy: string;
  readonly umbrales: UmbralesCalculo;
}

export interface DetalleFactor {
  impedimentos?: number;
  impedimentoId?: string;
  diasAbierto?: number;
  umbralDias?: number;
  sprint?: { id: string; nombre: string };
  sprintFin?: string;
  diasRestantes?: number;
  avance?: number;
  umbralAvance?: number;
}

export interface Factor {
  readonly codigo: CodigoFactor;
  readonly nivel: NivelRiesgo;
  readonly detalle: DetalleFactor;
}

export type MotivoSinSugerencia = 'HDU_CERRADA' | 'FUENTE_NO_DISPONIBLE';

export interface ResultadoRiesgo {
  readonly nivelSugerido: NivelRiesgo | null;
  readonly estado: 'ok' | 'indisponible';
  readonly motivoSinSugerencia: MotivoSinSugerencia | null;
  readonly calculoParcial: boolean;
  /** Del nivel más alto al más bajo; dentro de cada nivel, el orden de la tabla. */
  readonly factores: readonly Factor[];
  readonly factoresNoEvaluados: readonly CodigoFactor[];
}

export const ORDEN_NIVEL: Readonly<Record<NivelRiesgo, number>> = { BAJO: 1, MEDIO: 2, ALTO: 3 };

export function nivelMaximo(niveles: readonly NivelRiesgo[]): NivelRiesgo {
  return niveles.reduce<NivelRiesgo>((maximo, nivel) => (ORDEN_NIVEL[nivel] > ORDEN_NIVEL[maximo] ? nivel : maximo), 'BAJO');
}

export function calcularRiesgoSugerido(entrada: EntradaRiesgo): ResultadoRiesgo {
  if (entrada.hduCerrada) {
    return { nivelSugerido: null, estado: 'ok', motivoSinSugerencia: 'HDU_CERRADA', calculoParcial: false, factores: [], factoresNoEvaluados: [] };
  }

  const { umbrales, hoy } = entrada;
  const factores: Factor[] = [];
  const bloqueantes = entrada.impedimentos.filter((impedimento) => impedimento.estado !== 'RESUELTO');
  const escalados = bloqueantes.filter((impedimento) => impedimento.estado === 'ESCALADO');
  const abiertos = bloqueantes.filter((impedimento) => impedimento.estado === 'ABIERTO');

  if (bloqueantes.length > 0) {
    factores.push({ codigo: 'IMPEDIMENTO_ABIERTO', nivel: 'MEDIO', detalle: { impedimentos: bloqueantes.length } });
  }

  // El más antiguo de los ABIERTO; ante un empate, el primero registrado.
  let masAntiguo: { id: string; dias: number } | null = null;
  for (const impedimento of abiertos) {
    const dias = Math.max(0, diasEntre(fechaSantiago(impedimento.abiertoDesde), hoy));
    if (masAntiguo === null || dias > masAntiguo.dias) masAntiguo = { id: impedimento.id, dias };
  }
  if (masAntiguo !== null && masAntiguo.dias >= umbrales.diasImpedimentoAlto) {
    factores.push({
      codigo: 'IMPEDIMENTO_ANTIGUO',
      nivel: 'ALTO',
      detalle: { impedimentoId: masAntiguo.id, diasAbierto: masAntiguo.dias, umbralDias: umbrales.diasImpedimentoAlto },
    });
  }

  if (escalados.length > 0) {
    factores.push({ codigo: 'IMPEDIMENTO_ESCALADO', nivel: 'ALTO', detalle: { impedimentos: escalados.length } });
  }

  const noEvaluados: CodigoFactor[] = [];
  if (entrada.sprintFin !== null) {
    const diasRestantes = diasEntre(hoy, entrada.sprintFin);
    const sprint = entrada.sprint === null ? {} : { sprint: { id: entrada.sprint.id, nombre: entrada.sprint.nombre } };
    if (diasRestantes < 0) {
      factores.push({ codigo: 'SPRINT_VENCIDO', nivel: 'ALTO', detalle: { ...sprint, sprintFin: entrada.sprintFin, diasRestantes } });
    } else if (entrada.avance === null) {
      // Sin el avance no se pueden evaluar los factores de atraso (D68).
      noEvaluados.push('ATRASO_SPRINT_ALTO', 'ATRASO_SPRINT_MEDIO');
    } else if (diasRestantes <= umbrales.diasSprintAlto && entrada.avance < umbrales.avanceAlto) {
      factores.push({
        codigo: 'ATRASO_SPRINT_ALTO',
        nivel: 'ALTO',
        detalle: { ...sprint, sprintFin: entrada.sprintFin, diasRestantes, umbralDias: umbrales.diasSprintAlto, avance: entrada.avance, umbralAvance: umbrales.avanceAlto },
      });
    } else if (diasRestantes <= umbrales.diasSprintMedio && entrada.avance < umbrales.avanceMedio) {
      factores.push({
        codigo: 'ATRASO_SPRINT_MEDIO',
        nivel: 'MEDIO',
        detalle: { ...sprint, sprintFin: entrada.sprintFin, diasRestantes, umbralDias: umbrales.diasSprintMedio, avance: entrada.avance, umbralAvance: umbrales.avanceMedio },
      });
    }
  }

  const ordenados = [...factores].sort((a, b) => ORDEN_NIVEL[b.nivel] - ORDEN_NIVEL[a.nivel]);
  const maximo = nivelMaximo(ordenados.map((factor) => factor.nivel));

  if (noEvaluados.length === 0) {
    return { nivelSugerido: maximo, estado: 'ok', motivoSinSugerencia: null, calculoParcial: false, factores: ordenados, factoresNoEvaluados: [] };
  }
  // Fuente caída (D68, D90): un ALTO ya alcanzado vale; cualquier otro resultado podría subir con el avance.
  if (maximo === 'ALTO') {
    return { nivelSugerido: 'ALTO', estado: 'ok', motivoSinSugerencia: null, calculoParcial: true, factores: ordenados, factoresNoEvaluados: noEvaluados };
  }
  return {
    nivelSugerido: null,
    estado: 'indisponible',
    motivoSinSugerencia: 'FUENTE_NO_DISPONIBLE',
    calculoParcial: false,
    factores: ordenados,
    factoresNoEvaluados: noEvaluados,
  };
}

export interface FijadoMinimo {
  readonly nivel: NivelRiesgo;
}

export interface NivelVigente {
  readonly nivelVigente: NivelRiesgo | null;
  readonly origen: 'MANUAL' | 'SUGERIDO' | null;
  /** `ok` si hay nivel (o es una HDU cerrada sin nivel: «Sin evaluar»); `indisponible` si no se pudo calcular. */
  readonly estado: 'ok' | 'indisponible';
  readonly calculoParcial: boolean;
}

/**
 * Nivel vigente (D66): el último fijado por el QE; si no hay, el sugerido. Un nivel fijado se
 * informa aunque la sugerencia no se pueda calcular.
 */
export function nivelVigente(fijado: FijadoMinimo | null, resultado: ResultadoRiesgo): NivelVigente {
  if (fijado !== null) return { nivelVigente: fijado.nivel, origen: 'MANUAL', estado: 'ok', calculoParcial: false };
  if (resultado.nivelSugerido !== null) {
    return { nivelVigente: resultado.nivelSugerido, origen: 'SUGERIDO', estado: 'ok', calculoParcial: resultado.calculoParcial };
  }
  return { nivelVigente: null, origen: null, estado: resultado.estado, calculoParcial: false };
}

/** Hay nivel fijado y la sugerencia es otra: el portal avisa «La sugerencia actual es X» (D66). */
export function sugerenciaDistinta(fijado: FijadoMinimo | null, resultado: ResultadoRiesgo): boolean {
  return fijado !== null && resultado.nivelSugerido !== null && resultado.nivelSugerido !== fijado.nivel;
}
