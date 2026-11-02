import type { Ejecucion } from "@/types/dominio";
import { ETIQUETAS_ORIGEN_EJECUCION } from "./mensajesIntegracion";

type Modo = "jira" | "archivo";

/** Texto de `aviso-incompleta` según la causa (diseño §4.4), siempre con lo procesado. */
export function textoAvisoIncompleta(e: Pick<Ejecucion, "leidas" | "codigoError" | "hayMas">, modo: Modo, totalFilasArchivo?: number): string {
  if (modo === "archivo") {
    const de = totalFilasArchivo ? ` de ${totalFilasArchivo}` : "";
    return `Se procesaron ${e.leidas}${de} filas por el límite de tiempo. Vuelve a importar el mismo archivo: lo ya importado quedará como "Sin cambios".`;
  }
  if (e.codigoError === "PRESUPUESTO_DE_TIEMPO") return `Se alcanzó el tiempo máximo. Se procesaron ${e.leidas} historias; continúa para procesar el resto.`;
  if (e.codigoError === "JIRA_LIMITE_DE_TASA") return `Jira pidió esperar demasiado. Se procesaron ${e.leidas} historias; continúa más tarde o importa un archivo.`;
  if (e.codigoError === "ORGANIZACION_NO_DISPONIBLE") return `No pudimos guardar las HDU en este momento. Se procesaron ${e.leidas} historias; reintenta más tarde.`;
  return `Se procesaron ${e.leidas} historias; quedan más en Jira.`;
}

/** «Sin cambios» (D103): `EXITOSA` sin HDU creadas ni actualizadas. */
export function esSinCambios(e: Pick<Ejecucion, "resultado" | "creadas" | "actualizadas">): boolean {
  return e.resultado === "EXITOSA" && e.creadas === 0 && e.actualizadas === 0;
}

export function textoSinCambios(e: Pick<Ejecucion, "leidas">, modo: Modo): string {
  if (modo === "archivo") return "Sin cambios: el archivo no trae historias nuevas ni modificadas";
  return e.leidas === 0 ? "Sin cambios: el proyecto no tiene historias del tipo configurado" : "Sin cambios: Jira no tiene historias nuevas ni modificadas";
}

export function titularResultado(e: Pick<Ejecucion, "resultado" | "conError">, modo: Modo): string | null {
  const nombre = modo === "jira" ? "Sincronización completa." : "Importación completa.";
  if (e.resultado === "EXITOSA") return nombre;
  if (e.resultado === "CON_ERRORES") return `${nombre} ${e.conError} ${e.conError === 1 ? "fila tuvo errores y las demás se procesaron" : "filas tuvieron errores y las demás se procesaron"}.`;
  if (e.resultado === "INTERRUMPIDA") return "La ejecución quedó sin terminar.";
  return null;
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;
}

export function formatearDuracion(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** «Jira (QTY)», «CSV (archivo.csv)»: origen de una ejecución con su proyecto o su archivo. */
export function origenDe(e: Pick<Ejecucion, "origen" | "proyecto" | "archivo">): string {
  const base = ETIQUETAS_ORIGEN_EJECUCION[e.origen];
  if (e.origen === "JIRA") return e.proyecto ? `${base} (${e.proyecto})` : base;
  return e.archivo ? `${base} (${e.archivo.nombre})` : base;
}
