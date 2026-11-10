export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

export function formatearFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL");
}

const ZONA_CHILE = "America/Santiago";

/** «04-11-2026 15:20» en hora de Chile (E6: todas las fechas de indicadores y snapshots). */
export function formatearFechaHoraChile(iso: string): string {
  const partes = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA_CHILE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${g("day")}-${g("month")}-${g("year")} ${g("hour")}:${g("minute")}`;
}

/** «dd-mm-aaaa» de una fecha calendario ISO (`2026-10-14`), sin pasar por zonas horarias. */
export function formatearDia(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}-${m}-${a}`;
}

/** «dd-mm» de una fecha calendario ISO. */
export function formatearDiaMes(fecha: string): string {
  const [, m, d] = fecha.split("-");
  return `${d}-${m}`;
}

/** Entero con «%» (D156: el decimal de la API no se muestra): `44` pasa a «44 %». */
export function formatearPorcentaje(valor: number): string {
  return `${Math.round(valor)} %`;
}
