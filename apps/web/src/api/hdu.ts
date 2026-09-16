import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type {
  AsignacionAnalista,
  EstadoHdu,
  HduDetalle,
  HistorialHdu,
  NuevaHdu,
  PaginaHdu,
  ResultadoAsignacion,
  ResultadoCambioEstado,
  SolicitudCambioEstado,
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
