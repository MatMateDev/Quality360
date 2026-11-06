// E5 · textos de «Consultar Jira» (diseño §3, §7 y §10). Los plurales se construyen con funciones, nunca con
// concatenaciones sueltas en los componentes. Los nombres de personas llegan como texto y se interpolan sin tocar.
import type { Consulta, Ejecucion, EstadoConsulta, Persona } from "@/types/dominio";
import { formatearFecha } from "./formato";

export const TEXTO_VENCIDA = "La consulta venció. Consulta Jira de nuevo.";
export const TEXTO_NO_ENCONTRADA = "No encontramos esa consulta. Puede que ya no exista.";
export const TEXTO_EN_CURSO = "Ya hay una consulta o confirmación en curso.";
export const TEXTO_SIN_CONSULTA = "Aún no hay una consulta abierta.";
export const TEXTO_NO_CREA_HDU = "Consultar Jira lee las historias y las deja para revisión. No crea ni modifica HDU hasta que confirmes.";
export const TEXTO_QUE_SE_ACTUALIZA =
  "Al confirmar se actualizan solo el título, la descripción y la prioridad de las filas que marques en «Cambiaron en Jira». Nunca se modifican el estado, el analista, el QE, el sprint, la célula, el checklist ni los impedimentos. Las HDU cerradas no se modifican.";
export const TEXTO_CONSULTA_CONSERVADA = "La consulta que tenías abierta se conserva.";
export const TEXTO_FALLIDA_SIN_GUARDAR = "La ejecución quedó registrada como fallida y no se guardó ninguna consulta nueva.";
export const TEXTO_ESPERA_429 = "Espera unos minutos antes de reintentar.";
export const TEXTO_CONSERVA = "Lo que ya leíste y asignaste se conserva.";
export const TEXTO_CONSULTANDO = "Leyendo historias de Jira y comparándolas con Quality360. Puede tardar hasta unos 10 segundos.";
export const TEXTO_CONSULTANDO_NOTA = "No se puede cancelar. Puedes salir: el resultado quedará en el Historial.";

/** «1 fila» / «5 filas». */
export function textoFilas(n: number): string {
  return `${n} ${n === 1 ? "fila" : "filas"}`;
}

/** «1 historia» / «5 historias». */
export function textoHistorias(n: number): string {
  return `${n} ${n === 1 ? "historia" : "historias"}`;
}

/** «con 3 filas asignadas» / «con 1 fila asignada» / «sin filas asignadas». */
export function textoAsignadas(n: number): string {
  if (n === 0) return "sin filas asignadas";
  return `con ${n} ${n === 1 ? "fila asignada" : "filas asignadas"}`;
}

/** Cuerpo del diálogo «Ya hay una consulta abierta» (datos de `ErrorConsultaAbierta`). */
export function textoReemplazo(creadaPor: Pick<Persona, "nombre">, creadaEn: string, asignadas: number, creadas = 0): string {
  const conservadas = creadas > 0 ? ` ${creadas} HDU ya creadas se conservan.` : "";
  return `Ya hay una consulta abierta de ${creadaPor.nombre} del ${formatearFecha(creadaEn)} ${textoAsignadas(asignadas)}. Si la reemplazas, se pierden las asignaciones.${conservadas}`;
}

/** «Jira pidió esperar 2 veces; se reintentó.» */
export function textoLimiteTasa(n: number): string {
  return `Jira pidió esperar ${n} ${n === 1 ? "vez" : "veces"}; se reintentó.`;
}

/** «Esta tanda: 30 historias.» (D149: los `res-*` son acumulados; la tanda sale de la ejecución). */
export function textoEstaTanda(n: number): string {
  return `Esta tanda: ${textoHistorias(n)}.`;
}

/** Texto de `enlace-revisar-consulta`. */
export function textoRevisar(nuevas: number, cambiaron: number): string | null {
  if (nuevas > 0) return `Revisar y asignar (${nuevas} ${nuevas === 1 ? "nueva" : "nuevas"})`;
  if (cambiaron > 0) return `Revisar los cambios (${cambiaron})`;
  return null;
}

/** Titular de la tanda según su resultado (diseño §3.2). */
export function titularConsulta(e: Pick<Ejecucion, "resultado" | "conError">): string | null {
  if (e.resultado === "EXITOSA") return "Consulta completa.";
  if (e.resultado === "CON_ERRORES") return `Consulta completa. ${textoFilas(e.conError)} no se ${e.conError === 1 ? "puede" : "pueden"} importar; las demás quedaron para revisión.`;
  if (e.resultado === "INTERRUMPIDA") return "La ejecución quedó sin terminar.";
  return null;
}

/** Aviso de tanda incompleta por causa (diseño §3.3). `leidas` es lo leído en esa tanda. */
export function textoAvisoIncompletaConsulta(e: Pick<Ejecucion, "codigoError" | "leidas">): string {
  if (e.codigoError === "PRESUPUESTO_DE_TIEMPO") return `Se alcanzó el tiempo máximo. Se leyeron ${textoHistorias(e.leidas)}; continúa la consulta para leer el resto.`;
  if (e.codigoError === "JIRA_LIMITE_DE_TASA") return `Jira pidió esperar demasiado. Se leyeron ${textoHistorias(e.leidas)}; continúa más tarde o importa un archivo.`;
  if (e.codigoError === "TOPE_DE_CONSULTA") return "La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.";
  return `Se leyeron ${textoHistorias(e.leidas)}; quedan más en Jira.`;
}

/** Con tope de 500 filas ya no hay «Continuar consulta». */
export function esTopeDeConsulta(e: Pick<Ejecucion, "codigoError">): boolean {
  return e.codigoError === "TOPE_DE_CONSULTA";
}

/** «Sin novedades» (diseño §3.2): nada nuevo ni cambiado. */
export function textoSinNovedades(leidas: number): string {
  return leidas === 0
    ? "Sin novedades: el proyecto no tiene historias del tipo configurado"
    : "Sin novedades: todas las historias de Jira ya están en Quality360 sin cambios";
}

export function haySinNovedades(c: Pick<Consulta, "nuevas" | "cambiaron">, e: Pick<Ejecucion, "resultado">): boolean {
  return (e.resultado === "EXITOSA" || e.resultado === "CON_ERRORES") && c.nuevas === 0 && c.cambiaron === 0;
}

/** `CONSULTA_NO_ABIERTA` según el estado en que quedó (diseño §10.2). */
export function textoNoAbierta(estado: EstadoConsulta, cerradaPor?: Pick<Persona, "nombre"> | null): string {
  if (estado === "CONFIRMADA") return "Esta consulta ya se confirmó.";
  if (estado === "REEMPLAZADA") return cerradaPor ? `Esta consulta fue reemplazada por ${cerradaPor.nombre}.` : "Esta consulta fue reemplazada.";
  if (estado === "DESCARTADA") return "Esta consulta se descartó.";
  if (estado === "VENCIDA") return TEXTO_VENCIDA;
  return "Esta consulta ya no está abierta.";
}
