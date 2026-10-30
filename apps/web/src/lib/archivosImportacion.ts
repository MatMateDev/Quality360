export const TAMANO_MAXIMO_BYTES = 1_048_576;

/** Extensión permitida en el cliente (`.csv` o `.json`); el servidor repite la validación. */
export function formatoDeArchivo(nombre: string): "CSV" | "JSON" | null {
  const minusculas = nombre.toLowerCase();
  if (minusculas.endsWith(".csv")) return "CSV";
  if (minusculas.endsWith(".json")) return "JSON";
  return null;
}

/** Lee el archivo como texto UTF-8 (con `FileReader`, disponible también en las pruebas). */
export function leerTexto(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result ?? ""));
    lector.onerror = () => rechazar(lector.error ?? new Error("No se pudo leer el archivo"));
    lector.readAsText(archivo, "utf-8");
  });
}

/** Cuerpo de la plantilla descargable: BOM para que Excel respete las tildes. */
export function urlPlantilla(contenido: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${contenido}`)}`;
}
