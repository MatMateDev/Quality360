import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { ErrorApi, http } from "@/lib/httpClient";
import type {
  Ejecucion,
  EstadoIntegracion,
  ConfiguracionJira,
  ListaPersonas,
  ListaSprints,
  PaginaEjecuciones,
  PaginaEventosConfiguracionJira,
  PaginaFilasEjecucion,
  ResultadoFila,
  ResultadoGuardadoJira,
  ResultadoPruebaJira,
  SolicitudArchivo,
  SolicitudConfiguracionJira,
  SolicitudPruebaJira,
  VistaPreviaArchivo,
} from "@/types/dominio";

const BASE = "/v1/integraciones";

/** Código que solo existe en el portal (D115): la respuesta de una escritura no llegó. */
export const SIN_RESPUESTA = "SIN_RESPUESTA";

/**
 * D115: tras un POST de sincronización o importación, un error de red, un timeout, un 502, un 504 o un 503
 * `SERVICIO_NO_DISPONIBLE` no dicen si la operación se completó. El cliente HTTP ya convierte un fallo de red en
 * 503 `SERVICIO_NO_DISPONIBLE`; una respuesta de error sin JSON (HTML del proxy) llega como `ErrorApi` genérico.
 */
export function esSinRespuesta(error: unknown): boolean {
  if (error instanceof ErrorApi) return error.status === 502 || error.status === 504 || (error.status === 503 && error.codigo === "SERVICIO_NO_DISPONIBLE");
  return error instanceof TypeError || error instanceof SyntaxError || (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"));
}

/** Código a mostrar para un error de escritura: `SIN_RESPUESTA` (solo portal) o el del servidor. */
export function codigoDeEscritura(error: unknown): string {
  if (esSinRespuesta(error)) return SIN_RESPUESTA;
  return error instanceof ErrorApi ? error.codigo : "ERROR_INTERNO";
}

/** Una fuente caída al leer (503 `SERVICIO_NO_DISPONIBLE`) es «indisponible», no un error (diseño §9.2). */
export function esIndisponible(error: unknown): boolean {
  return error instanceof ErrorApi && error.status === 503 && error.codigo === "SERVICIO_NO_DISPONIBLE";
}

// ------------------------------------------------------------------ conexión

export function useConfiguracionJira() {
  return useQuery({
    queryKey: ["integraciones", "configuracion"],
    queryFn: () => http.get<ConfiguracionJira>(`${BASE}/jira/configuracion`),
    retry: false,
  });
}

export function useEventosConfiguracion() {
  return useQuery({
    queryKey: ["integraciones", "eventos-configuracion"],
    queryFn: () => http.get<PaginaEventosConfiguracionJira>(`${BASE}/jira/configuracion/eventos?tamanoPagina=10`),
    retry: false,
  });
}

/** Sprints de una célula (D120). Sin célula elegida no hay consulta. */
export function useSprintsDeCelula(celulaId: string) {
  return useQuery({
    queryKey: ["sprints", "celula", celulaId],
    queryFn: () => http.get<ListaSprints>(`/v1/catalogos/sprints?celulaId=${encodeURIComponent(celulaId)}`),
    enabled: celulaId !== "",
    retry: false,
  });
}

/** QE activos (D120): el catálogo de personas ya existente, solo Administrador. */
export function useQeActivos() {
  return useQuery({
    queryKey: ["personas", "qe-activos"],
    queryFn: () => http.get<ListaPersonas>("/v1/catalogos/personas?rol=QE&activo=true"),
    staleTime: 60_000,
    retry: false,
  });
}

export function useGuardarConfiguracion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: SolicitudConfiguracionJira) => http.put<ResultadoGuardadoJira>(`${BASE}/jira/configuracion`, cuerpo),
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: ["integraciones"] });
    },
  });
}

export function useProbarConexion() {
  return useMutation({
    mutationFn: (cuerpo: SolicitudPruebaJira) => http.post<ResultadoPruebaJira>(`${BASE}/jira/configuracion/probar`, cuerpo),
  });
}

// ------------------------------------------------------------ sincronización

export function useEstadoIntegracion(opciones: { intervalo?: number | false; habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: ["integraciones", "estado"],
    queryFn: () => http.get<EstadoIntegracion>(`${BASE}/estado`),
    refetchInterval: opciones.intervalo ?? false,
    enabled: opciones.habilitado ?? true,
    retry: false,
  });
}

/** Consulta de `GET /estado` por demanda (D115: tras `SIN_RESPUESTA`). */
export function consultarEstado(): Promise<EstadoIntegracion> {
  return http.get<EstadoIntegracion>(`${BASE}/estado`);
}

export function useSincronizarJira() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: { vincularExistentes: boolean; continuarDesde?: string }) => http.post<Ejecucion>(`${BASE}/jira/sincronizaciones`, cuerpo),
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: ["integraciones"] });
      // Crear o actualizar HDU mueve bandejas y listados.
      void cliente.invalidateQueries({ queryKey: ["bandeja"] });
    },
  });
}

// ------------------------------------------------------------------- archivos

export function usePrevisualizarArchivo() {
  return useMutation({ mutationFn: (cuerpo: SolicitudArchivo) => http.post<VistaPreviaArchivo>(`${BASE}/archivos/vista-previa`, cuerpo) });
}

export function useImportarArchivo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: SolicitudArchivo) => http.post<Ejecucion>(`${BASE}/archivos/importaciones`, cuerpo),
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: ["integraciones"] });
      void cliente.invalidateQueries({ queryKey: ["bandeja"] });
    },
  });
}

// ------------------------------------------------------------------ historial

const CLAVES_HISTORIAL = ["origen", "resultado", "desde", "hasta"] as const;

/** Parámetros del API desde la URL del portal (origen, resultado, desde, hasta, orden, página). Lo inválido se ignora. */
export function queryHistorial(filtros: FiltrosUrl): string {
  const params = new URLSearchParams();
  const validos: Record<string, (v: string) => boolean> = {
    origen: (v) => ["JIRA", "CSV", "JSON"].includes(v),
    resultado: (v) => ["EN_CURSO", "EXITOSA", "CON_ERRORES", "INCOMPLETA", "FALLIDA", "INTERRUMPIDA"].includes(v),
    desde: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    hasta: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  };
  for (const clave of CLAVES_HISTORIAL) {
    const valor = filtros.get(clave);
    if (valor && validos[clave](valor)) params.set(clave, valor);
  }
  if (filtros.orden?.columna === "fecha") params.set("orden", `iniciadaEn:${filtros.orden.direccion}`);
  if (filtros.pagina > 1) params.set("pagina", String(filtros.pagina));
  if (filtros.tamano !== 25) params.set("tamanoPagina", String(Math.min(filtros.tamano, 100)));
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function useEjecuciones(filtros: FiltrosUrl) {
  const query = queryHistorial(filtros);
  return useQuery({
    queryKey: ["integraciones", "ejecuciones", query],
    queryFn: () => http.get<PaginaEjecuciones>(`${BASE}/ejecuciones${query}`),
    retry: false,
  });
}

export function useEjecucion(id: string | null) {
  return useQuery({
    queryKey: ["integraciones", "ejecucion", id],
    queryFn: () => http.get<Ejecucion>(`${BASE}/ejecuciones/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useFilasEjecucion(id: string | null, opciones: { soloErrores: boolean; pagina: number }) {
  const params = new URLSearchParams();
  if (opciones.soloErrores) params.set("soloErrores", "true");
  if (opciones.pagina > 1) params.set("pagina", String(opciones.pagina));
  const texto = params.toString();
  return useQuery({
    queryKey: ["integraciones", "detalle", id, texto],
    queryFn: () => http.get<PaginaFilasEjecucion>(`${BASE}/ejecuciones/${id}/detalle${texto ? `?${texto}` : ""}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export const FILAS_POR_VEZ = 25;

/** Lista de un resultado (creadas, actualizadas, omitidas, con error) con «Mostrar más», de 25 en 25 (D113). */
export function useFilasPorResultado(id: string, resultado: ResultadoFila, habilitado: boolean) {
  return useInfiniteQuery({
    queryKey: ["integraciones", "detalle-resultado", id, resultado],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => http.get<PaginaFilasEjecucion>(`${BASE}/ejecuciones/${id}/detalle?resultado=${resultado}&tamanoPagina=${FILAS_POR_VEZ}&pagina=${pageParam}`),
    getNextPageParam: (ultima) => (ultima.pagina * ultima.tamanoPagina < ultima.total ? ultima.pagina + 1 : undefined),
    enabled: habilitado,
    retry: false,
  });
}
