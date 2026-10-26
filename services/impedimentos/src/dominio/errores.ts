/** Errores de negocio del dominio. Sin dependencias de Nest: la capa API los traduce a HTTP. */
import type { EstadoImpedimento, OperacionImpedimento } from './tipos.js';
import { mensajeTransicionInvalida, operacionesDelEstado } from './impedimento.js';

/**
 * 409 `TRANSICION_INVALIDA` sobre un impedimento (E4-B02#3). Su cuerpo lleva el estado actual, la
 * operación pedida y las que admite el estado (`ErrorTransicionImpedimento` de comun.v1.yaml).
 */
export class ErrorTransicionImpedimento extends Error {
  readonly operacionesPermitidas: readonly OperacionImpedimento[];

  /** `cambioConcurrente`: el estado que vio quien pidió ya no es el vigente (D62). */
  constructor(
    readonly estadoActual: EstadoImpedimento,
    readonly operacion: OperacionImpedimento,
    cambioConcurrente = false,
  ) {
    super(cambioConcurrente ? 'El impedimento ya cambió de estado.' : mensajeTransicionInvalida(estadoActual, operacion));
    this.name = 'ErrorTransicionImpedimento';
    this.operacionesPermitidas = operacionesDelEstado(estadoActual);
  }
}

/** Una fuente de datos (Organización o Certificaciones) no respondió. */
export class FuenteNoDisponible extends Error {
  constructor(readonly fuente: 'organizacion' | 'certificaciones', detalle: string) {
    super(`${fuente} no disponible: ${detalle}`);
    this.name = 'FuenteNoDisponible';
  }
}
