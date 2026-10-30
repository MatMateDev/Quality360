// MSW de E4 (impedimentos y riesgos) según `contracts/impedimentos.v1.yaml` y los esquemas del gateway.
// El servidor decide qué se puede hacer (D75): `permisos` y `operacionesPermitidas` salen de la relación del
// usuario con la HDU (matriz 3.6 del backlog E4). Nada de esto se usa como fuente de datos del portal real.
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import {
  ETIQUETAS_TIPO_IMPEDIMENTO,
  TIPOS_IMPEDIMENTO,
  type CodigoFactorRiesgo,
  type EstadoImpedimento,
  type FactorRiesgo,
  type NivelRiesgo,
  type OperacionImpedimento,
  type Rol,
  type TipoImpedimento,
} from "@/types/dominio";
import { autenticar, esUsuarioMock, exigirRol } from "./comun";
import { buscarUsuario, celulas, hdus, relacionesSupervision, sprints, supervisorVigenteDe, usuarios, type HduMock, type UsuarioMock } from "./data";
import {
  accionesMock,
  diasHastaFinSprint,
  impedimentosMock,
  riesgosMock,
  type AccionMock,
  type ImpedimentoMock,
  type RiesgoFijadoMock,
} from "./dataE4";
import { celulasLider, celulasVigentesDe, fuentes, seguimientoDe } from "./dataE7";
import { ERROR_ACCESO_DENEGADO, ERROR_NO_ENCONTRADO, aCatalogoRef, cuerpoError, leerNumero, paginar } from "./utils";

const BASE = env.gatewayUrl;
const MS_DIA = 86_400_000;
const UMBRAL_DIAS_ANTIGUO = 5;

type Respuesta = HttpResponse<any>;
export type Relacion = "ANALISTA_ASIGNADO" | "QE_RESPONSABLE" | "QE_SUPERVISOR" | "LIDER" | "ADMINISTRADOR" | "AUDITOR" | null;

const ORDEN_NIVEL: Record<string, number> = { ALTO: 0, MEDIO: 1, BAJO: 2 };
const PESO_NIVEL: Record<NivelRiesgo, number> = { BAJO: 0, MEDIO: 1, ALTO: 2 };

// ------------------------------------------------------------------ relaciones y permisos

export function relacionCon(actor: UsuarioMock, hdu: HduMock): Relacion {
  switch (actor.rol) {
    case "ADMINISTRADOR":
      return "ADMINISTRADOR";
    case "AUDITOR":
      return "AUDITOR";
    case "LIDER_QA":
      return celulasVigentesDe(actor.id).includes(hdu.celulaId) ? "LIDER" : null;
    case "ANALISTA_QA":
      return hdu.analistaId === actor.id ? "ANALISTA_ASIGNADO" : null;
    default: {
      if (hdu.qeResponsableId === actor.id) return "QE_RESPONSABLE";
      const supervisa = relacionesSupervision.some((r) => r.qeId === actor.id && r.hasta === null && r.analistaId === hdu.analistaId);
      return supervisa ? "QE_SUPERVISOR" : null;
    }
  }
}

const cerrada = (h: HduMock) => h.estado === "CERRADA";

export function permisosDe(rel: Relacion, hdu: HduMock, actor: UsuarioMock) {
  const abierta = !cerrada(hdu);
  return {
    puedeRegistrar: abierta && (rel === "ANALISTA_ASIGNADO" || rel === "QE_RESPONSABLE"),
    puedeGestionar: abierta && rel === "QE_RESPONSABLE",
    puedeVerRiesgo: actor.rol !== "ANALISTA_QA",
    puedeFijarRiesgo: abierta && rel === "QE_RESPONSABLE",
  };
}

function denegado(): Respuesta {
  return HttpResponse.json(ERROR_ACCESO_DENEGADO(), { status: 403 });
}

function servicioNoDisponible(): Respuesta {
  return HttpResponse.json(cuerpoError("SERVICIO_NO_DISPONIBLE", "El servicio no está disponible. Intenta nuevamente."), { status: 503 });
}

/** HDU inexistente o fuera de ámbito: 404 para Administrador y Auditor, 403 para el resto (D50). */
function sinAcceso(actor: UsuarioMock, existe: boolean): Respuesta {
  return actor.rol === "ADMINISTRADOR" || actor.rol === "AUDITOR"
    ? existe
      ? denegado()
      : HttpResponse.json(ERROR_NO_ENCONTRADO(), { status: 404 })
    : denegado();
}

// ------------------------------------------------------------------ impedimentos

const abiertosDe = (hduId: string) => impedimentosMock.filter((i) => i.hduId === hduId && i.estado !== "RESUELTO");

function diasEntre(desde: string, hasta: number = Date.now()): number {
  return Math.max(0, Math.floor((hasta - new Date(desde).getTime()) / MS_DIA));
}

function diasAbierto(i: ImpedimentoMock): number {
  return diasEntre(i.abiertoDesde, i.fechaResolucion ? new Date(i.fechaResolucion).getTime() : Date.now());
}

const esNuevo = (i: ImpedimentoMock) => i.estado !== "RESUELTO" && Date.now() - new Date(i.fechaRegistro).getTime() < MS_DIA;

function persona(id: string) {
  const u = buscarUsuario(id);
  return { id, nombre: u?.nombre ?? "Usuario" };
}

function personaRol(id: string, rol: Rol) {
  return { ...persona(id), rol: buscarUsuario(id)?.rol ?? rol };
}

function responsableDe(i: ImpedimentoMock) {
  return { id: i.responsableId, nombre: i.responsableNombre, externo: i.responsableId === null };
}

function operacionesDe(i: ImpedimentoMock, puedeGestionar: boolean): OperacionImpedimento[] {
  if (!puedeGestionar) return [];
  return i.estado === "RESUELTO" ? ["REABRIR"] : ["RESOLVER", "ESCALAR", "SEGUIMIENTO"];
}

export function aImpedimento(i: ImpedimentoMock, puedeGestionar: boolean) {
  return {
    id: i.id,
    hduId: i.hduId,
    certificacionId: null,
    tipo: i.tipo,
    titulo: i.titulo,
    descripcion: i.descripcion,
    estado: i.estado,
    responsable: responsableDe(i),
    creadoPor: personaRol(i.creadoPorId, i.creadoPorRol),
    fechaRegistro: i.fechaRegistro,
    abiertoDesde: i.abiertoDesde,
    fechaResolucion: i.fechaResolucion,
    diasAbierto: diasAbierto(i),
    esNuevo: esNuevo(i),
    actualizadoEn: accionesMock.filter((a) => a.impedimentoId === i.id).map((a) => a.fecha).sort().at(-1) ?? i.fechaRegistro,
    operacionesPermitidas: operacionesDe(i, puedeGestionar),
  };
}

function hduReferencia(h: HduMock) {
  return { id: h.id, codigo: h.codigo, titulo: h.titulo, estado: h.estado };
}

/** Orden D74: abiertos y escalados primero (más antiguos arriba), luego resueltos (más reciente arriba). */
function ordenarBasico(items: ImpedimentoMock[]): ImpedimentoMock[] {
  return [...items].sort((a, b) => {
    const ra = a.estado === "RESUELTO" ? 1 : 0;
    const rb = b.estado === "RESUELTO" ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.abiertoDesde.localeCompare(b.abiertoDesde);
    return (b.fechaResolucion ?? "").localeCompare(a.fechaResolucion ?? "");
  });
}

function aAccion(a: AccionMock) {
  const actor = buscarUsuario(a.actorId);
  return {
    id: a.id,
    impedimentoId: a.impedimentoId,
    tipo: a.tipo,
    estadoAnterior: a.estadoAnterior,
    estado: a.estado,
    actor: { id: a.actorId, nombre: actor?.nombre ?? "Usuario", rol: actor?.rol ?? "QE" },
    fecha: a.fecha,
    comentario: a.comentario,
    detalle: a.detalle
      ? {
          responsableAnterior: { id: a.detalle.anterior.id, nombre: a.detalle.anterior.nombre, externo: a.detalle.anterior.id === null },
          responsableNuevo: { id: a.detalle.nuevo.id, nombre: a.detalle.nuevo.nombre, externo: a.detalle.nuevo.id === null },
        }
      : null,
  };
}

function resumenBloqueo(hduId: string) {
  const n = abiertosDe(hduId).length;
  return { bloqueada: n > 0, abiertos: n };
}

// ------------------------------------------------------------------ riesgo

function fechaMasDias(dias: number): string {
  return new Date(Date.now() + dias * MS_DIA).toISOString().slice(0, 10);
}

export interface CalculoRiesgo {
  factores: FactorRiesgo[];
  noEvaluados: CodigoFactorRiesgo[];
  sugerido: NivelRiesgo | null;
  estado: "ok" | "indisponible";
  calculoParcial: boolean;
  motivoSinSugerencia: "HDU_CERRADA" | "FUENTE_NO_DISPONIBLE" | null;
}

/** D67/D68/D90: nivel sugerido = máximo de los factores; con el avance caído, ALTO parcial o «No disponible». */
export function calcularRiesgo(hdu: HduMock): CalculoRiesgo {
  if (cerrada(hdu)) {
    return { factores: [], noEvaluados: [], sugerido: null, estado: "ok", calculoParcial: false, motivoSinSugerencia: "HDU_CERRADA" };
  }
  const factores: FactorRiesgo[] = [];
  const noEvaluados: CodigoFactorRiesgo[] = [];
  const abiertos = abiertosDe(hdu.id);
  if (abiertos.length > 0) factores.push({ codigo: "IMPEDIMENTO_ABIERTO", nivel: "MEDIO", detalle: { impedimentos: abiertos.length } });
  const antiguo = abiertos
    .filter((i) => i.estado === "ABIERTO")
    .sort((a, b) => diasAbierto(b) - diasAbierto(a))
    .find((i) => diasAbierto(i) >= UMBRAL_DIAS_ANTIGUO);
  if (antiguo) {
    factores.push({
      codigo: "IMPEDIMENTO_ANTIGUO",
      nivel: "ALTO",
      detalle: { impedimentoId: antiguo.id, diasAbierto: diasAbierto(antiguo), umbralDias: UMBRAL_DIAS_ANTIGUO },
    });
  }
  const escalados = abiertos.filter((i) => i.estado === "ESCALADO");
  if (escalados.length > 0) factores.push({ codigo: "IMPEDIMENTO_ESCALADO", nivel: "ALTO", detalle: { impedimentos: escalados.length } });

  const dias = diasHastaFinSprint[hdu.id];
  if (dias !== undefined) {
    const sprint = aCatalogoRef(sprints.find((s) => s.id === hdu.sprintId)!);
    const sprintFin = fechaMasDias(dias);
    if (dias < 0) {
      factores.push({ codigo: "SPRINT_VENCIDO", nivel: "ALTO", detalle: { sprint, sprintFin, diasRestantes: dias } });
    } else if (!fuentes.certificaciones) {
      if (dias <= 3) noEvaluados.push("ATRASO_SPRINT_ALTO");
      if (dias <= 7) noEvaluados.push("ATRASO_SPRINT_MEDIO");
    } else {
      const avance = seguimientoDe(hdu.id).aprobados * 10;
      if (dias <= 3 && avance < 70) {
        factores.push({ codigo: "ATRASO_SPRINT_ALTO", nivel: "ALTO", detalle: { sprint, sprintFin, diasRestantes: dias, umbralDias: 3, avance, umbralAvance: 70 } });
      } else if (dias <= 7 && avance < 50) {
        factores.push({ codigo: "ATRASO_SPRINT_MEDIO", nivel: "MEDIO", detalle: { sprint, sprintFin, diasRestantes: dias, umbralDias: 7, avance, umbralAvance: 50 } });
      }
    }
  }
  factores.sort((a, b) => PESO_NIVEL[b.nivel] - PESO_NIVEL[a.nivel]);
  const maximo = factores[0]?.nivel ?? null;
  if (noEvaluados.length === 0) {
    return { factores, noEvaluados, sugerido: maximo ?? "BAJO", estado: "ok", calculoParcial: false, motivoSinSugerencia: null };
  }
  if (maximo === "ALTO") return { factores, noEvaluados, sugerido: "ALTO", estado: "ok", calculoParcial: true, motivoSinSugerencia: null };
  return { factores, noEvaluados, sugerido: null, estado: "indisponible", calculoParcial: false, motivoSinSugerencia: "FUENTE_NO_DISPONIBLE" };
}

const fijadoDe = (hduId: string): RiesgoFijadoMock | undefined =>
  riesgosMock.filter((r) => r.hduId === hduId).sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1);

export function resumenRiesgo(hdu: HduMock) {
  const fijado = fijadoDe(hdu.id);
  const calculo = calcularRiesgo(hdu);
  if (fijado) return { nivelVigente: fijado.nivel, origen: "MANUAL" as const, estado: "ok" as const, calculoParcial: false };
  if (cerrada(hdu)) return { nivelVigente: null, origen: null, estado: "ok" as const, calculoParcial: false };
  if (calculo.estado === "indisponible") return { nivelVigente: null, origen: null, estado: "indisponible" as const, calculoParcial: false };
  return { nivelVigente: calculo.sugerido, origen: "SUGERIDO" as const, estado: "ok" as const, calculoParcial: calculo.calculoParcial };
}

function cuerpoRiesgo(hdu: HduMock, rel: Relacion, actor: UsuarioMock) {
  const calculo = calcularRiesgo(hdu);
  const fijado = fijadoDe(hdu.id);
  const resumen = resumenRiesgo(hdu);
  return {
    hduId: hdu.id,
    hduCerrada: cerrada(hdu),
    nivelVigente: resumen.nivelVigente,
    origen: resumen.origen,
    fijado: fijado
      ? {
          nivel: fijado.nivel,
          nivelAnterior: fijado.nivelAnterior,
          justificacion: fijado.justificacion,
          sugeridoAlFijar: fijado.sugeridoAlFijar,
          actor: personaRol(fijado.actorId, "QE"),
          fecha: fijado.fecha,
        }
      : null,
    nivelSugerido: calculo.sugerido,
    estado: calculo.estado,
    motivoSinSugerencia: calculo.motivoSinSugerencia,
    calculoParcial: calculo.calculoParcial,
    factores: calculo.factores,
    factoresNoEvaluados: calculo.noEvaluados,
    sugerenciaDistinta: Boolean(fijado && calculo.sugerido && fijado.nivel !== calculo.sugerido),
    fechaReferencia: fechaMasDias(0),
    permisos: { puedeFijarRiesgo: permisosDe(rel, hdu, actor).puedeFijarRiesgo },
  };
}

// ------------------------------------------------------------------ candidatos de responsable

function candidatos(hdu: HduMock, proposito: "REGISTRO" | "ESCALAMIENTO") {
  const ids: string[] = [];
  if (proposito === "REGISTRO") {
    ids.push(hdu.qeResponsableId);
    const sup = hdu.analistaId ? supervisorVigenteDe(hdu.analistaId) : undefined;
    if (sup && !ids.includes(sup.qeId)) ids.push(sup.qeId);
  } else {
    for (const c of celulasLider) if (c.celulaId === hdu.celulaId && c.hasta === null) ids.push(c.usuarioId);
    for (const u of usuarios) if (u.rol === "ADMINISTRADOR" && u.activo) ids.push(u.id);
  }
  return [...new Set(ids)].filter((id) => buscarUsuario(id)?.activo).map((id) => personaRol(id, "QE"));
}

// ------------------------------------------------------------------ bloques de bandeja (D87)

const FUENTE_IMP = "impedimentos.impedimentos";
const FUENTE_RIESGO = "impedimentos.riesgo";

function contador(valor: number) {
  return fuentes.impedimentos ? { fuente: FUENTE_IMP, estado: "ok" as const, datos: { valor } } : { fuente: FUENTE_IMP, estado: "indisponible" as const };
}

/** Contador `hduRiesgoAlto`: `indisponible` si alguna HDU del ámbito no tiene su riesgo calculable (nunca cuenta de menos). */
function contadorRiesgoAlto(ambito: HduMock[]) {
  if (!fuentes.impedimentos) return { fuente: FUENTE_RIESGO, estado: "indisponible" as const };
  const noCerradas = ambito.filter((h) => !cerrada(h));
  const resumenes = noCerradas.map(resumenRiesgo);
  if (resumenes.some((r) => r.estado === "indisponible")) return { fuente: FUENTE_RIESGO, estado: "indisponible" as const };
  return { fuente: FUENTE_RIESGO, estado: "ok" as const, datos: { valor: resumenes.filter((r) => r.nivelVigente === "ALTO").length } };
}

export function bloqueoFila(hduId: string) {
  return fuentes.impedimentos
    ? { fuente: FUENTE_IMP, estado: "ok" as const, datos: resumenBloqueo(hduId) }
    : { fuente: FUENTE_IMP, estado: "indisponible" as const };
}

export function riesgoFila(hdu: HduMock) {
  return fuentes.impedimentos
    ? { fuente: FUENTE_RIESGO, estado: "ok" as const, datos: resumenRiesgo(hdu) }
    : { fuente: FUENTE_RIESGO, estado: "indisponible" as const };
}

/** HDU con impedimentos abiertos, para el filtro `soloBloqueadas`. */
export function hduBloqueadasIds(): Set<string> {
  return new Set(impedimentosMock.filter((i) => i.estado !== "RESUELTO").map((i) => i.hduId));
}

function itemBandeja(i: ImpedimentoMock, actor: UsuarioMock) {
  const hdu = hdus.find((h) => h.id === i.hduId)!;
  const analista = hdu.analistaId ? buscarUsuario(hdu.analistaId) : undefined;
  return {
    id: i.id,
    hdu: hduReferencia(hdu),
    celula: aCatalogoRef(celulas.find((c) => c.id === hdu.celulaId)!),
    analista: analista ? { id: analista.id, nombre: analista.nombre, correo: analista.correo } : null,
    tipo: i.tipo,
    titulo: i.titulo,
    estado: i.estado as "ABIERTO" | "ESCALADO",
    responsable: responsableDe(i),
    creadoPor: personaRol(i.creadoPorId, i.creadoPorRol),
    diasAbierto: diasAbierto(i),
    fechaRegistro: i.fechaRegistro,
    esNuevo: esNuevo(i),
    escaladoAMi: i.estado === "ESCALADO" && i.responsableId === actor.id,
    riesgo: resumenRiesgo(hdu),
  };
}

function listaBandeja(items: ImpedimentoMock[], actor: UsuarioMock, limite: number, escaladosPrimero = false) {
  if (!fuentes.impedimentos) return { fuente: FUENTE_IMP, estado: "indisponible" as const };
  const filas = ordenD74(items, actor).map((i) => itemBandeja(i, actor));
  if (escaladosPrimero) filas.sort((a, b) => Number(b.escaladoAMi) - Number(a.escaladoAMi));
  return { fuente: FUENTE_IMP, estado: "ok" as const, datos: { items: filas.slice(0, limite), total: filas.length } };
}

/** Bloque `impedimentos` de cada bandeja. `ambito` = HDU que le corresponden al usuario en esa bandeja. */
export function bloqueImpedimentosBandeja(actor: UsuarioMock, ambito: HduMock[]) {
  const ids = new Set(ambito.map((h) => h.id));
  const abiertos = impedimentosMock.filter((i) => ids.has(i.hduId) && i.estado !== "RESUELTO");
  const bloqueadas = new Set(abiertos.map((i) => i.hduId)).size;
  switch (actor.rol) {
    case "ANALISTA_QA":
      return { contadores: { impedimentosAbiertos: contador(abiertos.length) } };
    case "QE":
      return {
        contadores: {
          impedimentosAbiertos: contador(abiertos.length),
          impedimentosNuevos: contador(abiertos.filter(esNuevo).length),
          hduRiesgoAlto: contadorRiesgoAlto(ambito),
        },
        lista: listaBandeja(abiertos, actor, 10),
      };
    case "LIDER_QA":
      return {
        contadores: {
          impedimentosAbiertos: contador(abiertos.length),
          hduBloqueadas: contador(bloqueadas),
          escaladosAMi: contador(abiertos.filter((i) => i.estado === "ESCALADO" && i.responsableId === actor.id).length),
        },
        lista: listaBandeja(abiertos, actor, 50, true),
      };
    case "ADMINISTRADOR": {
      const aMi = abiertos.filter((i) => i.estado === "ESCALADO" && i.responsableId === actor.id).sort((a, b) => a.abiertoDesde.localeCompare(b.abiertoDesde));
      return {
        contadores: { impedimentosAbiertos: contador(abiertos.length), hduBloqueadas: contador(bloqueadas), hduRiesgoAlto: contadorRiesgoAlto(ambito) },
        escalados: fuentes.impedimentos
          ? { fuente: FUENTE_IMP, estado: "ok" as const, datos: { items: aMi.slice(0, 50).map((i) => itemBandeja(i, actor)), total: aMi.length } }
          : { fuente: FUENTE_IMP, estado: "indisponible" as const },
      };
    }
    default:
      return { contadores: { impedimentosAbiertos: contador(abiertos.length), hduBloqueadas: contador(bloqueadas) } };
  }
}

// ------------------------------------------------------------------ ámbito y listado (E4-F02)

function ambitoDe(actor: UsuarioMock): HduMock[] {
  return hdus.filter((h) => relacionCon(actor, h) !== null);
}

/** Orden D74: abiertos primero, luego riesgo vigente (Alto, Medio, Bajo) y días abiertos; con el riesgo caído, solo días. */
function ordenD74(items: ImpedimentoMock[], _actor: UsuarioMock): ImpedimentoMock[] {
  const nivelDe = (i: ImpedimentoMock) => {
    const r = resumenRiesgo(hdus.find((h) => h.id === i.hduId)!);
    return r.nivelVigente ? ORDEN_NIVEL[r.nivelVigente]! : 3;
  };
  return [...items].sort((a, b) => {
    const ra = a.estado === "RESUELTO" ? 1 : 0;
    const rb = b.estado === "RESUELTO" ? 1 : 0;
    if (ra !== rb) return ra - rb;
    if (fuentes.certificaciones) {
      const n = nivelDe(a) - nivelDe(b);
      if (n !== 0) return n;
    }
    return diasAbierto(b) - diasAbierto(a);
  });
}

function parametrosLista(url: URL) {
  const g = (k: string) => url.searchParams.get(k);
  return {
    estado: g("estado") as EstadoImpedimento | null,
    tipo: g("tipo") as TipoImpedimento | null,
    celulaId: g("celulaId"),
    analistaId: g("analistaId"),
    riesgo: g("riesgo") as NivelRiesgo | null,
    q: g("q")?.trim().toLowerCase() ?? "",
    incluirResueltos: g("incluirResueltos") === "true",
    orden: g("orden"),
  };
}

function listarImpedimentos(actor: UsuarioMock, url: URL): Respuesta {
  if (actor.rol === "ANALISTA_QA") return denegado();
  if (!fuentes.impedimentos) return servicioNoDisponible();
  const p = parametrosLista(url);
  if (p.riesgo && !fuentes.certificaciones) return servicioNoDisponible();
  const ambito = ambitoDe(actor);
  const ids = new Set(ambito.map((h) => h.id));
  if (actor.rol === "LIDER_QA" && p.celulaId && !celulasVigentesDe(actor.id).includes(p.celulaId)) return denegado();
  const delAmbito = impedimentosMock.filter((i) => ids.has(i.hduId));
  const abiertos = delAmbito.filter((i) => i.estado !== "RESUELTO");

  let filtrados = delAmbito.filter((i) => p.incluirResueltos || p.estado === "RESUELTO" || i.estado !== "RESUELTO");
  if (p.estado) filtrados = filtrados.filter((i) => i.estado === p.estado);
  if (p.tipo) filtrados = filtrados.filter((i) => i.tipo === p.tipo);
  if (p.celulaId) filtrados = filtrados.filter((i) => hdus.find((h) => h.id === i.hduId)!.celulaId === p.celulaId);
  if (p.analistaId) filtrados = filtrados.filter((i) => hdus.find((h) => h.id === i.hduId)!.analistaId === p.analistaId);
  if (p.riesgo) filtrados = filtrados.filter((i) => resumenRiesgo(hdus.find((h) => h.id === i.hduId)!).nivelVigente === p.riesgo);
  if (p.q.length >= 2) {
    filtrados = filtrados.filter((i) => {
      const h = hdus.find((x) => x.id === i.hduId)!;
      return h.codigo.toLowerCase().includes(p.q) || h.titulo.toLowerCase().includes(p.q) || i.titulo.toLowerCase().includes(p.q);
    });
  }

  let ordenAplicado = "riesgo:desc";
  let ordenados = ordenD74(filtrados, actor);
  if (!fuentes.certificaciones) ordenAplicado = "diasAbierto:desc";
  const [columna, direccion] = (p.orden ?? "").split(":");
  if (columna === "diasAbierto" || columna === "fechaRegistro") {
    const signo = direccion === "asc" ? 1 : -1;
    ordenAplicado = `${columna}:${direccion === "asc" ? "asc" : "desc"}`;
    ordenados = [...filtrados].sort((a, b) =>
      columna === "diasAbierto" ? signo * (diasAbierto(a) - diasAbierto(b)) : signo * a.fechaRegistro.localeCompare(b.fechaRegistro),
    );
  } else if (columna === "riesgo") {
    const signo = direccion === "asc" ? -1 : 1;
    ordenAplicado = fuentes.certificaciones ? `riesgo:${direccion === "asc" ? "asc" : "desc"}` : "diasAbierto:desc";
    if (fuentes.certificaciones) {
      ordenados = [...ordenD74(filtrados, actor)];
      if (signo === -1) ordenados.reverse();
    }
  }

  const pagina = leerNumero(url.searchParams.get("pagina"), 1);
  const tamano = Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100);
  const pag = paginar(ordenados, pagina, tamano);
  return HttpResponse.json({
    ...pag,
    items: pag.items.map((i) => {
      const hdu = hdus.find((h) => h.id === i.hduId)!;
      const rel = relacionCon(actor, hdu);
      const analista = hdu.analistaId ? persona(hdu.analistaId) : null;
      return {
        ...aImpedimento(i, rel === "QE_RESPONSABLE" && !cerrada(hdu)),
        hdu: hduReferencia(hdu),
        celula: aCatalogoRef(celulas.find((c) => c.id === hdu.celulaId)!),
        analista,
        qeResponsable: persona(hdu.qeResponsableId),
        riesgo: resumenRiesgo(hdu),
        soloLectura: rel !== "QE_RESPONSABLE",
      };
    }),
    orden: ordenAplicado,
    contadores: {
      abiertos: abiertos.length,
      escalados: abiertos.filter((i) => i.estado === "ESCALADO").length,
      nuevos: abiertos.filter(esNuevo).length,
    },
  });
}

// ------------------------------------------------------------------ riesgo por HDU (E4-F04#3)

function listarRiesgo(actor: UsuarioMock, url: URL): Respuesta {
  if (actor.rol === "ANALISTA_QA") return denegado();
  if (!fuentes.impedimentos) return servicioNoDisponible();
  const g = (k: string) => url.searchParams.get(k);
  const nivel = g("nivel") as NivelRiesgo | null;
  if (nivel && !fuentes.certificaciones) return servicioNoDisponible();
  const estado = g("estado");
  const q = g("q")?.trim().toLowerCase() ?? "";
  let lista = ambitoDe(actor).filter((h) => (estado ? h.estado === estado : h.estado !== "CERRADA"));
  if (g("celulaId")) lista = lista.filter((h) => h.celulaId === g("celulaId"));
  if (g("sprintId")) lista = lista.filter((h) => h.sprintId === g("sprintId"));
  if (g("analistaId")) lista = lista.filter((h) => h.analistaId === g("analistaId"));
  if (g("soloBloqueadas") === "true") lista = lista.filter((h) => abiertosDe(h.id).length > 0);
  if (q.length >= 2) lista = lista.filter((h) => h.codigo.toLowerCase().includes(q) || h.titulo.toLowerCase().includes(q));
  if (nivel) lista = lista.filter((h) => resumenRiesgo(h).nivelVigente === nivel);

  const nivelDe = (h: HduMock) => {
    const n = resumenRiesgo(h).nivelVigente;
    return n ? ORDEN_NIVEL[n]! : 3;
  };
  const [columna, direccion] = (g("orden") ?? "riesgo:desc").split(":");
  const signo = direccion === "asc" ? -1 : 1;
  lista = [...lista].sort((a, b) => {
    if (columna === "codigo") return -signo * a.codigo.localeCompare(b.codigo);
    if (columna === "impedimentosAbiertos") return signo * (abiertosDe(b.id).length - abiertosDe(a.id).length);
    const n = signo * (nivelDe(a) - nivelDe(b));
    return n !== 0 ? n : abiertosDe(b.id).length - abiertosDe(a.id).length || a.codigo.localeCompare(b.codigo);
  });

  const pagina = leerNumero(g("pagina"), 1);
  const tamano = Math.min(leerNumero(g("tamanoPagina"), 25), 100);
  const pag = paginar(lista, pagina, tamano);
  return HttpResponse.json({
    ...pag,
    orden: g("orden") ?? "riesgo:desc",
    items: pag.items.map((h) => {
      const fijado = fijadoDe(h.id);
      const abiertos = abiertosDe(h.id).length;
      return {
        hdu: hduReferencia(h),
        celula: aCatalogoRef(celulas.find((c) => c.id === h.celulaId)!),
        sprint: aCatalogoRef(sprints.find((s) => s.id === h.sprintId)!),
        analista: h.analistaId ? persona(h.analistaId) : null,
        qeResponsable: persona(h.qeResponsableId),
        avance: fuentes.certificaciones ? seguimientoDe(h.id).aprobados * 10 : null,
        impedimentosAbiertos: abiertos,
        bloqueada: abiertos > 0,
        riesgo: resumenRiesgo(h),
        actualizadoEn: fijado?.fecha ?? null,
        soloLectura: relacionCon(actor, h) !== "QE_RESPONSABLE",
      };
    }),
  });
}

// ------------------------------------------------------------------ historial de gestión y Auditor

function entradasGestion() {
  const deImpedimento = accionesMock.map((a) => {
    const imp = impedimentosMock.find((i) => i.id === a.impedimentoId)!;
    const hdu = hdus.find((h) => h.id === imp.hduId)!;
    return {
      id: a.id,
      tipo: "IMPEDIMENTO" as const,
      accion: a.tipo,
      hdu: hduReferencia(hdu),
      impedimento: { id: imp.id, titulo: imp.titulo, tipo: imp.tipo },
      actor: personaRol(a.actorId, "QE"),
      fecha: a.fecha,
      anterior: a.estadoAnterior,
      nuevo: a.estado,
      comentario: a.comentario,
      sugeridoAlFijar: null,
      detalle: aAccion(a).detalle,
      estadoImpedimento: a.estado,
      tipoImpedimento: imp.tipo,
    };
  });
  const deRiesgo = riesgosMock.map((r) => ({
    id: r.id,
    tipo: "RIESGO" as const,
    accion: "FIJAR_RIESGO" as const,
    hdu: hduReferencia(hdus.find((h) => h.id === r.hduId)!),
    impedimento: null,
    actor: personaRol(r.actorId, "QE"),
    fecha: r.fecha,
    anterior: r.nivelAnterior,
    nuevo: r.nivel,
    comentario: r.justificacion,
    sugeridoAlFijar: r.sugeridoAlFijar,
    detalle: null,
    estadoImpedimento: null,
    tipoImpedimento: null,
  }));
  return [...deImpedimento, ...deRiesgo];
}

function limpiarEntrada<T extends { estadoImpedimento: unknown; tipoImpedimento: unknown }>(e: T) {
  const { estadoImpedimento: _e, tipoImpedimento: _t, ...resto } = e;
  return resto;
}

function enRango(fechaIso: string, url: URL): boolean {
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");
  const dia = fechaIso.slice(0, 10);
  return (!desde || dia >= desde) && (!hasta || dia <= hasta);
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

function filtrarImpedimentosAuditor(url: URL) {
  const g = (k: string) => url.searchParams.get(k);
  const q = g("q")?.trim().toLowerCase() ?? "";
  return impedimentosMock
    .filter((i) => enRango(i.fechaRegistro, url))
    .filter((i) => !g("hduId") || i.hduId === g("hduId"))
    .filter((i) => !g("estado") || i.estado === g("estado"))
    .filter((i) => !g("tipo") || i.tipo === g("tipo"))
    .filter((i) => {
      if (q.length < 2) return true;
      const h = hdus.find((x) => x.id === i.hduId)!;
      return h.codigo.toLowerCase().includes(q) || h.titulo.toLowerCase().includes(q) || i.titulo.toLowerCase().includes(q);
    })
    .sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro));
}

function filtrarGestionAuditor(url: URL) {
  const g = (k: string) => url.searchParams.get(k);
  return entradasGestion()
    .filter((e) => enRango(e.fecha, url))
    .filter((e) => !g("hduId") || e.hdu.id === g("hduId"))
    .filter((e) => !g("actorId") || e.actor.id === g("actorId"))
    .filter((e) => !g("estado") || e.estadoImpedimento === g("estado"))
    .filter((e) => !g("tipo") || e.tipoImpedimento === g("tipo"))
    .filter((e) => !g("accion") || e.accion === g("accion"))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ------------------------------------------------------------------ cierre (D60, D77)

/** Verificación de impedimentos al cerrar una HDU: 409 `HDU_BLOQUEADA` con total, o 503 con `impedimentos` indisponible. */
export function verificarImpedimentosCierre(hduId: string): Respuesta | null {
  if (!fuentes.impedimentos) {
    return HttpResponse.json(
      {
        ...cuerpoError("SERVICIO_NO_DISPONIBLE", "No pudimos verificar los impedimentos de la HDU."),
        impedimentos: { fuente: FUENTE_IMP, estado: "indisponible" },
      },
      { status: 503 },
    );
  }
  const abiertos = abiertosDe(hduId).sort((a, b) => a.abiertoDesde.localeCompare(b.abiertoDesde));
  if (abiertos.length === 0) return null;
  return HttpResponse.json(
    {
      ...cuerpoError("HDU_BLOQUEADA", "No se puede cerrar la HDU: tiene impedimentos abiertos o escalados."),
      impedimentos: {
        total: abiertos.length,
        items: abiertos.slice(0, 20).map((i) => ({ id: i.id, titulo: i.titulo, tipo: i.tipo, estado: i.estado, diasAbierto: diasAbierto(i) })),
      },
    },
    { status: 409 },
  );
}

// ------------------------------------------------------------------ validación de acciones

function validacion(campo: string, codigo: string, mensaje: string): Respuesta {
  return HttpResponse.json(cuerpoError("VALIDACION", mensaje, [{ campo, codigo: codigo as "REQUERIDO", mensaje }]), { status: 400 });
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function descripcionMinima(tipo: TipoImpedimento): number {
  return tipo === "OTRO" ? 20 : 10;
}

function resolverResponsable(
  hdu: HduMock,
  proposito: "REGISTRO" | "ESCALAMIENTO",
  cuerpo: { responsableId?: unknown; responsableNombre?: unknown },
): { id: string | null; nombre: string } | Respuesta {
  const id = texto(cuerpo.responsableId);
  const nombre = texto(cuerpo.responsableNombre);
  if (id && nombre) return validacion("responsableNombre", "NO_PERMITIDO", "Indica el responsable por id o por nombre, no ambos.");
  if (!id && !nombre) return validacion("responsableNombre", "REQUERIDO", "Indica quién debe resolverlo.");
  if (id) {
    const candidato = candidatos(hdu, proposito).find((c) => c.id === id);
    if (!candidato) return HttpResponse.json(cuerpoError("RESPONSABLE_INVALIDO", "El responsable indicado no está entre los candidatos de esta HDU."), { status: 422 });
    return { id: candidato.id, nombre: candidato.nombre };
  }
  if (nombre.length < 3 || nombre.length > 150) return validacion("responsableNombre", "LONGITUD_INVALIDA", "El nombre del responsable debe tener entre 3 y 150 caracteres.");
  return { id: null, nombre };
}

function registrarAccion(imp: ImpedimentoMock, actor: UsuarioMock, tipo: AccionMock["tipo"], estado: EstadoImpedimento, comentario: string, detalle: AccionMock["detalle"] = null): AccionMock {
  const accion: AccionMock = {
    id: crypto.randomUUID(),
    impedimentoId: imp.id,
    tipo,
    estadoAnterior: imp.estado,
    estado,
    actorId: actor.id,
    fecha: new Date().toISOString(),
    comentario,
    detalle,
  };
  accionesMock.push(accion);
  return accion;
}

function tomarImpedimento(id: string, actor: UsuarioMock): { imp: ImpedimentoMock; hdu: HduMock; rel: Relacion } | Respuesta {
  const imp = impedimentosMock.find((i) => i.id === id);
  if (!imp) return sinAcceso(actor, false);
  const hdu = hdus.find((h) => h.id === imp.hduId)!;
  const rel = relacionCon(actor, hdu);
  if (rel === null) return sinAcceso(actor, true);
  return { imp, hdu, rel };
}

function conflictoTransicion(imp: ImpedimentoMock, operacion: OperacionImpedimento): Respuesta {
  return HttpResponse.json(
    {
      ...cuerpoError("TRANSICION_INVALIDA", "El impedimento no admite esa operación en su estado actual."),
      estadoActual: imp.estado,
      operacion,
      operacionesPermitidas: operacionesDe(imp, true),
    },
    { status: 409 },
  );
}

const hduCerradaError = () => HttpResponse.json(cuerpoError("HDU_CERRADA", "La HDU ya está cerrada y no admite cambios."), { status: 409 });

function respuestaAccion(imp: ImpedimentoMock, accion: AccionMock): Respuesta {
  return HttpResponse.json({ impedimento: aImpedimento(imp, true), accion: aAccion(accion), hdu: resumenBloqueo(imp.hduId) });
}

// ------------------------------------------------------------------ handlers

export const handlersE4 = [
  http.get(`${BASE}/v1/catalogos/tipos-impedimento`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return HttpResponse.json({
      items: TIPOS_IMPEDIMENTO.map((codigo) => ({ codigo, etiqueta: ETIQUETAS_TIPO_IMPEDIMENTO[codigo], descripcionMinima: descripcionMinima(codigo) })),
    });
  }),

  http.get(`${BASE}/v1/hdu/:id/impedimentos`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    const rel = hdu ? relacionCon(actor, hdu) : null;
    if (!hdu || rel === null) return sinAcceso(actor, Boolean(hdu));
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const permisos = permisosDe(rel, hdu, actor);
    const items = ordenarBasico(impedimentosMock.filter((i) => i.hduId === hdu.id));
    const abiertos = items.filter((i) => i.estado !== "RESUELTO");
    return HttpResponse.json({
      hduId: hdu.id,
      hduCerrada: cerrada(hdu),
      bloqueada: abiertos.length > 0,
      abiertos: items.filter((i) => i.estado === "ABIERTO").length,
      escalados: items.filter((i) => i.estado === "ESCALADO").length,
      resueltos: items.filter((i) => i.estado === "RESUELTO").length,
      permisos,
      items: items.map((i) => aImpedimento(i, permisos.puedeGestionar)),
    });
  }),

  http.get(`${BASE}/v1/hdu/:id/impedimentos/responsables`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    const rel = hdu ? relacionCon(actor, hdu) : null;
    if (!hdu || rel === null) return sinAcceso(actor, Boolean(hdu));
    if (rel !== "ANALISTA_ASIGNADO" && rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const proposito = new URL(request.url).searchParams.get("proposito");
    if (proposito !== "REGISTRO" && proposito !== "ESCALAMIENTO") return validacion("proposito", "VALOR_NO_PERMITIDO", "El propósito debe ser REGISTRO o ESCALAMIENTO.");
    return HttpResponse.json({
      hduId: hdu.id,
      proposito,
      items: candidatos(hdu, proposito),
      preseleccionadoId: proposito === "REGISTRO" ? hdu.qeResponsableId : null,
    });
  }),

  http.post(`${BASE}/v1/hdu/:id/impedimentos`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    const rel = hdu ? relacionCon(actor, hdu) : null;
    if (!hdu || rel === null) return sinAcceso(actor, Boolean(hdu));
    if (rel !== "ANALISTA_ASIGNADO" && rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const cuerpo = (await request.json()) as Record<string, unknown>;
    const tipo = cuerpo.tipo as TipoImpedimento;
    if (!TIPOS_IMPEDIMENTO.includes(tipo)) return validacion("tipo", "VALOR_NO_PERMITIDO", "Selecciona un tipo.");
    const titulo = texto(cuerpo.titulo);
    if (titulo.length < 5 || titulo.length > 200) return validacion("titulo", "LONGITUD_INVALIDA", "El título debe tener entre 5 y 200 caracteres.");
    const descripcion = texto(cuerpo.descripcion);
    if (descripcion.length < descripcionMinima(tipo) || descripcion.length > 1000) {
      return validacion("descripcion", "LONGITUD_INVALIDA", `La descripción debe tener entre ${descripcionMinima(tipo)} y 1000 caracteres.`);
    }
    if (cerrada(hdu)) return hduCerradaError();
    const responsable = resolverResponsable(hdu, "REGISTRO", cuerpo);
    if (responsable instanceof HttpResponse) return responsable;
    const ahora = new Date().toISOString();
    const imp: ImpedimentoMock = {
      id: crypto.randomUUID(),
      hduId: hdu.id,
      tipo,
      titulo,
      descripcion,
      estado: "ABIERTO",
      responsableId: responsable.id,
      responsableNombre: responsable.nombre,
      creadoPorId: actor.id,
      creadoPorRol: actor.rol === "QE" ? "QE" : "ANALISTA_QA",
      fechaRegistro: ahora,
      abiertoDesde: ahora,
      fechaResolucion: null,
    };
    impedimentosMock.push(imp);
    const accion: AccionMock = {
      id: crypto.randomUUID(),
      impedimentoId: imp.id,
      tipo: "REGISTRAR",
      estadoAnterior: null,
      estado: "ABIERTO",
      actorId: actor.id,
      fecha: ahora,
      comentario: "Registro del impedimento",
      detalle: null,
    };
    accionesMock.push(accion);
    const permisos = permisosDe(rel, hdu, actor);
    return HttpResponse.json(
      {
        ...aImpedimento(imp, permisos.puedeGestionar),
        hdu: hduReferencia(hdu),
        hduCerrada: false,
        permisos,
        acciones: [aAccion(accion)],
      },
      { status: 201 },
    );
  }),

  http.get(`${BASE}/v1/impedimentos`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return listarImpedimentos(actor, new URL(request.url));
  }),

  http.get(`${BASE}/v1/impedimentos/:id`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const tomado = tomarImpedimento(String(params.id), actor);
    if (tomado instanceof HttpResponse) return tomado;
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const { imp, hdu, rel } = tomado;
    const permisos = permisosDe(rel, hdu, actor);
    return HttpResponse.json({
      ...aImpedimento(imp, permisos.puedeGestionar),
      hdu: hduReferencia(hdu),
      hduCerrada: cerrada(hdu),
      permisos,
      acciones: accionesMock.filter((a) => a.impedimentoId === imp.id).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(aAccion),
    });
  }),

  http.post(`${BASE}/v1/impedimentos/:id/resolver`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const tomado = tomarImpedimento(String(params.id), actor);
    if (tomado instanceof HttpResponse) return tomado;
    const { imp, hdu, rel } = tomado;
    if (rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const cuerpo = (await request.json()) as Record<string, unknown>;
    if (cerrada(hdu)) return hduCerradaError();
    const comentario = texto(cuerpo.comentario);
    if (comentario.length < 3 || comentario.length > 500) {
      return HttpResponse.json(cuerpoError("COMENTARIO_REQUERIDO", "Indica la acción tomada."), { status: 422 });
    }
    if (imp.estado === "RESUELTO") return conflictoTransicion(imp, "RESOLVER");
    const accion = registrarAccion(imp, actor, "RESOLVER", "RESUELTO", comentario);
    imp.estado = "RESUELTO";
    imp.fechaResolucion = accion.fecha;
    return respuestaAccion(imp, accion);
  }),

  http.post(`${BASE}/v1/impedimentos/:id/escalar`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const tomado = tomarImpedimento(String(params.id), actor);
    if (tomado instanceof HttpResponse) return tomado;
    const { imp, hdu, rel } = tomado;
    if (rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const cuerpo = (await request.json()) as Record<string, unknown>;
    if (cerrada(hdu)) return hduCerradaError();
    const comentario = texto(cuerpo.comentario);
    if (comentario.length < 3 || comentario.length > 500) {
      return HttpResponse.json(cuerpoError("COMENTARIO_REQUERIDO", "Indica por qué lo escalas."), { status: 422 });
    }
    const destino = resolverResponsable(hdu, "ESCALAMIENTO", cuerpo);
    if (destino instanceof HttpResponse) return destino;
    if (imp.estado === "RESUELTO") return conflictoTransicion(imp, "ESCALAR");
    if ((destino.id !== null && destino.id === imp.responsableId) || (destino.id === null && imp.responsableId === null && destino.nombre === imp.responsableNombre)) {
      return HttpResponse.json(cuerpoError("RESPONSABLE_INVALIDO", "El impedimento ya está a cargo de esa persona."), { status: 422 });
    }
    const anterior = { id: imp.responsableId, nombre: imp.responsableNombre };
    const accion = registrarAccion(imp, actor, "ESCALAR", "ESCALADO", comentario, { anterior, nuevo: destino });
    imp.estado = "ESCALADO";
    imp.responsableId = destino.id;
    imp.responsableNombre = destino.nombre;
    return respuestaAccion(imp, accion);
  }),

  http.post(`${BASE}/v1/impedimentos/:id/reabrir`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const tomado = tomarImpedimento(String(params.id), actor);
    if (tomado instanceof HttpResponse) return tomado;
    const { imp, hdu, rel } = tomado;
    if (rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const cuerpo = (await request.json()) as Record<string, unknown>;
    if (cerrada(hdu)) return hduCerradaError();
    const motivo = texto(cuerpo.motivo);
    if (motivo.length < 3 || motivo.length > 500) return HttpResponse.json(cuerpoError("MOTIVO_REQUERIDO", "Indica el motivo."), { status: 422 });
    if (imp.estado !== "RESUELTO") return conflictoTransicion(imp, "REABRIR");
    const accion = registrarAccion(imp, actor, "REABRIR", "ABIERTO", motivo);
    imp.estado = "ABIERTO";
    imp.fechaResolucion = null;
    imp.abiertoDesde = accion.fecha;
    return respuestaAccion(imp, accion);
  }),

  http.post(`${BASE}/v1/impedimentos/:id/seguimiento`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const tomado = tomarImpedimento(String(params.id), actor);
    if (tomado instanceof HttpResponse) return tomado;
    const { imp, hdu, rel } = tomado;
    if (rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const cuerpo = (await request.json()) as Record<string, unknown>;
    if (cerrada(hdu)) return hduCerradaError();
    const comentario = texto(cuerpo.comentario);
    if (comentario.length < 3 || comentario.length > 500) {
      return HttpResponse.json(cuerpoError("COMENTARIO_REQUERIDO", "Escribe el seguimiento."), { status: 422 });
    }
    if (imp.estado === "RESUELTO") return conflictoTransicion(imp, "SEGUIMIENTO");
    const accion = registrarAccion(imp, actor, "SEGUIMIENTO", imp.estado, comentario);
    return respuestaAccion(imp, accion);
  }),

  http.get(`${BASE}/v1/hdu/:id/riesgo`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    const rel = hdu ? relacionCon(actor, hdu) : null;
    if (!hdu || rel === null) return sinAcceso(actor, Boolean(hdu));
    if (actor.rol === "ANALISTA_QA") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    return HttpResponse.json(cuerpoRiesgo(hdu, rel, actor));
  }),

  http.put(`${BASE}/v1/hdu/:id/riesgo`, async ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    const rel = hdu ? relacionCon(actor, hdu) : null;
    if (!hdu || rel === null) return sinAcceso(actor, Boolean(hdu));
    if (rel !== "QE_RESPONSABLE") return denegado();
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const cuerpo = (await request.json()) as Record<string, unknown>;
    const nivel = cuerpo.nivel as NivelRiesgo;
    if (!["ALTO", "MEDIO", "BAJO"].includes(nivel)) return validacion("nivel", "VALOR_NO_PERMITIDO", "Elige un nivel.");
    if (cerrada(hdu)) return hduCerradaError();
    const justificacion = texto(cuerpo.justificacion);
    if (justificacion.length === 0) return HttpResponse.json(cuerpoError("JUSTIFICACION_REQUERIDA", "La justificación es obligatoria."), { status: 422 });
    if (justificacion.length > 500) return validacion("justificacion", "LONGITUD_INVALIDA", "Máximo 500 caracteres.");
    const previo = fijadoDe(hdu.id);
    const cambio = !(previo && previo.nivel === nivel && previo.justificacion === justificacion);
    if (cambio) {
      riesgosMock.push({
        id: crypto.randomUUID(),
        hduId: hdu.id,
        nivel,
        nivelAnterior: previo?.nivel ?? null,
        justificacion,
        sugeridoAlFijar: calcularRiesgo(hdu).sugerido,
        actorId: actor.id,
        fecha: new Date().toISOString(),
      });
    }
    return HttpResponse.json({ cambio, riesgo: cuerpoRiesgo(hdu, rel, actor) });
  }),

  http.get(`${BASE}/v1/riesgo/hdu`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    return listarRiesgo(actor, new URL(request.url));
  }),

  http.get(`${BASE}/v1/hdu/:id/gestion-impedimentos`, ({ request, params }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const hdu = hdus.find((h) => h.id === params.id);
    const rel = hdu ? relacionCon(actor, hdu) : null;
    if (!hdu || rel === null) return sinAcceso(actor, Boolean(hdu));
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo");
    const orden = url.searchParams.get("orden") === "fecha:asc" ? "fecha:asc" : "fecha:desc";
    const items = entradasGestion()
      .filter((e) => e.hdu.id === hdu.id)
      // D82: el Analista no ve el riesgo; si lo pide, recibe solo entradas de impedimentos.
      .filter((e) => actor.rol !== "ANALISTA_QA" || e.tipo === "IMPEDIMENTO")
      .filter((e) => !tipo || e.tipo === tipo)
      .sort((a, b) => (orden === "fecha:asc" ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha)))
      .map(limpiarEntrada);
    return HttpResponse.json({ hduId: hdu.id, orden, items });
  }),

  http.get(`${BASE}/v1/auditor/impedimentos`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const sin = exigirRol(actor, "AUDITOR");
    if (sin) return sin;
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const url = new URL(request.url);
    const pag = paginar(filtrarImpedimentosAuditor(url), leerNumero(url.searchParams.get("pagina"), 1), Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100));
    return HttpResponse.json({
      ...pag,
      items: pag.items.map((i) => ({ ...aImpedimento(i, false), hdu: hduReferencia(hdus.find((h) => h.id === i.hduId)!) })),
    });
  }),

  http.get(`${BASE}/v1/auditor/gestion-impedimentos`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const sin = exigirRol(actor, "AUDITOR");
    if (sin) return sin;
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const url = new URL(request.url);
    const pag = paginar(filtrarGestionAuditor(url), leerNumero(url.searchParams.get("pagina"), 1), Math.min(leerNumero(url.searchParams.get("tamanoPagina"), 25), 100));
    return HttpResponse.json({ ...pag, items: pag.items.map(limpiarEntrada) });
  }),

  http.get(`${BASE}/v1/auditor/exportaciones/impedimentos`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const sin = exigirRol(actor, "AUDITOR");
    if (sin) return sin;
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const filas = filtrarImpedimentosAuditor(new URL(request.url));
    return csv(
      "quality360-impedimentos-2026-10-26.csv",
      filas.map((i) => [i.fechaRegistro, hdus.find((h) => h.id === i.hduId)!.codigo, i.titulo, i.estado]),
      ["fechaRegistro", "hdu", "titulo", "estado"],
    );
  }),

  http.get(`${BASE}/v1/auditor/exportaciones/gestion-impedimentos`, ({ request }) => {
    const actor = autenticar(request);
    if (!esUsuarioMock(actor)) return actor;
    const sin = exigirRol(actor, "AUDITOR");
    if (sin) return sin;
    if (!fuentes.impedimentos) return servicioNoDisponible();
    const filas = filtrarGestionAuditor(new URL(request.url));
    return csv(
      "quality360-gestion-impedimentos-2026-10-26.csv",
      filas.map((e) => [e.fecha, e.hdu.codigo, e.tipo, e.accion]),
      ["fecha", "hdu", "tipo", "accion"],
    );
  }),
];
