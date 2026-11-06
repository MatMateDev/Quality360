import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { ErrorApi, http } from "@/lib/httpClient";
import type {
  Consulta,
  ConsultaActual,
  DetalleItemConsulta,
  ResultadoConfirmacionFila,
  Ejecucion,
  EstadoIntegracion,
  GrupoConsulta,
  PaginaItemsConsulta,
  ResultadoConfirmacion,
  ResultadoConsultaJira,
  ResultadoEdicionItems,
  SolicitudConsultaJira,
  SolicitudEdicionItems,
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

// ------------------------------------------------------------------ consulta de Jira (D132–D152)

const CONSULTAS = `${BASE}/jira/consultas`;

/** Llamadas directas (sin caché): las usan las acciones y el reintento tras `SIN_RESPUESTA` (D115). */
export const llamadasConsulta = {
  consultar: (cuerpo: SolicitudConsultaJira = { reemplazar: false }) => http.post<ResultadoConsultaJira>(CONSULTAS, cuerpo),
  continuar: (id: string) => http.post<ResultadoConsultaJira>(`${CONSULTAS}/${id}/continuaciones`, {}),
  actual: () => http.get<ConsultaActual>(`${CONSULTAS}/actual`),
  obtener: (id: string) => http.get<Consulta>(`${CONSULTAS}/${id}`),
  items: (id: string, opciones: { grupo: GrupoConsulta; q?: string; pagina?: number; tamanoPagina?: number }) => {
    const params = new URLSearchParams({ grupo: opciones.grupo });
    if (opciones.q) params.set("q", opciones.q);
    if (opciones.pagina && opciones.pagina > 1) params.set("pagina", String(opciones.pagina));
    if (opciones.tamanoPagina) params.set("tamanoPagina", String(opciones.tamanoPagina));
    return http.get<PaginaItemsConsulta>(`${CONSULTAS}/${id}/items?${params.toString()}`);
  },
  editar: (id: string, cuerpo: SolicitudEdicionItems) => http.patch<ResultadoEdicionItems>(`${CONSULTAS}/${id}/items`, cuerpo),
  confirmar: (id: string, version: number) => http.post<ResultadoConfirmacion>(`${CONSULTAS}/${id}/confirmaciones`, { version }),
  /** Detalle completo de una fila (D200): lee la base propia, no llama a Jira. */
  detalle: (id: string, itemId: string) => http.get<DetalleItemConsulta>(`${CONSULTAS}/${id}/items/${itemId}`),
  /** «Confirmar asignación» de una sola HDU (D202): crea esa HDU con la `revision` que vio la persona. */
  confirmarFila: (id: string, itemId: string, revision: number) => http.post<ResultadoConfirmacionFila>(`${CONSULTAS}/${id}/items/${itemId}/confirmaciones`, { revision }),
  descartar: (id: string) => http.post<Consulta>(`${CONSULTAS}/${id}/descartes`, {}),
};

/** La consulta abierta (o `null` con `ultimaCerrada`). Aplica el vencimiento perezoso en el servidor. */
export function useConsultaActual(opciones: { habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: ["integraciones", "consulta", "actual"],
    queryFn: llamadasConsulta.actual,
    enabled: opciones.habilitado ?? true,
    retry: false,
  });
}

/** Lectura barata de la cabecera y la `version` (D148). */
export function useConsulta(id: string | null) {
  return useQuery({
    queryKey: ["integraciones", "consulta", "cabecera", id],
    queryFn: () => llamadasConsulta.obtener(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useItemsConsulta(id: string | null, opciones: { grupo: GrupoConsulta; q?: string; pagina?: number; tamanoPagina?: number }) {
  return useQuery({
    queryKey: ["integraciones", "consulta", "items", id, opciones.grupo, opciones.q ?? "", opciones.pagina ?? 1, opciones.tamanoPagina ?? 25],
    queryFn: () => llamadasConsulta.items(id as string, opciones),
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
    retry: false,
  });
}

/** Detalle de una fila para el panel «Ver detalle». Se pide solo con el panel abierto y no se reintenta solo. */
export function useDetalleItem(consultaId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: ["integraciones", "consulta", "detalle", consultaId, itemId],
    queryFn: () => llamadasConsulta.detalle(consultaId as string, itemId as string),
    enabled: Boolean(consultaId && itemId),
    retry: false,
    staleTime: 0,
  });
}

/** Analistas vigentes del equipo de un QE (D147). Un QE sin analistas devuelve lista vacía, que es el dato real. */
export function useAnalistasDeQe(qeId: string | null) {
  return useQuery({
    queryKey: ["personas", "analistas-de-qe", qeId],
    queryFn: () => http.get<ListaPersonas>(`/v1/catalogos/personas?supervisorId=${encodeURIComponent(qeId as string)}`),
    enabled: Boolean(qeId),
    staleTime: 60_000,
    retry: false,
  });
}

function refrescarConsulta(cliente: ReturnType<typeof useQueryClient>) {
  void cliente.invalidateQueries({ queryKey: ["integraciones"] });
}

/** Consultar Jira (o reemplazar la abierta). No crea ni modifica HDU. */
export function useConsultarJira() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: SolicitudConsultaJira) => llamadasConsulta.consultar(cuerpo),
    onSettled: () => refrescarConsulta(cliente),
  });
}

export function useContinuarConsulta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => llamadasConsulta.continuar(id),
    onSettled: () => refrescarConsulta(cliente),
  });
}

export function useEditarItemsConsulta(id: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: SolicitudEdicionItems) => llamadasConsulta.editar(id, cuerpo),
    onSettled: () => refrescarConsulta(cliente),
  });
}

/** Confirmar crea y actualiza HDU: mueve bandejas y listados. */
export function useConfirmarConsulta(id: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => llamadasConsulta.confirmar(id, version),
    onSettled: () => {
      refrescarConsulta(cliente);
      void cliente.invalidateQueries({ queryKey: ["bandeja"] });
    },
  });
}

export function useDescartarConsulta(id: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => llamadasConsulta.descartar(id),
    onSettled: () => refrescarConsulta(cliente),
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

const CLAVES_HISTORIAL = ["fase", "alcance", "origen", "resultado", "desde", "hasta"] as const;

/** Parámetros del API desde la URL del portal (origen, resultado, desde, hasta, orden, página). Lo inválido se ignora. */
export function queryHistorial(filtros: FiltrosUrl): string {
  const params = new URLSearchParams();
  const validos: Record<string, (v: string) => boolean> = {
    fase: (v) => ["CONSULTA", "CONFIRMACION", "DIRECTA"].includes(v),
    alcance: (v) => ["LOTE", "HDU"].includes(v),
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
