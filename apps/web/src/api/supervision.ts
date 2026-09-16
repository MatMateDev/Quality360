import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/httpClient";
import type { AsignacionSupervisor, HistorialSupervision, ResultadoCambioSupervision } from "@/types/dominio";

export function useHistorialSupervision(analistaId: string | null) {
  return useQuery({
    queryKey: ["supervision-historial", analistaId],
    queryFn: () => http.get<HistorialSupervision>(`/v1/analistas/${analistaId}/supervision/historial`),
    enabled: Boolean(analistaId),
  });
}

export function useAsignarSupervisor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ analistaId, body }: { analistaId: string; body: AsignacionSupervisor }) =>
      http.put<ResultadoCambioSupervision>(`/v1/analistas/${analistaId}/supervisor`, body),
    onSuccess: (_datos, variables) => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["supervision-historial", variables.analistaId] });
      queryClient.invalidateQueries({ queryKey: ["inicio"] });
    },
  });
}
