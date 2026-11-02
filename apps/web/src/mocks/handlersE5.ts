// MSW de E5 según `contracts/integraciones.v1.yaml` (D113–D128). Los textos de error que trae el servidor real
// (`mensajeError`) se rellenan a propósito con una cadena que el portal NO debe mostrar: las pruebas verifican que la
// interfaz usa solo su tabla local de mensajes.
import { delay, http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import type {
  AccionVistaPrevia,
  CambiosHdu,
  CodigoErrorIntegracion,
  Ejecucion,
  FilaVistaPrevia,
  MotivoFila,
  OrigenEjecucion,
  ResultadoFila,
  SugerenciaIntegracion,
  VistaPreviaArchivo,
} from "@/types/dominio";
import { autenticar, esUsuarioMock, exigirRol } from "./comun";
import { ID, celulas, hdus, sprints, usuarios } from "./data";
import {
  MS_DIA,
  configuracionVacia,
  detalles,
  ejecucionBase,
  ejecuciones,
  estadoConfig,
  eventosConfig,
  filasCreadas,
  modoE5,
  sprintsE5,
  celulaDeSprintBase,
  ultimosTokens,
  type FilaMock,
} from "./dataE5";
import { ERROR_ACCESO_DENEGADO, ERROR_NO_ENCONTRADO, cuerpoError, leerNumero, paginar } from "./utils";

const BASE = env.gatewayUrl;
const TEXTO_DE_JIRA = "TEXTO-DEL-SERVIDOR-QUE-EL-PORTAL-NO-DEBE-MOSTRAR (Authorization: Basic c2VjcmV0bw==)";

type Respuesta = HttpResponse<any>;

const servicioNoDisponible = (): Respuesta => HttpResponse.json(cuerpoError("SERVICIO_NO_DISPONIBLE", "El servicio no está disponible. Intenta nuevamente."), { status: 503 });
const errorInterno = (): Respuesta => HttpResponse.json(cuerpoError("ERROR_INTERNO", "Ocurrió un error inesperado."), { status: 500 });
const denegado = (): Respuesta => HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });

/** Falla forzada de una fuente (`error` o `indisponible`) para un bloque concreto. */
function fallaDe(estado: string): Respuesta | null {
  if (estado === "error") return errorInterno();
  if (estado === "indisponible") return servicioNoDisponible();
  return null;
}

const SUGERENCIAS: Partial<Record<CodigoErrorIntegracion, SugerenciaIntegracion[]>> = {
  JIRA_CREDENCIAL_INVALIDA: ["IR_A_CONEXION", "IMPORTAR_ARCHIVO"],
  JIRA_SIN_PERMISO: ["REVISAR_PERMISOS", "IMPORTAR_ARCHIVO"],
  JIRA_SITIO_NO_ENCONTRADO: ["IR_A_CONEXION", "IMPORTAR_ARCHIVO"],
  JIRA_PROYECTO_NO_ENCONTRADO: ["IR_A_CONEXION", "IMPORTAR_ARCHIVO"],
  JIRA_NO_DISPONIBLE: ["REINTENTAR", "IMPORTAR_ARCHIVO"],
  ORGANIZACION_NO_DISPONIBLE: ["REINTENTAR"],
  MODO_ESTRICTO: ["CORREGIR_ARCHIVO"],
};

function adminOQuizas(request: Request, ...roles: Parameters<typeof exigirRol>[1][]) {
  const actor = autenticar(request);
  if (!esUsuarioMock(actor)) return { respuesta: actor as Respuesta };
  const negado = exigirRol(actor, ...roles);
  if (negado) return { respuesta: negado as Respuesta };
  return { actor };
}

const soloAdmin = (request: Request) => adminOQuizas(request, "ADMINISTRADOR");
const lectura = (request: Request) => adminOQuizas(request, "ADMINISTRADOR", "QE", "AUDITOR");

// -------------------------------------------------------------- configuración

function configuracionVigente() {
  const actual = estadoConfig.actual;
  if (modoE5.configuracion === "vacia") return configuracionVacia();
  if (modoE5.configuracion === "sin-llave") return { ...actual, llaveDisponible: false, token: { configurado: true, ultimos4: null, descifrable: false } };
  if (modoE5.configuracion === "no-descifrable") return { ...actual, token: { configurado: true, ultimos4: null, descifrable: false } };
  return actual;
}

function nombreDe(lista: Array<{ id: string; nombre: string }>, id: string) {
  const item = lista.find((x) => x.id === id);
  return item ? { id: item.id, nombre: item.nombre } : null;
}

function errorDePrueba() {
  if (modoE5.prueba === "ok") return null;
  return { codigo: modoE5.prueba, mensaje: TEXTO_DE_JIRA, sugerencias: SUGERENCIAS[modoE5.prueba] ?? ["IR_A_CONEXION"] } as const;
}

// ------------------------------------------------------------------- archivos

const PRIORIDADES = ["CRITICA", "ALTA", "MEDIA", "BAJA"];
const CODIGO_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const COLUMNAS_CONOCIDAS = ["codigo", "titulo", "descripcion", "prioridad", "celula", "sprint", "qe_correo", "qecorreo"];

function dividirCsv(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else entreComillas = !entreComillas;
    } else if (c === separador && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas;
}

interface ErrorAnalisis {
  status: 413 | 422;
  codigo: string;
  columnasFaltantes: Array<"codigo" | "titulo">;
}

function leerFilasArchivo(formato: string, contenido: string): { filas: Array<Record<string, string>>; ignoradas: string[] } | ErrorAnalisis {
  const tipo = formato.toUpperCase();
  if (tipo !== "CSV" && tipo !== "JSON") return { status: 422, codigo: "FORMATO_NO_SOPORTADO", columnasFaltantes: [] };
  if (contenido.trim() === "") return { status: 422, codigo: "ARCHIVO_VACIO", columnasFaltantes: [] };
  let registros: Array<Record<string, string>>;
  if (tipo === "JSON") {
    try {
      const datos = JSON.parse(contenido) as unknown;
      const lista = Array.isArray(datos) ? datos : (datos as { historias?: unknown }).historias;
      if (!Array.isArray(lista)) return { status: 422, codigo: "ARCHIVO_ILEGIBLE", columnasFaltantes: [] };
      registros = lista.map((item) => Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([k, v]) => [k.toLowerCase().replace("qecorreo", "qe_correo"), String(v ?? "")])));
    } catch {
      return { status: 422, codigo: "ARCHIVO_ILEGIBLE", columnasFaltantes: [] };
    }
  } else {
    const lineas = contenido.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lineas.length === 0) return { status: 422, codigo: "ARCHIVO_VACIO", columnasFaltantes: [] };
    const separador = lineas[0].includes(";") && !lineas[0].includes(",") ? ";" : ",";
    const encabezado = dividirCsv(lineas[0], separador).map((h) => h.trim().toLowerCase());
    registros = lineas.slice(1).map((linea) => {
      const celdas = dividirCsv(linea, separador);
      return Object.fromEntries(encabezado.map((h, i) => [h, celdas[i] ?? ""]));
    });
    const faltantes = (["codigo", "titulo"] as const).filter((c) => !encabezado.includes(c));
    if (faltantes.length > 0) return { status: 422, codigo: "COLUMNAS_FALTANTES", columnasFaltantes: [...faltantes] };
    if (registros.length === 0) return { status: 422, codigo: "ARCHIVO_VACIO", columnasFaltantes: [] };
    const ignoradas = encabezado.filter((h) => !COLUMNAS_CONOCIDAS.includes(h));
    if (registros.length > 500) return { status: 422, codigo: "DEMASIADAS_FILAS", columnasFaltantes: [] };
    return { filas: registros, ignoradas };
  }
  if (registros.length === 0) return { status: 422, codigo: "ARCHIVO_VACIO", columnasFaltantes: [] };
  if (registros.length > 500) return { status: 422, codigo: "DEMASIADAS_FILAS", columnasFaltantes: [] };
  const claves = new Set(registros.flatMap((r) => Object.keys(r)));
  const faltantes = (["codigo", "titulo"] as const).filter((c) => !claves.has(c));
  if (faltantes.length > 0) return { status: 422, codigo: "COLUMNAS_FALTANTES", columnasFaltantes: [...faltantes] };
  return { filas: registros, ignoradas: [...claves].filter((h) => !COLUMNAS_CONOCIDAS.includes(h)) };
}

function simular(filas: Array<Record<string, string>>, ignoradas: string[]): VistaPreviaArchivo {
  const vistos = new Set<string>();
  const detalle: FilaVistaPrevia[] = filas.map((r, i) => {
    const codigo = (r.codigo ?? "").trim();
    const titulo = (r.titulo ?? "").trim();
    const prioridad = (r.prioridad ?? "").trim().toUpperCase();
    const base = { fila: i + 2, codigo: codigo || null, titulo: titulo || null, advertencias: [] as FilaVistaPrevia["advertencias"], cambios: null as CambiosHdu | null };
    const error = (motivo: MotivoFila): FilaVistaPrevia => ({ ...base, accion: "ERROR", motivo });
    if (!CODIGO_RE.test(codigo)) return error("CODIGO_INVALIDO");
    if (vistos.has(codigo.toLowerCase())) return error("CODIGO_DUPLICADO_EN_ARCHIVO");
    vistos.add(codigo.toLowerCase());
    if (!titulo) return error("TITULO_VACIO");
    if (titulo.length > 200) return error("TITULO_LARGO");
    if (prioridad && !PRIORIDADES.includes(prioridad)) return error("PRIORIDAD_INVALIDA");
    const existente = hdus.find((h) => h.codigo.toLowerCase() === codigo.toLowerCase());
    if (!existente) return { ...base, accion: "CREAR", motivo: null, cambios: prioridad ? { prioridad: { antes: null, despues: prioridad } } : null };
    if (existente.estado === "CERRADA") return { ...base, accion: "OMITIR", motivo: "HDU_CERRADA" };
    if (existente.titulo === titulo) return { ...base, accion: "OMITIR", motivo: "SIN_CAMBIOS" };
    return { ...base, accion: "ACTUALIZAR", motivo: null, cambios: { titulo: { antes: existente.titulo, despues: titulo } } };
  });
  const cuenta = (a: AccionVistaPrevia) => detalle.filter((f) => f.accion === a).length;
  return {
    formato: "CSV",
    filas: detalle.length,
    crear: cuenta("CREAR"),
    actualizar: cuenta("ACTUALIZAR"),
    omitir: cuenta("OMITIR"),
    errores: cuenta("ERROR"),
    advertencias: detalle.filter((f) => f.advertencias.length > 0).length + (ignoradas.length > 0 ? 1 : 0),
    columnasIgnoradas: ignoradas,
    detalle,
  };
}

function cuerpoErrorArchivo(codigo: string, columnasFaltantes: string[], ejecucionId: string | null) {
  return { ...cuerpoError(codigo as never, "Texto del servidor que el portal no muestra"), ejecucionId, columnasFaltantes };
}

// ---------------------------------------------------------------- ejecuciones

function registrar(ejecucion: Ejecucion, filas: FilaMock[]): Ejecucion {
  ejecuciones.unshift(ejecucion);
  detalles.set(ejecucion.id, filas);
  return ejecucion;
}

function nuevoId(): string {
  return crypto.randomUUID();
}

function ejecucionDeSincronizacion(vincular: boolean): { ejecucion: Ejecucion; filas: FilaMock[] } {
  const ahora = new Date();
  const base = { id: nuevoId(), origen: "JIRA" as const, iniciadaEn: ahora.toISOString(), terminadaEn: new Date(ahora.getTime() + 3100).toISOString(), duracionMs: 3100, proyecto: "QTY", sitioHost: "su-empresa.atlassian.net", vincularExistentes: vincular };
  const modo = modoE5.sincronizacion;
  const fallida = (codigo: CodigoErrorIntegracion) =>
    ejecucionBase({ ...base, resultado: "FALLIDA", codigoError: codigo, mensajeError: TEXTO_DE_JIRA, sugerencias: SUGERENCIAS[codigo] ?? ["IMPORTAR_ARCHIVO"] });
  if (modo === "fallida") return { ejecucion: fallida("JIRA_NO_DISPONIBLE"), filas: [] };
  if (modo === "fallida-credencial") return { ejecucion: fallida("JIRA_CREDENCIAL_INVALIDA"), filas: [] };
  if (modo === "fallida-organizacion") return { ejecucion: fallida("ORGANIZACION_NO_DISPONIBLE"), filas: [] };
  if (modo === "con-errores") {
    const filas: FilaMock[] = [
      ...filasCreadas("QTY", 10),
      { fila: 11, codigo: "QTY-11", titulo: null, idHistoria: null, resultado: "ERROR", motivo: "TITULO_VACIO", advertencias: [], cambios: null, referencia: { estado: "Por hacer", responsable: null } },
    ];
    return { ejecucion: ejecucionBase({ ...base, resultado: "CON_ERRORES", leidas: 11, creadas: 10, conError: 1, conAdvertencias: 5, reintentos429: 2, eventos: [{ tipo: "JIRA_LIMITE_DE_TASA", esperaMs: 1000, fecha: base.iniciadaEn }, { tipo: "JIRA_LIMITE_DE_TASA", esperaMs: 1000, fecha: base.iniciadaEn }] }), filas };
  }
  if (modo === "sin-cambios") {
    const filas: FilaMock[] = Array.from({ length: 5 }, (_, i) => ({ fila: i + 1, codigo: `QTY-${i + 1}`, titulo: `Historia QTY-${i + 1}`, idHistoria: null, resultado: "OMITIDA", motivo: "SIN_CAMBIOS", advertencias: [], cambios: null, referencia: null }));
    return { ejecucion: ejecucionBase({ ...base, resultado: "EXITOSA", leidas: 5, omitidas: 5 }), filas };
  }
  if (modo === "incompleta") {
    return { ejecucion: ejecucionBase({ ...base, resultado: "INCOMPLETA", leidas: 100, creadas: 100, hayMas: true, continuarDesde: "QTY-100", sugerencias: ["CONTINUAR"] }), filas: filasCreadas("QTY", 100) };
  }
  if (modo === "incompleta-tasa") {
    return { ejecucion: ejecucionBase({ ...base, resultado: "INCOMPLETA", leidas: 50, creadas: 50, hayMas: true, continuarDesde: "QTY-50", codigoError: "JIRA_LIMITE_DE_TASA", mensajeError: TEXTO_DE_JIRA, sugerencias: ["CONTINUAR", "IMPORTAR_ARCHIVO"] }), filas: filasCreadas("QTY", 50) };
  }
  if (modo === "vincular-sugerido") {
    const resultado: ResultadoFila = vincular ? "ACTUALIZADA" : "OMITIDA";
    const filas: FilaMock[] = [
      ...filasCreadas("QTY", 3),
      ...Array.from({ length: 2 }, (_, i): FilaMock => ({
        fila: 4 + i,
        codigo: `MAN-${i + 1}`,
        titulo: `Hecha a mano ${i + 1}`,
        idHistoria: vincular ? `d5000000-0000-4000-8000-00000000009${i}` : null,
        resultado,
        motivo: vincular ? null : "HDU_MANUAL_EXISTENTE",
        advertencias: [],
        cambios: vincular ? { titulo: { antes: "Antes", despues: `Hecha a mano ${i + 1}` } } : null,
        referencia: null,
      })),
    ];
    return { ejecucion: ejecucionBase({ ...base, resultado: "EXITOSA", leidas: 5, creadas: 3, actualizadas: vincular ? 2 : 0, omitidas: vincular ? 0 : 2 }), filas };
  }
  // exitosa (y sin-respuesta: el servidor sí completó)
  return { ejecucion: ejecucionBase({ ...base, resultado: "EXITOSA", leidas: 10, creadas: 10, conAdvertencias: 1 }), filas: filasCreadas("QTY", 10) };
}

function filtrarEjecuciones(): Ejecucion[] {
  return modoE5.historial === "vacio" ? [] : ejecuciones;
}

const ESTADOS_COMPLETADOS = ["EXITOSA", "CON_ERRORES"];

export const handlersE5 = [
  // -------------------------------------------------------------- catálogos
  http.get(`${BASE}/v1/catalogos/sprints`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const caida = fallaDe(modoE5.catalogos);
    if (caida) return caida;
    const celulaId = new URL(request.url).searchParams.get("celulaId");
    const base = sprints.map((s) => ({ ...s, celulaId: celulaDeSprintBase[s.id] ?? ID.celPagos }));
    const todos = [...base, ...sprintsE5];
    const items = (celulaId ? todos.filter((s) => s.celulaId === celulaId) : base).sort((a, b) => a.inicio.localeCompare(b.inicio));
    return HttpResponse.json({ items });
  }),

  http.get(`${BASE}/v1/catalogos/personas`, ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.catalogos);
    if (caida) return caida;
    const url = new URL(request.url);
    const rol = url.searchParams.get("rol");
    const soloActivos = url.searchParams.get("activo") !== "false";
    const items = usuarios
      .filter((u) => (!rol || u.rol === rol) && (!soloActivos || u.activo))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((u) => ({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol }));
    return HttpResponse.json({ items });
  }),

  // ------------------------------------------------------------ configuración
  http.get(`${BASE}/v1/integraciones/jira/configuracion`, ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.configuracion);
    if (caida) return caida;
    return HttpResponse.json(configuracionVigente());
  }),

  http.put(`${BASE}/v1/integraciones/jira/configuracion`, async ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.configuracion);
    if (caida) return caida;
    if (modoE5.configuracion === "sin-llave") return HttpResponse.json(cuerpoError("LLAVE_CIFRADO_NO_DISPONIBLE", "La integración no está habilitada."), { status: 503 });
    const cuerpo = (await request.json()) as {
      sitio: string; correo: string; token?: string; proyecto: string; tiposIssue: string[]; celulaId: string; qeResponsableId: string; sprintRespaldoId: string;
    };
    if (cuerpo.token) ultimosTokens.push(cuerpo.token);
    if (modoE5.configuracion === "no-descifrable" && !cuerpo.token) return HttpResponse.json(cuerpoError("TOKEN_NO_DESCIFRABLE", "Vuelve a ingresar el API token."), { status: 409 });
    const actual = estadoConfig.actual;
    const hayToken = Boolean(cuerpo.token) || actual.token.configurado;
    if (!hayToken) return HttpResponse.json(cuerpoError("VALIDACION", "Datos inválidos.", [{ campo: "token", codigo: "REQUERIDO", mensaje: "Falta el token." } as never]), { status: 400 });
    const error = errorDePrueba();
    const ahora = new Date().toISOString();
    if (error) {
      estadoConfig.actual = { ...actual, estadoConexion: "FALLIDA", ultimaPruebaEn: ahora, ultimaPruebaCodigo: error.codigo as CodigoErrorIntegracion };
      return HttpResponse.json({ guardado: false, prueba: { ok: false, usuarioJira: null, proyecto: null, error }, configuracion: estadoConfig.actual });
    }
    const celula = nombreDe(celulas, cuerpo.celulaId);
    const qe = nombreDe(usuarios, cuerpo.qeResponsableId);
    const sprint = nombreDe([...sprints, ...sprintsE5], cuerpo.sprintRespaldoId);
    const cambiados = (
      [
        ["sitio", cuerpo.sitio !== actual.sitio],
        ["correo", cuerpo.correo !== actual.correo],
        ["token", Boolean(cuerpo.token)],
        ["proyecto", cuerpo.proyecto !== actual.proyecto],
        ["tiposIssue", cuerpo.tiposIssue.join(",") !== actual.tiposIssue.join(",")],
        ["celulaId", cuerpo.celulaId !== actual.celula?.id],
        ["qeResponsableId", cuerpo.qeResponsableId !== actual.qeResponsable?.id],
        ["sprintRespaldoId", cuerpo.sprintRespaldoId !== actual.sprintRespaldo?.id],
      ] as const
    )
      .filter(([, c]) => c)
      .map(([campo]) => campo);
    estadoConfig.actual = {
      ...actual,
      configurado: true,
      sitio: cuerpo.sitio,
      correo: cuerpo.correo,
      proyecto: cuerpo.proyecto,
      tiposIssue: cuerpo.tiposIssue,
      celula,
      qeResponsable: qe,
      sprintRespaldo: sprint,
      token: cuerpo.token ? { configurado: true, ultimos4: cuerpo.token.slice(-4).padStart(4, "·"), descifrable: true } : actual.token.configurado ? actual.token : { configurado: true, ultimos4: "····", descifrable: true },
      estadoConexion: "OK",
      ultimaPruebaEn: ahora,
      ultimaPruebaCodigo: null,
      actualizadoEn: ahora,
      actualizadoPor: { id: actor.id, nombre: actor.nombre },
    };
    eventosConfig.unshift({ id: nuevoId(), fecha: ahora, actor: { id: actor.id, nombre: actor.nombre }, camposCambiados: cambiados, tokenCambiado: Boolean(cuerpo.token), resultadoPrueba: "OK" });
    return HttpResponse.json({
      guardado: true,
      prueba: { ok: true, usuarioJira: "Admin Jira Falso", proyecto: { clave: cuerpo.proyecto, nombre: "Proyecto de prueba" }, error: null },
      configuracion: estadoConfig.actual,
    });
  }),

  http.post(`${BASE}/v1/integraciones/jira/configuracion/probar`, async ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.configuracion);
    if (caida) return caida;
    const cuerpo = (await request.json().catch(() => ({}))) as { token?: string; proyecto?: string };
    if (modoE5.configuracion === "no-descifrable" && !cuerpo.token) return HttpResponse.json(cuerpoError("TOKEN_NO_DESCIFRABLE", "Vuelve a ingresar el API token."), { status: 409 });
    if (cuerpo.token) ultimosTokens.push(cuerpo.token);
    const error = errorDePrueba();
    if (error) return HttpResponse.json({ ok: false, usuarioJira: null, proyecto: null, error });
    return HttpResponse.json({ ok: true, usuarioJira: "Admin Jira Falso", proyecto: { clave: cuerpo.proyecto ?? "QTY", nombre: "Proyecto de prueba" }, error: null });
  }),

  http.get(`${BASE}/v1/integraciones/jira/configuracion/eventos`, ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.eventos);
    if (caida) return caida;
    const items = modoE5.eventos === "vacio" ? [] : eventosConfig;
    return HttpResponse.json(paginar(items, 1, 10));
  }),

  // ---------------------------------------------------------- sincronización
  http.post(`${BASE}/v1/integraciones/jira/sincronizaciones`, async ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    if (modoE5.configuracion === "sin-llave") return HttpResponse.json(cuerpoError("LLAVE_CIFRADO_NO_DISPONIBLE", "No habilitada."), { status: 503 });
    if (modoE5.configuracion === "vacia") return HttpResponse.json(cuerpoError("JIRA_NO_CONFIGURADO", "Sin configuración."), { status: 409 });
    if (modoE5.configuracion === "no-descifrable") return HttpResponse.json(cuerpoError("TOKEN_NO_DESCIFRABLE", "Reingresa el token."), { status: 409 });
    if (modoE5.sincronizacion === "en-curso") return HttpResponse.json(cuerpoError("INTEGRACION_EN_CURSO", "Ya hay una sincronización en curso."), { status: 409 });
    await delay(modoE5.demoraMs); // La operación real tarda: deja ver el estado de espera.
    const cuerpo = (await request.json().catch(() => ({}))) as { vincularExistentes?: boolean };
    const { ejecucion, filas } = ejecucionDeSincronizacion(Boolean(cuerpo.vincularExistentes));
    registrar(ejecucion, filas);
    // La función de Vercel se cortó: el servidor sí terminó, pero el portal no recibe la respuesta (D115).
    if (modoE5.sincronizacion === "sin-respuesta") return new HttpResponse("<html><body>504 Gateway Timeout</body></html>", { status: 504, headers: { "Content-Type": "text/html" } });
    return HttpResponse.json(ejecucion);
  }),

  // ----------------------------------------------------------------- archivos
  http.post(`${BASE}/v1/integraciones/archivos/vista-previa`, async ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.vistaPrevia);
    if (caida) return caida;
    const cuerpo = (await request.json()) as { formato: string; nombre: string; contenido: string };
    if (new TextEncoder().encode(cuerpo.contenido).length > 1_048_576) return HttpResponse.json(cuerpoErrorArchivo("ARCHIVO_MUY_GRANDE", [], null), { status: 413 });
    const leido = leerFilasArchivo(cuerpo.formato, cuerpo.contenido);
    if ("status" in leido) return HttpResponse.json(cuerpoErrorArchivo(leido.codigo, leido.columnasFaltantes, null), { status: leido.status });
    return HttpResponse.json({ ...simular(leido.filas, leido.ignoradas), formato: cuerpo.formato.toUpperCase() });
  }),

  http.post(`${BASE}/v1/integraciones/archivos/importaciones`, async ({ request }) => {
    const { actor, respuesta } = soloAdmin(request);
    if (!actor) return respuesta;
    if (modoE5.sincronizacion === "en-curso") return HttpResponse.json(cuerpoError("INTEGRACION_EN_CURSO", "Ya hay una sincronización en curso."), { status: 409 });
    await delay(modoE5.demoraMs);
    const cuerpo = (await request.json()) as { formato: string; nombre: string; contenido: string; estricto: boolean; vincularExistentes: boolean };
    const bytes = new TextEncoder().encode(cuerpo.contenido).length;
    if (bytes > 1_048_576) return HttpResponse.json(cuerpoErrorArchivo("ARCHIVO_MUY_GRANDE", [], null), { status: 413 });
    const ahora = new Date();
    const origen = (cuerpo.formato.toUpperCase() === "JSON" ? "JSON" : "CSV") satisfies OrigenEjecucion;
    const archivo = { nombre: cuerpo.nombre, tamano: bytes, huella: "9f86d081".padEnd(64, "a") };
    const base = { id: nuevoId(), origen, iniciadaEn: ahora.toISOString(), terminadaEn: new Date(ahora.getTime() + 1200).toISOString(), duracionMs: 1200, estricto: cuerpo.estricto, vincularExistentes: cuerpo.vincularExistentes, archivo } as const;
    const leido = leerFilasArchivo(cuerpo.formato, cuerpo.contenido);
    if ("status" in leido) {
      const fallida = ejecucionBase({ ...base, resultado: "FALLIDA", codigoError: leido.codigo as CodigoErrorIntegracion, mensajeError: TEXTO_DE_JIRA, sugerencias: ["CORREGIR_ARCHIVO"] });
      registrar(fallida, []);
      return HttpResponse.json(cuerpoErrorArchivo(leido.codigo, leido.columnasFaltantes, fallida.id), { status: 422 });
    }
    const vista = simular(leido.filas, leido.ignoradas);
    const aFila = (f: FilaVistaPrevia, resultado: ResultadoFila): FilaMock => ({ fila: f.fila, codigo: f.codigo, titulo: f.titulo, idHistoria: resultado === "CREADA" || resultado === "ACTUALIZADA" ? nuevoId() : null, resultado, motivo: f.motivo, advertencias: f.advertencias, cambios: f.cambios, referencia: null });
    if (cuerpo.estricto && vista.errores > 0) {
      const filas = vista.detalle.filter((f) => f.accion === "ERROR").map((f) => aFila(f, "ERROR"));
      const fallida = ejecucionBase({ ...base, resultado: "FALLIDA", leidas: vista.filas, conError: vista.errores, codigoError: "MODO_ESTRICTO", mensajeError: TEXTO_DE_JIRA, sugerencias: SUGERENCIAS.MODO_ESTRICTO });
      return HttpResponse.json(registrar(fallida, filas));
    }
    const incompleta = modoE5.importacion === "incompleta";
    const procesadas = incompleta ? vista.detalle.slice(0, Math.max(1, Math.floor(vista.detalle.length / 2))) : vista.detalle;
    const filas = procesadas.map((f) => aFila(f, f.accion === "CREAR" ? "CREADA" : f.accion === "ACTUALIZAR" ? "ACTUALIZADA" : f.accion === "OMITIR" ? "OMITIDA" : "ERROR"));
    const cuenta = (r: ResultadoFila) => filas.filter((f) => f.resultado === r).length;
    const resultado = incompleta ? "INCOMPLETA" : cuenta("ERROR") > 0 ? "CON_ERRORES" : "EXITOSA";
    const ejecucion = ejecucionBase({
      ...base,
      resultado,
      leidas: filas.length,
      creadas: cuenta("CREADA"),
      actualizadas: cuenta("ACTUALIZADA"),
      omitidas: cuenta("OMITIDA"),
      conError: cuenta("ERROR"),
      conAdvertencias: filas.filter((f) => f.advertencias.length > 0).length,
      codigoError: incompleta ? "PRESUPUESTO_DE_TIEMPO" : null,
      mensajeError: incompleta ? TEXTO_DE_JIRA : null,
      sugerencias: incompleta ? ["IMPORTAR_MISMO_ARCHIVO"] : [],
    });
    registrar(ejecucion, filas);
    if (modoE5.importacion === "sin-respuesta") return new HttpResponse("<html>502 Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } });
    return HttpResponse.json(ejecucion);
  }),

  // ---------------------------------------------------------------- historial
  http.get(`${BASE}/v1/integraciones/ejecuciones`, ({ request }) => {
    const { actor, respuesta } = lectura(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.historial);
    if (caida) return caida;
    const p = new URL(request.url).searchParams;
    let items = [...filtrarEjecuciones()];
    const origen = p.get("origen");
    const resultado = p.get("resultado");
    const desde = p.get("desde");
    const hasta = p.get("hasta");
    if (origen) items = items.filter((e) => e.origen === origen);
    if (resultado) items = items.filter((e) => e.resultado === resultado);
    if (desde) items = items.filter((e) => e.iniciadaEn.slice(0, 10) >= desde);
    if (hasta) items = items.filter((e) => e.iniciadaEn.slice(0, 10) <= hasta);
    const asc = p.get("orden") === "iniciadaEn:asc";
    items.sort((a, b) => (asc ? 1 : -1) * a.iniciadaEn.localeCompare(b.iniciadaEn));
    return HttpResponse.json(paginar(items, leerNumero(p.get("pagina"), 1), Math.min(100, leerNumero(p.get("tamanoPagina"), 25))));
  }),

  http.get(`${BASE}/v1/integraciones/ejecuciones/:id`, ({ request, params }) => {
    const { actor, respuesta } = lectura(request);
    if (!actor) return respuesta;
    const ejecucion = ejecuciones.find((e) => e.id === params.id);
    if (!ejecucion) return actor.rol === "QE" ? denegado() : HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    return HttpResponse.json(ejecucion);
  }),

  http.get(`${BASE}/v1/integraciones/ejecuciones/:id/detalle`, ({ request, params }) => {
    const { actor, respuesta } = lectura(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.detalle);
    if (caida) return caida;
    const ejecucion = ejecuciones.find((e) => e.id === params.id);
    if (!ejecucion) return actor.rol === "QE" ? denegado() : HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    const p = new URL(request.url).searchParams;
    let filas = detalles.get(ejecucion.id) ?? [];
    let ocultas = 0;
    if (actor.rol === "QE") {
      // D106/D126: el QE ve sus HDU y todas las filas con error, pero estas sin título ni referencia.
      ocultas = filas.filter((f) => f.fueraDeAmbito && f.resultado !== "ERROR").length;
      filas = filas.filter((f) => !f.fueraDeAmbito || f.resultado === "ERROR").map((f) => (f.resultado === "ERROR" ? { ...f, titulo: null, referencia: null } : f));
    }
    const resultado = p.get("resultado");
    if (resultado) filas = filas.filter((f) => f.resultado === resultado);
    if (p.get("soloErrores") === "true") filas = filas.filter((f) => f.resultado === "ERROR");
    const pagina = paginar(
      filas.map(({ fueraDeAmbito: _omitido, ...fila }) => fila),
      leerNumero(p.get("pagina"), 1),
      Math.min(100, leerNumero(p.get("tamanoPagina"), 25)),
    );
    return HttpResponse.json({ ...pagina, filasOcultas: ocultas });
  }),

  http.get(`${BASE}/v1/integraciones/estado`, ({ request }) => {
    const { actor, respuesta } = lectura(request);
    if (!actor) return respuesta;
    const caida = fallaDe(modoE5.ultimaEjecucion);
    if (caida) return caida;
    const lista = filtrarEjecuciones();
    const ultima = lista[0] ?? null;
    const completada = lista.find((e) => ESTADOS_COMPLETADOS.includes(e.resultado)) ?? null;
    const enCurso = modoE5.sincronizacion === "en-curso" ? { id: nuevoId(), origen: "JIRA" as const, iniciadaEn: new Date(Date.now() - MS_DIA / 1000).toISOString(), abandonada: false } : null;
    const cuerpo: Record<string, unknown> = { ultimaEjecucion: ultima, ultimaCompletada: completada, enCurso };
    if (actor.rol === "ADMINISTRADOR") {
      cuerpo.jiraConfigurado = modoE5.configuracion !== "vacia" && estadoConfig.actual.configurado;
      if (ultima && ultima.resultado === "INCOMPLETA" && ultima.origen === "JIRA" && ultima.continuarDesde) cuerpo.continuar = { desde: ultima.continuarDesde, ejecucionId: ultima.id };
    }
    return HttpResponse.json(cuerpo);
  }),
];
