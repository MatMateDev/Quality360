// MSW de la consulta de Jira (E5, D132–D152) según `contracts/integraciones.v1.yaml`, con estado en memoria: consultar,
// continuar, leer y editar filas, confirmar, descartar, vencimiento perezoso (D134) y la fase en el historial (D141).
// Solo sirve para pruebas y revisión visual; las reglas reales viven en `services/integraciones`.
import { delay, http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import type {
  AdvertenciaFila,
  CampoAsignacion,
  Consulta,
  DetalleHdu,
  EstadoConsulta,
  Ejecucion,
  FilaRechazada,
  GrupoConsulta,
  ItemConsulta,
  MotivoRechazoFila,
  Persona,
  SolicitudEdicionItems,
} from "@/types/dominio";
import { ID, analistasVigentesDe, celulas, hdus, sprints, usuarios } from "./data";
import { ejecucionBase, estadoConfig, estadoConsulta, hduCreadasPorConsulta, modoE5, origenesHdu, sprintsE5, celulaDeSprintBase, type FilaMock } from "./dataE5";
import { fallaDe, nuevoId, registrar, soloAdmin, SUGERENCIAS, TEXTO_DE_JIRA } from "./handlersE5";
import { cuerpoError, leerNumero, sprintsAdicionales } from "./utils";

const BASE = env.gatewayUrl;
const VIGENCIA_MS = 24 * 3_600_000;
const TOPE_TANDA = 100;
const TOPE_CONSULTA = 500;
const LOTE_CONFIRMACION = 25;
const PROYECTO = "QTY";
const HOST = "su-empresa.atlassian.net";

type Respuesta = HttpResponse<any>;
const err = (status: number, codigo: string, extra: Record<string, unknown> = {}, detalles: Array<{ campo: string; codigo: string; mensaje: string }> = []): Respuesta =>
  HttpResponse.json({ ...cuerpoError(codigo as never, "Texto del servidor que el portal no muestra", detalles as never), ...extra }, { status });

// ------------------------------------------------------------------ catálogos

const todosLosSprints = () => [...sprints.map((s) => ({ ...s, celulaId: celulaDeSprintBase[s.id] ?? ID.celPagos })), ...sprintsE5];

// --------------------------------------------------------------------- filas

/** Ids fijos de las HDU «ya asignadas» del modo `con-ya-asignada` (destino de «Ir a la HDU»). */
export const ID_YA_ASIGNADA = "e5aaaaaa-0000-4000-8000-000000000005";
export const ID_YA_ASIGNADA_CAMBIO = "e5aaaaaa-0000-4000-8000-000000000006";

const FALTANTES_ORDEN: CampoAsignacion[] = ["celulaId", "qeId", "analistaId", "sprintId"];

function faltantesDe(item: ItemConsulta): CampoAsignacion[] {
  if (item.grupo !== "NUEVA") return [];
  const a = item.asignacion;
  const tiene: Record<CampoAsignacion, boolean> = { celulaId: Boolean(a?.celula), qeId: Boolean(a?.qeResponsable), analistaId: Boolean(a?.analista), sprintId: Boolean(a?.sprint) };
  return FALTANTES_ORDEN.filter((c) => !tiene[c]);
}

/** Recalcula los campos derivados de una fila (`completa`, `faltantes`, `marcable`). */
function derivar(item: ItemConsulta): ItemConsulta {
  const faltantes = faltantesDe(item);
  const completa = item.grupo === "NUEVA" && faltantes.length === 0;
  return { ...item, faltantes, completa, marcable: item.grupo === "NUEVA" ? completa : item.grupo === "CAMBIO" };
}

function itemBase(posicion: number, grupo: GrupoConsulta, codigo: string, parcial: Partial<ItemConsulta> = {}): ItemConsulta {
  const prioridades = ["CRITICA", "ALTA", "MEDIA", "BAJA"] as const;
  return derivar({
    id: nuevoId(),
    posicion,
    grupo,
    codigo,
    titulo: `Historia ${codigo}`,
    descripcion: `Descripción de ${codigo}.`,
    prioridad: prioridades[posicion % 4],
    sprintJira: posicion % 3 === 0 ? "E5 Sprint 1" : null,
    urlExterna: `https://${HOST}/browse/${codigo}`,
    referencia: { estado: "En curso", responsable: "Ana" },
    advertencias: [],
    motivo: null,
    idHistoria: null,
    origenHdu: null,
    hdu: null,
    cambios: null,
    asignacion: null,
    completa: false,
    faltantes: [],
    marcada: false,
    marcable: false,
    aplicada: false,
    revision: 1,
    analistaAuto: false,
    aplicando: false,
    aplicacion: null,
    yaAsignada: null,
    avisoSinLider: false,
    asignadoPor: null,
    asignadoEn: null,
    ...parcial,
  });
}

/** Una issue del universo del modo vigente, en el orden de Jira (`key ASC`). */
function issueDelUniverso(i: number): ItemConsulta | null {
  const modo = modoE5.consulta;
  const n = i + 1;
  if (modo === "incompleta" || modo === "incompleta-tasa" || modo === "incompleta-tiempo") return i < 230 ? itemBase(n, "NUEVA", `BIG-${n}`) : null;
  if (modo === "tope") return i < 600 ? itemBase(n, "NUEVA", `BIG-${n}`) : null;
  if (modo === "sin-novedades") return i < 5 ? itemBase(n, "SIN_CAMBIOS", `QTY-${n}`, { motivo: "SIN_CAMBIOS", hdu: { estado: "EN_EJECUCION", qeResponsable: "Jose Seguel" } }) : null;
  if (modo === "con-cambios") {
    if (i === 0) return itemBase(n, "NUEVA", "QTY-14");
    if (i <= 2) return itemBase(n, "CAMBIO", `QTY-${i}`, { cambios: i === 1 ? { titulo: { antes: "Recuperar clave", despues: "Recuperar clave de acceso" }, prioridad: { antes: "MEDIA", despues: "CRITICA" } } : { descripcion: { antes: "Antes", despues: "Después" } }, origenHdu: i === 1 ? "JIRA" : "MANUAL", hdu: { estado: "EN_EJECUCION", qeResponsable: "Jose Seguel" }, idHistoria: nuevoId(), marcable: true });
    if (i <= 10) return itemBase(n, "SIN_CAMBIOS", `QTY-${i + 2}`, { motivo: "SIN_CAMBIOS", hdu: { estado: "EN_EJECUCION", qeResponsable: "Jose Seguel" } });
    if (i === 11) return itemBase(n, "CON_ERROR", "QTY-13", { titulo: null, motivo: "TITULO_VACIO" });
    return null;
  }
  if (modo === "con-ya-asignada") {
    if (i < 2) return itemBase(n, "NUEVA", `QTY-${n}`);
    // QTY-5 la creó otra persona (a mano) durante la revisión: ya tiene QE y no tiene analista (D204).
    if (i === 2) return itemBase(n, "NUEVA", "QTY-5", { origenHdu: "MANUAL", idHistoria: ID_YA_ASIGNADA, yaAsignada: { idHistoria: ID_YA_ASIGNADA, qe: "Jose Seguel", analista: null } });
    if (i === 3) {
      const y = { idHistoria: ID_YA_ASIGNADA_CAMBIO, qe: "Jose Seguel", analista: "Jonathan Choque" };
      return itemBase(n, "CAMBIO", "QTY-6", { cambios: { titulo: { antes: "Antes", despues: "Después" } }, origenHdu: "JIRA", hdu: { estado: "EN_EJECUCION", qeResponsable: "Jose Seguel" }, idHistoria: y.idHistoria, yaAsignada: y, marcable: true });
    }
    return null;
  }
  // exitosa y con-errores: diez nuevas; la 11 es la fila con error de la fixture base.
  if (i < 10) return itemBase(n, "NUEVA", `QTY-${n}`, { advertencias: i < 4 ? (["SPRINT_NO_ENCONTRADO"] as AdvertenciaFila[]) : [] });
  if (i === 10 && modo === "con-errores") return itemBase(n, "CON_ERROR", "QTY-11", { titulo: null, motivo: "TITULO_VACIO" });
  return null;
}

function universoTotal(): number {
  let n = 0;
  while (issueDelUniverso(n)) n += 1;
  return n;
}

// ------------------------------------------------------------------ consulta

function recalcular(c: Consulta, items: ItemConsulta[]): Consulta {
  const cuenta = (g: GrupoConsulta) => items.filter((i) => i.grupo === g).length;
  const nuevas = items.filter((i) => i.grupo === "NUEVA");
  return {
    ...c,
    leidas: items.length,
    nuevas: cuenta("NUEVA"),
    cambiaron: cuenta("CAMBIO"),
    sinCambios: cuenta("SIN_CAMBIOS"),
    conError: cuenta("CON_ERROR"),
    conAdvertencias: items.filter((i) => i.advertencias.length > 0).length,
    asignadas: nuevas.filter((i) => i.asignacion !== null).length,
    completas: nuevas.filter((i) => i.completa).length,
    marcadasNuevas: nuevas.filter((i) => i.marcada).length,
    marcadasCambio: items.filter((i) => i.grupo === "CAMBIO" && i.marcada).length,
    aplicadas: items.filter((i) => i.aplicada).length,
    creadas: items.filter((i) => i.aplicada && i.grupo === "NUEVA").length,
    yaAsignadas: items.filter((i) => i.yaAsignada).length,
    pendientes: items.filter((i) => i.marcada && !i.aplicada).length,
  };
}

function sincronizar(): Consulta | null {
  if (!estadoConsulta.consulta) return null;
  estadoConsulta.consulta = recalcular(estadoConsulta.consulta, estadoConsulta.items);
  return estadoConsulta.consulta;
}

function cerrar(estado: EstadoConsulta, por: Persona | null): Consulta {
  const actual = estadoConsulta.consulta as Consulta;
  const cerrada: Consulta = { ...recalcular(actual, estadoConsulta.items), estado, version: actual.version + 1, cerradaEn: new Date().toISOString(), cerradaPor: por };
  estadoConsulta.ultimaCerrada = cerrada;
  estadoConsulta.consulta = null;
  estadoConsulta.items = [];
  return cerrada;
}

/** Vencimiento perezoso (D134): se aplica en cada lectura o escritura sobre la consulta. */
function aplicarVencimiento(): void {
  const c = estadoConsulta.consulta;
  if (c && c.estado === "ABIERTA" && Date.parse(c.venceEn) < Date.now()) cerrar("VENCIDA", null);
}

/** Para pruebas: hace vencer la consulta abierta sin esperar 24 h. */
export function vencerConsultaAbierta(): void {
  if (estadoConsulta.consulta) estadoConsulta.consulta = { ...estadoConsulta.consulta, venceEn: new Date(Date.now() - 1000).toISOString() };
}

function buscar(id: string): { consulta: Consulta; abierta: boolean } | null {
  aplicarVencimiento();
  if (estadoConsulta.consulta?.id === id) return { consulta: sincronizar() as Consulta, abierta: true };
  if (estadoConsulta.ultimaCerrada?.id === id) return { consulta: estadoConsulta.ultimaCerrada, abierta: false };
  return null;
}

const noEncontrada = (): Respuesta => err(404, "CONSULTA_NO_ENCONTRADA");

/** 409 `CONSULTA_NO_ABIERTA` (o 410 `CONSULTA_VENCIDA`) con el estado en que quedó. */
function cerrada(c: Consulta): Respuesta {
  const cuerpo = { consultaId: c.id, estado: c.estado, version: c.version, cerradaPor: c.cerradaPor };
  return c.estado === "VENCIDA" ? err(410, "CONSULTA_VENCIDA", cuerpo) : err(409, "CONSULTA_NO_ABIERTA", cuerpo);
}

function llegoRespuesta(): Respuesta | null {
  return modoE5.consulta === "sin-respuesta" ? new HttpResponse("<html><body>504 Gateway Timeout</body></html>", { status: 504, headers: { "Content-Type": "text/html" } }) : null;
}

// ------------------------------------------------------------ ejecuciones

type Tanda = { leidas: ItemConsulta[]; hayMas: boolean; codigo: Ejecucion["codigoError"]; fallida: boolean };

function leerTanda(): Tanda {
  const modo = modoE5.consulta;
  const desde = estadoConsulta.leidas;
  const total = universoTotal();
  let cuantas = Math.min(TOPE_TANDA, total - desde);
  let codigo: Ejecucion["codigoError"] = null;
  if (estadoConsulta.tandas === 0 && modo === "incompleta-tasa") {
    cuantas = 50;
    codigo = "JIRA_LIMITE_DE_TASA";
  } else if (estadoConsulta.tandas === 0 && modo === "incompleta-tiempo") {
    cuantas = 40;
    codigo = "PRESUPUESTO_DE_TIEMPO";
  }
  const enConsulta = estadoConsulta.items.length;
  if (enConsulta + cuantas >= TOPE_CONSULTA && total > TOPE_CONSULTA) {
    cuantas = TOPE_CONSULTA - enConsulta;
    codigo = "TOPE_DE_CONSULTA";
  }
  const leidas: ItemConsulta[] = [];
  for (let i = desde; i < desde + cuantas; i += 1) {
    const issue = issueDelUniverso(i);
    if (issue) leidas.push({ ...issue, posicion: enConsulta + leidas.length + 1 });
  }
  return { leidas, hayMas: desde + cuantas < total, codigo, fallida: false };
}

function ejecucionDeTanda(consultaId: string, tanda: Tanda, usuario: { id: string; nombre: string }): Ejecucion {
  const ahora = new Date();
  const cuenta = (g: GrupoConsulta) => tanda.leidas.filter((i) => i.grupo === g).length;
  const reintentos = modoE5.consulta === "con-errores" ? 2 : 0;
  const incompleta = tanda.hayMas;
  const conError = cuenta("CON_ERROR");
  return ejecucionBase({
    id: nuevoId(),
    origen: "JIRA",
    fase: "CONSULTA",
    consultaId,
    resultado: incompleta ? "INCOMPLETA" : conError > 0 ? "CON_ERRORES" : "EXITOSA",
    actor: { id: usuario.id, nombre: usuario.nombre, rol: "ADMINISTRADOR" },
    iniciadaEn: ahora.toISOString(),
    terminadaEn: new Date(ahora.getTime() + 3100).toISOString(),
    duracionMs: 3100,
    proyecto: PROYECTO,
    sitioHost: HOST,
    leidas: tanda.leidas.length,
    nuevas: cuenta("NUEVA"),
    cambiaron: cuenta("CAMBIO"),
    sinCambios: cuenta("SIN_CAMBIOS"),
    conError,
    conAdvertencias: modoE5.consulta === "con-errores" ? 4 : tanda.leidas.filter((i) => i.advertencias.length > 0).length,
    reintentos429: reintentos,
    eventos: Array.from({ length: reintentos }, () => ({ tipo: "JIRA_LIMITE_DE_TASA" as const, esperaMs: 1000, fecha: ahora.toISOString() })),
    hayMas: tanda.hayMas,
    continuarDesde: tanda.hayMas ? (tanda.leidas.at(-1)?.codigo ?? null) : null,
    codigoError: incompleta ? (tanda.codigo ?? null) : null,
    mensajeError: incompleta && tanda.codigo ? TEXTO_DE_JIRA : null,
    sugerencias: incompleta && tanda.codigo !== "TOPE_DE_CONSULTA" ? ["CONTINUAR"] : [],
  });
}

function filasDeDetalle(items: ItemConsulta[]): FilaMock[] {
  return items
    .filter((i) => i.grupo === "CON_ERROR")
    .map((i, n) => ({ fila: n + 1, codigo: i.codigo, titulo: i.titulo, idHistoria: null, resultado: "ERROR" as const, motivo: i.motivo, advertencias: [], cambios: null, referencia: i.referencia }));
}

function fallidaDe(codigo: NonNullable<Ejecucion["codigoError"]>, usuario: { id: string; nombre: string }): Ejecucion {
  const ahora = new Date();
  return ejecucionBase({
    id: nuevoId(),
    origen: "JIRA",
    fase: "CONSULTA",
    resultado: "FALLIDA",
    actor: { id: usuario.id, nombre: usuario.nombre, rol: "ADMINISTRADOR" },
    iniciadaEn: ahora.toISOString(),
    terminadaEn: new Date(ahora.getTime() + 2000).toISOString(),
    duracionMs: 2000,
    proyecto: PROYECTO,
    sitioHost: HOST,
    codigoError: codigo,
    mensajeError: TEXTO_DE_JIRA,
    sugerencias: SUGERENCIAS[codigo] ?? ["IMPORTAR_ARCHIVO"],
    hayMas: false,
  });
}

function falloDelModo(usuario: { id: string; nombre: string }): Ejecucion | null {
  const m = modoE5.consulta;
  if (m === "fallida") return fallidaDe("JIRA_NO_DISPONIBLE", usuario);
  if (m === "fallida-credencial") return fallidaDe("JIRA_CREDENCIAL_INVALIDA", usuario);
  if (m === "fallida-organizacion") return fallidaDe("ORGANIZACION_NO_DISPONIBLE", usuario);
  if (m === "fallida-tasa") return { ...fallidaDe("JIRA_LIMITE_DE_TASA", usuario), reintentos429: 3, sugerencias: ["REINTENTAR", "IMPORTAR_ARCHIVO"] };
  return null;
}

/** Errores previos a la ejecución (409/503): ninguno registra ejecución ni llama a Jira. */
function previos(): Respuesta | null {
  if (modoE5.configuracion === "sin-llave") return err(503, "LLAVE_CIFRADO_NO_DISPONIBLE");
  if (modoE5.configuracion === "vacia") return err(409, "JIRA_NO_CONFIGURADO");
  if (modoE5.configuracion === "no-descifrable") return err(409, "TOKEN_NO_DESCIFRABLE");
  if (modoE5.consulta === "en-curso") return err(409, "INTEGRACION_EN_CURSO");
  return null;
}

// ---------------------------------------------------------- detalle y confirmación por fila

/** Ejecución `HDU` de cada fila confirmada una a una: un reintento del mismo actor devuelve la misma (`repetida`). */
const ejecucionesDeFila = new Map<string, Ejecucion>();

/** Crea la HDU de una fila `NUEVA` completa (lo hacen el lote y «Confirmar asignación»). */
function crearHduDeFila(i: ItemConsulta, actorId: string, ahora: Date) {
  const a = i.asignacion as NonNullable<ItemConsulta["asignacion"]>;
  const hdu = {
    id: nuevoId(),
    codigo: i.codigo ?? "SIN-CODIGO",
    titulo: i.titulo ?? i.codigo ?? "Sin título",
    celulaId: (a.celula as { id: string }).id,
    sprintId: (a.sprint as { id: string }).id,
    prioridad: i.prioridad ?? ("MEDIA" as const),
    estado: "PENDIENTE" as const,
    estadoActualizadoEn: ahora.toISOString(),
    qeResponsableId: (a.qeResponsable as { id: string }).id,
    analistaId: a.analista?.id ?? null,
    creadoPorId: actorId,
    creadoEn: ahora.toISOString(),
  };
  hdus.push(hdu);
  hduCreadasPorConsulta.push(hdu.id);
  const sprintE5 = sprintsE5.find((s) => s.id === hdu.sprintId);
  if (sprintE5 && !sprintsAdicionales.some((s) => s.id === sprintE5.id)) sprintsAdicionales.push({ id: sprintE5.id, nombre: sprintE5.nombre, inicio: sprintE5.inicio, fin: sprintE5.fin });
  origenesHdu.set(hdu.id, { descripcion: i.descripcion, origen: "JIRA", claveExterna: i.codigo, urlExterna: i.urlExterna });
  return hdu;
}

function referenciaDe(i: ItemConsulta, titulo?: string) {
  return { id: i.idHistoria as string, codigo: i.codigo ?? "", titulo: titulo ?? i.titulo ?? "", estado: "PENDIENTE" as const };
}

/** `DetalleHdu` simulado de una fila (D196–D199). `largo`: textos al límite y 25 etiquetas. */
function detalleDe(i: ItemConsulta, largo: boolean): DetalleHdu {
  const parrafo = "Texto de la historia con palabras suficientes para llenar varias líneas del panel. ";
  const descripcion = largo ? parrafo.repeat(120).slice(0, 8000) : `${i.descripcion ?? ""}\nSegunda línea con <b>etiquetas</b> y https://ejemplo.com/ruta. [contenido no mostrable]`.trim();
  const sinCriterios = i.posicion === 2;
  const desdeDescripcion = i.posicion === 3;
  return {
    resumen: i.titulo,
    descripcion: { texto: i.descripcion || largo ? descripcion : null, truncado: largo },
    criterios: sinCriterios ? { texto: null, origen: null, truncado: false } : { texto: "• El segundo factor es obligatorio\n• Se registra el intento fallido", origen: desdeDescripcion ? "DESCRIPCION" : "CAMPO", truncado: false },
    estadoJira: "En curso",
    prioridadJira: "High",
    prioridadQ360: i.prioridad,
    tipo: "Historia",
    responsableJira: i.referencia?.responsable ?? null,
    etiquetas: Array.from({ length: largo ? 20 : 3 }, (_, n) => ({ valor: n < 3 ? ["seguridad", "login", "mfa"][n] : `etiqueta-${n + 1}` })),
    etiquetasTotal: largo ? 25 : 3,
    sprints: i.sprintJira ? [{ nombre: i.sprintJira, estado: "ACTIVO", inicio: "2026-11-03T12:00:00Z", fin: "2026-11-17T12:00:00Z" }] : [],
    epica: { clave: "QTY-100", titulo: "Autenticación" },
    fechas: { creada: "2026-10-20T13:00:00Z", actualizada: "2026-11-04T15:30:00Z", vencimiento: "2026-11-30", resolucion: null },
    urlJira: i.urlExterna,
  };
}

// ------------------------------------------------------------------ edición

function conCoincidencia(i: ItemConsulta, q: string | undefined): boolean {
  if (!q) return true;
  const t = q.toLowerCase();
  return (i.codigo ?? "").toLowerCase().includes(t) || (i.titulo ?? "").toLowerCase().includes(t);
}

function proponerSprint(item: ItemConsulta, celulaId: string) {
  const delaCelula = todosLosSprints().filter((s) => s.celulaId === celulaId);
  const deJira = item.sprintJira ? delaCelula.find((s) => s.nombre.toLowerCase() === item.sprintJira?.toLowerCase()) : undefined;
  if (deJira) return { sprint: { id: deJira.id, nombre: deJira.nombre }, origen: "JIRA" as const };
  const respaldo = estadoConfig.actual.sprintRespaldo;
  const respaldoEnCelula = respaldo && delaCelula.some((s) => s.id === respaldo.id);
  return respaldoEnCelula ? { sprint: respaldo, origen: "RESPALDO" as const } : { sprint: null, origen: null };
}

function editarFila(item: ItemConsulta, cuerpo: SolicitudEdicionItems, actor: Persona): { fila: ItemConsulta; rechazo: FilaRechazada | null; desmarcada: boolean } {
  const rechazar = (motivo: MotivoRechazoFila, campo: CampoAsignacion | null, faltantes?: CampoAsignacion[]): { fila: ItemConsulta; rechazo: FilaRechazada; desmarcada: boolean } => ({
    fila: item,
    rechazo: { itemId: item.id, codigo: item.codigo, campo, motivo, ...(faltantes ? { faltantes } : {}) },
    desmarcada: false,
  });
  if (item.grupo === "NUEVA" && item.yaAsignada && (cuerpo.asignacion || cuerpo.marcada === true)) return rechazar("HDU_YA_ASIGNADA", null);
  if (item.aplicando) return rechazar("FILA_EN_CURSO", null);
  if (item.aplicada) {
    if (cuerpo.asignacion) return rechazar("FILA_NO_ASIGNABLE", null);
    if (cuerpo.marcada !== undefined) return rechazar("FILA_NO_MARCABLE", null);
    return { fila: item, rechazo: null, desmarcada: false };
  }
  let fila = { ...item };
  if (cuerpo.asignacion) {
    if (item.grupo !== "NUEVA") return rechazar("FILA_NO_ASIGNABLE", null);
    const cambio = cuerpo.asignacion;
    const previa = item.asignacion ?? { celula: null, qeResponsable: null, analista: null, sprint: null, sprintOrigen: null };
    let celula = previa.celula;
    let qe = previa.qeResponsable;
    let analista = previa.analista;
    let sprint = previa.sprint;
    let origen = previa.sprintOrigen;
    let auto = item.analistaAuto;
    if (cambio.celulaId !== undefined) {
      const c = cambio.celulaId === null ? null : celulas.find((x) => x.id === cambio.celulaId);
      if (cambio.celulaId !== null && !c) return rechazar("CATALOGO_INVALIDO", "celulaId");
      celula = c ? { id: c.id, nombre: c.nombre } : null;
      if (cambio.sprintId === undefined) {
        const propuesta = celula ? proponerSprint(item, celula.id) : { sprint: null, origen: null };
        sprint = propuesta.sprint;
        origen = propuesta.origen;
      }
    }
    if (cambio.qeId !== undefined) {
      const u = cambio.qeId === null ? null : usuarios.find((x) => x.id === cambio.qeId && x.rol === "QE" && x.activo);
      if (cambio.qeId !== null && !u) return rechazar("QE_INVALIDO", "qeId");
      qe = u ? { id: u.id, nombre: u.nombre } : null;
      if (cambio.analistaId === undefined) {
        if (analista && !(qe && analistasVigentesDe(qe.id).some((r) => r.analistaId === analista?.id))) analista = null;
        // D201: un QE con un único Analista activo en su equipo vigente lo asigna solo; en cualquier otro caso la marca se apaga.
        const activos = qe ? analistasVigentesDe(qe.id).flatMap((r) => usuarios.filter((x) => x.id === r.analistaId && x.activo)) : [];
        auto = activos.length === 1 && qe !== null;
        if (auto) analista = { id: activos[0].id, nombre: activos[0].nombre };
      }
    }
    if (cambio.analistaId !== undefined) {
      const u = cambio.analistaId === null ? null : usuarios.find((x) => x.id === cambio.analistaId && x.rol === "ANALISTA_QA" && x.activo);
      if (cambio.analistaId !== null && !u) return rechazar("ANALISTA_INVALIDO", "analistaId");
      if (u && !(qe && analistasVigentesDe(qe.id).some((r) => r.analistaId === u.id))) return rechazar("ANALISTA_FUERA_DE_EQUIPO", "analistaId");
      analista = u ? { id: u.id, nombre: u.nombre } : null;
      auto = false;
    }
    if (cambio.sprintId !== undefined) {
      const s = cambio.sprintId === null ? null : todosLosSprints().find((x) => x.id === cambio.sprintId);
      if (cambio.sprintId !== null && (!s || s.celulaId !== celula?.id)) return rechazar("CATALOGO_INVALIDO", "sprintId");
      sprint = s ? { id: s.id, nombre: s.nombre } : null;
      origen = s ? "MANUAL" : null;
    }
    const algo = celula ?? qe ?? analista ?? sprint;
    fila = {
      ...fila,
      asignacion: algo ? { celula, qeResponsable: qe, analista, sprint, sprintOrigen: origen } : null,
      analistaAuto: Boolean(analista) && auto,
      asignadoPor: actor,
      asignadoEn: new Date().toISOString(),
    };
    fila = derivar(fila);
  }
  let desmarcada = false;
  if (cuerpo.marcada === true) {
    if (fila.grupo === "SIN_CAMBIOS" || fila.grupo === "CON_ERROR") return rechazar("FILA_NO_MARCABLE", null);
    if (fila.grupo === "NUEVA" && !fila.completa) return rechazar("ASIGNACION_INCOMPLETA" as MotivoRechazoFila, null, fila.faltantes);
    fila.marcada = true;
  } else if (cuerpo.marcada === false) {
    fila.marcada = false;
  } else if (cuerpo.marcarListas && fila.grupo === "NUEVA" && fila.completa) {
    fila.marcada = true;
  }
  if (fila.grupo === "NUEVA" && fila.marcada && !fila.completa) {
    fila.marcada = false;
    desmarcada = true;
  }
  // D202: la `revision` de la fila sube con cada cambio de la fila.
  if (JSON.stringify({ ...fila, revision: 0 }) !== JSON.stringify({ ...item, revision: 0 })) fila = { ...fila, revision: item.revision + 1 };
  return { fila, rechazo: null, desmarcada };
}

// ---------------------------------------------------------------- handlers

export const handlersConsulta = [
  http.post(`${BASE}/v1/integraciones/jira/consultas`, async ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const cuerpo = (await request.json().catch(() => ({}))) as { reemplazar?: boolean };
    const previo = previos();
    if (previo) return previo;
    aplicarVencimiento();
    const abierta = sincronizar();
    if (abierta && !cuerpo.reemplazar) {
      return err(409, "CONSULTA_ABIERTA", { consultaId: abierta.id, creadaPor: abierta.creadaPor, creadaEn: abierta.creadaEn, asignadas: abierta.asignadas });
    }
    await delay(modoE5.demoraMs);
    estadoConsulta.llamadasJira += 1;
    const persona = { id: actor.id, nombre: actor.nombre };
    const fallo = falloDelModo(persona);
    if (fallo) {
      registrar(fallo, []);
      return HttpResponse.json({ consulta: null, ejecucion: fallo });
    }
    if (abierta) cerrar("REEMPLAZADA", persona);
    Object.assign(estadoConsulta, { items: [], leidas: 0, tandas: 0 });
    ejecucionesDeFila.clear();
    const tanda = leerTanda();
    const ahora = new Date();
    const config = estadoConfig.actual;
    const base: Consulta = {
      id: nuevoId(),
      estado: "ABIERTA",
      version: 1,
      creadaPor: persona,
      creadaEn: ahora.toISOString(),
      venceEn: new Date(ahora.getTime() + VIGENCIA_MS).toISOString(),
      cerradaEn: null,
      cerradaPor: null,
      proyecto: PROYECTO,
      sitioHost: HOST,
      hayMas: tanda.hayMas,
      continuarDesde: tanda.hayMas ? (tanda.leidas.at(-1)?.codigo ?? null) : null,
      leidas: 0, nuevas: 0, cambiaron: 0, sinCambios: 0, conError: 0, conAdvertencias: 0, asignadas: 0, completas: 0, marcadasNuevas: 0, marcadasCambio: 0, aplicadas: 0, pendientes: 0, descartadas: 0, creadas: 0, yaAsignadas: 0,
      sugerencia: { celula: config.celula, qeResponsable: config.qeResponsable, sprintRespaldo: config.sprintRespaldo },
    };
    estadoConsulta.items = tanda.leidas;
    estadoConsulta.leidas = tanda.leidas.length;
    estadoConsulta.tandas = 1;
    estadoConsulta.consulta = recalcular(base, tanda.leidas);
    const ejecucion = ejecucionDeTanda(base.id, tanda, persona);
    registrar(ejecucion, filasDeDetalle(tanda.leidas));
    return llegoRespuesta() ?? HttpResponse.json({ consulta: estadoConsulta.consulta, ejecucion });
  }),

  http.get(`${BASE}/v1/integraciones/jira/consultas/actual`, ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.lecturaConsulta);
    if (caida) return caida;
    aplicarVencimiento();
    return HttpResponse.json({ consulta: sincronizar(), ultimaCerrada: estadoConsulta.ultimaCerrada });
  }),

  http.get(`${BASE}/v1/integraciones/jira/consultas/:id`, ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.lecturaConsulta);
    if (caida) return caida;
    const hallada = buscar(String(params.id));
    return hallada ? HttpResponse.json(hallada.consulta) : noEncontrada();
  }),

  http.post(`${BASE}/v1/integraciones/jira/consultas/:id/continuaciones`, async ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    if (!hallada.abierta) return cerrada(hallada.consulta);
    if (estadoConsulta.items.length >= TOPE_CONSULTA) return err(409, "CONSULTA_LLENA");
    if (!hallada.consulta.hayMas) return err(409, "CONSULTA_COMPLETA");
    const previo = previos();
    if (previo) return previo;
    await delay(modoE5.demoraMs);
    estadoConsulta.llamadasJira += 1;
    const persona = { id: actor.id, nombre: actor.nombre };
    const fallo = falloDelModo(persona);
    if (fallo) {
      registrar({ ...fallo, consultaId: hallada.consulta.id }, []);
      return HttpResponse.json({ consulta: hallada.consulta, ejecucion: { ...fallo, consultaId: hallada.consulta.id } });
    }
    const tanda = leerTanda();
    estadoConsulta.items = [...estadoConsulta.items, ...tanda.leidas];
    estadoConsulta.leidas += tanda.leidas.length;
    estadoConsulta.tandas += 1;
    estadoConsulta.consulta = {
      ...(estadoConsulta.consulta as Consulta),
      version: hallada.consulta.version + 1,
      venceEn: new Date(Date.now() + VIGENCIA_MS).toISOString(),
      hayMas: tanda.hayMas,
      continuarDesde: tanda.hayMas ? (tanda.leidas.at(-1)?.codigo ?? null) : null,
    };
    const consulta = sincronizar() as Consulta;
    const ejecucion = ejecucionDeTanda(consulta.id, tanda, persona);
    registrar(ejecucion, filasDeDetalle(tanda.leidas));
    return llegoRespuesta() ?? HttpResponse.json({ consulta, ejecucion });
  }),

  http.get(`${BASE}/v1/integraciones/jira/consultas/:id/items`, ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.lecturaConsulta);
    if (caida) return caida;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    if (!hallada.abierta) return cerrada(hallada.consulta);
    const p = new URL(request.url).searchParams;
    const grupo = p.get("grupo") as GrupoConsulta | null;
    if (!grupo || !["NUEVA", "CAMBIO", "SIN_CAMBIOS", "CON_ERROR"].includes(grupo)) return err(400, "VALIDACION", {}, [{ campo: "grupo", codigo: "REQUERIDO", mensaje: "Indica el grupo." }]);
    const q = p.get("q") ?? undefined;
    const tamano = Math.min(100, leerNumero(p.get("tamanoPagina"), 25));
    const pagina = leerNumero(p.get("pagina"), 1);
    const filtradas = estadoConsulta.items.filter((i) => i.grupo === grupo && conCoincidencia(i, q)).sort((a, b) => a.posicion - b.posicion);
    return HttpResponse.json({ items: filtradas.slice((pagina - 1) * tamano, pagina * tamano), total: filtradas.length, yaAsignadas: filtradas.filter((i) => i.yaAsignada).length, pagina, tamanoPagina: tamano, version: hallada.consulta.version });
  }),

  // Detalle de una fila (D200): lee la base propia; no llama a Jira ni a Organización.
  http.get(`${BASE}/v1/integraciones/jira/consultas/:id/items/:itemId`, async ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    const item = hallada.abierta ? estadoConsulta.items.find((i) => i.id === params.itemId) : undefined;
    if (hallada.abierta && !item) return noEncontrada();
    if (!hallada.abierta) return cerrada(hallada.consulta);
    await delay(40);
    if (modoE5.detalleItem === "error") return err(500, "ERROR_INTERNO");
    return HttpResponse.json({
      item,
      detalle: modoE5.detalleItem === "antiguo" ? null : detalleDe(item as ItemConsulta, modoE5.detalleItem === "largo"),
      leidaEn: "2026-11-05T10:32:00Z",
      version: hallada.consulta.version,
    });
  }),

  // «Confirmar asignación» de una sola HDU (D202, D204): crea esa HDU; la consulta sigue abierta (D205).
  http.post(`${BASE}/v1/integraciones/jira/consultas/:id/items/:itemId/confirmaciones`, async ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    const item = estadoConsulta.items.find((i) => i.id === params.itemId);
    if (hallada.abierta && !item) return noEncontrada();
    const { revision } = (await request.json().catch(() => ({}))) as { revision?: number };
    if (typeof revision !== "number") return err(400, "VALIDACION", {}, [{ campo: "revision", codigo: "REQUERIDO", mensaje: "Falta la revisión." }]);
    if (!hallada.abierta || !item) return cerrada(hallada.consulta);
    if (item.grupo !== "NUEVA") return err(422, "FILA_NO_ASIGNABLE", {}, [{ campo: "itemId", codigo: "FILA_NO_ASIGNABLE", mensaje: "No es una fila nueva." }]);
    const persona = { id: actor.id, nombre: actor.nombre };
    const reemplazar = (nueva: ItemConsulta) => {
      estadoConsulta.items = estadoConsulta.items.map((i) => (i.id === nueva.id ? nueva : i));
      if (estadoConsulta.consulta) estadoConsulta.consulta = { ...estadoConsulta.consulta, version: estadoConsulta.consulta.version + 1 };
      sincronizar();
      return nueva;
    };
    if (item.yaAsignada) return err(409, "HDU_YA_ASIGNADA", { yaAsignada: item.yaAsignada, item });
    if (item.aplicada) {
      const previa = ejecucionesDeFila.get(item.id);
      if (item.aplicacion?.por.id === actor.id && previa) {
        return HttpResponse.json({ resultado: "CREADA", repetida: true, hdu: referenciaDe(item), item, ejecucion: previa, consulta: sincronizar() });
      }
      return err(409, "HDU_YA_ASIGNADA", { yaAsignada: { idHistoria: item.idHistoria, qe: item.asignacion?.qeResponsable?.nombre ?? "—", analista: item.asignacion?.analista?.nombre ?? null }, item });
    }
    // Gatillos de prueba de un solo uso: la próxima confirmación de fila se rechaza como lo haría el servidor.
    const modo = modoE5.confirmacionFila;
    if (modo !== "normal") modoE5.confirmacionFila = "normal";
    if (modo === "ya-asignada") {
      const yaAsignada = { idHistoria: ID_YA_ASIGNADA, qe: item.asignacion?.qeResponsable?.nombre ?? "Jose Seguel", analista: null };
      const nueva = reemplazar({ ...item, marcada: false, revision: item.revision + 1, yaAsignada, idHistoria: yaAsignada.idHistoria, origenHdu: "MANUAL" });
      return err(409, "HDU_YA_ASIGNADA", { yaAsignada, item: nueva });
    }
    if (modo === "modificada") return err(409, "FILA_MODIFICADA", { item: reemplazar({ ...item, revision: item.revision + 1 }) });
    if (modo === "en-curso") return err(409, "FILA_EN_CURSO");
    if (modo === "red") return err(503, "SERVICIO_NO_DISPONIBLE");
    if (revision !== item.revision) return err(409, "FILA_MODIFICADA", { item });
    if (!item.completa) return err(422, "ASIGNACION_INCOMPLETA", {}, item.faltantes.map((f) => ({ campo: f, codigo: "ASIGNACION_INCOMPLETA", mensaje: "Falta este dato." })));
    if (item.aplicando) return err(409, "FILA_EN_CURSO");
    await delay(modoE5.demoraMs);
    const ahora = new Date();
    const a = item.asignacion as NonNullable<ItemConsulta["asignacion"]>;
    const hdu = crearHduDeFila(item, actor.id, ahora);
    const nueva = reemplazar({
      ...item,
      aplicada: true,
      marcada: true,
      marcable: false,
      idHistoria: hdu.id,
      revision: item.revision + 1,
      aplicacion: { alcance: "HDU", por: persona, en: ahora.toISOString() },
    });
    const ejecucion = ejecucionBase({
      id: nuevoId(),
      origen: "JIRA",
      fase: "CONFIRMACION",
      alcance: "HDU",
      consultaId: hallada.consulta.id,
      resultado: "EXITOSA",
      actor: { id: actor.id, nombre: actor.nombre, rol: "ADMINISTRADOR" },
      iniciadaEn: ahora.toISOString(),
      terminadaEn: new Date(ahora.getTime() + 600).toISOString(),
      duracionMs: 600,
      proyecto: PROYECTO,
      sitioHost: HOST,
      leidas: 1,
      creadas: 1,
    });
    registrar(ejecucion, [
      {
        fila: 1,
        codigo: item.codigo,
        titulo: item.titulo,
        idHistoria: hdu.id,
        resultado: "CREADA",
        motivo: null,
        advertencias: item.advertencias,
        cambios: null,
        referencia: item.referencia,
        asignacion: a.celula && a.qeResponsable && a.analista && a.sprint ? { celula: a.celula.nombre, qe: a.qeResponsable.nombre, analista: a.analista.nombre, sprint: a.sprint.nombre } : null,
      },
    ]);
    ejecucionesDeFila.set(item.id, ejecucion);
    return HttpResponse.json({ resultado: "CREADA", repetida: false, hdu: referenciaDe(nueva, hdu.titulo), item: nueva, ejecucion, consulta: sincronizar() });
  }),

  http.patch(`${BASE}/v1/integraciones/jira/consultas/:id/items`, async ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    const cuerpo = (await request.json().catch(() => ({}))) as SolicitudEdicionItems;
    const porIds = Array.isArray(cuerpo.itemIds) && cuerpo.itemIds.length > 0;
    const porGrupo = Boolean(cuerpo.grupo && cuerpo.todas === true);
    if (porIds === porGrupo) return err(400, "VALIDACION", {}, [{ campo: "itemIds", codigo: "ALCANCE", mensaje: "Indica itemIds o grupo con todas." }]);
    if (!hallada.abierta) return cerrada(hallada.consulta);
    const caida = fallaDe(modoE5.catalogos);
    if (caida) return caida;
    let alcance: ItemConsulta[];
    if (porIds) {
      const ids = cuerpo.itemIds as string[];
      alcance = ids.map((id) => estadoConsulta.items.find((i) => i.id === id)).filter((i): i is ItemConsulta => Boolean(i));
      if (alcance.length !== ids.length) return noEncontrada();
    } else {
      alcance = estadoConsulta.items.filter((i) => i.grupo === cuerpo.grupo && conCoincidencia(i, cuerpo.q));
    }
    const persona = { id: actor.id, nombre: actor.nombre };
    const resultados = alcance.map((i) => editarFila(i, cuerpo, persona));
    const rechazadas = resultados.flatMap((r) => (r.rechazo ? [r.rechazo] : []));
    if (porIds && alcance.length === 1 && rechazadas.length > 0) {
      const r = rechazadas[0];
      const campo = r.campo ?? "itemId";
      const detalles = r.motivo === ("ASIGNACION_INCOMPLETA" as MotivoRechazoFila) ? (r.faltantes ?? []).map((f) => ({ campo: f, codigo: r.motivo, mensaje: "Falta este dato." })) : [{ campo, codigo: r.motivo, mensaje: "Fila rechazada." }];
      if (r.motivo === "HDU_YA_ASIGNADA") return err(422, r.motivo, { yaAsignada: alcance[0].yaAsignada, item: alcance[0] }, detalles);
      if (r.motivo === "FILA_EN_CURSO") return err(409, r.motivo, {}, detalles);
      return err(422, r.motivo, {}, detalles);
    }
    const nuevos = new Map(resultados.filter((r) => !r.rechazo).map((r) => [r.fila.id, r.fila]));
    const cambio = resultados.some((r) => !r.rechazo && JSON.stringify(r.fila) !== JSON.stringify(alcance.find((a) => a.id === r.fila.id)));
    estadoConsulta.items = estadoConsulta.items.map((i) => nuevos.get(i.id) ?? i);
    if (cambio && estadoConsulta.consulta) estadoConsulta.consulta = { ...estadoConsulta.consulta, version: estadoConsulta.consulta.version + 1 };
    const consulta = sincronizar() as Consulta;
    const afectadas = resultados.filter((r) => !r.rechazo).map((r) => r.fila);
    return HttpResponse.json({
      aplicadas: cuerpo.asignacion ? afectadas.length : 0,
      marcadas: afectadas.filter((f) => f.marcada).length,
      incompletas: afectadas.filter((f) => f.grupo === "NUEVA" && !f.completa).length,
      rechazadas,
      desmarcadas: resultados.filter((r) => r.desmarcada).map((r) => r.fila.codigo ?? r.fila.id),
      version: consulta.version,
      items: afectadas,
    });
  }),

  http.post(`${BASE}/v1/integraciones/jira/consultas/:id/confirmaciones`, async ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    const { version } = (await request.json().catch(() => ({}))) as { version?: number };
    if (typeof version !== "number") return err(400, "VALIDACION", {}, [{ campo: "version", codigo: "REQUERIDO", mensaje: "Falta la versión." }]);
    if (!hallada.abierta) return cerrada(hallada.consulta);
    const actual = hallada.consulta;
    if (version !== actual.version) return err(409, "CONSULTA_MODIFICADA", { consultaId: actual.id, estado: actual.estado, version: actual.version });
    const pendientes = estadoConsulta.items.filter((i) => i.marcada && !i.aplicada);
    if (pendientes.length === 0) return err(422, "SIN_SELECCION");
    if (modoE5.consulta === "en-curso") return err(409, "INTEGRACION_EN_CURSO");
    if (modoE5.confirmacion === "asignaciones-invalidas") {
      const invalidas = pendientes.filter((i) => i.grupo === "NUEVA").slice(0, 2);
      const filas: FilaRechazada[] = invalidas.map((i) => ({ itemId: i.id, codigo: i.codigo, campo: "analistaId", motivo: "ANALISTA_INVALIDO" }));
      estadoConsulta.items = estadoConsulta.items.map((i) => (invalidas.some((x) => x.id === i.id) ? { ...i, marcada: false } : i));
      if (estadoConsulta.consulta) estadoConsulta.consulta = { ...estadoConsulta.consulta, version: actual.version + 1 };
      return err(409, "ASIGNACIONES_INVALIDAS", { filas, version: (sincronizar() as Consulta).version });
    }
    if (modoE5.confirmacion === "organizacion-caida") return err(503, "SERVICIO_NO_DISPONIBLE");
    await delay(modoE5.demoraMs);
    const incompleta = modoE5.confirmacion === "incompleta";
    const procesadas = incompleta ? pendientes.slice(0, Math.max(1, Math.min(LOTE_CONFIRMACION, Math.floor(pendientes.length / 2)))) : pendientes;
    const ids = new Set(procesadas.map((i) => i.id));
    estadoConsulta.items = estadoConsulta.items.map((i) => (ids.has(i.id) ? { ...i, aplicada: true, revision: i.revision + 1, aplicacion: { alcance: "LOTE" as const, por: { id: actor.id, nombre: actor.nombre }, en: new Date().toISOString() } } : i));
    const creadas = procesadas.filter((i) => i.grupo === "NUEVA");
    const actualizadas = procesadas.filter((i) => i.grupo === "CAMBIO");
    const persona = { id: actor.id, nombre: actor.nombre };
    const ahora = new Date();
    const idsCreadas = new Map<string, string>();
    for (const i of creadas) {
      const a = i.asignacion;
      if (!a?.celula || !a.qeResponsable || !a.sprint || !i.codigo) continue;
      idsCreadas.set(i.id, crearHduDeFila(i, actor.id, ahora).id);
    }
    for (const i of actualizadas) {
      const existente = hdus.find((h) => h.id === i.idHistoria);
      if (!existente) continue;
      if (i.cambios?.titulo?.despues) existente.titulo = i.cambios.titulo.despues;
      if (i.cambios?.prioridad?.despues) existente.prioridad = i.cambios.prioridad.despues as typeof existente.prioridad;
      origenesHdu.set(existente.id, { ...(origenesHdu.get(existente.id) ?? { descripcion: null, claveExterna: null, urlExterna: null }), origen: "JIRA", claveExterna: i.codigo });
    }
    const filas: FilaMock[] = procesadas.map((i, n) => ({
      fila: n + 1,
      codigo: i.codigo,
      titulo: i.titulo,
      idHistoria: i.grupo === "NUEVA" ? (idsCreadas.get(i.id) ?? nuevoId()) : i.idHistoria,
      resultado: i.grupo === "NUEVA" ? "CREADA" : "ACTUALIZADA",
      motivo: null,
      advertencias: i.advertencias,
      cambios: null,
      referencia: i.referencia,
      asignacion: i.asignacion?.celula && i.asignacion.qeResponsable && i.asignacion.analista && i.asignacion.sprint ? { celula: i.asignacion.celula.nombre, qe: i.asignacion.qeResponsable.nombre, analista: i.asignacion.analista.nombre, sprint: i.asignacion.sprint.nombre } : null,
    }));
    const ejecucion = ejecucionBase({
      id: nuevoId(),
      origen: "JIRA",
      fase: "CONFIRMACION",
      consultaId: actual.id,
      resultado: incompleta ? "INCOMPLETA" : "EXITOSA",
      actor: { id: actor.id, nombre: actor.nombre, rol: "ADMINISTRADOR" },
      iniciadaEn: ahora.toISOString(),
      terminadaEn: new Date(ahora.getTime() + 2400).toISOString(),
      duracionMs: 2400,
      proyecto: PROYECTO,
      sitioHost: HOST,
      leidas: procesadas.length,
      creadas: creadas.length,
      actualizadas: actualizadas.length,
      codigoError: incompleta ? "ORGANIZACION_NO_DISPONIBLE" : null,
      mensajeError: incompleta ? TEXTO_DE_JIRA : null,
      sugerencias: incompleta ? ["REINTENTAR"] : [],
    });
    registrar(ejecucion, filas);
    let consulta: Consulta;
    if (estadoConsulta.items.some((i) => i.marcada && !i.aplicada)) {
      estadoConsulta.consulta = { ...(estadoConsulta.consulta as Consulta), version: actual.version + 1 };
      consulta = sincronizar() as Consulta;
    } else {
      const noMarcadas = estadoConsulta.items.filter((i) => !i.marcada).length;
      consulta = { ...cerrar("CONFIRMADA", persona), descartadas: noMarcadas };
      estadoConsulta.ultimaCerrada = consulta;
    }
    return llegoRespuesta() ?? (modoE5.confirmacion === "sin-respuesta" ? new HttpResponse("<html>502 Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }) : HttpResponse.json({ ejecucion, consulta }));
  }),

  http.post(`${BASE}/v1/integraciones/jira/consultas/:id/descartes`, ({ request, params }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const hallada = buscar(String(params.id));
    if (!hallada) return noEncontrada();
    if (!hallada.abierta) return cerrada(hallada.consulta);
    const sinConfirmar = estadoConsulta.items.filter((i) => !i.aplicada).length;
    const descartada = { ...cerrar("DESCARTADA", { id: actor.id, nombre: actor.nombre }), descartadas: sinConfirmar };
    estadoConsulta.ultimaCerrada = descartada;
    return HttpResponse.json(descartada);
  }),
];
