import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { ESTADOS_HDU, ROLES_CATALOGO, ETIQUETAS_ROL, ROLES_SOLO_LECTURA, type EstadoHdu } from "@/types/dominio";
import { autenticar, esUsuarioMock, exigirRol } from "./comun";
import { analistasVigentesDe, buscarUsuario, celulas, hdus, supervisorVigenteDe, usuarios, type HduMock, type UsuarioMock } from "./data";
import {
  aplicarCelulasLider,
  auditoriaUsuarios,
  bitacora,
  celulasLider,
  celulasVigentesDe,
  certificados,
  fuentes,
  seguimientoDe,
} from "./dataE7";
import { bloqueImpedimentosBandeja, bloqueoFila, hduBloqueadasIds, riesgoFila } from "./handlersE4";
import { ERROR_ACCESO_DENEGADO, ERROR_NO_ENCONTRADO, aCatalogoRef, aHduResumen, aUsuarioResumen, cuerpoError, leerNumero, paginar } from "./utils";

const BASE = env.gatewayUrl;
const ID_EMISOR = "a1000000-0000-4000-8000-000000000002";
const PRIORIDAD_ORDEN: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };

type Respuesta = HttpResponse<any>;

function servicioNoDisponible(): Respuesta {
  return HttpResponse.json(cuerpoError("SERVICIO_NO_DISPONIBLE", "El servicio no está disponible. Intenta nuevamente."), { status: 503 });
}

function bloqueIndisponible(fuente: string) {
  return { fuente, estado: "indisponible" as const };
}

function contadorOrg(valor: number) {
  return { fuente: "organizacion.hdu", estado: "ok" as const, datos: { valor } };
}

function contadorCert(valor: number) {
  return fuentes.certificaciones
    ? { fuente: "certificaciones.checklist", estado: "ok" as const, datos: { valor } }
    : bloqueIndisponible("certificaciones.checklist");
}

function seguimientoBloque(hdu: HduMock) {
  if (!fuentes.certificaciones) return bloqueIndisponible("certificaciones.checklist");
  const s = seguimientoDe(hdu.id);
  return {
    fuente: "certificaciones.checklist",
    estado: "ok" as const,
    datos: {
      hduId: hdu.id,
      aprobados: s.aprobados,
      porcentaje: s.aprobados * 10,
      porAprobar: s.porAprobar,
      observaciones: s.observaciones,
      siguienteEntregable: s.siguiente,
      certificado: s.certificado,
      listaParaCertificar: s.aprobados === 8 && !s.certificado,
      listaParaCerrar: s.aprobados === 10 && hdu.estado !== "CERRADA",
      porAprobarDesde: s.porAprobarDesde,
      listaDesde: s.listaDesde,
      ultimaActividad: hdu.estadoActualizadoEn,
    },
  };
}

/** Campos aditivos de E4 por fila (D87): `bloqueo` en Analista y Líder, `riesgo` solo en el Líder. */
type ExtraFila = (hdu: HduMock) => Record<string, unknown>;

function itemBandeja(hdu: HduMock, extra?: ExtraFila) {
  return { ...aHduResumen(hdu), actualizadoEn: hdu.estadoActualizadoEn, seguimiento: seguimientoBloque(hdu), ...extra?.(hdu) };
}

interface ParamsLista {
  estado?: string | null;
  celulaId?: string | null;
  sprintId?: string | null;
  qeId?: string | null;
  analistaId?: string | null;
  q?: string | null;
}

function leerParams(url: URL): ParamsLista {
  const g = (k: string) => url.searchParams.get(k);
  return { estado: g("estado"), celulaId: g("celulaId"), sprintId: g("sprintId"), qeId: g("qeId"), analistaId: g("analistaId"), q: g("q") };
}

function filtrar(items: HduMock[], p: ParamsLista): HduMock[] {
  let r = items;
  if (p.estado && ESTADOS_HDU.includes(p.estado as EstadoHdu)) r = r.filter((h) => h.estado === p.estado);
  if (p.celulaId) r = r.filter((h) => h.celulaId === p.celulaId);
  if (p.sprintId) r = r.filter((h) => h.sprintId === p.sprintId);
  if (p.qeId) r = r.filter((h) => h.qeResponsableId === p.qeId);
  if (p.analistaId) r = r.filter((h) => h.analistaId === p.analistaId);
  if (p.q && p.q.trim().length >= 2) {
    const q = p.q.trim().toLowerCase();
    r = r.filter((h) => h.codigo.toLowerCase().includes(q) || h.titulo.toLowerCase().includes(q));
  }
  return r;
}

const COLUMNAS: Record<string, (h: HduMock) => string | number> = {
  codigo: (h) => h.codigo,
  celula: (h) => celulas.find((c) => c.id === h.celulaId)!.nombre,
  prioridad: (h) => PRIORIDAD_ORDEN[h.prioridad]!,
  estado: (h) => ESTADOS_HDU.indexOf(h.estado),
  actualizada: (h) => h.estadoActualizadoEn,
  fecha: (h) => h.creadoEn,
  sprint: (h) => h.sprintId,
  avance: (h) => seguimientoDe(h.id).aprobados,
};

function ordenar(items: HduMock[], orden: string | null, porDefecto: string) {
  let efectivo = orden && orden.split(":")[0]! in COLUMNAS ? orden : porDefecto;
  // D46: un orden que depende de Certificaciones cae a un orden de respaldo, que se informa.
  if (efectivo.startsWith("avance") && !fuentes.certificaciones) efectivo = "codigo:asc";
  const [columna, direccion] = efectivo.split(":") as [string, "asc" | "desc"];
  const clave = COLUMNAS[columna]!;
  const ordenados = [...items].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return direccion === "desc" ? -c : c;
  });
  return { ordenados, efectivo };
}

function paginaHdu(items: HduMock[], url: URL, porDefecto: string, extra?: ExtraFila) {
  const pagina = leerNumero(url.searchParams.get("pagina"), 1);
  const tamano = Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100);
  const { ordenados, efectivo } = ordenar(items, url.searchParams.get("orden"), porDefecto);
  const p = paginar(ordenados, pagina, tamano);
  return { ...p, items: p.items.map((h) => itemBandeja(h, extra)), orden: efectivo };
}

function bloqueLista(items: HduMock[], url: URL, porDefecto: string, extra?: ExtraFila) {
  return { fuente: "organizacion.hdu", estado: "ok" as const, datos: paginaHdu(items, url, porDefecto, extra) };
}

function esAbierta(h: HduMock) {
  return h.estado !== "CERRADA";
}

function csv(nombre: string, filas: string[][], encabezado: string[]): Respuesta {
  const lineas = [encabezado, ...filas].map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"));
  return new HttpResponse("﻿" + lineas.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "X-Q360-Filas": String(filas.length),
    },
  });
}

function enRango(fechaIso: string, url: URL): boolean {
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");
  const dia = fechaIso.slice(0, 10);
  return (!desde || dia >= desde) && (!hasta || dia <= hasta);
}

function registroAuditoria(r: (typeof auditoriaUsuarios)[number]) {
  const actor = buscarUsuario(r.actorId)!;
  const afectado = r.usuarioAfectadoId ? buscarUsuario(r.usuarioAfectadoId) : undefined;
  return {
    id: r.id,
    fecha: r.fecha,
    actor: { tipo: "USUARIO" as const, id: actor.id, nombre: actor.nombre },
    operacion: r.operacion,
    entidad: r.operacion === "EXPORTAR" ? ("EXPORTACION" as const) : r.operacion.includes("SUPERVISOR") ? ("SUPERVISION" as const) : ("USUARIO" as const),
    entidadId: r.usuarioAfectadoId ?? r.id,
    usuarioAfectado: afectado ? aUsuarioResumen(afectado) : null,
    antes: r.antes,
    despues: r.despues,
    motivo: r.motivo,
  };
}

function filtrarAuditoria(url: URL) {
  const operacion = url.searchParams.get("operacion");
  const actorId = url.searchParams.get("actorId");
  const afectado = url.searchParams.get("usuarioAfectadoId");
  return auditoriaUsuarios
    .filter((r) => enRango(r.fecha, url))
    .filter((r) => !operacion || r.operacion === operacion)
    .filter((r) => !actorId || r.actorId === actorId)
    .filter((r) => !afectado || r.usuarioAfectadoId === afectado)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function filtrarBitacora(url: URL) {
  const hduId = url.searchParams.get("hduId");
  const actorId = url.searchParams.get("actorId");
  const accion = url.searchParams.get("accion");
  return bitacora
    .filter((e) => enRango(e.fecha, url))
    .filter((e) => !hduId || e.hduId === hduId)
    .filter((e) => !actorId || e.actorId === actorId)
    .filter((e) => !accion || e.accion === accion)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function filtrarCertificados(url: URL) {
  const emisor = url.searchParams.get("emitidoPorId");
  const q = url.searchParams.get("q")?.toLowerCase();
  return certificados
    .filter((c) => enRango(c.emitidoEn, url))
    .filter((c) => !emisor || c.emitidoPorId === emisor)
    .filter((c) => {
      if (!q) return true;
      const hdu = hdus.find((h) => h.id === c.hduId)!;
      return c.folio.toLowerCase().includes(q) || hdu.codigo.toLowerCase().includes(q);
    })
    .sort((a, b) => b.emitidoEn.localeCompare(a.emitidoEn));
}

function eventoBitacora(e: (typeof bitacora)[number]) {
  const hdu = hdus.find((h) => h.id === e.hduId)!;
  const actor = buscarUsuario(e.actorId)!;
  return {
    id: e.id,
    hdu: { id: hdu.id, codigo: hdu.codigo, titulo: hdu.titulo, estado: hdu.estado },
    accion: e.accion,
    clave: `ENTREGABLE_${e.orden}` as never,
    nombreEntregable: e.nombre,
    actor: { id: actor.id, nombre: actor.nombre, rol: actor.rol },
    fecha: e.fecha,
    valorAnterior: null,
    valorNuevo: null,
    motivo: e.motivo,
  };
}

function certificadoAuditoria(c: (typeof certificados)[number]) {
  const hdu = hdus.find((h) => h.id === c.hduId)!;
  const emisor = buscarUsuario(c.emitidoPorId)!;
  return {
    folio: c.folio,
    hdu: { id: hdu.id, codigo: hdu.codigo, titulo: hdu.titulo },
    emitidoEn: c.emitidoEn,
    emitidoPor: { id: emisor.id, nombre: emisor.nombre },
    huellaSha256: c.huella,
    valido: true,
  };
}

function exigir(actor: UsuarioMock, ...roles: UsuarioMock["rol"][]) {
  return exigirRol(actor, ...roles);
}

export const handlersE7 = [
  // -------------------------------------------------------------------- roles
  http.get(`${BASE}/v1/roles`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "ADMINISTRADOR");
    if (denegado) return denegado;
    return HttpResponse.json({
      items: ROLES_CATALOGO.map((codigo) => ({ codigo, nombre: ETIQUETAS_ROL[codigo], soloLectura: ROLES_SOLO_LECTURA.includes(codigo) })),
    });
  }),

  // ---------------------------------------------------------- células del líder
  http.get(`${BASE}/v1/usuarios/:id/celulas-lider`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "ADMINISTRADOR");
    if (denegado) return denegado;
    const usuario = buscarUsuario(String(params.id));
    if (!usuario) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    return HttpResponse.json(cuerpoCelulasLider(usuario));
  }),

  http.put(`${BASE}/v1/usuarios/:id/celulas-lider`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "ADMINISTRADOR");
    if (denegado) return denegado;
    const usuario = buscarUsuario(String(params.id));
    if (!usuario) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    if (usuario.rol !== "LIDER_QA") {
      return HttpResponse.json(cuerpoError("ROL_INCOMPATIBLE", "Este usuario no es Líder QA."), { status: 409 });
    }
    const cuerpo = (await request.json()) as { celulaIds?: string[] };
    const ids = cuerpo.celulaIds ?? [];
    if (ids.some((id) => !celulas.some((c) => c.id === id))) {
      return HttpResponse.json(
        cuerpoError("CATALOGO_INVALIDO", "Alguna de las células indicadas no existe.", [
          { campo: "celulaIds", codigo: "NO_EXISTE", mensaje: "Alguna de las células indicadas no existe." },
        ]),
        { status: 422 },
      );
    }
    aplicarCelulasLider(usuario, ids, actor.id);
    return HttpResponse.json(cuerpoCelulasLider(usuario));
  }),

  // ------------------------------------------------------------------ bandejas
  http.get(`${BASE}/v1/bandeja/analista`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "ANALISTA_QA");
    if (denegado) return denegado;
    const url = new URL(request.url);

    const propias = hdus.filter((h) => h.analistaId === actor.id);
    const relacion = supervisorVigenteDe(actor.id);
    const suma = (f: (h: HduMock) => number) => propias.reduce((t, h) => t + f(h), 0);

    let lista = filtrar(propias, leerParams(url));
    const soloObs = url.searchParams.get("soloConObservaciones") === "true";
    const soloBloqueadas = url.searchParams.get("soloBloqueadas") === "true";
    let bloqueHdu;
    if ((soloObs && !fuentes.certificaciones) || (soloBloqueadas && !fuentes.impedimentos)) {
      // D46 y D87: un filtro que depende de otra fuente deja la lista indisponible, nunca sin filtrar.
      bloqueHdu = bloqueIndisponible("organizacion.hdu");
    } else {
      if (soloObs) lista = lista.filter((h) => seguimientoDe(h.id).observaciones > 0);
      if (soloBloqueadas) lista = lista.filter((h) => hduBloqueadasIds().has(h.id));
      bloqueHdu = bloqueLista(lista, url, "codigo:asc", (h) => ({ bloqueo: bloqueoFila(h.id) }));
    }

    return HttpResponse.json({
      rol: "ANALISTA_QA",
      generadaEn: new Date().toISOString(),
      supervisor: { fuente: "organizacion.supervision", estado: "ok", datos: { supervisor: relacion ? aUsuarioResumen(buscarUsuario(relacion.qeId)!) : null } },
      contadores: {
        abiertas: contadorOrg(propias.filter(esAbierta).length),
        conObservaciones: contadorCert(suma((h) => seguimientoDe(h.id).observaciones)),
        esperandoAprobacion: contadorCert(suma((h) => seguimientoDe(h.id).porAprobar)),
      },
      hdu: bloqueHdu,
      impedimentos: bloqueImpedimentosBandeja(actor, propias),
    });
  }),

  http.get(`${BASE}/v1/bandeja/qe`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "QE");
    if (denegado) return denegado;
    const url = new URL(request.url);
    const propias = hdus.filter((h) => h.qeResponsableId === actor.id);
    const vivas = propias.filter(esAbierta);

    const acciones: { hdu: HduMock; tipo: string; entregablesPorAprobar: number | null; esperandoDesde: string }[] = [];
    for (const h of vivas) {
      const s = seguimientoDe(h.id);
      if (!h.analistaId) acciones.push({ hdu: h, tipo: "ASIGNAR", entregablesPorAprobar: null, esperandoDesde: h.creadoEn });
      if (!fuentes.certificaciones) continue;
      if (s.porAprobar > 0) acciones.push({ hdu: h, tipo: "APROBAR", entregablesPorAprobar: s.porAprobar, esperandoDesde: s.porAprobarDesde ?? h.creadoEn });
      if (s.aprobados === 8 && !s.certificado) acciones.push({ hdu: h, tipo: "CERTIFICAR", entregablesPorAprobar: null, esperandoDesde: s.listaDesde ?? h.creadoEn });
      if (s.aprobados === 10) acciones.push({ hdu: h, tipo: "CERRAR", entregablesPorAprobar: null, esperandoDesde: s.listaDesde ?? h.creadoEn });
    }

    const tipo = url.searchParams.get("tipoAccion");
    const p = leerParams(url);
    let bloqueAcciones;
    if (tipo && tipo !== "ASIGNAR" && !fuentes.certificaciones) {
      bloqueAcciones = bloqueIndisponible("organizacion.hdu");
    } else {
      const ids = new Set(filtrar(vivas, p).map((h) => h.id));
      const filtradas = acciones
        .filter((a) => ids.has(a.hdu.id))
        .filter((a) => !tipo || a.tipo === tipo)
        .sort((a, b) => a.esperandoDesde.localeCompare(b.esperandoDesde));
      const pagina = leerNumero(url.searchParams.get("pagina"), 1);
      const tamano = Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100);
      const pag = paginar(filtradas, pagina, tamano);
      bloqueAcciones = {
        fuente: "organizacion.hdu",
        estado: "ok" as const,
        datos: {
          ...pag,
          items: pag.items.map((a) => ({
            hdu: aHduResumen(a.hdu),
            tipo: a.tipo,
            entregablesPorAprobar: a.entregablesPorAprobar,
            esperandoDesde: a.esperandoDesde,
            antiguedadDias: Math.max(0, Math.floor((Date.now() - new Date(a.esperandoDesde).getTime()) / 86_400_000)),
            // D81: el bloqueo solo viaja en las filas `CERRAR`.
            ...(a.tipo === "CERRAR" ? { bloqueo: bloqueoFila(a.hdu.id) } : {}),
          })),
          calculoParcial: !fuentes.certificaciones,
        },
      };
    }

    const conPorAprobar = vivas.filter((h) => seguimientoDe(h.id).porAprobar > 0);
    return HttpResponse.json({
      rol: "QE",
      generadaEn: new Date().toISOString(),
      contadores: {
        porAprobar: fuentes.certificaciones
          ? {
              fuente: "certificaciones.checklist",
              estado: "ok",
              datos: { valor: conPorAprobar.reduce((t, h) => t + seguimientoDe(h.id).porAprobar, 0), hdu: conPorAprobar.length },
            }
          : bloqueIndisponible("certificaciones.checklist"),
        sinAnalista: contadorOrg(vivas.filter((h) => !h.analistaId).length),
        listasCertificar: contadorCert(vivas.filter((h) => seguimientoDe(h.id).aprobados === 8 && !seguimientoDe(h.id).certificado).length),
        listasCerrar: contadorCert(vivas.filter((h) => seguimientoDe(h.id).aprobados === 10).length),
      },
      acciones: bloqueAcciones,
      impedimentos: bloqueImpedimentosBandeja(actor, propias),
    });
  }),

  http.get(`${BASE}/v1/bandeja/lider`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "LIDER_QA");
    if (denegado) return denegado;
    const url = new URL(request.url);
    const misCelulas = celulasVigentesDe(actor.id);
    const p = leerParams(url);
    if (p.celulaId && !misCelulas.includes(p.celulaId)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });

    const ambito = hdus.filter((h) => misCelulas.includes(h.celulaId));
    let lista = filtrar(ambito, p);
    if (url.searchParams.get("sinAnalista") === "true") lista = lista.filter((h) => !h.analistaId);
    const soloBloqueadasLider = url.searchParams.get("soloBloqueadas") === "true";
    if (soloBloqueadasLider && fuentes.impedimentos) lista = lista.filter((h) => hduBloqueadasIds().has(h.id));

    return HttpResponse.json({
      rol: "LIDER_QA",
      generadaEn: new Date().toISOString(),
      celulas: {
        fuente: "organizacion.celulas",
        estado: "ok",
        datos: { items: misCelulas.map((id) => aCatalogoRef(celulas.find((c) => c.id === id)!)).sort((a, b) => a.nombre.localeCompare(b.nombre)) },
      },
      contadores: {
        celulas: contadorOrg(misCelulas.length),
        hduAbiertas: contadorOrg(ambito.filter(esAbierta).length),
        hduCerradas: contadorOrg(ambito.filter((h) => !esAbierta(h)).length),
        sinAnalista: contadorOrg(ambito.filter((h) => !h.analistaId).length),
        certificados: contadorCert(ambito.filter((h) => seguimientoDe(h.id).certificado).length),
      },
      resumenPorCelula: {
        fuente: "organizacion.hdu",
        estado: "ok",
        datos: {
          items: misCelulas.map((id) => {
            const delas = ambito.filter((h) => h.celulaId === id);
            const porEstado = { PENDIENTE: 0, DISENO_PRUEBAS: 0, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 };
            for (const h of delas) porEstado[h.estado] += 1;
            const abiertas = delas.filter(esAbierta);
            const prom = abiertas.length ? Math.round(abiertas.reduce((t, h) => t + seguimientoDe(h.id).aprobados * 10, 0) / abiertas.length) : null;
            return {
              celula: aCatalogoRef(celulas.find((c) => c.id === id)!),
              porEstado,
              avancePromedioAbiertas: fuentes.certificaciones
                ? { fuente: "certificaciones.checklist", estado: "ok", datos: { porcentaje: prom } }
                : bloqueIndisponible("certificaciones.checklist"),
            };
          }),
        },
      },
      hdu:
        soloBloqueadasLider && !fuentes.impedimentos
          ? bloqueIndisponible("organizacion.hdu")
          : bloqueLista(lista, url, "celula:asc", (h) => ({ bloqueo: bloqueoFila(h.id), riesgo: riesgoFila(h) })),
      impedimentos: bloqueImpedimentosBandeja(actor, ambito),
    });
  }),

  http.get(`${BASE}/v1/bandeja/admin`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const activos = usuarios.filter((u) => u.activo);
    const porRol = { ADMINISTRADOR: 0, QE: 0, ANALISTA_QA: 0, LIDER_QA: 0, AUDITOR: 0 };
    for (const u of activos) porRol[u.rol] += 1;
    const analistasSinQe = activos.filter((u) => u.rol === "ANALISTA_QA" && !supervisorVigenteDe(u.id));
    const qeSinAnalistas = activos.filter((u) => u.rol === "QE" && analistasVigentesDe(u.id).length === 0);
    const lideresSinCelulas = activos.filter((u) => u.rol === "LIDER_QA" && celulasVigentesDe(u.id).length === 0);
    const celulasSinLider = celulas.filter((c) => !celulasLider.some((l) => l.celulaId === c.id && l.hasta === null && buscarUsuario(l.usuarioId)?.activo));

    const pendientes = [
      ...analistasSinQe.map((u) => ({ tipo: "ANALISTA_SIN_QE", usuario: aUsuarioResumen(u), celula: null })),
      ...qeSinAnalistas.map((u) => ({ tipo: "QE_SIN_ANALISTAS", usuario: aUsuarioResumen(u), celula: null })),
      ...lideresSinCelulas.map((u) => ({ tipo: "LIDER_SIN_CELULAS", usuario: aUsuarioResumen(u), celula: null })),
      ...celulasSinLider.map((c) => ({ tipo: "CELULA_SIN_LIDER", usuario: null, celula: aCatalogoRef(c) })),
    ];

    return HttpResponse.json({
      rol: "ADMINISTRADOR",
      generadaEn: new Date().toISOString(),
      contadores: {
        usuariosActivos: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: activos.length, porRol } },
        usuariosInactivos: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: usuarios.length - activos.length } },
        analistasSinQe: { fuente: "organizacion.supervision", estado: "ok", datos: { valor: analistasSinQe.length } },
        qeSinAnalistas: { fuente: "organizacion.supervision", estado: "ok", datos: { valor: qeSinAnalistas.length } },
        lideresSinCelulas: { fuente: "organizacion.usuarios", estado: "ok", datos: { valor: lideresSinCelulas.length } },
        celulasSinLider: { fuente: "organizacion.celulas", estado: "ok", datos: { valor: celulasSinLider.length } },
        hduTotal: contadorOrg(hdus.length),
      },
      pendientes: fuentes.pendientesAdmin
        ? {
            fuente: "organizacion.usuarios",
            estado: "ok",
            datos: paginar(
              pendientes,
              leerNumero(new URL(request.url).searchParams.get("pagina"), 1),
              Math.min(leerNumero(new URL(request.url).searchParams.get("tamanoPagina"), 25), 100),
            ),
          }
        : bloqueIndisponible("organizacion.usuarios"),
      ultimosCambios: fuentes.cambiosAdmin
        ? {
            fuente: "organizacion.auditoria",
            estado: "ok",
            datos: { items: [...auditoriaUsuarios].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10).map((r) => ({ ...registroAuditoria(r), antes: null, despues: null })) },
          }
        : bloqueIndisponible("organizacion.auditoria"),
      impedimentos: bloqueImpedimentosBandeja(actor, hdus),
    });
  }),

  http.get(`${BASE}/v1/bandeja/auditor`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    const url = new URL(request.url);
    const certificado = url.searchParams.get("certificado");
    const lista0 = filtrar(hdus, leerParams(url)).filter((h) => enRango(h.estadoActualizadoEn, url));
    let bloque;
    if (certificado && !fuentes.certificaciones) {
      bloque = bloqueIndisponible("organizacion.hdu");
    } else {
      const lista = certificado ? lista0.filter((h) => Boolean(seguimientoDe(h.id).certificado) === (certificado === "con")) : lista0;
      bloque = bloqueLista(lista, url, "codigo:asc");
    }
    return HttpResponse.json({
      rol: "AUDITOR",
      generadaEn: new Date().toISOString(),
      contadores: {
        hduTotal: contadorOrg(hdus.length),
        certificados: contadorCert(certificados.length),
        eventos7d: contadorCert(bitacora.length),
        cambiosUsuarios7d: { fuente: "organizacion.auditoria", estado: "ok", datos: { valor: auditoriaUsuarios.length } },
      },
      hdu: bloque,
      impedimentos: bloqueImpedimentosBandeja(actor, hdus),
    });
  }),

  // ------------------------------------------------------------------- auditor
  http.get(`${BASE}/v1/auditor/auditoria-usuarios`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    const url = new URL(request.url);
    const pag = paginar(
      filtrarAuditoria(url),
      leerNumero(url.searchParams.get("pagina"), 1),
      Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100),
    );
    return HttpResponse.json({ ...pag, items: pag.items.map(registroAuditoria) });
  }),

  http.get(`${BASE}/v1/auditor/bitacora`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    if (!fuentes.certificaciones) return servicioNoDisponible();
    const url = new URL(request.url);
    const pag = paginar(filtrarBitacora(url), leerNumero(url.searchParams.get("pagina"), 1), Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100));
    return HttpResponse.json({ ...pag, items: pag.items.map(eventoBitacora) });
  }),

  http.get(`${BASE}/v1/auditor/certificados`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    if (!fuentes.certificaciones) return servicioNoDisponible();
    const url = new URL(request.url);
    const pag = paginar(filtrarCertificados(url), leerNumero(url.searchParams.get("pagina"), 1), Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100));
    return HttpResponse.json({ ...pag, items: pag.items.map(certificadoAuditoria) });
  }),

  http.get(`${BASE}/v1/auditor/exportaciones/hdu`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    if (!fuentes.certificaciones) return servicioNoDisponible();
    const url = new URL(request.url);
    const lista = filtrar(hdus, leerParams(url)).filter((h) => enRango(h.estadoActualizadoEn, url));
    return csv(
      "quality360-hdu-2026-10-21.csv",
      lista.map((h) => [h.codigo, h.titulo, h.estado]),
      ["codigo", "titulo", "estado"],
    );
  }),

  http.get(`${BASE}/v1/auditor/exportaciones/auditoria-usuarios`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    const filas = filtrarAuditoria(new URL(request.url));
    return csv(
      "quality360-auditoria-usuarios-2026-10-21.csv",
      filas.map((r) => [r.fecha, r.operacion, r.id]),
      ["fecha", "operacion", "id"],
    );
  }),

  http.get(`${BASE}/v1/auditor/exportaciones/bitacora`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    if (!fuentes.certificaciones) return servicioNoDisponible();
    const filas = filtrarBitacora(new URL(request.url));
    return csv(
      "quality360-bitacora-2026-10-21.csv",
      filas.map((e) => [e.fecha, e.accion, e.nombre]),
      ["fecha", "accion", "entregable"],
    );
  }),

  http.get(`${BASE}/v1/auditor/exportaciones/certificados`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "AUDITOR");
    if (denegado) return denegado;
    if (!fuentes.certificaciones) return servicioNoDisponible();
    const filas = filtrarCertificados(new URL(request.url));
    return csv(
      "quality360-certificados-2026-10-21.csv",
      filas.map((c) => [c.folio, c.emitidoEn, c.huella]),
      ["folio", "emitidoEn", "huella"],
    );
  }),

  // ---------------------- lectura del checklist (solo lectura para Líder y Auditor, D39)
  http.get(`${BASE}/v1/hdu/:id/entregables`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    if (!hdu) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    if (!fuentes.certificaciones) return servicioNoDisponible();
    const s = seguimientoDe(hdu.id);
    return HttpResponse.json({
      hduId: hdu.id,
      resumen: { hduId: hdu.id, totalEntregables: 10, completados: s.aprobados, porcentajeCumplimiento: s.aprobados * 10, completo: s.aprobados === 10 },
      entregables: [],
      // Los roles de lectura (Líder, Auditor) nunca reciben permisos de escritura.
      permisos: { puedeMarcar: false, puedeAprobar: false, puedeGenerarCertificado: false },
      certificado: s.certificado
        ? { folio: s.certificado.folio, emitido: { id: ID_EMISOR, nombre: "Jose Seguel", fecha: s.certificado.emitidoEn }, huellaSha256: "a3f1c9d4" }
        : null,
      certificacion: { habilitada: false, motivo: null, faltantes: [] },
    });
  }),

  http.get(`${BASE}/v1/hdu/:id/entregables/bitacora`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return HttpResponse.json({ hduId: String(params.id), eventos: [] });
  }),

  http.get(`${BASE}/v1/hdu/:id/certificado`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const s = seguimientoDe(String(params.id));
    if (!s.certificado) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    return HttpResponse.json({
      hduId: String(params.id),
      certificado: { folio: s.certificado.folio, emitido: { id: ID_EMISOR, nombre: "Jose Seguel", fecha: s.certificado.emitidoEn }, huellaSha256: "a3f1c9d4" },
      descarga: { url: `http://localhost/archivos/${s.certificado.folio}.pdf`, expiraEn: "2099-01-01T00:00:00Z" },
    });
  }),

  // --------------------------------------------- E7-B05 · QE responsable de la HDU
  http.put(`${BASE}/v1/hdu/:id/qe-responsable`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigir(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const hdu = hdus.find((h) => h.id === params.id);
    if (!hdu) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });

    const cuerpo = (await request.json()) as { qeResponsableId?: string; motivo?: string };
    const motivo = cuerpo.motivo?.trim() ?? "";
    if (motivo.length < 3 || motivo.length > 500) {
      return HttpResponse.json(
        cuerpoError("VALIDACION", "El motivo es obligatorio (3 a 500 caracteres).", [
          { campo: "motivo", codigo: motivo.length === 0 ? "REQUERIDO" : "LONGITUD_INVALIDA", mensaje: "El motivo es obligatorio (3 a 500 caracteres)." },
        ]),
        { status: 400 },
      );
    }
    if (hdu.estado === "CERRADA") return HttpResponse.json(cuerpoError("HDU_CERRADA", "La HDU está cerrada y no admite cambios."), { status: 409 });

    const destino = cuerpo.qeResponsableId ? buscarUsuario(cuerpo.qeResponsableId) : undefined;
    if (!destino || destino.rol !== "QE" || !destino.activo) {
      return HttpResponse.json(
        cuerpoError("QE_INVALIDO", "El QE responsable debe tener rol QE y estar activo.", [
          { campo: "qeResponsableId", codigo: "NO_PERMITIDO", mensaje: "El QE responsable debe tener rol QE y estar activo." },
        ]),
        { status: 422 },
      );
    }

    const anterior = buscarUsuario(hdu.qeResponsableId)!;
    const cambio = anterior.id !== destino.id;
    if (cambio) {
      hdu.qeResponsableId = destino.id;
    }
    return HttpResponse.json({ cambio, hdu: aHduResumen(hdu), qeAnterior: aUsuarioResumen(anterior), qeNuevo: aUsuarioResumen(destino), motivo });
  }),
];

function cuerpoCelulasLider(usuario: UsuarioMock) {
  const mapa = (c: (typeof celulasLider)[number]) => {
    const asignador = buscarUsuario(c.asignadoPorId)!;
    return {
      id: c.id,
      celula: aCatalogoRef(celulas.find((x) => x.id === c.celulaId)!),
      desde: c.desde,
      hasta: c.hasta,
      asignadoPor: { tipo: "USUARIO" as const, id: asignador.id, nombre: asignador.nombre },
      retiradoPor: c.hasta ? { tipo: "USUARIO" as const, id: asignador.id, nombre: asignador.nombre } : null,
    };
  };
  const propias = celulasLider.filter((c) => c.usuarioId === usuario.id);
  return {
    usuario: aUsuarioResumen(usuario),
    vigentes: propias.filter((c) => c.hasta === null).map(mapa).sort((a, b) => a.celula.nombre.localeCompare(b.celula.nombre)),
    historial: propias.map(mapa),
  };
}
