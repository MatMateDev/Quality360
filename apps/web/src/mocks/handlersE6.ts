// MSW de E6 según `contracts/indicadores.v1.yaml` (D176–D195) publicado por el gateway. Un dato caído nunca se
// convierte en 0: el bloque queda `indisponible` (D169), igual que en el servicio real.
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import type { ColorSemaforo, EstadoHdu, MotivoSemaforo, Rol } from "@/types/dominio";
import { ESTADOS_HDU } from "@/types/dominio";
import { autenticar, esUsuarioMock, exigirRol } from "./comun";
import { ID, analistasVigentesDe, buscarUsuario, celulas, hdus, sprints, supervisorVigenteDe, usuarios, type HduMock, type UsuarioMock } from "./data";
import { CELULAS_ABIERTO, aprobadosDe, claseDe, esActiva, estadoE6, infoHdu, motivosDe } from "./dataE6";
import { celulasVigentesDe, fuentes } from "./dataE7";
import { ERROR_ACCESO_DENEGADO, ERROR_NO_ENCONTRADO, cuerpoError } from "./utils";

const BASE = env.gatewayUrl;
type Respuesta = HttpResponse<any>;

const ahoraIso = () => new Date().toISOString();
const persona = (u: UsuarioMock) => ({ id: u.id, nombre: u.nombre });
const error503 = (): Respuesta => HttpResponse.json(cuerpoError("SERVICIO_NO_DISPONIBLE", "El servicio no está disponible. Intenta nuevamente."), { status: 503 });
const error500 = (): Respuesta => HttpResponse.json(cuerpoError("ERROR_INTERNO", "Ocurrió un error inesperado."), { status: 500 });
const bad = (campo: string, mensaje: string, codigo = "VALIDACION"): Respuesta =>
  HttpResponse.json(cuerpoError(codigo as never, mensaje, [{ campo, codigo: "VALOR_NO_PERMITIDO", mensaje }]), { status: 400 });

const ROLES_DASHBOARD: Rol[] = ["QE", "LIDER_QA", "AUDITOR"];

/** Ámbito del rol (D153, D176): `null` = 403. */
function ambitoDe(actor: UsuarioMock): HduMock[] | null {
  if (actor.rol === "AUDITOR") return [...hdus];
  if (actor.rol === "LIDER_QA") {
    const vigentes = celulasVigentesDe(actor.id);
    return hdus.filter((h) => vigentes.includes(h.celulaId));
  }
  if (actor.rol === "QE") {
    const supervisados = analistasVigentesDe(actor.id).map((r) => r.analistaId);
    return hdus.filter((h) => h.qeResponsableId === actor.id || (h.analistaId !== null && supervisados.includes(h.analistaId)));
  }
  return null;
}

/** Guardia común de las vistas: sesión, rol y fallas forzadas de las pruebas. */
function preparar(request: Request): { actor: UsuarioMock; ambito: HduMock[] } | Respuesta {
  const actor = autenticar(request);
  if (!esUsuarioMock(actor)) return actor;
  const denegado = exigirRol(actor, ...ROLES_DASHBOARD);
  if (denegado) return denegado;
  if (estadoE6.indicadoresCaido) return error500();
  if (estadoE6.organizacionCaida) return error503();
  return { actor, ambito: ambitoDe(actor) ?? [] };
}

const esRespuesta = (v: unknown): v is Respuesta => v instanceof Response;

function filtrar(ambito: HduMock[], url: URL, usarSprint = true): { items: HduMock[]; filtrado: boolean; celulaId: string | null; sprintId: string | null } {
  const celulaId = url.searchParams.get("celulaId");
  const sprintId = usarSprint ? url.searchParams.get("sprintId") : null;
  let items = ambito;
  if (celulaId) items = items.filter((h) => h.celulaId === celulaId);
  if (sprintId) items = sprintId === "SIN_SPRINT" ? [] : items.filter((h) => h.sprintId === sprintId);
  return { items, filtrado: Boolean(celulaId || sprintId), celulaId, sprintId };
}

const hduBloqueada = (h: HduMock) => h.estado !== "CERRADA" && infoHdu[h.id]?.impedimento != null;

// --------------------------------------------------------------------------- cumplimiento
function calcularCumplimiento(items: HduMock[]) {
  const certOk = fuentes.certificaciones;
  const impOk = fuentes.impedimentos;
  const clases = items.map(claseDe);
  const cuenta = (c: string) => clases.filter((x) => x === c).length;
  const promedio = items.length ? items.reduce((s, h) => s + (claseDe(h) === "CERTIFICADA" ? 100 : aprobadosDe(h) * 10), 0) / items.length : 0;
  const ok = (valor: number) => ({ estado: "ok" as const, valor });
  const caido = { estado: "indisponible" as const, valor: null };
  return {
    hduTotales: ok(items.length),
    certificadas: certOk ? ok(cuenta("CERTIFICADA")) : caido,
    cerradasConExcepcion: ok(cuenta("CERRADA_EXCEPCION")),
    enCurso: certOk ? ok(cuenta("EN_CURSO")) : caido,
    sinIniciar: certOk ? ok(cuenta("SIN_INICIAR")) : caido,
    bloqueadas: impOk ? ok(items.filter(hduBloqueada).length) : caido,
    cumplimientoPromedio: certOk ? ok(Math.round(promedio * 10) / 10) : caido,
  };
}

const NULO = { estado: "ok" as const, valor: null };

// ------------------------------------------------------------------------------ semáforo
interface CalculoCelula {
  estado: "ok" | "indisponible" | "SIN_HDU";
  color: ColorSemaforo | null;
  alMenos: "AMARILLO" | null;
  calculoParcial: boolean;
}

function calcularColor(items: HduMock[]): CalculoCelula {
  const activas = items.filter((h) => esActiva(h.estado));
  if (!fuentes.impedimentos) return { estado: "indisponible", color: null, alMenos: null, calculoParcial: false };
  const escalado = activas.some((h) => infoHdu[h.id]?.impedimento?.estado === "ESCALADO");
  const rojo = escalado || (fuentes.certificaciones && activas.some((h) => infoHdu[h.id]?.riesgo === "ALTO"));
  if (rojo) return { estado: "ok", color: "ROJO", alMenos: null, calculoParcial: !fuentes.certificaciones };
  if (!fuentes.certificaciones) {
    const amarillo = activas.some((h) => infoHdu[h.id]?.impedimento != null);
    return { estado: "indisponible", color: null, alMenos: amarillo ? "AMARILLO" : null, calculoParcial: false };
  }
  if (activas.some((h) => infoHdu[h.id]?.riesgo === "MEDIO" || infoHdu[h.id]?.impedimento != null)) return { estado: "ok", color: "AMARILLO", alMenos: null, calculoParcial: false };
  return { estado: "ok", color: "VERDE", alMenos: null, calculoParcial: false };
}

const ORDEN_COLOR: Record<string, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2 };

function celulasDelAmbito(actor: UsuarioMock, ambito: HduMock[]) {
  const ids = new Set(ambito.map((h) => h.celulaId));
  if (actor.rol === "LIDER_QA") for (const id of celulasVigentesDe(actor.id)) ids.add(id);
  return celulas.filter((c) => ids.has(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// -------------------------------------------------------------------------------- carga
function conteoPorEstado(items: HduMock[]) {
  const r = Object.fromEntries(ESTADOS_HDU.map((e) => [e, 0])) as Record<EstadoHdu, number>;
  for (const h of items) r[h.estado] += 1;
  return r;
}

export function umbralDe(qeId: string) {
  return estadoE6.umbrales.get(qeId) ?? { valor: 5, actualizadoEn: null, actualizadoPorId: null };
}

function filaAnalista(analista: UsuarioMock, ambitoTotal: HduMock[], filtradas: HduMock[], umbral: number, supervisadoPorMi: boolean | null) {
  const propias = ambitoTotal.filter((h) => h.analistaId === analista.id);
  const delFiltro = filtradas.filter((h) => h.analistaId === analista.id);
  const activas = propias.filter((h) => esActiva(h.estado)).length;
  const certOk = fuentes.certificaciones;
  const prom = delFiltro.length ? Math.round(delFiltro.reduce((s, h) => s + (claseDe(h) === "CERTIFICADA" ? 100 : aprobadosDe(h) * 10), 0) / delFiltro.length) : null;
  return {
    analista: { id: analista.id, nombre: analista.nombre, activo: analista.activo },
    supervisadoPorMi,
    porEstado: conteoPorEstado(delFiltro),
    activas,
    sinHdu: propias.length === 0,
    cumplimiento: certOk ? { estado: "ok" as const, valor: prom } : { estado: "indisponible" as const, valor: null },
    sobrecargado: activas > umbral,
  };
}

function ordenarFilas<T extends { sobrecargado: boolean; activas: number; analista: { nombre: string } }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => Number(b.sobrecargado) - Number(a.sobrecargado) || b.activas - a.activas || a.analista.nombre.localeCompare(b.analista.nombre));
}

// --------------------------------------------------------------------------- tendencia
const PUNTOS: Array<{ celulaId: string; sprintId: string; fecha: string; cumplimiento: number; hduTotal: number }> = [
  { celulaId: ID.celPagos, sprintId: ID.sprint19, fecha: "2026-09-15", cumplimiento: 30, hduTotal: 1 },
  { celulaId: ID.celPagos, sprintId: ID.sprint19, fecha: "2026-09-16", cumplimiento: 30, hduTotal: 1 },
  { celulaId: ID.celPagos, sprintId: ID.sprint19, fecha: "2026-09-17", cumplimiento: 40, hduTotal: 1 },
  { celulaId: ID.celClientes, sprintId: ID.sprint18, fecha: "2026-09-11", cumplimiento: 50, hduTotal: 2 },
  { celulaId: ID.celClientes, sprintId: ID.sprint18, fecha: "2026-09-13", cumplimiento: 55, hduTotal: 2 },
];

// --------------------------------------------------------------------------- exportación
function csvDe(vista: string, filas: string[][]): string {
  const neutral = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  return "﻿" + filas.map((f) => f.map((c) => `"${neutral(c).replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n" + (vista ? "" : "");
}

export const handlersE6 = [
  http.get(`${BASE}/v1/indicadores/filtros`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const cels = celulasDelAmbito(base.actor, base.ambito);
    const idsSprint = new Set(base.ambito.map((h) => h.sprintId));
    return HttpResponse.json({
      celulas: cels.map((c) => ({ id: c.id, nombre: c.nombre })),
      sprints: sprints
        .filter((s) => idsSprint.has(s.id))
        .map((s) => ({
          id: s.id,
          nombre: s.nombre,
          celulaId: base.ambito.find((h) => h.sprintId === s.id)?.celulaId ?? ID.celPagos,
          inicio: s.inicio,
          fin: s.fin,
          cerrado: !CELULAS_ABIERTO.has(s.id),
        })),
      hduSinSprint: estadoE6.hduSinSprint,
    });
  }),

  http.get(`${BASE}/v1/indicadores/cumplimiento`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const url = new URL(request.url);
    const { items, filtrado, celulaId, sprintId } = filtrar(base.ambito, url);
    const vacio = items.length === 0;
    const sinDatos = {
      hduTotales: NULO,
      certificadas: NULO,
      cerradasConExcepcion: NULO,
      enCurso: NULO,
      sinIniciar: NULO,
      bloqueadas: NULO,
      cumplimientoPromedio: NULO,
    };
    return HttpResponse.json({
      generadoEn: ahoraIso(),
      filtros: { celulaId, sprintId },
      sinDatos: vacio,
      motivoSinDatos: vacio ? (base.ambito.length === 0 || !filtrado ? "AMBITO_VACIO" : "FILTRO_SIN_COINCIDENCIAS") : null,
      ...(vacio ? sinDatos : calcularCumplimiento(items)),
    });
  }),

  http.get(`${BASE}/v1/indicadores/semaforo`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const url = new URL(request.url);
    const celulaId = url.searchParams.get("celulaId");
    const todas = celulasDelAmbito(base.actor, base.ambito);
    const lista = celulaId ? todas.filter((c) => c.id === celulaId) : todas;
    const filas = lista.map((c) => {
      const items = base.ambito.filter((h) => h.celulaId === c.id);
      const activas = items.filter((h) => esActiva(h.estado));
      const calculo: CalculoCelula = items.length === 0 ? { estado: "SIN_HDU", color: null, alMenos: null, calculoParcial: false } : calcularColor(items);
      const riesgos = activas.map((h) => infoHdu[h.id]?.riesgo);
      const maximo = riesgos.includes("ALTO") ? "ALTO" : riesgos.includes("MEDIO") ? "MEDIO" : activas.length ? "BAJO" : null;
      const conDatos = calculo.estado === "ok";
      return {
        celula: { id: c.id, nombre: c.nombre },
        ...calculo,
        riesgoMaximo: conDatos ? maximo : null,
        impedimentosAbiertos: conDatos ? activas.filter((h) => infoHdu[h.id]?.impedimento?.estado === "ABIERTO").length : null,
        impedimentosEscalados: conDatos ? activas.filter((h) => infoHdu[h.id]?.impedimento?.estado === "ESCALADO").length : null,
        hduActivas: activas.length,
      };
    });
    filas.sort((a, b) => (ORDEN_COLOR[a.color ?? "Z"] ?? 3) - (ORDEN_COLOR[b.color ?? "Z"] ?? 3) || a.celula.nombre.localeCompare(b.celula.nombre));
    const vacio = filas.length === 0;
    return HttpResponse.json({
      generadoEn: ahoraIso(),
      filtros: { celulaId, sprintId: null },
      sinDatos: vacio,
      motivoSinDatos: vacio ? (celulaId ? "FILTRO_SIN_COINCIDENCIAS" : "AMBITO_VACIO") : null,
      fuentes: { certificaciones: fuentes.certificaciones ? "ok" : "indisponible", impedimentos: fuentes.impedimentos ? "ok" : "indisponible" },
      celulas: filas,
    });
  }),

  http.get(`${BASE}/v1/indicadores/semaforo/:celulaId/hdu`, ({ request, params }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const celula = celulas.find((c) => c.id === params.celulaId);
    if (!celula) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    const permitidas = celulasDelAmbito(base.actor, base.ambito).map((c) => c.id);
    if (!permitidas.includes(celula.id)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
    const items = base.ambito.filter((h) => h.celulaId === celula.id && esActiva(h.estado));
    const calculo = calcularColor(base.ambito.filter((h) => h.celulaId === celula.id));
    const GRAVEDAD: Record<MotivoSemaforo, number> = { IMPEDIMENTO_ESCALADO: 0, RIESGO_ALTO: 1, RIESGO_MEDIO: 2, IMPEDIMENTO_ABIERTO: 3 };
    const filas = items
      .filter((h) => motivosDe(h).length > 0)
      .sort((a, b) => Math.min(...motivosDe(a).map((m) => GRAVEDAD[m])) - Math.min(...motivosDe(b).map((m) => GRAVEDAD[m])) || a.codigo.localeCompare(b.codigo))
      .map((h) => {
        const info = infoHdu[h.id]!;
        const analista = h.analistaId ? buscarUsuario(h.analistaId) : undefined;
        return {
          hdu: { id: h.id, codigo: h.codigo, titulo: h.titulo, estado: h.estado },
          analista: analista ? persona(analista) : null,
          riesgo: fuentes.impedimentos
            ? { nivelVigente: info.riesgo, origen: "CALCULADO", estado: "ok", calculoParcial: !fuentes.certificaciones }
            : { nivelVigente: null, origen: null, estado: "indisponible", calculoParcial: false },
          motivos: motivosDe(h),
          impedimentoPrincipal: info.impedimento
            ? { id: info.impedimento.id, titulo: info.impedimento.titulo, tipo: "AMBIENTE", estado: info.impedimento.estado, diasAbierto: info.impedimento.diasAbierto }
            : null,
        };
      });
    return HttpResponse.json({ generadoEn: ahoraIso(), celula: { id: celula.id, nombre: celula.nombre }, estado: calculo.estado === "SIN_HDU" ? "ok" : calculo.estado, color: calculo.color, calculoParcial: calculo.calculoParcial, items: filas });
  }),

  http.get(`${BASE}/v1/indicadores/carga`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const url = new URL(request.url);
    const { items: filtradas, filtrado, celulaId, sprintId } = filtrar(base.ambito, url);
    const vacioAmbito = base.ambito.length === 0;
    const vacio = vacioAmbito || (filtrado && filtradas.length === 0);
    const fuentesBloque = { certificaciones: fuentes.certificaciones ? "ok" : "indisponible", impedimentos: fuentes.impedimentos ? "ok" : "indisponible" };
    const sinAnalistaItems = filtradas.filter((h) => h.analistaId === null);
    const sinAnalista = sinAnalistaItems.length
      ? { porEstado: conteoPorEstado(sinAnalistaItems), activas: base.ambito.filter((h) => h.analistaId === null && esActiva(h.estado)).length }
      : null;
    const encabezado = { generadoEn: ahoraIso(), filtros: { celulaId, sprintId }, sinDatos: vacio, motivoSinDatos: vacio ? (vacioAmbito ? "AMBITO_VACIO" : "FILTRO_SIN_COINCIDENCIAS") : null, fuentes: fuentesBloque };
    if (vacio) return HttpResponse.json({ ...encabezado, grupos: [], sinAnalista: null });

    const analistas = usuarios.filter((u) => u.rol === "ANALISTA_QA");
    if (base.actor.rol === "QE") {
      const u = umbralDe(base.actor.id);
      const supervisados = analistasVigentesDe(base.actor.id).map((r) => r.analistaId);
      const conHdu = base.ambito.map((h) => h.analistaId).filter((x): x is string => x !== null);
      const ids = [...new Set([...supervisados, ...conHdu])];
      const filas = ids.map((id) => buscarUsuario(id)!).filter(Boolean).map((a) => filaAnalista(a, base.ambito, filtradas, u.valor, supervisados.includes(a.id)));
      return HttpResponse.json({
        ...encabezado,
        grupos: [{ umbral: { qe: persona(base.actor), valor: u.valor, porDefecto: !estadoE6.umbrales.has(base.actor.id) }, filas: ordenarFilas(filas) }],
        sinAnalista,
      });
    }
    // Líder y Auditor: un grupo por QE supervisor más «Sin QE supervisor» (D182).
    const grupos: Array<{ umbral: { qe: { id: string; nombre: string } | null; valor: number; porDefecto: boolean }; filas: ReturnType<typeof filaAnalista>[] }> = [];
    const qes = usuarios.filter((u) => u.rol === "QE").sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const qe of qes) {
      const u = umbralDe(qe.id);
      const filas = analistas
        .filter((a) => supervisorVigenteDe(a.id)?.qeId === qe.id && base.ambito.some((h) => h.analistaId === a.id))
        .map((a) => filaAnalista(a, base.ambito, filtradas, u.valor, null));
      if (filas.length) grupos.push({ umbral: { qe: persona(qe), valor: u.valor, porDefecto: !estadoE6.umbrales.has(qe.id) }, filas: ordenarFilas(filas) });
    }
    const sinSupervisor = analistas
      .filter((a) => !supervisorVigenteDe(a.id) && base.ambito.some((h) => h.analistaId === a.id))
      .map((a) => filaAnalista(a, base.ambito, filtradas, 5, null));
    if (sinSupervisor.length) grupos.push({ umbral: { qe: null, valor: 5, porDefecto: true }, filas: ordenarFilas(sinSupervisor) });
    return HttpResponse.json({ ...encabezado, grupos, sinAnalista });
  }),

  http.get(`${BASE}/v1/indicadores/umbral-carga`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const qeParam = new URL(request.url).searchParams.get("qeId");
    const qeId = base.actor.rol === "QE" ? base.actor.id : qeParam;
    const qe = qeId ? buscarUsuario(qeId) : undefined;
    if (!qe || qe.rol !== "QE") return qeParam ? HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 }) : bad("qeId", "Indica el QE.");
    const u = umbralDe(qe.id);
    const actor = u.actualizadoPorId ? buscarUsuario(u.actualizadoPorId) : undefined;
    return HttpResponse.json({ qe: persona(qe), valor: u.valor, porDefecto: !estadoE6.umbrales.has(qe.id), actualizadoEn: u.actualizadoEn, actualizadoPor: actor ? persona(actor) : null });
  }),

  http.put(`${BASE}/v1/indicadores/umbral-carga`, async ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE");
    if (denegado) return denegado;
    if (estadoE6.indicadoresCaido) return error500();
    const cuerpo = (await request.json().catch(() => ({}))) as { valor?: unknown };
    if (typeof cuerpo.valor !== "number" || !Number.isInteger(cuerpo.valor)) return bad("valor", "El umbral debe ser un entero.");
    if (cuerpo.valor < 1 || cuerpo.valor > 50) return bad("valor", "El umbral debe estar entre 1 y 50.", "VALOR_FUERA_DE_RANGO");
    const anterior = umbralDe(actor.id);
    const cambio = anterior.valor !== cuerpo.valor;
    if (cambio) {
      const fecha = ahoraIso();
      estadoE6.umbrales.set(actor.id, { valor: cuerpo.valor, actualizadoEn: fecha, actualizadoPorId: actor.id });
      estadoE6.eventosUmbral.unshift({ id: crypto.randomUUID(), qeId: actor.id, valorAnterior: anterior.valor, valorNuevo: cuerpo.valor, actorId: actor.id, fecha });
    }
    const u = umbralDe(actor.id);
    return HttpResponse.json({
      cambio,
      umbral: { qe: persona(actor), valor: u.valor, porDefecto: !estadoE6.umbrales.has(actor.id), actualizadoEn: u.actualizadoEn, actualizadoPor: u.actualizadoPorId ? persona(actor) : null },
    });
  }),

  http.get(`${BASE}/v1/indicadores/umbral-carga/historial`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE", "AUDITOR");
    if (denegado) return denegado;
    const url = new URL(request.url);
    const qeId = actor.rol === "QE" ? actor.id : url.searchParams.get("qeId");
    if (!qeId) return bad("qeId", "Indica el QE.");
    const pagina = Number(url.searchParams.get("pagina") ?? 1) || 1;
    const tamano = Number(url.searchParams.get("tamanoPagina") ?? 5) || 5;
    const todos = estadoE6.eventosUmbral.filter((e) => e.qeId === qeId);
    const items = todos.slice((pagina - 1) * tamano, pagina * tamano).map((e) => ({
      id: e.id,
      qe: persona(buscarUsuario(e.qeId)!),
      valorAnterior: e.valorAnterior,
      valorNuevo: e.valorNuevo,
      actor: persona(buscarUsuario(e.actorId)!),
      fecha: e.fecha,
    }));
    return HttpResponse.json({ items, total: todos.length, pagina, tamanoPagina: tamano });
  }),

  http.get(`${BASE}/v1/indicadores/tendencia`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const url = new URL(request.url);
    const celulaId = url.searchParams.get("celulaId");
    const sprintId = url.searchParams.get("sprintId");
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (desde && hasta && desde > hasta) return bad("hasta", "La fecha final debe ser igual o posterior a la inicial.");
    const celulasOk = new Set(celulasDelAmbito(base.actor, base.ambito).map((c) => c.id));
    let puntos = PUNTOS.filter((p) => celulasOk.has(p.celulaId));
    const ambitoVacio = puntos.length === 0 && base.ambito.length === 0;
    if (celulaId) puntos = puntos.filter((p) => p.celulaId === celulaId);
    if (sprintId) puntos = sprintId === "SIN_SPRINT" ? [] : puntos.filter((p) => p.sprintId === sprintId);
    if (desde) puntos = puntos.filter((p) => p.fecha >= desde);
    if (hasta) puntos = puntos.filter((p) => p.fecha <= hasta);
    const claves = [...new Set(puntos.map((p) => `${p.celulaId}|${p.sprintId}`))];
    const series = claves
      .map((k) => {
        const [cId, sId] = k.split("|");
        const c = celulas.find((x) => x.id === cId)!;
        const s = sprints.find((x) => x.id === sId)!;
        return {
          celula: { id: c.id, nombre: c.nombre },
          sprint: { id: s.id, nombre: s.nombre, inicio: s.inicio, fin: s.fin, cerrado: !CELULAS_ABIERTO.has(s.id) },
          puntos: puntos.filter((p) => p.celulaId === cId && p.sprintId === sId).map(({ fecha, cumplimiento, hduTotal }) => ({ fecha, cumplimiento, hduTotal })),
        };
      })
      .sort((a, b) => a.celula.nombre.localeCompare(b.celula.nombre) || b.sprint.inicio.localeCompare(a.sprint.inicio));
    const vacio = series.length === 0;
    const filtrado = Boolean(celulaId || sprintId || desde || hasta);
    return HttpResponse.json({
      generadoEn: ahoraIso(),
      filtros: { celulaId, sprintId, desde, hasta },
      sinDatos: vacio,
      motivoSinDatos: vacio ? (ambitoVacio ? "AMBITO_VACIO" : filtrado ? "FILTRO_SIN_COINCIDENCIAS" : "SIN_HISTORIAL") : null,
      totalSeries: series.length,
      series: series.slice(0, 6),
    });
  }),

  http.get(`${BASE}/v1/indicadores/exportacion`, ({ request }) => {
    const base = preparar(request);
    if (esRespuesta(base)) return base;
    const url = new URL(request.url);
    const vista = url.searchParams.get("vista") ?? "cumplimiento";
    const formato = url.searchParams.get("formato") === "pdf" ? "pdf" : "csv";
    const dependeDeFuentes = vista !== "tendencia";
    if (dependeDeFuentes && (!fuentes.certificaciones || !fuentes.impedimentos)) {
      return HttpResponse.json(cuerpoError("INDICADORES_NO_DISPONIBLES" as never, "No se pudo generar el reporte: hay datos no disponibles."), { status: 503 });
    }
    if (estadoE6.exportacionExcede) return HttpResponse.json(cuerpoError("EXPORTACION_EXCEDE_LIMITE" as never, "El reporte tiene demasiadas filas."), { status: 422 });
    const { items } = filtrar(base.ambito, url);
    const cum = calcularCumplimiento(items);
    const filas = items.length === 0 ? [["Sin datos para los filtros aplicados"]] : [["Indicador", "Valor"], ["HDU totales", String(cum.hduTotales.valor)], ["Certificadas", String(cum.certificadas.valor)]];
    const nombre = `quality360-indicadores-${vista}-20261104.${formato}`;
    const cuerpo = formato === "csv" ? csvDe(vista, filas) : "%PDF-1.4\n%mock";
    return new HttpResponse(cuerpo, {
      status: 200,
      headers: {
        "Content-Type": formato === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "X-Q360-Filas": String(items.length === 0 ? 0 : filas.length - 1),
      },
    });
  }),

  http.get(`${BASE}/v1/indicadores/snapshots/ejecuciones`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;
    if (estadoE6.indicadoresCaido) return error500();
    const url = new URL(request.url);
    const pagina = Number(url.searchParams.get("pagina") ?? 1) || 1;
    const tamano = Number(url.searchParams.get("tamanoPagina") ?? 10) || 10;
    const todas = estadoE6.ejecuciones;
    return HttpResponse.json({ items: todas.slice((pagina - 1) * tamano, pagina * tamano).map(aEjecucion), total: todas.length, pagina, tamanoPagina: tamano });
  }),

  http.post(`${BASE}/v1/indicadores/snapshots`, async ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;
    if (estadoE6.indicadoresCaido) return error500();
    if (estadoE6.snapshotEnCurso) return HttpResponse.json(cuerpoError("EJECUCION_EN_CURSO" as never, "Ya hay un snapshot en ejecución."), { status: 409 });
    const falla = estadoE6.snapshotFalla;
    const nueva = {
      id: crypto.randomUUID(),
      fecha: "2026-11-04",
      origen: "MANUAL" as const,
      actorId: actor.id,
      actorNombre: actor.nombre,
      inicio: ahoraIso(),
      duracionMs: 1000,
      resultado: falla ? ("FALLIDA" as const) : ("EXITOSA" as const),
      filasEscritas: falla ? 0 : 24,
      motivo: falla,
    };
    estadoE6.ejecuciones.unshift(nueva);
    return HttpResponse.json(aEjecucion(nueva));
  }),
];

function aEjecucion(e: (typeof estadoE6.ejecuciones)[number]) {
  return {
    id: e.id,
    fecha: e.fecha,
    origen: e.origen,
    actor: { id: e.actorId, nombre: e.actorNombre },
    inicio: e.inicio,
    fin: e.duracionMs === null ? null : new Date(Date.parse(e.inicio) + e.duracionMs).toISOString(),
    duracionMs: e.duracionMs,
    resultado: e.resultado,
    filasEscritas: e.filasEscritas,
    filasNuevas: e.filasEscritas,
    filasActualizadas: 0,
    motivo: e.motivo,
  };
}
