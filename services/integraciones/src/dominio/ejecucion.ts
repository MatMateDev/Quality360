/**
 * Reglas de una ejecución (D96, D103, D114, D121): presupuesto de tiempo, resultado final, contadores a partir
 * del detalle y «última completada». Funciones puras, sin dependencias de Nest, Prisma ni `fetch`.
 */
import type { AdvertenciaFila, CodigoErrorIntegracion, Contadores, FilaDetalle, ResultadoEjecucion } from './tipos.js';
import { contadoresVacios } from './tipos.js';

/** Con menos de 1 s de presupuesto no se inicia otra llamada y la ejecución termina `INCOMPLETA` (D114). */
export const MARGEN_MINIMO_MS = 1000;
/** Lote de filas hacia Organización (D100). */
export const TAMANO_LOTE = 25;
/** Filas de un archivo y de una vista previa (D102). */
export const MAXIMO_FILAS_ARCHIVO = 500;
/** Bytes del contenido de un archivo (D102): 1 MB. */
export const MAXIMO_BYTES_ARCHIVO = 1_048_576;

/** Presupuesto de tiempo de una petición, medido desde que llega (D114). */
export class Presupuesto {
  private readonly inicio: number;

  constructor(
    private readonly totalMs: number,
    private readonly ahora: () => number = Date.now,
  ) {
    this.inicio = ahora();
  }

  transcurridoMs(): number {
    return this.ahora() - this.inicio;
  }

  restanteMs(): number {
    return Math.max(0, this.totalMs - this.transcurridoMs());
  }

  /** `true` si queda margen para iniciar otra llamada externa. */
  alcanza(): boolean {
    return this.restanteMs() >= MARGEN_MINIMO_MS;
  }

  /** El menor entre el tiempo límite propio de la llamada y lo que queda de presupuesto. */
  limiteDe(propioMs: number): number {
    return Math.max(1, Math.min(propioMs, this.restanteMs()));
  }
}

/**
 * Resultado de una ejecución que terminó (D103). Una interrupción (error de Jira, de Organización o de tiempo)
 * deja `FALLIDA` si no se procesó nada e `INCOMPLETA` si ya había filas procesadas; que quede más por leer es
 * `INCOMPLETA`; si no, `CON_ERRORES` si hay al menos una fila con error, y `EXITOSA` en los demás casos.
 */
export function resultadoFinal(entrada: {
  leidas: number;
  conError: number;
  interrupcion: CodigoErrorIntegracion | null;
  hayMas: boolean;
}): Exclude<ResultadoEjecucion, 'EN_CURSO' | 'INTERRUMPIDA'> {
  if (entrada.interrupcion !== null) return entrada.leidas === 0 ? 'FALLIDA' : 'INCOMPLETA';
  if (entrada.hayMas) return 'INCOMPLETA';
  return entrada.conError > 0 ? 'CON_ERRORES' : 'EXITOSA';
}

/** Suma las filas de detalle; sirve para cerrar como `INTERRUMPIDA` una ejecución que quedó a medias (D114). */
export function contadoresDeDetalle(filas: ReadonlyArray<Pick<FilaDetalle, 'resultado' | 'advertencias'>>): Contadores {
  const contadores = contadoresVacios();
  for (const fila of filas) {
    contadores.leidas += 1;
    if (fila.resultado === 'CREADA') contadores.creadas += 1;
    else if (fila.resultado === 'ACTUALIZADA') contadores.actualizadas += 1;
    else if (fila.resultado === 'OMITIDA') contadores.omitidas += 1;
    else contadores.conError += 1;
    if (fila.advertencias.length > 0) contadores.conAdvertencias += 1;
  }
  return contadores;
}

/** Suma una fila de detalle a los contadores en memoria. */
export function sumarFila(contadores: Contadores, fila: Pick<FilaDetalle, 'resultado' | 'advertencias'>): void {
  const parcial = contadoresDeDetalle([fila]);
  contadores.leidas += parcial.leidas;
  contadores.creadas += parcial.creadas;
  contadores.actualizadas += parcial.actualizadas;
  contadores.omitidas += parcial.omitidas;
  contadores.conError += parcial.conError;
  contadores.conAdvertencias += parcial.conAdvertencias;
}

/** «Última completada» = la más reciente `EXITOSA` o `CON_ERRORES`; una `INCOMPLETA` no cuenta (D121). */
export function esCompletada(resultado: ResultadoEjecucion): boolean {
  return resultado === 'EXITOSA' || resultado === 'CON_ERRORES';
}

/** Una ejecución `EN_CURSO` de más de este tiempo ya es «abandonada» y la siguiente la cierra (D104). */
export function estaAbandonada(iniciadaEn: Date, ahora: Date, enCursoMaxMs: number): boolean {
  return ahora.getTime() - iniciadaEn.getTime() > enCursoMaxMs;
}

/** Une advertencias sin repetir y conservando el orden. */
export function unirAdvertencias(...listas: ReadonlyArray<readonly AdvertenciaFila[]>): AdvertenciaFila[] {
  const unidas: AdvertenciaFila[] = [];
  for (const lista of listas) for (const advertencia of lista) if (!unidas.includes(advertencia)) unidas.push(advertencia);
  return unidas;
}

/** Recorta un texto a `maximo` caracteres; `null` si no hay texto. */
export function recortar(valor: string | null | undefined, maximo: number): string | null {
  if (valor === null || valor === undefined) return null;
  return valor.length > maximo ? valor.slice(0, maximo) : valor;
}
