// MSW de la consulta de Jira (E5, D132–D152) según `contracts/integraciones.v1.yaml`, con estado en memoria: consultar,
// continuar, leer y editar filas, confirmar, descartar, vencimiento perezoso (D134) y la fase en el historial (D141).
// Solo sirve para pruebas y revisión visual; las reglas reales viven en `services/integraciones`.
import { delay, http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import type {
  AdvertenciaFila,
  CampoAsignacion,
  Consulta,
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
import { cuerpoError, leerNumero } from "./utils";

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
      if (cambio.analistaId === undefined && analista && !(qe && analistasVigentesDe(qe.id).some((r) => r.analistaId === analista?.id))) analista = null;
    }
    if (cambio.analistaId !== undefined) {
      const u = cambio.analistaId === null ? null : usuarios.find((x) => x.id === cambio.analistaId && x.rol === "ANALISTA_QA" && x.activo);
      if (cambio.analistaId !== null && !u) return rechazar("ANALISTA_INVALIDO", "analistaId");
      if (u && !(qe && analistasVigentesDe(qe.id).some((r) => r.analistaId === u.id))) return rechazar("ANALISTA_FUERA_DE_EQUIPO", "analistaId");
      analista = u ? { id: u.id, nombre: u.nombre } : null;
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
      leidas: 0, nuevas: 0, cambiaron: 0, sinCambios: 0, conError: 0, conAdvertencias: 0, asignadas: 0, completas: 0, marcadasNuevas: 0, marcadasCambio: 0, aplicadas: 0, pendientes: 0, descartadas: 0,
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
    return HttpResponse.json({ items: filtradas.slice((pagina - 1) * tamano, pagina * tamano), total: filtradas.length, pagina, tamanoPagina: tamano, version: hallada.consulta.version });
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
    estadoConsulta.items = estadoConsulta.items.map((i) => (ids.has(i.id) ? { ...i, aplicada: true } : i));
    const creadas = procesadas.filter((i) => i.grupo === "NUEVA");
    const actualizadas = procesadas.filter((i) => i.grupo === "CAMBIO");
    const persona = { id: actor.id, nombre: actor.nombre };
    const ahora = new Date();
    const idsCreadas = new Map<string, string>();
    for (const i of creadas) {
      const a = i.asignacion;
      if (!a?.celula || !a.qeResponsable || !a.sprint || !i.codigo) continue;
      const id = nuevoId();
      idsCreadas.set(i.id, id);
      hdus.push({
        id,
        codigo: i.codigo,
        titulo: i.titulo ?? i.codigo,
        celulaId: a.celula.id,
        sprintId: a.sprint.id,
        prioridad: i.prioridad ?? "MEDIA",
        estado: "PENDIENTE",
        estadoActualizadoEn: ahora.toISOString(),
        qeResponsableId: a.qeResponsable.id,
        analistaId: a.analista?.id ?? null,
        creadoPorId: actor.id,
        creadoEn: ahora.toISOString(),
      });
      hduCreadasPorConsulta.push(id);
      origenesHdu.set(id, { descripcion: i.descripcion, origen: "JIRA", claveExterna: i.codigo, urlExterna: i.urlExterna });
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
    return HttpResponse.json(cerrar("DESCARTADA", { id: actor.id, nombre: actor.nombre }));
  }),
];
