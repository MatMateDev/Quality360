/**
 * Vida de la consulta (D134, D135, D148): una sola abierta, vigencia desde la última llamada a Jira, vencimiento
 * perezoso, reemplazo y tope de filas. Puro.
 */
import type { Consulta, EstadoConsulta } from './tipos.js';

/** Tope de filas de una consulta (D135). */
export const TOPE_ITEMS_POR_DEFECTO = 500;

/** `venceEn` = hora de la última llamada a Jira + la vigencia. */
export function calcularVencimiento(ultimaLlamada: Date, vigenciaMs: number): Date {
  return new Date(ultimaLlamada.getTime() + vigenciaMs);
}

/** Una consulta `ABIERTA` que pasó `venceEn` está vencida aunque nadie la haya cerrado todavía (vencimiento perezoso). */
export function pasoSuVigencia(consulta: Pick<Consulta, 'estado' | 'venceEn'>, ahora: Date): boolean {
  return consulta.estado === 'ABIERTA' && consulta.venceEn.getTime() <= ahora.getTime();
}

export type DecisionConsultar = 'CREAR' | 'REEMPLAZAR' | 'CONFLICTO';

/**
 * Qué hace «Consultar Jira» ante la consulta abierta: una vencida no cuenta como abierta; una vigente exige
 * `reemplazar: true` (409 `CONSULTA_ABIERTA` sin llamar a Jira, D134).
 */
export function decidirConsultar(abierta: Pick<Consulta, 'estado' | 'venceEn'> | null, reemplazar: boolean, ahora: Date): DecisionConsultar {
  if (abierta === null || pasoSuVigencia(abierta, ahora)) return 'CREAR';
  return reemplazar ? 'REEMPLAZAR' : 'CONFLICTO';
}

export type ObstaculoDeLectura = { readonly tipo: 'VENCIDA' } | { readonly tipo: 'NO_ABIERTA' };

/**
 * Por qué una consulta no admite leer filas, editarlas, confirmarla ni descartarla (D148): vencida (410) o cerrada
 * (409). `null` si está abierta y vigente. Una `VENCIDA` ya cerrada sigue siendo 410.
 */
export function obstaculoDeLectura(consulta: Pick<Consulta, 'estado' | 'venceEn'>, ahora: Date): ObstaculoDeLectura | null {
  if (consulta.estado === 'VENCIDA' || pasoSuVigencia(consulta, ahora)) return { tipo: 'VENCIDA' };
  if (consulta.estado !== 'ABIERTA') return { tipo: 'NO_ABIERTA' };
  return null;
}

export const esEstadoCerrado = (estado: EstadoConsulta): boolean => estado !== 'ABIERTA';

/** Cuántas filas más caben en la consulta. */
export function cupoRestante(filasGuardadas: number, tope: number): number {
  return Math.max(0, tope - filasGuardadas);
}

/** «Continuar» con `hayMas: false` es 409 `CONSULTA_COMPLETA`; con el tope alcanzado, 409 `CONSULTA_LLENA` (D135, D148). */
export type ObstaculoDeContinuar = 'CONSULTA_LLENA' | 'CONSULTA_COMPLETA';
export function obstaculoDeContinuar(consulta: Pick<Consulta, 'leidas' | 'hayMas'>, tope: number): ObstaculoDeContinuar | null {
  if (consulta.leidas >= tope) return 'CONSULTA_LLENA';
  if (!consulta.hayMas) return 'CONSULTA_COMPLETA';
  return null;
}

/**
 * Una issue ya leída no se duplica: gana la primera lectura (D135). Devuelve las filas nuevas (por código sin
 * distinguir mayúsculas, sin repetir dentro de la misma tanda) y cuántas se descartaron por repetidas.
 */
export function sinRepetidos<T extends { readonly codigo: string | null }>(candidatas: readonly T[], yGuardados: ReadonlySet<string>): { nuevas: T[]; repetidas: number } {
  const vistos = new Set(yGuardados);
  const nuevas: T[] = [];
  let repetidas = 0;
  for (const fila of candidatas) {
    const clave = fila.codigo === null ? null : fila.codigo.trim().toUpperCase();
    if (clave !== null && clave !== '' && vistos.has(clave)) {
      repetidas += 1;
      continue;
    }
    if (clave !== null && clave !== '') vistos.add(clave);
    nuevas.push(fila);
  }
  return { nuevas, repetidas };
}
