/**
 * Reglas puras de los bloques de impedimentos de las bandejas (E4, D79, D87). Sin dependencias de
 * Nest ni Prisma: Organización arma las listas con lo que devuelve la evaluación de Impedimentos.
 */
export type NivelRiesgoBandeja = 'BAJO' | 'MEDIO' | 'ALTO';

const RANGO_NIVEL: Readonly<Record<NivelRiesgoBandeja, number>> = { BAJO: 1, MEDIO: 2, ALTO: 3 };

/** Alto primero; sin nivel (indisponible o sin evaluar) al final. */
export const rangoNivel = (nivel: NivelRiesgoBandeja | null): number => (nivel === null ? 0 : RANGO_NIVEL[nivel]);

export interface ElementoLista {
  readonly id: string;
  readonly hduId: string;
  readonly diasAbierto: number;
  readonly fechaRegistro: string;
  readonly estado: 'ABIERTO' | 'ESCALADO';
}

/**
 * Orden D74 de las listas: riesgo vigente de la HDU (Alto, Medio, Bajo) y luego días abiertos de mayor
 * a menor. Si el riesgo de alguna HDU está indisponible se ordena solo por días (D74). Con
 * `primero`, los elementos que cumplen el predicado van antes (los escalados al Líder, D79).
 */
export function ordenarLista<T extends ElementoLista>(
  items: readonly T[],
  nivelDe: (hduId: string) => NivelRiesgoBandeja | null,
  opciones: { riesgoDisponible: boolean; primero?: (item: T) => boolean },
): T[] {
  return [...items].sort((a, b) => {
    if (opciones.primero !== undefined) {
      const diferencia = Number(opciones.primero(b)) - Number(opciones.primero(a));
      if (diferencia !== 0) return diferencia;
    }
    if (opciones.riesgoDisponible) {
      const porNivel = rangoNivel(nivelDe(b.hduId)) - rangoNivel(nivelDe(a.hduId));
      if (porNivel !== 0) return porNivel;
    }
    return b.diasAbierto - a.diasAbierto || a.fechaRegistro.localeCompare(b.fechaRegistro) || a.id.localeCompare(b.id);
  });
}

/** Los escalados más antiguos primero (bloque del Administrador, D87). */
export function ordenarPorAntiguedad<T extends ElementoLista>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.diasAbierto - a.diasAbierto || a.fechaRegistro.localeCompare(b.fechaRegistro) || a.id.localeCompare(b.id));
}

export interface RiesgoEvaluado {
  readonly estado: 'ok' | 'indisponible';
  readonly nivelVigente: NivelRiesgoBandeja | null;
}

/**
 * Contador `hduRiesgoAlto`: HDU no cerradas con riesgo vigente ALTO. Si el riesgo de alguna HDU no
 * cerrada es indisponible, el contador es `null` (indisponible): nunca cuenta de menos (D87).
 */
export function contarRiesgoAlto(riesgos: readonly RiesgoEvaluado[]): number | null {
  if (riesgos.some((riesgo) => riesgo.estado === 'indisponible')) return null;
  return riesgos.filter((riesgo) => riesgo.nivelVigente === 'ALTO').length;
}
