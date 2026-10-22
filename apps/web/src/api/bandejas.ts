import { useQuery } from "@tanstack/react-query";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { http } from "@/lib/httpClient";
import {
  ESTADOS_HDU,
  ETIQUETAS_ACCION_BITACORA,
  ETIQUETAS_OPERACION,
  type AccionChecklist,
  type BandejaAdmin,
  type BandejaAnalista,
  type BandejaAuditor,
  type BandejaLider,
  type BandejaQe,
  type OperacionAuditoriaUsuarios,
  type PaginaAuditoriaUsuarios,
  type PaginaBitacoraGlobal,
  type PaginaCertificadosAuditoria,
  type TipoAccionQe,
} from "@/types/dominio";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNAS_ORDEN = ["codigo", "celula", "sprint", "prioridad", "estado", "avance", "actualizada", "fecha"];
const TIPOS_ACCION: TipoAccionQe[] = ["APROBAR", "ASIGNAR", "CERTIFICAR", "CERRAR"];

type Conversion = (valor: string) => string | undefined;
const uuid: Conversion = (v) => (UUID_RE.test(v) ? v : undefined);
const fecha: Conversion = (v) => (FECHA_RE.test(v) ? v : undefined);
const entre =
  (validos: readonly string[]): Conversion =>
  (v) =>
    validos.includes(v) ? v : undefined;
const verdadero: Conversion = (v) => (v === "1" ? "true" : undefined);

/**
 * Parámetros de la URL del portal -> parámetros del API (D49). La URL usa `celula`, `tamano`…; el API,
 * `celulaId`, `tamanoPagina`… Un parámetro inválido se ignora sin error (diseño §1.4).
 */
const CONVERSIONES: Record<string, [parametroApi: string, convertir: Conversion]> = {
  estado: ["estado", entre(ESTADOS_HDU)],
  celula: ["celulaId", uuid],
  sprint: ["sprintId", uuid],
  qe: ["qeId", uuid],
  analista: ["analistaId", uuid],
  tipo: ["tipoAccion", entre(TIPOS_ACCION)],
  "solo-obs": ["soloConObservaciones", verdadero],
  "sin-analista": ["sinAnalista", verdadero],
  certificado: ["certificado", entre(["con", "sin"])],
  desde: ["desde", fecha],
  hasta: ["hasta", fecha],
  q: ["q", (v) => (v.trim().length >= 2 ? v.trim() : undefined)],
  hdu: ["hduId", uuid],
  actor: ["actorId", uuid],
  accion: ["accion", entre(Object.keys(ETIQUETAS_ACCION_BITACORA))],
  operacion: ["operacion", entre(Object.keys(ETIQUETAS_OPERACION))],
  usuario: ["usuarioAfectadoId", uuid],
  emisor: ["emitidoPorId", uuid],
};

export interface OpcionesQuery {
  /** Claves de la URL que esta consulta entiende. */
  claves: string[];
  /** Si es falso no se envían `orden`, `pagina` ni `tamanoPagina` (exportaciones). */
  paginar?: boolean;
  /** Columnas de orden aceptadas por el API de esta consulta; vacío = no admite `orden`. */
  ordenables?: string[];
}

/** Construye el `?query` del API desde los filtros de la URL. */
export function aQueryApi(filtros: FiltrosUrl | null, opciones: OpcionesQuery): string {
  if (!filtros) return "";
  const params = new URLSearchParams();
  for (const clave of opciones.claves) {
    const conversion = CONVERSIONES[clave];
    const valor = filtros.get(clave);
    if (!conversion || !valor) continue;
    const convertido = conversion[1](valor);
    if (convertido) params.set(conversion[0], convertido);
  }
  if (opciones.paginar !== false) {
    const orden = filtros.orden;
    const validas = opciones.ordenables ?? [];
    if (orden && validas.includes(orden.columna) && COLUMNAS_ORDEN.includes(orden.columna)) {
      params.set("orden", `${orden.columna}:${orden.direccion}`);
    }
    if (filtros.pagina > 1) params.set("pagina", String(filtros.pagina));
    if (filtros.tamano !== 25) params.set("tamanoPagina", String(Math.min(filtros.tamano, 100)));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

const ORDEN_HDU = COLUMNAS_ORDEN;

export const CLAVES_ANALISTA = ["estado", "celula", "sprint", "solo-obs", "q"];
export const CLAVES_QE = ["tipo", "celula", "sprint", "analista", "q"];
export const CLAVES_LIDER = ["celula", "sprint", "estado", "qe", "analista", "sin-analista", "q"];
export const CLAVES_AUDITOR_HDU = ["celula", "sprint", "estado", "qe", "analista", "certificado", "desde", "hasta", "q"];
export const CLAVES_CERTIFICADOS = ["desde", "hasta", "emisor", "q"];
export const CLAVES_BITACORA = ["desde", "hasta", "hdu", "actor", "accion"];
export const CLAVES_AUDITORIA = ["desde", "hasta", "actor", "operacion", "usuario"];

export function useBandejaAnalista(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_ANALISTA, ordenables: ORDEN_HDU });
  return useQuery({ queryKey: ["bandeja", "analista", query], queryFn: () => http.get<BandejaAnalista>(`/v1/bandeja/analista${query}`) });
}

export function useBandejaQe(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_QE });
  return useQuery({ queryKey: ["bandeja", "qe", query], queryFn: () => http.get<BandejaQe>(`/v1/bandeja/qe${query}`) });
}

export function useBandejaLider(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_LIDER, ordenables: ORDEN_HDU });
  return useQuery({ queryKey: ["bandeja", "lider", query], queryFn: () => http.get<BandejaLider>(`/v1/bandeja/lider${query}`) });
}

/** `pagina` y `tamano` paginan «Pendientes de configuración» (DEF-10); el resto de la bandeja no cambia. */
export function useBandejaAdmin(pagina = 1, tamano = 25) {
  const query = new URLSearchParams();
  if (pagina > 1) query.set("pagina", String(pagina));
  if (tamano !== 25) query.set("tamanoPagina", String(Math.min(tamano, 100)));
  const texto = query.toString();
  return useQuery({
    queryKey: ["bandeja", "admin", pagina, tamano],
    queryFn: () => http.get<BandejaAdmin>(`/v1/bandeja/admin${texto ? `?${texto}` : ""}`),
    placeholderData: (anterior) => anterior,
  });
}

/** `filtros = null` pide la bandeja sin filtros (contadores globales del Auditor, que no dependen de la pestaña). */
export function useBandejaAuditor(filtros: FiltrosUrl | null) {
  const query = aQueryApi(filtros, { claves: CLAVES_AUDITOR_HDU, ordenables: ORDEN_HDU });
  return useQuery({ queryKey: ["bandeja", "auditor", query], queryFn: () => http.get<BandejaAuditor>(`/v1/bandeja/auditor${query}`) });
}

export interface CatalogoAuditor {
  hdus: Array<readonly [id: string, codigo: string]>;
  /** QE responsables y analistas de esas HDU: los actores posibles de la bitácora de checklist. */
  actores: Array<readonly [id: string, nombre: string]>;
}

const PAGINAS_CATALOGO_MAXIMAS = 30;

/**
 * Catálogo completo de HDU y actores del Auditor (DEF-04). El contrato no trae un catálogo para este rol, así que
 * se recorre `GET /v1/bandeja/auditor` (tamanoPagina=100) hasta cubrir el total; así los filtros de la bitácora no
 * dependen de la página cargada. Si falla, los filtros siguen con lo que ya aparece en las filas.
 */
export function useCatalogoAuditor() {
  return useQuery({
    queryKey: ["auditor", "catalogo"],
    staleTime: 60_000,
    retry: 0,
    queryFn: async (): Promise<CatalogoAuditor> => {
      const hdus = new Map<string, string>();
      const actores = new Map<string, string>();
      for (let pagina = 1; pagina <= PAGINAS_CATALOGO_MAXIMAS; pagina += 1) {
        const bandeja = await http.get<BandejaAuditor>(`/v1/bandeja/auditor?tamanoPagina=100&pagina=${pagina}`);
        if (bandeja.hdu.estado !== "ok") break;
        const { items, total } = bandeja.hdu.datos;
        for (const h of items) {
          hdus.set(h.id, h.codigo);
          actores.set(h.qeResponsable.id, h.qeResponsable.nombre);
          if (h.analista) actores.set(h.analista.id, h.analista.nombre);
        }
        if (items.length === 0 || hdus.size >= total) break;
      }
      return { hdus: [...hdus.entries()], actores: [...actores.entries()] };
    },
  });
}

export function useCertificadosAuditor(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_CERTIFICADOS });
  return useQuery({ queryKey: ["auditor", "certificados", query], queryFn: () => http.get<PaginaCertificadosAuditoria>(`/v1/auditor/certificados${query}`) });
}

export function useBitacoraAuditor(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_BITACORA });
  return useQuery({ queryKey: ["auditor", "bitacora", query], queryFn: () => http.get<PaginaBitacoraGlobal>(`/v1/auditor/bitacora${query}`) });
}

export function useAuditoriaUsuarios(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_AUDITORIA });
  return useQuery({
    queryKey: ["auditor", "auditoria-usuarios", query],
    queryFn: () => http.get<PaginaAuditoriaUsuarios>(`/v1/auditor/auditoria-usuarios${query}`),
  });
}

export type RecursoExportable = "hdu" | "certificados" | "bitacora" | "auditoria-usuarios";

const CLAVES_EXPORTACION: Record<RecursoExportable, string[]> = {
  hdu: CLAVES_AUDITOR_HDU,
  certificados: CLAVES_CERTIFICADOS,
  bitacora: CLAVES_BITACORA,
  "auditoria-usuarios": CLAVES_AUDITORIA,
};

/** Ruta del CSV con los mismos filtros de la pestaña (exporta todo lo filtrado, no solo la página visible). */
export function rutaExportacion(recurso: RecursoExportable, filtros: FiltrosUrl): string {
  return `/v1/auditor/exportaciones/${recurso}${aQueryApi(filtros, { claves: CLAVES_EXPORTACION[recurso], paginar: false })}`;
}

export type { AccionChecklist, OperacionAuditoriaUsuarios };
