import { useQuery } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type { EquipoQe, ListaAnalistasAsignables } from "@/types/dominio";

export function useEquipoQe(qeId?: string) {
  const query = qeId ? `?qeId=${qeId}` : "";
  return useQuery({
    queryKey: ["equipo", qeId ?? null],
    queryFn: () => http.get<EquipoQe>(`/v1/qe/analistas${query}`),
  });
}

export function useAnalistasAsignables(habilitado = true) {
  return useQuery({
    enabled: habilitado,
    queryKey: ["analistas-asignables"],
    queryFn: () => http.get<ListaAnalistasAsignables>("/v1/qe/analistas-asignables"),
  });
}
