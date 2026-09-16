/**
 * Estados de HDU y transiciones permitidas (D10, comun.v1.yaml#/EstadoHdu).
 * Solo se avanza un paso; `CERRADA` es terminal. `PENDIENTE_CIERRE` puede
 * reabrirse hacia `EN_EJECUCION`.
 */
import type { EstadoHdu } from '../tipos.js';

export const TRANSICIONES: Readonly<Record<EstadoHdu, readonly EstadoHdu[]>> = Object.freeze({
  PENDIENTE: ['DISENO_PRUEBAS'],
  DISENO_PRUEBAS: ['EN_EJECUCION'],
  EN_EJECUCION: ['PENDIENTE_CIERRE'],
  PENDIENTE_CIERRE: ['CERRADA', 'EN_EJECUCION'],
  CERRADA: [],
});

export function transicionesPermitidas(estado: EstadoHdu): EstadoHdu[] {
  return [...TRANSICIONES[estado]];
}

export interface ResultadoValidacionTransicion {
  readonly valida: boolean;
  readonly transicionesPermitidas: EstadoHdu[];
}

/** Valida si `estadoActual -> estadoSolicitado` es una transición permitida. */
export function validarTransicion(estadoActual: EstadoHdu, estadoSolicitado: EstadoHdu): ResultadoValidacionTransicion {
  const permitidas = transicionesPermitidas(estadoActual);
  return { valida: permitidas.includes(estadoSolicitado), transicionesPermitidas: permitidas };
}

export function esEstadoTerminal(estado: EstadoHdu): boolean {
  return estado === 'CERRADA';
}
