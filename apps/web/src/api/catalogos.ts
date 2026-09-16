import { useQuery } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type { ListaCelulas, ListaSprints } from "@/types/dominio";

export function useCelulas() {
  return useQuery({
    queryKey: ["celulas"],
    queryFn: () => http.get<ListaCelulas>("/v1/catalogos/celulas"),
    staleTime: 5 * 60_000,
  });
}

export function useSprints() {
  return useQuery({
    queryKey: ["sprints"],
    queryFn: () => http.get<ListaSprints>("/v1/catalogos/sprints"),
    staleTime: 5 * 60_000,
  });
}
