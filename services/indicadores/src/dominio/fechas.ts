/** Fechas en `America/Santiago` (D163) con `Intl`, sin dependencias nuevas. Puro. */

const ZONA = 'America/Santiago';
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const FORMATO_HORA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Fecha de calendario de Santiago (AAAA-MM-DD) del instante dado. */
export function fechaSantiago(instante: Date): string {
  return FORMATO_DIA.format(instante);
}

/** «AAAA-MM-DD HH:mm» en hora de Chile. */
export function fechaHoraSantiago(instante: Date): string {
  return FORMATO_HORA.format(instante).replace(',', '');
}

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` si el texto es una fecha de calendario válida AAAA-MM-DD. */
export function esFechaIso(texto: string): boolean {
  const partes = PATRON_FECHA.exec(texto);
  if (partes === null) return false;
  const fecha = new Date(`${texto}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

const MS_DIA = 24 * 60 * 60 * 1000;

export function sumarDias(fecha: string, dias: number): string {
  return new Date(new Date(`${fecha}T00:00:00.000Z`).getTime() + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function diasEntre(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / MS_DIA);
}
