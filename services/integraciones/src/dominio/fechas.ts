/**
 * Fechas de calendario de Chile (`America/Santiago`) para los filtros `desde` y `hasta` del historial (inclusivos).
 * Las fechas se manejan como `AAAA-MM-DD`; el rango se convierte a instantes UTC según la zona, sin depender de la
 * zona del proceso.
 */
export const ZONA_HORARIA = 'America/Santiago';

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Desfase (hora de Santiago menos UTC) en milisegundos en un instante dado. */
function desfaseMs(instante: Date): number {
  const partes = Object.fromEntries(PARTES.formatToParts(instante).map((p) => [p.type, Number(p.value)]));
  const comoUtc = Date.UTC(partes.year ?? 0, (partes.month ?? 1) - 1, partes.day ?? 1, partes.hour ?? 0, partes.minute ?? 0, partes.second ?? 0);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** El instante UTC en que empieza el día `fecha` en Santiago. */
export function inicioDeDiaSantiago(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const medianocheUtc = Date.UTC(anio ?? 0, (mes ?? 1) - 1, dia ?? 1);
  let instante = medianocheUtc - desfaseMs(new Date(medianocheUtc));
  instante = medianocheUtc - desfaseMs(new Date(instante));
  return new Date(instante);
}

/** El día siguiente a `fecha`, como `AAAA-MM-DD`. */
export function diaSiguiente(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, (dia ?? 1) + 1)).toISOString().slice(0, 10);
}
