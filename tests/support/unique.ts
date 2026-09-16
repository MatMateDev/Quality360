let contador = 0;

/** Sufijo único por proceso + contador, para que correr la suite dos veces no colisione. */
function sufijo(): string {
  contador += 1;
  return `${Date.now()}-${process.pid}-${contador}`;
}

/**
 * Genera identificadores únicos para entidades creadas por las propias
 * pruebas (regla de aislamiento: nunca se muta un usuario o HDU de la
 * semilla que otro escenario necesita).
 */
export function unico(prefijo: string): string {
  return `${prefijo}-${sufijo()}`;
}

export function correoUnico(prefijo: string): string {
  return `qa.${unico(prefijo)}@quality360.local`.toLowerCase();
}

export function codigoHduUnico(prefijo = "QA"): string {
  return unico(prefijo).toUpperCase();
}

export function nombreUnico(prefijo: string): string {
  return `${prefijo} ${sufijo()}`;
}
