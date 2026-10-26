/**
 * Ciclo de vida de un impedimento (D62, tabla 3.2 del backlog E4). Reglas puras.
 *
 * | Desde                  | Operación   | Hacia      |
 * | ---------------------- | ----------- | ---------- |
 * | (nuevo)                | Registrar   | ABIERTO    |
 * | ABIERTO, ESCALADO      | Resolver    | RESUELTO   |
 * | ABIERTO, ESCALADO      | Escalar     | ESCALADO   |
 * | RESUELTO               | Reabrir     | ABIERTO    |
 * | ABIERTO, ESCALADO      | Seguimiento | (igual)    |
 */
import {
  type EstadoHdu,
  type EstadoImpedimento,
  type OperacionImpedimento,
  type TipoImpedimento,
} from './tipos.js';

const OPERACIONES_POR_ESTADO: Readonly<Record<EstadoImpedimento, readonly OperacionImpedimento[]>> = {
  ABIERTO: ['RESOLVER', 'ESCALAR', 'SEGUIMIENTO'],
  ESCALADO: ['RESOLVER', 'ESCALAR', 'SEGUIMIENTO'],
  RESUELTO: ['REABRIR'],
};

/** Operaciones que admite el estado, sin considerar quién las pide. */
export function operacionesDelEstado(estado: EstadoImpedimento): readonly OperacionImpedimento[] {
  return OPERACIONES_POR_ESTADO[estado];
}

/** `null` si la operación no es válida desde ese estado. */
export function estadoResultante(estado: EstadoImpedimento, operacion: OperacionImpedimento): EstadoImpedimento | null {
  if (!OPERACIONES_POR_ESTADO[estado].includes(operacion)) return null;
  switch (operacion) {
    case 'RESOLVER':
      return 'RESUELTO';
    case 'ESCALAR':
      return 'ESCALADO';
    case 'REABRIR':
      return 'ABIERTO';
    case 'SEGUIMIENTO':
      return estado;
  }
}

/** Mensaje del 409 `TRANSICION_INVALIDA` (E4-B02#3). */
export function mensajeTransicionInvalida(estado: EstadoImpedimento, operacion: OperacionImpedimento): string {
  if (estado === 'RESUELTO') return 'Un impedimento resuelto solo puede reabrirse.';
  if (operacion === 'REABRIR') return 'Solo un impedimento resuelto puede reabrirse.';
  return 'La operación no es válida para el estado actual del impedimento.';
}

/** Un impedimento `ABIERTO` o `ESCALADO` bloquea la HDU y su cierre (D59, D60). */
export function bloquea(estado: EstadoImpedimento): boolean {
  return estado !== 'RESUELTO';
}

/** Estados de HDU que admiten registrar impedimentos (todos menos `CERRADA`). */
export function admiteImpedimentosNuevos(estado: EstadoHdu): boolean {
  return estado !== 'CERRADA';
}

/** Largo mínimo de la descripción: 20 para `OTRO`, 10 en los demás tipos. */
export function descripcionMinima(tipo: TipoImpedimento): number {
  return tipo === 'OTRO' ? 20 : 10;
}

/** Texto fijo de la acción `REGISTRAR`. */
export const COMENTARIO_REGISTRO = 'Registro del impedimento';

