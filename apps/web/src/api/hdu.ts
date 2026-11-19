import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import {
  ESTADOS_HDU,
  type AsignacionAnalista,
  type EstadoHdu,
  type HduDetalle,
  type HistorialHdu,
  type NuevaHdu,
  type PaginaHdu,
  type ReasignacionQeResponsable,
  type ResultadoReasignacionQe,
  type ResultadoAsignacion,
  type ResultadoCambioEstado,
  type SolicitudCambioEstado,
} from "@/types/dominio";

export interface FiltrosHdu {
  celulaId?: string;
  sprintId?: string;
  estado?: EstadoHdu;
}

function construirQuery(filtros: FiltrosHdu): string {
  const params = new URLSearchParams();
  if (filtros.celulaId) params.set("celulaId", filtros.celulaId);
  if (filtros.sprintId) params.set("sprintId", filtros.sprintId);
  if (filtros.estado) params.set("estado", filtros.estado);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function useListaHdu(filtros: FiltrosHdu) {
  return useQuery({
    queryKey: ["hdu", "lista", filtros],
    queryFn: () => http.get<PaginaHdu>(`/v1/hdu${construirQuery(filtros)}`),
  });
}

export interface ConteoHduPorEstado {
  isLoading: boolean;
  isError: boolean;
  /** Solo cuando respondieron los cinco conteos: nunca se muestra una distribución a medias. */
  porEstado?: Record<EstadoHdu, number>;
  refetch: () => void;
}

/**
 * Cuántas HDU hay en cada estado dentro del ámbito del usuario (el Administrador ve todas, E2-B03).
 * Pide solo el total de cada estado (`tamanoPagina=1`), los cinco en paralelo.
 */
export function useConteoHduPorEstado(): ConteoHduPorEstado {
  return useQueries({
    queries: ESTADOS_HDU.map((estado) => ({
      queryKey: ["hdu", "conteo", estado],
      queryFn: () => http.get<PaginaHdu>(`/v1/hdu?estado=${estado}&tamanoPagina=1`),
    })),
    combine: (resultados) => ({
      isLoading: resultados.some((r) => r.isLoading),
      isError: resultados.some((r) => r.isError),
      porEstado: resultados.every((r) => r.data !== undefined)
        ? (Object.fromEntries(ESTADOS_HDU.map((estado, i) => [estado, resultados[i]?.data?.total ?? 0])) as Record<EstadoHdu, number>)
        : undefined,
      refetch: () => {
        for (const r of resultados) void r.refetch();
      },
    }),
  });
}

export function useDetalleHdu(id: string | undefined) {
  return useQuery({
    queryKey: ["hdu", "detalle", id],
    queryFn: () => http.get<HduDetalle>(`/v1/hdu/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useHistorialHdu(id: string | undefined) {
  return useQuery({
    queryKey: ["hdu", "historial", id],
    queryFn: () => http.get<HistorialHdu>(`/v1/hdu/${id}/historial`),
    enabled: Boolean(id),
  });
}

export function useCrearHdu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NuevaHdu) => http.post<HduDetalle>("/v1/hdu", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hdu", "lista"] });
      queryClient.invalidateQueries({ queryKey: ["inicio"] });
    },
  });
}

export function useAsignarAnalista(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AsignacionAnalista) => http.put<ResultadoAsignacion>(`/v1/hdu/${id}/analista`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hdu"] });
      queryClient.invalidateQueries({ queryKey: ["inicio"] });
    },
  });
}

export function useCambiarEstadoHdu(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SolicitudCambioEstado) => http.post<ResultadoCambioEstado>(`/v1/hdu/${id}/estado`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hdu"] });
      queryClient.invalidateQueries({ queryKey: ["inicio"] });
    },
  });
}

/** E7-B05 (solo Administrador): reasigna el QE responsable de la HDU con motivo obligatorio. */
export function useReasignarQeResponsable(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReasignacionQeResponsable) => http.put<ResultadoReasignacionQe>(`/v1/hdu/${id}/qe-responsable`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hdu"] });
      queryClient.invalidateQueries({ queryKey: ["bandeja"] });
      queryClient.invalidateQueries({ queryKey: ["inicio"] });
    },
  });
}
