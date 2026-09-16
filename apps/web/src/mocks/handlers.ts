import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { ROLES_CATALOGO, TRANSICIONES_HDU, type EstadoHdu, type Rol } from "@/types/dominio";
import {
  ID,
  analistasVigentesDe,
  buscarUsuario,
  buscarUsuarioPorCorreo,
  celulas,
  eventosHdu,
  hdus,
  relacionesSupervision,
  sprints,
  supervisorVigenteDe,
  usuarios,
  type HduMock,
  type UsuarioMock,
} from "./data";
import {
  ERROR_ACCESO_DENEGADO,
  ERROR_NO_AUTENTICADO,
  ERROR_NO_ENCONTRADO,
  aCatalogoRef,
  aHduResumen,
  aUsuarioResumen,
  cuerpoError,
  decodificarToken,
  leerNumero,
  paginar,
  transicionesDesde,
} from "./utils";

const BASE = env.gatewayUrl;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function autenticar(request: Request): UsuarioMock | HttpResponse<any> {
  const usuario = decodificarToken(request.headers.get("Authorization"));
  if (!usuario) return HttpResponse.json(ERROR_NO_AUTENTICADO(), { status: 401 });
  if (!usuario.activo) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
  return usuario;
}

function esUsuarioMock(valor: UsuarioMock | HttpResponse<any>): valor is UsuarioMock {
  return "id" in valor;
}

function exigirRol(usuario: UsuarioMock, ...roles: Rol[]): HttpResponse<any> | null {
  if (!roles.includes(usuario.rol)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
  return null;
}

function analistaEnEquipoDe(qeId: string, analistaId: string): boolean {
  return analistasVigentesDe(qeId).some((relacion) => relacion.analistaId === analistaId);
}

function estaEnAmbito(hdu: HduMock, usuario: UsuarioMock): boolean {
  if (usuario.rol === "ADMINISTRADOR") return true;
  if (usuario.rol === "ANALISTA_QA") return hdu.analistaId === usuario.id;
  return hdu.qeResponsableId === usuario.id || analistaEnEquipoDe(usuario.id, hdu.analistaId ?? "");
}

function puedeCambiarEstado(hdu: HduMock, usuario: UsuarioMock): boolean {
  if (usuario.rol === "ADMINISTRADOR") return true;
  if (usuario.rol === "ANALISTA_QA") return hdu.analistaId === usuario.id;
  return estaEnAmbito(hdu, usuario);
}

function puedeAsignarAnalista(hdu: HduMock, usuario: UsuarioMock): boolean {
  if (usuario.rol === "ADMINISTRADOR") return true;
  return usuario.rol === "QE" && hdu.qeResponsableId === usuario.id;
}

function construirHduDetalle(hdu: HduMock, usuario: UsuarioMock) {
  const cambiarEstado = puedeCambiarEstado(hdu, usuario);
  const creador = buscarUsuario(hdu.creadoPorId)!;
  return {
    ...aHduResumen(hdu),
    creadoPor: { tipo: "USUARIO" as const, id: creador.id, nombre: creador.nombre },
    transicionesPermitidas: cambiarEstado ? transicionesDesde(hdu.estado) : [],
    permisos: { cambiarEstado, asignarAnalista: puedeAsignarAnalista(hdu, usuario) },
  };
}

function usuarioAAudiencia(usuario: UsuarioMock) {
  const relacion = supervisorVigenteDe(usuario.id);
  const qe = relacion ? buscarUsuario(relacion.qeId) : undefined;
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    activo: usuario.activo,
    supervisorVigente: usuario.rol === "ANALISTA_QA" && qe ? aUsuarioResumen(qe) : null,
    analistasVigentes: usuario.rol === "QE" ? analistasVigentesDe(usuario.id).length : 0,
    creadoEn: usuario.creadoEn,
    actualizadoEn: usuario.actualizadoEn,
  };
}

export const handlers = [
  http.get(`${BASE}/health`, () => HttpResponse.json({ estado: "ok" })),

  // ---------------------------------------------------------------- sesión
  http.get(`${BASE}/v1/me`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return HttpResponse.json({ id: actor.id, nombre: actor.nombre, correo: actor.correo, rol: actor.rol });
  }),

  // ----------------------------------------------------------------- inicio
  http.get(`${BASE}/v1/inicio/admin`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const activos = usuarios.filter((u) => u.activo);
    const porRol = { ADMINISTRADOR: 0, QE: 0, ANALISTA_QA: 0 };
    for (const usuario of usuarios) porRol[usuario.rol] += 1;

    const analistasQaActivos = usuarios.filter((u) => u.rol === "ANALISTA_QA" && u.activo);
    const qeActivos = usuarios.filter((u) => u.rol === "QE" && u.activo);

    return HttpResponse.json({
      usuarios: {
        fuente: "organizacion.usuarios",
        estado: "ok",
        datos: { total: usuarios.length, activos: activos.length, inactivos: usuarios.length - activos.length, porRol },
      },
      supervision: {
        fuente: "organizacion.supervision",
        estado: "ok",
        datos: {
          relacionesVigentes: relacionesSupervision.filter((r) => r.hasta === null).length,
          analistasSinSupervisor: analistasQaActivos.filter((u) => !supervisorVigenteDe(u.id)).length,
          qeSinAnalistas: qeActivos.filter((u) => analistasVigentesDe(u.id).length === 0).length,
        },
      },
    });
  }),

  http.get(`${BASE}/v1/inicio/qe`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE");
    if (denegado) return denegado;

    const analistasEquipo = analistasVigentesDe(actor.id).map((r) => r.analistaId);
    const hduAmbito = hdus.filter((hdu) => hdu.qeResponsableId === actor.id || analistasEquipo.includes(hdu.analistaId ?? ""));
    const porEstado = contarPorEstado(hduAmbito);

    return HttpResponse.json({
      equipo: { fuente: "organizacion.supervision", estado: "ok", datos: { analistasVigentes: analistasEquipo.length } },
      hdu: { fuente: "organizacion.hdu", estado: "ok", datos: { hduEnAmbito: hduAmbito.length, porEstado } },
    });
  }),

  http.get(`${BASE}/v1/inicio/qa`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ANALISTA_QA", "ADMINISTRADOR");
    if (denegado) return denegado;

    const url = new URL(request.url);
    const analistaIdParam = url.searchParams.get("analistaId");

    let resuelto: UsuarioMock;
    if (actor.rol === "ANALISTA_QA") {
      if (analistaIdParam && analistaIdParam !== actor.id) {
        return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
      }
      resuelto = actor;
    } else {
      if (!analistaIdParam) {
        return HttpResponse.json(cuerpoError("VALIDACION", "analistaId es obligatorio.", [
          { campo: "query.analistaId", codigo: "REQUERIDO", mensaje: "analistaId es obligatorio." },
        ]), { status: 400 });
      }
      const candidato = buscarUsuario(analistaIdParam);
      if (!candidato || candidato.rol !== "ANALISTA_QA") {
        return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
      }
      resuelto = candidato;
    }

    const relacion = supervisorVigenteDe(resuelto.id);
    const supervisorResumen = relacion ? aUsuarioResumen(buscarUsuario(relacion.qeId)!) : null;

    const bloqueHdu =
      resuelto.id === ID.qa3
        ? { fuente: "organizacion.hdu", estado: "indisponible" as const }
        : {
            fuente: "organizacion.hdu",
            estado: "ok" as const,
            datos: {
              hduAsignadas: hdus.filter((h) => h.analistaId === resuelto.id).length,
              porEstado: contarPorEstado(hdus.filter((h) => h.analistaId === resuelto.id)),
            },
          };

    return HttpResponse.json({
      supervisor: { fuente: "organizacion.supervision", estado: "ok", datos: { supervisor: supervisorResumen } },
      hdu: bloqueHdu,
    });
  }),

  // ------------------------------------------------------------------ equipo
  http.get(`${BASE}/v1/qe/analistas`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE", "ADMINISTRADOR");
    if (denegado) return denegado;

    const url = new URL(request.url);
    const qeIdParam = url.searchParams.get("qeId");

    let qe: UsuarioMock;
    if (actor.rol === "QE") {
      if (qeIdParam && qeIdParam !== actor.id) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
      qe = actor;
    } else {
      if (!qeIdParam) {
        return HttpResponse.json(cuerpoError("VALIDACION", "qeId es obligatorio.", [
          { campo: "query.qeId", codigo: "REQUERIDO", mensaje: "qeId es obligatorio." },
        ]), { status: 400 });
      }
      const candidato = buscarUsuario(qeIdParam);
      if (!candidato || candidato.rol !== "QE") return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
      qe = candidato;
    }

    const items = analistasVigentesDe(qe.id)
      .map((relacion) => {
        const analista = buscarUsuario(relacion.analistaId)!;
        return { id: analista.id, nombre: analista.nombre, correo: analista.correo, activo: analista.activo, supervisadoDesde: relacion.desde };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return HttpResponse.json({ qe: aUsuarioResumen(qe), items, total: items.length });
  }),

  http.get(`${BASE}/v1/qe/analistas-asignables`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE", "ADMINISTRADOR");
    if (denegado) return denegado;

    let candidatos: UsuarioMock[];
    if (actor.rol === "QE") {
      const idsEquipo = analistasVigentesDe(actor.id).map((r) => r.analistaId);
      candidatos = usuarios.filter((u) => idsEquipo.includes(u.id) && u.activo);
    } else {
      candidatos = usuarios.filter((u) => u.rol === "ANALISTA_QA" && u.activo);
    }
    candidatos = [...candidatos].sort((a, b) => a.nombre.localeCompare(b.nombre));

    return HttpResponse.json({ items: candidatos.map(aUsuarioResumen) });
  }),

  // ---------------------------------------------------------------- usuarios
  http.get(`${BASE}/v1/usuarios`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    const rol = url.searchParams.get("rol") as Rol | null;
    const activoParam = url.searchParams.get("activo");
    const pagina = leerNumero(url.searchParams.get("pagina"), 1);
    const tamanoPagina = leerNumero(url.searchParams.get("tamanoPagina"), 20);

    let filtrados = [...usuarios];
    if (q) filtrados = filtrados.filter((u) => u.nombre.toLowerCase().includes(q) || u.correo.toLowerCase().includes(q));
    if (rol) filtrados = filtrados.filter((u) => u.rol === rol);
    if (activoParam !== null) filtrados = filtrados.filter((u) => u.activo === (activoParam === "true"));
    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const pagina_ = paginar(filtrados, pagina, tamanoPagina);
    return HttpResponse.json({ ...pagina_, items: pagina_.items.map(usuarioAAudiencia) });
  }),

  http.post(`${BASE}/v1/usuarios`, async ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const cuerpo = (await request.json()) as { nombre?: string; correo?: string; rol?: Rol };
    const detalles: { campo: string; codigo: "REQUERIDO" | "FORMATO_INVALIDO" | "VALOR_NO_PERMITIDO"; mensaje: string }[] = [];
    const nombre = cuerpo.nombre?.trim() ?? "";
    const correo = cuerpo.correo?.trim().toLowerCase() ?? "";
    if (!nombre) detalles.push({ campo: "nombre", codigo: "REQUERIDO", mensaje: "El nombre es obligatorio." });
    if (!correo) detalles.push({ campo: "correo", codigo: "REQUERIDO", mensaje: "El correo es obligatorio." });
    else if (!/^\S+@\S+\.\S+$/.test(correo)) detalles.push({ campo: "correo", codigo: "FORMATO_INVALIDO", mensaje: "El correo no tiene un formato válido." });
    if (!cuerpo.rol || !ROLES_CATALOGO.includes(cuerpo.rol)) detalles.push({ campo: "rol", codigo: "VALOR_NO_PERMITIDO", mensaje: "Selecciona un rol válido." });
    if (detalles.length > 0) {
      return HttpResponse.json(cuerpoError("VALIDACION", "Los datos enviados no son válidos.", detalles), { status: 400 });
    }

    if (buscarUsuarioPorCorreo(correo)) {
      return HttpResponse.json(
        cuerpoError("CORREO_DUPLICADO", "Ya existe un usuario con ese correo.", [
          { campo: "correo", codigo: "DUPLICADO", mensaje: "Ya existe un usuario con ese correo." },
        ]),
        { status: 409 },
      );
    }

    const ahora = new Date().toISOString();
    const nuevo: UsuarioMock = {
      id: crypto.randomUUID(),
      nombre,
      correo,
      rol: cuerpo.rol as Rol,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora,
      contrasena: "",
    };
    usuarios.push(nuevo);
    return HttpResponse.json(usuarioAAudiencia(nuevo), { status: 201, headers: { Location: `/v1/usuarios/${nuevo.id}` } });
  }),

  http.patch(`${BASE}/v1/usuarios/:id`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const usuario = buscarUsuario(String(params.id));
    if (!usuario) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });

    const cuerpo = (await request.json()) as { nombre?: string; correo?: string; activo?: boolean };

    if (cuerpo.correo && buscarUsuarioPorCorreo(cuerpo.correo) && buscarUsuarioPorCorreo(cuerpo.correo)!.id !== usuario.id) {
      return HttpResponse.json(
        cuerpoError("CORREO_DUPLICADO", "Ya existe un usuario con ese correo.", [
          { campo: "correo", codigo: "DUPLICADO", mensaje: "Ya existe un usuario con ese correo." },
        ]),
        { status: 409 },
      );
    }

    if (cuerpo.activo === false) {
      if (usuario.rol === "ADMINISTRADOR") {
        const otrosAdminsActivos = usuarios.some((u) => u.rol === "ADMINISTRADOR" && u.activo && u.id !== usuario.id);
        if (!otrosAdminsActivos) {
          return HttpResponse.json(
            cuerpoError("ULTIMO_ADMINISTRADOR", "La plataforma debe conservar al menos un administrador activo."),
            { status: 409 },
          );
        }
      }
      if (usuario.rol === "QE") {
        const vigentes = analistasVigentesDe(usuario.id);
        if (vigentes.length > 0) {
          return HttpResponse.json(
            {
              ...cuerpoError("RELACIONES_INCOMPATIBLES", "Resuelve las relaciones de supervisión antes de continuar."),
              relaciones: {
                analistasVigentes: vigentes.map((r) => aUsuarioResumen(buscarUsuario(r.analistaId)!)),
                supervisorVigente: null,
              },
            },
            { status: 409 },
          );
        }
      }
    }

    if (cuerpo.nombre?.trim()) usuario.nombre = cuerpo.nombre.trim();
    if (cuerpo.correo?.trim()) usuario.correo = cuerpo.correo.trim().toLowerCase();
    if (typeof cuerpo.activo === "boolean") usuario.activo = cuerpo.activo;
    usuario.actualizadoEn = new Date().toISOString();

    return HttpResponse.json(usuarioAAudiencia(usuario));
  }),

  http.put(`${BASE}/v1/usuarios/:id/rol`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const usuario = buscarUsuario(String(params.id));
    if (!usuario) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });

    const cuerpo = (await request.json()) as { rol?: Rol };
    if (!cuerpo.rol || !ROLES_CATALOGO.includes(cuerpo.rol)) {
      return HttpResponse.json(
        cuerpoError("VALIDACION", "Selecciona un rol válido.", [
          { campo: "rol", codigo: "VALOR_NO_PERMITIDO", mensaje: "Selecciona un rol válido." },
        ]),
        { status: 400 },
      );
    }

    if (cuerpo.rol === usuario.rol) return HttpResponse.json(usuarioAAudiencia(usuario));

    if (usuario.rol === "ADMINISTRADOR") {
      const otrosAdminsActivos = usuarios.some((u) => u.rol === "ADMINISTRADOR" && u.activo && u.id !== usuario.id);
      if (!otrosAdminsActivos) {
        return HttpResponse.json(
          cuerpoError("ULTIMO_ADMINISTRADOR", "La plataforma debe conservar al menos un administrador activo."),
          { status: 409 },
        );
      }
    }
    if (usuario.rol === "QE") {
      const vigentes = analistasVigentesDe(usuario.id);
      if (vigentes.length > 0) {
        return HttpResponse.json(
          {
            ...cuerpoError("RELACIONES_INCOMPATIBLES", "Resuelve las relaciones de supervisión antes de continuar."),
            relaciones: { analistasVigentes: vigentes.map((r) => aUsuarioResumen(buscarUsuario(r.analistaId)!)), supervisorVigente: null },
          },
          { status: 409 },
        );
      }
    }
    if (usuario.rol === "ANALISTA_QA") {
      const relacion = supervisorVigenteDe(usuario.id);
      if (relacion) {
        return HttpResponse.json(
          {
            ...cuerpoError("RELACIONES_INCOMPATIBLES", "Resuelve las relaciones de supervisión antes de continuar."),
            relaciones: { analistasVigentes: [], supervisorVigente: aUsuarioResumen(buscarUsuario(relacion.qeId)!) },
          },
          { status: 409 },
        );
      }
    }

    usuario.rol = cuerpo.rol;
    usuario.actualizadoEn = new Date().toISOString();
    return HttpResponse.json(usuarioAAudiencia(usuario));
  }),

  // -------------------------------------------------------------- supervisión
  http.put(`${BASE}/v1/analistas/:id/supervisor`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const analista = buscarUsuario(String(params.id));
    if (!analista) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    if (analista.rol !== "ANALISTA_QA" || !analista.activo) {
      return HttpResponse.json(
        cuerpoError("SUPERVISION_INVALIDA", "El supervisor debe ser QE y el supervisado Analista QA, ambos activos.", [
          { campo: "id", codigo: "NO_PERMITIDO", mensaje: "El usuario indicado no es un Analista QA activo." },
        ]),
        { status: 422 },
      );
    }

    const cuerpo = (await request.json()) as { qeId?: string; motivo?: string };
    const qe = cuerpo.qeId ? buscarUsuario(cuerpo.qeId) : undefined;
    if (!qe || qe.rol !== "QE" || !qe.activo) {
      return HttpResponse.json(
        cuerpoError("SUPERVISION_INVALIDA", "El supervisor debe ser QE y el supervisado Analista QA, ambos activos.", [
          { campo: "qeId", codigo: "NO_PERMITIDO", mensaje: "El usuario indicado no es un QE activo." },
        ]),
        { status: 422 },
      );
    }

    const vigente = supervisorVigenteDe(analista.id);
    if (vigente && vigente.qeId === qe.id) {
      return HttpResponse.json({ cambio: false, vigente: mapearRelacion(vigente), anterior: null });
    }
    if (vigente && (!cuerpo.motivo || cuerpo.motivo.trim().length < 3)) {
      return HttpResponse.json(
        cuerpoError("MOTIVO_REQUERIDO", "Indica el motivo del cambio.", [
          { campo: "motivo", codigo: "REQUERIDO", mensaje: "El analista ya tiene un QE vigente; indica el motivo del cambio." },
        ]),
        { status: 422 },
      );
    }

    const ahora = new Date().toISOString();
    let anteriorMapeada = null;
    if (vigente) {
      vigente.hasta = ahora;
      anteriorMapeada = mapearRelacion(vigente);
    }
    const nueva = {
      id: crypto.randomUUID(),
      analistaId: analista.id,
      qeId: qe.id,
      desde: ahora,
      hasta: null,
      motivo: vigente ? (cuerpo.motivo ?? null) : null,
      registradoPorId: actor.id,
    };
    relacionesSupervision.push(nueva);

    return HttpResponse.json({ cambio: true, vigente: mapearRelacion(nueva), anterior: anteriorMapeada });
  }),

  http.get(`${BASE}/v1/analistas/:id/supervision/historial`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "ADMINISTRADOR");
    if (denegado) return denegado;

    const analista = buscarUsuario(String(params.id));
    if (!analista) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });

    const items = relacionesSupervision
      .filter((r) => r.analistaId === analista.id)
      .sort((a, b) => a.desde.localeCompare(b.desde))
      .map(mapearRelacion);

    return HttpResponse.json({ analista: aUsuarioResumen(analista), items });
  }),

  // --------------------------------------------------------------- catálogos
  http.get(`${BASE}/v1/catalogos/celulas`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return HttpResponse.json({ items: [...celulas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(aCatalogoRef) });
  }),

  http.get(`${BASE}/v1/catalogos/sprints`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return HttpResponse.json({ items: [...sprints].sort((a, b) => a.inicio.localeCompare(b.inicio)) });
  }),

  // -------------------------------------------------------------------- HDU
  http.get(`${BASE}/v1/hdu`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;

    const url = new URL(request.url);
    const celulaId = url.searchParams.get("celulaId");
    const sprintId = url.searchParams.get("sprintId");
    const estado = url.searchParams.get("estado") as EstadoHdu | null;
    const detalles: { campo: string; codigo: "FORMATO_INVALIDO" | "VALOR_NO_PERMITIDO"; mensaje: string }[] = [];
    if (celulaId && !UUID_RE.test(celulaId)) detalles.push({ campo: "query.celulaId", codigo: "FORMATO_INVALIDO", mensaje: "celulaId no es un UUID válido." });
    if (sprintId && !UUID_RE.test(sprintId)) detalles.push({ campo: "query.sprintId", codigo: "FORMATO_INVALIDO", mensaje: "sprintId no es un UUID válido." });
    if (estado && !(estado in TRANSICIONES_HDU)) detalles.push({ campo: "query.estado", codigo: "VALOR_NO_PERMITIDO", mensaje: "estado no es válido." });
    if (detalles.length > 0) return HttpResponse.json(cuerpoError("VALIDACION", "Los datos enviados no son válidos.", detalles), { status: 400 });

    const pagina = leerNumero(url.searchParams.get("pagina"), 1);
    const tamanoPagina = leerNumero(url.searchParams.get("tamanoPagina"), 20);

    let ambito = hdus.filter((hdu) => estaEnAmbito(hdu, actor));
    if (celulaId) ambito = ambito.filter((h) => h.celulaId === celulaId);
    if (sprintId) ambito = ambito.filter((h) => h.sprintId === sprintId);
    if (estado) ambito = ambito.filter((h) => h.estado === estado);
    ambito = [...ambito].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

    const pagina_ = paginar(ambito, pagina, tamanoPagina);
    return HttpResponse.json({ ...pagina_, items: pagina_.items.map(aHduResumen) });
  }),

  http.post(`${BASE}/v1/hdu`, async ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE");
    if (denegado) return denegado;

    const cuerpo = (await request.json()) as { codigo?: string; titulo?: string; celulaId?: string; sprintId?: string; prioridad?: string };
    const detalles: { campo: string; codigo: "REQUERIDO" | "FORMATO_INVALIDO"; mensaje: string }[] = [];
    const codigo = cuerpo.codigo?.trim() ?? "";
    const titulo = cuerpo.titulo?.trim() ?? "";
    if (!codigo) detalles.push({ campo: "codigo", codigo: "REQUERIDO", mensaje: "El código es obligatorio." });
    if (!titulo) detalles.push({ campo: "titulo", codigo: "REQUERIDO", mensaje: "El título es obligatorio." });
    if (!cuerpo.celulaId) detalles.push({ campo: "celulaId", codigo: "REQUERIDO", mensaje: "La célula es obligatoria." });
    if (!cuerpo.sprintId) detalles.push({ campo: "sprintId", codigo: "REQUERIDO", mensaje: "El sprint es obligatorio." });
    if (!cuerpo.prioridad) detalles.push({ campo: "prioridad", codigo: "REQUERIDO", mensaje: "La prioridad es obligatoria." });
    if (detalles.length > 0) return HttpResponse.json(cuerpoError("VALIDACION", "Los datos enviados no son válidos.", detalles), { status: 400 });

    const celulaExiste = celulas.some((c) => c.id === cuerpo.celulaId);
    const sprintExiste = sprints.some((s) => s.id === cuerpo.sprintId);
    if (!celulaExiste || !sprintExiste) {
      const detallesCatalogo: { campo: string; codigo: "NO_EXISTE"; mensaje: string }[] = [];
      if (!celulaExiste) detallesCatalogo.push({ campo: "celulaId", codigo: "NO_EXISTE", mensaje: "La célula indicada no existe." });
      if (!sprintExiste) detallesCatalogo.push({ campo: "sprintId", codigo: "NO_EXISTE", mensaje: "El sprint indicado no existe." });
      return HttpResponse.json(cuerpoError("CATALOGO_INVALIDO", "La célula o el sprint indicados no existen.", detallesCatalogo), { status: 422 });
    }

    if (hdus.some((h) => h.codigo.toLowerCase() === codigo.toLowerCase())) {
      return HttpResponse.json(
        cuerpoError("CODIGO_HDU_DUPLICADO", "Ya existe una HDU con ese identificador.", [
          { campo: "codigo", codigo: "DUPLICADO", mensaje: `Ya existe una HDU con el identificador ${codigo}.` },
        ]),
        { status: 409 },
      );
    }

    const ahora = new Date().toISOString();
    const nueva: HduMock = {
      id: crypto.randomUUID(),
      codigo,
      titulo,
      celulaId: cuerpo.celulaId!,
      sprintId: cuerpo.sprintId!,
      prioridad: cuerpo.prioridad as HduMock["prioridad"],
      estado: "PENDIENTE",
      estadoActualizadoEn: ahora,
      qeResponsableId: actor.id,
      analistaId: null,
      creadoPorId: actor.id,
      creadoEn: ahora,
    };
    hdus.push(nueva);
    eventosHdu.push({ hduId: nueva.id, tipo: "ESTADO", fecha: ahora, actorId: actor.id, estadoAnterior: null, estadoNuevo: "PENDIENTE" });

    return HttpResponse.json(construirHduDetalle(nueva, actor), { status: 201, headers: { Location: `/v1/hdu/${nueva.id}` } });
  }),

  http.get(`${BASE}/v1/hdu/:id`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;

    const hdu = hdus.find((h) => h.id === params.id);
    if (!hdu) {
      return actor.rol === "ADMINISTRADOR"
        ? HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 })
        : HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
    }
    if (!estaEnAmbito(hdu, actor)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });

    return HttpResponse.json({
      ...construirHduDetalle(hdu, actor),
      // D11: la fuente de checklist de Certificaciones siempre responde indisponible en esta corrida.
      checklist: { fuente: "certificaciones.checklist", estado: "indisponible" },
    });
  }),

  http.put(`${BASE}/v1/hdu/:id/analista`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const denegado = exigirRol(actor, "QE", "ADMINISTRADOR");
    if (denegado) return denegado;

    const hdu = hdus.find((h) => h.id === params.id);
    if (!hdu) return HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 });
    if (!puedeAsignarAnalista(hdu, actor)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
    if (hdu.estado === "CERRADA") return HttpResponse.json(cuerpoError("HDU_CERRADA", "La HDU está cerrada y no admite cambios."), { status: 409 });

    const cuerpo = (await request.json()) as { analistaId?: string; motivo?: string };
    const candidato = cuerpo.analistaId ? buscarUsuario(cuerpo.analistaId) : undefined;
    if (!candidato || candidato.rol !== "ANALISTA_QA" || !candidato.activo) {
      return HttpResponse.json(
        cuerpoError("ANALISTA_INVALIDO", "El analista debe tener rol Analista QA y estar activo.", [
          { campo: "analistaId", codigo: "NO_PERMITIDO", mensaje: "El analista debe tener rol Analista QA y estar activo." },
        ]),
        { status: 422 },
      );
    }
    if (actor.rol === "QE" && !analistaEnEquipoDe(actor.id, candidato.id)) {
      return HttpResponse.json(
        cuerpoError("ANALISTA_FUERA_DE_EQUIPO", "El analista no pertenece al equipo vigente del QE responsable.", [
          { campo: "analistaId", codigo: "NO_PERMITIDO", mensaje: "El analista no pertenece a tu equipo vigente." },
        ]),
        { status: 422 },
      );
    }
    if (hdu.analistaId && hdu.analistaId !== candidato.id && (!cuerpo.motivo || cuerpo.motivo.trim().length < 3)) {
      return HttpResponse.json(
        cuerpoError("MOTIVO_REQUERIDO", "Indica el motivo del cambio.", [
          { campo: "motivo", codigo: "REQUERIDO", mensaje: "La HDU ya tiene analista asignado; indica el motivo del cambio." },
        ]),
        { status: 422 },
      );
    }

    const anteriorId = hdu.analistaId;
    const ahora = new Date().toISOString();
    if (anteriorId === candidato.id) {
      return HttpResponse.json({
        cambio: false,
        hdu: aHduResumen(hdu),
        analistaAnterior: aUsuarioResumen(candidato),
        analistaNuevo: aUsuarioResumen(candidato),
        motivo: null,
        fecha: ahora,
        actor: { tipo: "USUARIO", id: actor.id, nombre: actor.nombre },
      });
    }

    hdu.analistaId = candidato.id;
    eventosHdu.push({
      hduId: hdu.id,
      tipo: "ASIGNACION",
      fecha: ahora,
      actorId: actor.id,
      analistaAnterior: anteriorId,
      analistaNuevo: candidato.id,
      motivo: cuerpo.motivo ?? null,
    });

    return HttpResponse.json({
      cambio: true,
      hdu: aHduResumen(hdu),
      analistaAnterior: anteriorId ? aUsuarioResumen(buscarUsuario(anteriorId)!) : null,
      analistaNuevo: aUsuarioResumen(candidato),
      motivo: cuerpo.motivo ?? null,
      fecha: ahora,
      actor: { tipo: "USUARIO", id: actor.id, nombre: actor.nombre },
    });
  }),

  http.post(`${BASE}/v1/hdu/:id/estado`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;

    const hdu = hdus.find((h) => h.id === params.id);
    if (!hdu) {
      return actor.rol === "ADMINISTRADOR"
        ? HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 })
        : HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
    }
    if (!puedeCambiarEstado(hdu, actor)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });

    const cuerpo = (await request.json()) as { estado?: EstadoHdu };
    const solicitado = cuerpo.estado;
    const permitidas = transicionesDesde(hdu.estado);
    if (!solicitado || !permitidas.includes(solicitado)) {
      return HttpResponse.json(
        {
          ...cuerpoError("TRANSICION_INVALIDA", "La HDU no puede pasar a ese estado."),
          estadoActual: hdu.estado,
          estadoSolicitado: solicitado ?? hdu.estado,
          transicionesPermitidas: permitidas,
        },
        { status: 409 },
      );
    }

    if (solicitado === "CERRADA") {
      // D11: el cierre exige el checklist completo; en esta corrida la fuente de
      // Certificaciones siempre está indisponible, salvo el escenario de prueba
      // `simularChecklistIncompleto`, que distingue ambos mensajes de rechazo.
      if (hdu.simularChecklistIncompleto) {
        return HttpResponse.json(
          {
            ...cuerpoError("CHECKLIST_INCOMPLETO", "No se puede cerrar la HDU: el checklist de entregables está incompleto."),
            checklist: {
              fuente: "certificaciones.checklist",
              estado: "ok",
              datos: { hduId: hdu.id, totalEntregables: 10, completados: 7, porcentajeCumplimiento: 70, completo: false },
            },
          },
          { status: 409 },
        );
      }
      return HttpResponse.json(
        {
          ...cuerpoError(
            "CHECKLIST_NO_DISPONIBLE",
            "No se puede cerrar la HDU: el checklist de entregables no está disponible para verificarse.",
          ),
          checklist: { fuente: "certificaciones.checklist", estado: "indisponible" },
        },
        { status: 409 },
      );
    }

    const anterior = hdu.estado;
    const ahora = new Date().toISOString();
    hdu.estado = solicitado;
    hdu.estadoActualizadoEn = ahora;
    eventosHdu.push({ hduId: hdu.id, tipo: "ESTADO", fecha: ahora, actorId: actor.id, estadoAnterior: anterior, estadoNuevo: solicitado });

    return HttpResponse.json({
      hdu: aHduResumen(hdu),
      estadoAnterior: anterior,
      estadoNuevo: solicitado,
      fecha: ahora,
      actor: { tipo: "USUARIO", id: actor.id, nombre: actor.nombre },
      transicionesPermitidas: transicionesDesde(solicitado),
    });
  }),

  http.get(`${BASE}/v1/hdu/:id/historial`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;

    const hdu = hdus.find((h) => h.id === params.id);
    if (!hdu) {
      return actor.rol === "ADMINISTRADOR"
        ? HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 })
        : HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
    }
    if (!estaEnAmbito(hdu, actor)) return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });

    const items = eventosHdu
      .filter((evento) => evento.hduId === hdu.id)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((evento) => {
        const actorEvento = { tipo: "USUARIO" as const, id: evento.actorId, nombre: buscarUsuario(evento.actorId)?.nombre ?? "Usuario" };
        if (evento.tipo === "ESTADO") {
          return {
            tipo: "ESTADO" as const,
            fecha: evento.fecha,
            actor: actorEvento,
            estadoAnterior: evento.estadoAnterior ?? null,
            estadoNuevo: evento.estadoNuevo!,
          };
        }
        return {
          tipo: "ASIGNACION" as const,
          fecha: evento.fecha,
          actor: actorEvento,
          analistaAnterior: evento.analistaAnterior ? aUsuarioResumen(buscarUsuario(evento.analistaAnterior)!) : null,
          analistaNuevo: aUsuarioResumen(buscarUsuario(evento.analistaNuevo!)!),
          motivo: evento.motivo ?? null,
        };
      });

    return HttpResponse.json({ hduId: hdu.id, items });
  }),
];

function contarPorEstado(items: HduMock[]) {
  const conteo = { PENDIENTE: 0, DISENO_PRUEBAS: 0, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 };
  for (const item of items) conteo[item.estado] += 1;
  return conteo;
}

function mapearRelacion(relacion: (typeof relacionesSupervision)[number]) {
  return {
    id: relacion.id,
    analista: aUsuarioResumen(buscarUsuario(relacion.analistaId)!),
    qe: aUsuarioResumen(buscarUsuario(relacion.qeId)!),
    desde: relacion.desde,
    hasta: relacion.hasta,
    motivo: relacion.motivo,
    registradoPor: { tipo: "USUARIO" as const, id: relacion.registradoPorId, nombre: buscarUsuario(relacion.registradoPorId)?.nombre ?? "Usuario" },
  };
}
