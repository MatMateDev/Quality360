/**
 * Filas del snapshot diario (D162, D184). Puro. Una fila por fecha × célula × sprint × ámbito, donde el ámbito es `TODOS`
 * (todas las HDU del par, sin duplicar) o `QE:<id>` (las HDU del ámbito D153 de ese QE). Las HDU sin sprint no se guardan.
 */
import { avanceDe, clasificarHdu, promedioRedondeado } from './cumplimiento.js';
import type { FilaSnapshot } from './repositorios.js';
import { soloAbiertos } from './semaforo.js';
import type { AvanceHdu, ColorSemaforo, EvaluacionHdu, HduAmbito, Ref } from './tipos.js';

export const AMBITO_TODOS = 'TODOS';
export const ambitoQe = (qeId: string): string => `QE:${qeId}`;

export interface EntradaSnapshot {
  readonly fecha: string;
  readonly hdu: readonly HduAmbito[];
  readonly ambitosQe: ReadonlyArray<{ qe: Ref; hduIds: readonly string[] }>;
  readonly avance: ReadonlyMap<string, AvanceHdu>;
  /** Evaluación de las HDU no cerradas (las cerradas nunca están bloqueadas, D60). */
  readonly evaluaciones: ReadonlyMap<string, EvaluacionHdu>;
}

/** Color de la columna `semaforo`: sobre las HDU no cerradas del par; VERDE si no hay ninguna (D184). */
function colorDe(activas: readonly HduAmbito[], evaluaciones: ReadonlyMap<string, EvaluacionHdu>): ColorSemaforo {
  let amarillo = false;
  for (const hdu of activas) {
    const evaluacion = evaluaciones.get(hdu.id);
    if (evaluacion === undefined) continue;
    if (evaluacion.riesgo.nivelVigente === 'ALTO' || evaluacion.escalados > 0) return 'ROJO';
    if (evaluacion.riesgo.nivelVigente === 'MEDIO' || soloAbiertos(evaluacion) > 0) amarillo = true;
  }
  return amarillo ? 'AMARILLO' : 'VERDE';
}

function filaDe(ambito: string, fecha: string, hdus: readonly HduAmbito[], entrada: EntradaSnapshot): FilaSnapshot {
  const primera = hdus[0] as HduAmbito & { sprint: NonNullable<HduAmbito['sprint']> };
  let certificadas = 0;
  let cerradasExcepcion = 0;
  let enCurso = 0;
  let sinIniciar = 0;
  let suma = 0;
  let bloqueadas = 0;
  let riesgoAlto = 0;
  let riesgoMedio = 0;
  let abiertos = 0;
  let escalados = 0;
  const activas = hdus.filter((hdu) => hdu.estado !== 'CERRADA');
  for (const hdu of hdus) {
    const avance = entrada.avance.get(hdu.id);
    suma += avanceDe(avance);
    const clase = clasificarHdu(hdu, avance?.certificado === true);
    if (clase === 'CERTIFICADA') certificadas += 1;
    else if (clase === 'CERRADA_EXCEPCION') cerradasExcepcion += 1;
    else if (clase === 'EN_CURSO') enCurso += 1;
    else sinIniciar += 1;
  }
  for (const hdu of activas) {
    const evaluacion = entrada.evaluaciones.get(hdu.id);
    if (evaluacion === undefined) continue;
    if (evaluacion.bloqueada) bloqueadas += 1;
    if (evaluacion.riesgo.nivelVigente === 'ALTO') riesgoAlto += 1;
    if (evaluacion.riesgo.nivelVigente === 'MEDIO') riesgoMedio += 1;
    abiertos += soloAbiertos(evaluacion);
    escalados += evaluacion.escalados;
  }
  return {
    fecha,
    idCelula: primera.celula.id,
    celulaNombre: primera.celula.nombre,
    idSprint: primera.sprint.id,
    sprintNombre: primera.sprint.nombre,
    sprintInicio: primera.sprint.inicio,
    sprintFin: primera.sprint.fin,
    ambito,
    hduTotal: hdus.length,
    certificadas,
    cerradasExcepcion,
    enCurso,
    sinIniciar,
    bloqueadas,
    sumaAvance: suma,
    cumplimientoPromedio: promedioRedondeado(suma, hdus.length),
    hduRiesgoAlto: riesgoAlto,
    hduRiesgoMedio: riesgoMedio,
    impedimentosAbiertos: abiertos,
    impedimentosEscalados: escalados,
    semaforo: colorDe(activas, entrada.evaluaciones),
  };
}

function filasDeAmbito(ambito: string, hdus: readonly HduAmbito[], entrada: EntradaSnapshot): FilaSnapshot[] {
  const pares = new Map<string, HduAmbito[]>();
  for (const hdu of hdus) {
    if (hdu.sprint === null) continue;
    const clave = `${hdu.celula.id}|${hdu.sprint.id}`;
    pares.set(clave, [...(pares.get(clave) ?? []), hdu]);
  }
  return [...pares.values()].map((grupo) => filaDe(ambito, entrada.fecha, grupo, entrada));
}

export function construirFilasSnapshot(entrada: EntradaSnapshot): FilaSnapshot[] {
  const filas = filasDeAmbito(AMBITO_TODOS, entrada.hdu, entrada);
  const porId = new Map(entrada.hdu.map((hdu) => [hdu.id, hdu]));
  for (const { qe, hduIds } of entrada.ambitosQe) {
    const propias = hduIds.map((hduId) => porId.get(hduId)).filter((hdu): hdu is HduAmbito => hdu !== undefined);
    filas.push(...filasDeAmbito(ambitoQe(qe.id), propias, entrada));
  }
  return filas;
}
