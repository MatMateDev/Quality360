// E5 · textos de revisión, asignación y confirmación (diseño §4–§6 y §10). Los plurales y las listas se construyen
// con funciones. Los nombres de personas, células y sprints se interpolan como texto.
import type { CampoAsignacion, Ejecucion, ItemConsulta } from "@/types/dominio";
import { textoFilas } from "./mensajesConsulta";

const NOMBRE_CAMPO: Record<CampoAsignacion, string> = { celulaId: "célula", qeId: "QE", analistaId: "analista", sprintId: "sprint" };
export const ETIQUETA_CAMPO_FILA: Record<CampoAsignacion, string> = { celulaId: "Célula", qeId: "QE responsable", analistaId: "Analista QA", sprintId: "Sprint" };

/** Lista con comas y «y»: «célula, QE y sprint». */
export function listaConY(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** «Falta: célula, QE, analista y sprint» (solo lo que falta, en orden). */
export function textoFalta(faltantes: readonly CampoAsignacion[]): string {
  return `Falta: ${listaConY(faltantes.map((c) => NOMBRE_CAMPO[c]))}`;
}

/** Estado de una fila nueva: texto + glifo + clase (nunca solo color; diseño §4.3 y §3.3 del diseño de detalle). */
export function estadoDeFila(
  fila: Pick<ItemConsulta, "asignacion" | "completa" | "faltantes" | "marcada"> & Partial<Pick<ItemConsulta, "aplicada" | "yaAsignada">>,
): { texto: string; glifo: string; clase: "neutro" | "incompleta" | "lista" | "creada" | "ya-asignada" } {
  if (fila.yaAsignada) return { texto: "Ya asignada", glifo: "!", clase: "ya-asignada" };
  if (fila.aplicada) return { texto: "Creada", glifo: "✓", clase: "creada" };
  if (fila.completa) return { texto: fila.marcada ? "Marcada" : "Lista", glifo: fila.marcada ? "✓ ☑" : "✓", clase: "lista" };
  if (fila.faltantes.length === 4 || !fila.asignacion) return { texto: "Sin asignar", glifo: "○", clase: "neutro" };
  return { texto: `Incompleta (${textoFalta(fila.faltantes).replace("Falta", "falta")})`, glifo: "◐", clase: "incompleta" };
}

/** Rechazo de una fila (422 de una fila o `FilaRechazada`), con los nombres que el portal ya conoce. */
export function textoRechazoFila(motivo: string, campo: string | null, faltantes: readonly CampoAsignacion[] | undefined, nombres: { analista?: string; qe?: string } = {}): string {
  const analista = nombres.analista ?? "El analista";
  switch (motivo) {
    case "QE_INVALIDO":
      return "El QE responsable no es válido.";
    case "ANALISTA_FUERA_DE_EQUIPO":
      return `${analista} no pertenece al equipo de ${nombres.qe ?? "ese QE"}.`;
    case "ANALISTA_INVALIDO":
      return `${analista} ya no está disponible.`;
    case "CATALOGO_INVALIDO":
      return campo === "sprintId" ? "El sprint no pertenece a la célula." : "La célula no existe o está inactiva.";
    case "ASIGNACION_INCOMPLETA":
      return faltantes && faltantes.length > 0 ? `${textoFalta(faltantes)}.` : "La asignación está incompleta.";
    case "FILA_NO_MARCABLE":
      return "Esta fila no se puede incluir.";
    case "FILA_NO_ASIGNABLE":
      return "Esta fila no se puede asignar.";
    default:
      return TEXTO_NO_SE_PUDO_GUARDAR;
  }
}

export const TEXTO_NO_SE_PUDO_GUARDAR = "No se pudo guardar. Reintenta.";
export const TEXTO_SPRINT_RECALCULADO = "El sprint se recalculó para la célula elegida.";
export const TEXTO_SIN_ANALISTAS = "Este QE no supervisa analistas activos. Elige otro QE.";
export const TEXTO_NO_CONFIRMABLE_SIN_ANALISTAS = "No se puede confirmar: el QE no tiene analistas activos";
export const TEXTO_LOTE_EN_CURSO = "Hay una confirmación grupal en curso";
export const TEXTO_FILA_MODIFICADA = "Otra persona modificó esta HDU. Revisa los datos actuales y confirma de nuevo.";
export const TEXTO_FILA_EN_CURSO = "Otra persona está confirmando esta HDU ahora. Espera unos segundos y revisa.";
export const TEXTO_FALLA_CONFIRMAR = "No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.";
export const TEXTO_APOYO_YA_ASIGNADA = "No se puede reasignar desde la consulta. Para cambiar el QE o el analista, hazlo en la gestión de HDU.";
export const TEXTO_COEXISTENCIA_LOTE = "Las HDU que ya confirmaste una a una se conservan y no se repiten.";

/** «Asignado automáticamente: único analista de <QE>» (D201). */
export function textoAnalistaAutomatico(qe: string): string {
  return `Asignado automáticamente: único analista de ${qe}`;
}

export function textoAnuncioAnalistaAutomatico(analista: string, qe: string): string {
  return `Analista asignado automáticamente: ${analista}, único del equipo de ${qe}`;
}

/** «Esta HDU ya fue asignada a <QE> / <Analista>» o «… / sin Analista» (D204). */
export function textoYaAsignada(y: { qe: string; analista: string | null }): string {
  return `Esta HDU ya fue asignada a ${y.qe} / ${y.analista ?? "sin Analista"}`;
}

export function textoCarrera(codigo: string, y: { qe: string; analista: string | null }): string {
  return `${codigo} ya fue asignada a ${y.qe} / ${y.analista ?? "sin Analista"}. No se creó nada.`;
}

export function textoCreada(qe: string, analista: string): string {
  return `Asignada a ${qe} / ${analista}`;
}

export function textoAnuncioCreada(codigo: string, qe: string, analista: string | null): string {
  return `HDU ${codigo} creada: asignada a ${qe} / ${analista ?? "sin Analista"}`;
}

export function textoYaAsignadas(n: number): string {
  return `${n} ya ${n === 1 ? "asignada" : "asignadas"}`;
}

export function textoLoteYaCreadas(n: number): string {
  return `${n} ${n === 1 ? "HDU ya estaba creada y no se repitió" : "HDU ya estaban creadas y no se repitieron"}`;
}

export function textoCuerpoTerminarRevision(creadas: number, sinConfirmar: number): string {
  return `${creadas} HDU ya creadas se conservan; ${sinConfirmar} filas sin confirmar se perderán.`;
}

export function textoCreadas(n: number): string {
  return `${n} ${n === 1 ? "creada" : "creadas"}`;
}
export const TEXTO_SIN_LIDER = "La célula no tiene Líder activo: nadie la verá como Líder.";
export const TEXTO_SPRINT_JIRA_AUSENTE = "El sprint de Jira no existe en esta célula.";
export const TEXTO_NOTA_CAMBIARON = "Al confirmar se actualizan solo título, descripción y prioridad. El estado, el QE, el analista, el sprint y la célula no cambian.";
export const TEXTO_NOTA_CREADA_A_MANO = "Al actualizar pasará a figurar como Jira; su estado, analista y QE no cambian.";
export const TEXTO_NOTA_CON_ERROR = "Estas filas no se pueden importar desde Jira. Corrígelas en Jira y consulta de nuevo, o impórtalas desde un archivo.";
export const TEXTO_MODIFICADA_INFO = "Otra persona modificó la consulta. Revisa los cambios.";
export const TEXTO_YA_CONFIRMADA = "Esta consulta ya se confirmó.";
export const TEXTO_MARCA_AL_MENOS_UNA = "Marca al menos una fila";

export function textoLimpiaAnalista(qe: string): string {
  return `Se limpió el analista: elige uno del equipo de ${qe}.`;
}

export function textoEligeAnalista(qe: string): string {
  return `Elige un analista del equipo de ${qe}`;
}

export function textoAplicarA(n: number): string {
  return `Aplicar a ${textoFilas(n)}`;
}

export function textoSeAplico(aplicadas: number, marcadas: number, conMarcar: boolean): string {
  const base = `Se aplicó a ${textoFilas(aplicadas)}.`;
  if (!conMarcar) return base;
  return `${base} ${marcadas} ${marcadas === 1 ? "quedó lista e incluida" : "quedaron listas e incluidas"}.`;
}

export function textoSeIncluyeron(marcadas: number, incompletas: number): string {
  const primera = `${marcadas === 1 ? "Se incluyó" : "Se incluyeron"} ${textoFilas(marcadas)}.`;
  if (incompletas === 0) return primera;
  return `${primera} ${incompletas} ${incompletas === 1 ? "sigue incompleta" : "siguen incompletas"}.`;
}

export function textoRechazadasTitulo(n: number): string {
  return `No se pudo aplicar a ${textoFilas(n)}`;
}

export function textoSeleccionadas(n: number): string {
  return `${n} ${n === 1 ? "fila seleccionada" : "filas seleccionadas"}`;
}

export function textoGuardados(n: number): string {
  return n <= 1 ? "Guardado" : `${n} cambios guardados`;
}

export function textoDejoDeEstarIncluida(codigo: string): string {
  return `${codigo} dejó de estar incluida: la asignación quedó incompleta`;
}

export function textoVenceEn(minutos: number): string {
  return `La consulta vence en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}

// ------------------------------------------------------------ confirmación

export function textoBotonConfirmar(n: number): string {
  return `Confirmar marcadas (${n})`;
}

/** «Se crearán 4 HDU y se actualizará 1.» (diseño §6.1; con 0: «No se creará ninguna HDU»). */
export function textoSeCrea(crear: number, actualizar: number): string {
  const c = crear === 0 ? "No se creará ninguna HDU" : crear === 1 ? "Se creará 1 HDU" : `Se crearán ${crear} HDU`;
  const a = actualizar === 0 ? "no se actualizará ninguna" : actualizar === 1 ? "se actualizará 1" : `se actualizarán ${actualizar}`;
  return `${c} y ${a}.`;
}

export function textoResumenConfirmacion(crear: number, actualizar: number): string {
  return `${textoSeCrea(crear, actualizar)} No se llamará a Jira. Las filas sin marcar se descartarán.`;
}

/** Cuerpo del diálogo de confirmación (diseño §6.2). */
export function textoCuerpoConfirmar(crear: number, actualizar: number, nuevasSinIncluir: number, cambiosSinIncluir: number): string {
  const base = `${textoSeCrea(crear, actualizar)} No se llamará a Jira.`;
  const total = nuevasSinIncluir + cambiosSinIncluir;
  if (total === 0) return base;
  const frase = (n: number, singular: string, plural: string, primero: boolean) => (n === 1 ? `${primero ? "La" : "la"} ${singular}` : `${primero ? "Las" : "las"} ${n} ${plural}`);
  const partes: string[] = [];
  if (nuevasSinIncluir > 0) partes.push(frase(nuevasSinIncluir, "fila nueva", "filas nuevas", true));
  if (cambiosSinIncluir > 0) partes.push(frase(cambiosSinIncluir, "fila de cambios", "filas de cambios", partes.length === 0));
  return `${base} ${partes.join(" y ")} sin marcar ${total === 1 ? "se descartará" : "se descartarán"}: para ${total === 1 ? "traerla" : "traerlas"} tendrás que consultar Jira de nuevo.`;
}

/** «Se crearon 4 HDU y se actualizó 1.» */
export function textoSeCreo(crear: number, actualizar: number): string {
  const c = crear === 0 ? "No se creó ninguna HDU" : crear === 1 ? "Se creó 1 HDU" : `Se crearon ${crear} HDU`;
  const a = actualizar === 0 ? "no se actualizó ninguna" : actualizar === 1 ? "se actualizó 1" : `se actualizaron ${actualizar}`;
  return `${c} y ${a}.`;
}

export function titularConfirmacion(e: Pick<Ejecucion, "resultado" | "creadas" | "actualizadas" | "conError" | "omitidas">): string | null {
  if (e.resultado === "EXITOSA") return `Confirmación completa. ${textoSeCreo(e.creadas, e.actualizadas)}`;
  if (e.resultado === "CON_ERRORES") {
    const n = e.conError + e.omitidas;
    return `Confirmación completa. ${textoFilas(n)} ${n === 1 ? "tuvo errores u omisiones" : "tuvieron errores u omisiones"} y las demás se procesaron.`;
  }
  if (e.resultado === "INTERRUMPIDA") return "La ejecución quedó sin terminar.";
  return null;
}

/** «6 filas sin marcar no se crearon; consulta de nuevo para traerlas.» */
export function textoDescartadas(n: number, tipo: { nuevas: number; cambios: number } | null): string {
  const soloNuevas = tipo !== null && tipo.nuevas > 0 && tipo.cambios === 0;
  const soloCambios = tipo !== null && tipo.cambios > 0 && tipo.nuevas === 0;
  const uno = n === 1;
  const verbo = soloNuevas ? (uno ? "no se creó" : "no se crearon") : soloCambios ? (uno ? "no se actualizó" : "no se actualizaron") : uno ? "no se procesó" : "no se procesaron";
  return `${textoFilas(n)} sin marcar ${verbo}; consulta de nuevo para traer${uno ? "la" : "las"}.`;
}

export function textoAplicadasDe(aplicadas: number, total: number): string {
  return `Se aplicaron ${aplicadas} de ${total}.`;
}

export function textoFilasInvalidas(n: number): string {
  return `No se creó ninguna HDU: ${textoFilas(n)} ${n === 1 ? "tiene una asignación que dejó de ser válida" : "tienen una asignación que dejó de ser válida"}.`;
}

export function textoAsignacionNombres(a: { celula: string; qe: string; analista: string; sprint: string } | null | undefined): string {
  return a ? `${a.celula} · ${a.qe} · ${a.analista} · ${a.sprint}` : "—";
}
