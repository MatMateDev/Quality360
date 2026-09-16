import { useQuery } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type { InicioAdmin, InicioQa, InicioQe } from "@/types/dominio";

export function useInicioAdmin() {
  return useQuery({ queryKey: ["inicio", "admin"], queryFn: () => http.get<InicioAdmin>("/v1/inicio/admin") });
}

export function useInicioQe() {
  return useQuery({ queryKey: ["inicio", "qe"], queryFn: () => http.get<InicioQe>("/v1/inicio/qe") });
}

export function useInicioQa(analistaId?: string) {
  const query = analistaId ? `?analistaId=${analistaId}` : "";
  return useQuery({
    queryKey: ["inicio", "qa", analistaId ?? null],
    queryFn: () => http.get<InicioQa>(`/v1/inicio/qa${query}`),
  });
}
