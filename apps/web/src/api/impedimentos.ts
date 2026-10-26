import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { http } from "@/lib/httpClient";
import { aQueryApi, CLAVES_AUDITOR_GESTION, CLAVES_AUDITOR_IMPEDIMENTOS } from "./bandejas";
import type {
  CandidatosResponsable,
  ImpedimentoDetalle,
  ImpedimentosHdu,
  NuevoImpedimento,
  PaginaAuditorImpedimentos,
  PaginaGestionImpedimentos,
  PaginaImpedimentos,
  PropositoResponsable,
  ResultadoAccionImpedimento,
  TipoImpedimento,
} from "@/types/dominio";

export interface TipoImpedimentoCatalogo {
  codigo: TipoImpedimento;
  etiqueta: string;
  descripcionMinima: number;
}

export function useTiposImpedimento() {
  return useQuery({
    queryKey: ["impedimentos", "catalogo"],
    staleTime: 5 * 60_000,
    queryFn: () => http.get<{ items: TipoImpedimentoCatalogo[] }>("/v1/catalogos/tipos-impedimento"),
  });
}

/** Sección «Impedimentos» del detalle de HDU (E4-F01, E4-F03). Trae `permisos` y `operacionesPermitidas` (D75). */
export function useImpedimentosHdu(hduId: string | undefined) {
  return useQuery({
    queryKey: ["impedimentos", "hdu", hduId],
    queryFn: () => http.get<ImpedimentosHdu>(`/v1/hdu/${hduId}/impedimentos`),
    enabled: Boolean(hduId),
    retry: false,
  });
}

/** Historial de un impedimento (más antiguo primero, D82). Se pide al abrir «Ver historial». */
export function useDetalleImpedimento(id: string, habilitado: boolean) {
  return useQuery({
    queryKey: ["impedimentos", "detalle", id],
    queryFn: () => http.get<ImpedimentoDetalle>(`/v1/impedimentos/${id}`),
    enabled: habilitado,
    retry: false,
  });
}

export function useResponsablesImpedimento(hduId: string, proposito: PropositoResponsable, habilitado: boolean) {
  return useQuery({
    queryKey: ["impedimentos", "responsables", hduId, proposito],
    queryFn: () => http.get<CandidatosResponsable>(`/v1/hdu/${hduId}/impedimentos/responsables?proposito=${proposito}`),
    enabled: habilitado,
    staleTime: 0,
    retry: false,
  });
}

function useInvalidarImpedimentos() {
  const queryClient = useQueryClient();
  return () => {
    // Un cambio de impedimentos mueve el bloqueo (detalle, bandejas), el riesgo y el historial.
    for (const clave of ["impedimentos", "riesgo", "bandeja", "hdu"]) queryClient.invalidateQueries({ queryKey: [clave] });
  };
}

export function useRegistrarImpedimento(hduId: string) {
  const invalidar = useInvalidarImpedimentos();
  return useMutation({
    mutationFn: (cuerpo: NuevoImpedimento) => http.post<ImpedimentoDetalle>(`/v1/hdu/${hduId}/impedimentos`, cuerpo),
    onSuccess: invalidar,
  });
}

export type AccionImpedimento = "resolver" | "escalar" | "reabrir" | "seguimiento";

export interface CuerpoAccionImpedimento {
  comentario?: string;
  motivo?: string;
  responsableId?: string;
  responsableNombre?: string;
}

export function useAccionImpedimento(id: string, accion: AccionImpedimento) {
  const invalidar = useInvalidarImpedimentos();
  return useMutation({
    mutationFn: (cuerpo: CuerpoAccionImpedimento) => http.post<ResultadoAccionImpedimento>(`/v1/impedimentos/${id}/${accion}`, cuerpo),
    onSuccess: invalidar,
  });
}

/** Listado del QE (E4-F02). La URL del portal usa `celula`, `analista`, `q`, `resueltos`… y el API, `celulaId`… (D92). */
export const CLAVES_QE_IMPEDIMENTOS = ["celula", "tipo", "estado", "analista", "riesgo", "q", "resueltos"];

export function useListaImpedimentos(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_QE_IMPEDIMENTOS, ordenables: ["riesgo", "diasAbierto", "fechaRegistro"], impedimentos: true });
  return useQuery({
    queryKey: ["impedimentos", "lista", query],
    queryFn: () => http.get<PaginaImpedimentos>(`/v1/impedimentos${query}`),
    retry: false,
  });
}

export function useImpedimentosAuditor(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_AUDITOR_IMPEDIMENTOS, impedimentos: true });
  return useQuery({
    queryKey: ["auditor", "impedimentos", query],
    queryFn: () => http.get<PaginaAuditorImpedimentos>(`/v1/auditor/impedimentos${query}`),
    retry: false,
  });
}

export function useGestionAuditor(filtros: FiltrosUrl) {
  const query = aQueryApi(filtros, { claves: CLAVES_AUDITOR_GESTION, impedimentos: true });
  return useQuery({
    queryKey: ["auditor", "gestion-impedimentos", query],
    queryFn: () => http.get<PaginaGestionImpedimentos>(`/v1/auditor/gestion-impedimentos${query}`),
    retry: false,
  });
}
