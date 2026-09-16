export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

export function formatearFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL");
}
