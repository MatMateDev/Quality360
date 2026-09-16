import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type { ActualizacionUsuario, CambioRol, NuevoUsuario, PaginaUsuarios, Rol, Usuario } from "@/types/dominio";

export interface FiltrosUsuarios {
  q?: string;
  rol?: Rol;
  activo?: boolean;
}

function construirQuery(filtros: FiltrosUsuarios): string {
  const params = new URLSearchParams();
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.rol) params.set("rol", filtros.rol);
  if (filtros.activo !== undefined) params.set("activo", String(filtros.activo));
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function useUsuarios(filtros: FiltrosUsuarios) {
  return useQuery({
    queryKey: ["usuarios", filtros],
    queryFn: () => http.get<PaginaUsuarios>(`/v1/usuarios${construirQuery(filtros)}`),
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

export function useCambiarRolUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CambioRol }) => http.put<Usuario>(`/v1/usuarios/${id}/rol`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}
