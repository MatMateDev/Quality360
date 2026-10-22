import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type {
  ActualizacionUsuario,
  CambioRol,
  CelulasLider,
  NuevoUsuario,
  PaginaUsuarios,
  Rol,
  SolicitudCelulasLider,
  Usuario,
} from "@/types/dominio";

export interface FiltrosUsuarios {
  q?: string;
  rol?: Rol;
  activo?: boolean;
  pagina?: number;
  tamanoPagina?: number;
}

function construirQuery(filtros: FiltrosUsuarios): string {
  const params = new URLSearchParams();
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.rol) params.set("rol", filtros.rol);
  if (filtros.activo !== undefined) params.set("activo", String(filtros.activo));
  if (filtros.pagina && filtros.pagina > 1) params.set("pagina", String(filtros.pagina));
  if (filtros.tamanoPagina && filtros.tamanoPagina !== 25) params.set("tamanoPagina", String(filtros.tamanoPagina));
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function useUsuarios(filtros: FiltrosUsuarios) {
  return useQuery({
    queryKey: ["usuarios", filtros],
    queryFn: () => http.get<PaginaUsuarios>(`/v1/usuarios${construirQuery(filtros)}`),
  });
}

/** `GET /v1/usuarios/{id}` (D44): resuelve `?usuario=<id>`; un id inexistente es un 404, no un error de pantalla. */
export function useUsuario(id: string | null) {
  return useQuery({
    queryKey: ["usuario", id],
    queryFn: () => http.get<Usuario>(`/v1/usuarios/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCrearUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NuevoUsuario) => http.post<Usuario>("/v1/usuarios", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

export function useActualizarUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ActualizacionUsuario }) => http.patch<Usuario>(`/v1/usuarios/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

/** D42: rol y células en una sola llamada (`celulaIds` solo con `LIDER_QA`). */
export function useCambiarRolUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CambioRol }) => http.put<Usuario>(`/v1/usuarios/${id}/rol`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["usuario"] });
      queryClient.invalidateQueries({ queryKey: ["celulas-lider"] });
      queryClient.invalidateQueries({ queryKey: ["bandeja"] });
    },
  });
}

/** Células vigentes e historial de un Líder QA. Se vuelve a pedir al abrir el diálogo (otro administrador pudo cambiarlas). */
export function useCelulasLider(usuarioId: string | null) {
  return useQuery({
    queryKey: ["celulas-lider", usuarioId],
    queryFn: () => http.get<CelulasLider>(`/v1/usuarios/${usuarioId}/celulas-lider`),
    enabled: Boolean(usuarioId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useGuardarCelulasLider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SolicitudCelulasLider }) => http.put<CelulasLider>(`/v1/usuarios/${id}/celulas-lider`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["usuario"] });
      queryClient.invalidateQueries({ queryKey: ["celulas-lider"] });
      queryClient.invalidateQueries({ queryKey: ["bandeja"] });
    },
  });
}
