import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { http } from "@/lib/httpClient";
import { aQueryApi } from "./bandejas";
import type { CambioRiesgo, HistorialGestionHdu, PaginaRiesgoHdu, ResultadoCambioRiesgo, RiesgoHdu } from "@/types/dominio";

/**
 * Panel «Riesgo» del detalle (E4-F04). Solo se pide con `habilitado`: para el Analista no hay panel y, por
 * tanto, ninguna llamada (D73): el servicio le respondería 403.
 */
export function useRiesgoHdu(hduId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ["riesgo", "hdu", hduId],
    queryFn: () => http.get<RiesgoHdu>(`/v1/hdu/${hduId}/riesgo`),
    enabled: habilitado && Boolean(hduId),
    retry: false,
  });
}

/** Historial de cambios de nivel (D82): `gestion-impedimentos` filtrado por `tipo=RIESGO`. */
export function useHistorialRiesgo(hduId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ["riesgo", "historial", hduId],
    queryFn: () => http.get<HistorialGestionHdu>(`/v1/hdu/${hduId}/gestion-impedimentos?tipo=RIESGO&orden=fecha:desc`),
    enabled: habilitado,
    retry: false,
  });
}

export function useFijarRiesgo(hduId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: CambioRiesgo) => http.put<ResultadoCambioRiesgo>(`/v1/hdu/${hduId}/riesgo`, cuerpo),
    onSuccess: () => {
      for (const clave of ["riesgo", "impedimentos", "bandeja"]) queryClient.invalidateQueries({ queryKey: [clave] });
    },
  });
}

/** «Riesgo por HDU» (E4-F04#3). Las claves de la URL se traducen a `celulaId`, `sprintId`, `analistaId`… (D92). */
export const CLAVES_QE_RIESGO = ["nivel", "celula", "sprint", "analista", "estado", "solo-bloq", "q"];

export function useListaRiesgo(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_QE_RIESGO, ordenables: ["riesgo", "impedimentosAbiertos", "codigo"] });
  return useQuery({
    queryKey: ["riesgo", "lista", query],
    queryFn: () => http.get<PaginaRiesgoHdu>(`/v1/riesgo/hdu${query}`),
    retry: false,
  });
}
