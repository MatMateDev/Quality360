import type {
  CatalogoRef,
  ErrorApiCuerpo,
  EstadoHdu,
  HduResumen,
  UsuarioResumen,
} from "@/types/dominio";
import { TRANSICIONES_HDU } from "@/types/dominio";
import {
  buscarUsuario,
  celulas,
  sprints,
  type CelulaMock,
  type HduMock,
  type SprintMock,
  type UsuarioMock,
} from "./data";

export const PREFIJO_TOKEN_MOCK = "mock-token:";

export function decodificarToken(encabezado: string | null): UsuarioMock | undefined {
  if (!encabezado?.startsWith("Bearer ")) return undefined;
  const token = encabezado.slice("Bearer ".length);
  if (!token.startsWith(PREFIJO_TOKEN_MOCK)) return undefined;
  const id = token.slice(PREFIJO_TOKEN_MOCK.length);
  return buscarUsuario(id);
}

export function cuerpoError(
  codigo: ErrorApiCuerpo["codigo"],
  mensaje: string,
  detalles: ErrorApiCuerpo["detalles"] = [],
): ErrorApiCuerpo {
  return { codigo, mensaje, traceId: crypto.randomUUID().replace(/-/g, ""), detalles };
}

export const ERROR_NO_AUTENTICADO = () => cuerpoError("NO_AUTENTICADO", "Debes iniciar sesión.");
export const ERROR_ACCESO_DENEGADO = () => cuerpoError("ACCESO_DENEGADO", "No tienes acceso a este recurso.");
export const ERROR_NO_ENCONTRADO = () => cuerpoError("NO_ENCONTRADO", "El recurso solicitado no existe.");

export function aUsuarioResumen(usuario: UsuarioMock): UsuarioResumen {
  return { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
}

export function aCatalogoRef(item: CelulaMock | SprintMock): CatalogoRef {
  return { id: item.id, nombre: item.nombre };
}

export function celulaDe(id: string) {
  return celulas.find((celula) => celula.id === id)!;
}

export function sprintDe(id: string) {
  return sprints.find((sprint) => sprint.id === id)!;
}

export function aHduResumen(hdu: HduMock): HduResumen {
  const qeResponsable = buscarUsuario(hdu.qeResponsableId)!;
  const analista = hdu.analistaId ? buscarUsuario(hdu.analistaId) : undefined;
  return {
    id: hdu.id,
    codigo: hdu.codigo,
    titulo: hdu.titulo,
    celula: aCatalogoRef(celulaDe(hdu.celulaId)),
    sprint: aCatalogoRef(sprintDe(hdu.sprintId)),
    prioridad: hdu.prioridad,
    estado: hdu.estado,
    estadoActualizadoEn: hdu.estadoActualizadoEn,
    qeResponsable: aUsuarioResumen(qeResponsable),
    analista: analista ? aUsuarioResumen(analista) : null,
    creadoEn: hdu.creadoEn,
  };
}

export function transicionesDesde(estado: EstadoHdu): EstadoHdu[] {
  return TRANSICIONES_HDU[estado];
}

/** Ámbito de HDU por rol (E2-B03): analista ve las suyas, QE las de su responsabilidad o su equipo, admin todas. */
export function estaEnAmbitoHdu(hdu: HduMock, usuario: UsuarioMock, analistasDelQe: (qeId: string) => string[]): boolean {
  if (usuario.rol === "ADMINISTRADOR") return true;
  if (usuario.rol === "ANALISTA_QA") return hdu.analistaId === usuario.id;
  if (usuario.rol === "QE") {
    if (hdu.qeResponsableId === usuario.id) return true;
    return analistasDelQe(usuario.id).includes(hdu.analistaId ?? "");
  }
  return false;
}

export function paginar<T>(items: T[], pagina: number, tamanoPagina: number) {
  const inicio = (pagina - 1) * tamanoPagina;
  return {
    items: items.slice(inicio, inicio + tamanoPagina),
    total: items.length,
    pagina,
    tamanoPagina,
  };
}

export function leerNumero(valor: string | null, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : porDefecto;
}
