/**
 * Error de dominio para una violación de unicidad detectada al escribir
 * (carrera entre la verificación previa y el `INSERT`). Sin dependencia de
 * Nest ni Prisma: la capa de aplicación lo traduce al código HTTP del
 * contrato (409 `CORREO_DUPLICADO` o `CODIGO_HDU_DUPLICADO`).
 */
export class ConflictoUnicidad extends Error {
  constructor(readonly campo: 'correo' | 'codigo') {
    super(`Valor duplicado en ${campo}.`);
    this.name = 'ConflictoUnicidad';
  }
}
