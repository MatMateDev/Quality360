/**
 * Días de calendario en `America/Santiago` (D68, D74, D90). Las fechas se manejan como cadenas
 * `AAAA-MM-DD` para no depender de la zona horaria del proceso.
 */
export const ZONA_HORARIA = 'America/Santiago';

const FORMATO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha de calendario de un instante en `America/Santiago`. */
export function fechaSantiago(instante: Date): string {
  return FORMATO.format(instante);
}

function aDias(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Math.round(Date.UTC(anio ?? 0, (mes ?? 1) - 1, dia ?? 1) / 86_400_000);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return aDias(hasta) - aDias(desde);
}

/** «Hoy» del cálculo: la fecha de referencia de pruebas o la de Santiago (D90). */
export function hoy(ahora: Date, fechaReferencia: string | null): string {
  return fechaReferencia ?? fechaSantiago(ahora);
}

/** Días abiertos de un impedimento: de `abiertoDesde` a hoy, o a `fechaResolucion` si está resuelto (D74). */
export function diasAbierto(abiertoDesde: Date, fechaResolucion: Date | null, hoyFecha: string): number {
  const fin = fechaResolucion === null ? hoyFecha : fechaSantiago(fechaResolucion);
  return Math.max(0, diasEntre(fechaSantiago(abiertoDesde), fin));
}

const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

/** Registrado hace menos de 24 horas y no resuelto; usa el reloj real (D90). */
export function esNuevo(fechaRegistro: Date, resuelto: boolean, ahora: Date): boolean {
  return !resuelto && ahora.getTime() - fechaRegistro.getTime() < VEINTICUATRO_HORAS_MS;
}
