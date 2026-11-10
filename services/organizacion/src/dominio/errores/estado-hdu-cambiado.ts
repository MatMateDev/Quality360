/**
 * Error de dominio: al escribir, la HDU ya no estaba en el estado que la
 * validación previa dio por bueno (carrera entre dos cierres, E6-B05-T11).
 * Sin dependencia de Nest ni Prisma: la capa de aplicación lo traduce a 409
 * `TRANSICION_INVALIDA`.
 */
import type { EstadoHdu } from '../tipos.js';

export class EstadoHduCambiado extends Error {
  constructor(readonly estadoActual: EstadoHdu) {
    super(`La HDU ya no está en el estado esperado (ahora: ${estadoActual}).`);
    this.name = 'EstadoHduCambiado';
  }
}
