import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { descargar, http, type ArchivoDescargado } from "@/lib/httpClient";
import type {
  CargaIndicadores,
  DrilldownSemaforo,
  EjecucionSnapshot,
  FormatoExportacionIndicadores,
  IndicadoresCumplimiento,
  OpcionesFiltroIndicadores,
  PaginaEjecucionesSnapshot,
  PaginaEventosUmbral,
  ResultadoUmbralCarga,
  SemaforoIndicadores,
  TendenciaIndicadores,
  UmbralCarga,
  VistaIndicadores,
} from "@/types/dominio";

/** Filtros de las vistas de indicadores (claves del contrato: `celulaId`, `sprintId`, `desde`, `hasta`). */
export interface FiltrosIndicadores {
  celulaId?: string;
  sprintId?: string;
  desde?: string;
  hasta?: string;
}

/** Arma la query string omitiendo lo vacío. */
export function queryIndicadores(filtros: FiltrosIndicadores, extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...extra })) {
    if (valor !== undefined && valor !== "") params.set(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

/**
 * Sin caché de datos (E6 §1.7): las cifras se piden de nuevo al volver a la pestaña, a la ventana o a la
 * pantalla, para que nunca se mezclen con las del filtro anterior ni con datos viejos.
 */
const SIN_CACHE = { staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, retry: false } as const;

export function useOpcionesFiltroIndicadores(habilitado = true) {
  return useQuery({
    queryKey: ["indicadores", "filtros"],
    queryFn: () => http.get<OpcionesFiltroIndicadores>("/v1/indicadores/filtros"),
    enabled: habilitado,
    ...SIN_CACHE,
  });
}

export function useCumplimiento(filtros: FiltrosIndicadores) {
  return useQuery({
    queryKey: ["indicadores", "cumplimiento", filtros],
    queryFn: () => http.get<IndicadoresCumplimiento>(`/v1/indicadores/cumplimiento${queryIndicadores(filtros)}`),
    ...SIN_CACHE,
  });
}

export function useSemaforo(celulaId: string | undefined) {
  return useQuery({
    queryKey: ["indicadores", "semaforo", celulaId ?? ""],
    queryFn: () => http.get<SemaforoIndicadores>(`/v1/indicadores/semaforo${queryIndicadores({ celulaId })}`),
    ...SIN_CACHE,
  });
}

export function useDrilldown(celulaId: string | undefined) {
  return useQuery({
    queryKey: ["indicadores", "drilldown", celulaId ?? ""],
    queryFn: () => http.get<DrilldownSemaforo>(`/v1/indicadores/semaforo/${celulaId}/hdu`),
    enabled: Boolean(celulaId),
    ...SIN_CACHE,
  });
}

export function useCarga(filtros: FiltrosIndicadores) {
  return useQuery({
    queryKey: ["indicadores", "carga", filtros],
    queryFn: () => http.get<CargaIndicadores>(`/v1/indicadores/carga${queryIndicadores(filtros)}`),
    ...SIN_CACHE,
  });
}

/** Umbral de un QE. Sin `qeId` el QE lee el suyo; el Líder y el Auditor lo piden por grupo. */
export function useUmbral(qeId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ["indicadores", "umbral", qeId ?? ""],
    queryFn: () => http.get<UmbralCarga>(`/v1/indicadores/umbral-carga${queryIndicadores({}, { qeId })}`),
    enabled: habilitado,
    ...SIN_CACHE,
  });
}

export function useHistorialUmbral(qeId: string | undefined, pagina: number, habilitado = true) {
  return useQuery({
    queryKey: ["indicadores", "umbral-historial", qeId ?? "", pagina],
    queryFn: () => http.get<PaginaEventosUmbral>(`/v1/indicadores/umbral-carga/historial${queryIndicadores({}, { qeId, pagina, tamanoPagina: 5 })}`),
    enabled: habilitado,
    ...SIN_CACHE,
  });
}

export function useFijarUmbral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (valor: number) => http.put<ResultadoUmbralCarga>("/v1/indicadores/umbral-carga", { valor }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["indicadores"] }),
  });
}

export function useTendencia(filtros: FiltrosIndicadores, habilitado = true) {
  return useQuery({
    queryKey: ["indicadores", "tendencia", filtros],
    queryFn: () => http.get<TendenciaIndicadores>(`/v1/indicadores/tendencia${queryIndicadores(filtros)}`),
    enabled: habilitado,
    ...SIN_CACHE,
  });
}

/** Descarga autenticada de la vista abierta (CSV o PDF) con los mismos filtros (E6-F04#2). */
export function exportarIndicadores(vista: VistaIndicadores, formato: FormatoExportacionIndicadores, filtros: FiltrosIndicadores): Promise<ArchivoDescargado> {
  return descargar(`/v1/indicadores/exportacion${queryIndicadores(filtros, { vista, formato })}`);
}

export function useEjecucionesSnapshot(pagina: number) {
  return useQuery({
    queryKey: ["indicadores", "ejecuciones", pagina],
    queryFn: () => http.get<PaginaEjecucionesSnapshot>(`/v1/indicadores/snapshots/ejecuciones?pagina=${pagina}&tamanoPagina=10`),
    ...SIN_CACHE,
  });
}

export function useGenerarSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => http.post<EjecucionSnapshot>("/v1/indicadores/snapshots"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["indicadores", "ejecuciones"] }),
  });
}
