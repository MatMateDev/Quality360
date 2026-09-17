import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorApi, http } from "@/lib/httpClient";
import { obtenerClienteSupabase } from "@/lib/supabaseClient";
import type {
  BandejaAprobaciones,
  BitacoraChecklist,
  CertificadoDescarga,
  ChecklistHdu,
  ClaveEntregable,
  EnlaceDescarga,
  Entregable,
  EntradaEvidencia,
  SubidaEvidencia,
  VerificacionCertificado,
} from "@/types/dominio";

const BUCKET_EVIDENCIAS = "evidencias";

/** E3-F01: checklist de 10 entregables con permisos y estado de la certificación. */
export function useChecklist(hduId: string | undefined) {
  return useQuery({
    queryKey: ["checklist", hduId],
    queryFn: () => http.get<ChecklistHdu>(`/v1/hdu/${hduId}/entregables`),
    enabled: Boolean(hduId),
    retry: false,
  });
}

/** E3-B04#3: bitácora de cambios del checklist. */
export function useBitacoraChecklist(hduId: string | undefined) {
  return useQuery({
    queryKey: ["checklist", hduId, "bitacora"],
    queryFn: () => http.get<BitacoraChecklist>(`/v1/hdu/${hduId}/entregables/bitacora`),
    enabled: Boolean(hduId),
  });
}

/** E3-F03#3: bandeja del QE. */
export function useBandejaAprobaciones() {
  return useQuery({
    queryKey: ["checklist", "bandeja"],
    queryFn: () => http.get<BandejaAprobaciones>("/v1/qe/aprobaciones-pendientes"),
  });
}

function useInvalidarChecklist(hduId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["checklist"] });
    queryClient.invalidateQueries({ queryKey: ["hdu", "detalle", hduId] });
  };
}

export type EvidenciaAMarcar = { tipo: "ENLACE"; url: string } | { tipo: "ARCHIVO"; archivo: File };

/**
 * E3-F02#1: marca con evidencia. Un archivo se sube primero directo a Supabase
 * Storage con la URL firmada que emite Certificaciones (D20) y luego se marca.
 */
export function useMarcarEntregable(hduId: string) {
  const invalidar = useInvalidarChecklist(hduId);
  return useMutation({
    mutationFn: async ({ clave, evidencia }: { clave: ClaveEntregable; evidencia: EvidenciaAMarcar }) => {
      let entrada: EntradaEvidencia;
      if (evidencia.tipo === "ENLACE") {
        entrada = { tipo: "ENLACE", url: evidencia.url };
      } else {
        const subida = await http.post<SubidaEvidencia>(`/v1/hdu/${hduId}/entregables/${clave}/evidencias`, {
          nombreArchivo: evidencia.archivo.name,
          tipoContenido: evidencia.archivo.type,
          tamanoBytes: evidencia.archivo.size,
        });
        const { error } = await obtenerClienteSupabase()
          .storage.from(BUCKET_EVIDENCIAS)
          .uploadToSignedUrl(subida.ruta, subida.token, evidencia.archivo, { contentType: evidencia.archivo.type });
        if (error) {
          throw new ErrorApi(503, {
            codigo: "SERVICIO_NO_DISPONIBLE",
            mensaje: "No fue posible subir el archivo. Intenta nuevamente.",
            traceId: "",
            detalles: [],
          });
        }
        entrada = { tipo: "ARCHIVO", ruta: subida.ruta };
      }
      return http.post<Entregable>(`/v1/hdu/${hduId}/entregables/${clave}/marcar`, { evidencia: entrada });
    },
    onSuccess: invalidar,
  });
}

/** E3-F02#3: desmarca con motivo. */
export function useDesmarcarEntregable(hduId: string) {
  const invalidar = useInvalidarChecklist(hduId);
  return useMutation({
    mutationFn: ({ clave, motivo }: { clave: ClaveEntregable; motivo: string }) =>
      http.post<Entregable>(`/v1/hdu/${hduId}/entregables/${clave}/desmarcar`, { motivo }),
    onSuccess: invalidar,
  });
}

/** E3-F03#1: aprobación del QE responsable. */
export function useAprobarEntregable(hduId: string) {
  const invalidar = useInvalidarChecklist(hduId);
  return useMutation({
    mutationFn: ({ clave }: { clave: ClaveEntregable }) => http.post<Entregable>(`/v1/hdu/${hduId}/entregables/${clave}/aprobar`),
    onSuccess: invalidar,
  });
}

/** E3-F03#2: rechazo con observaciones. */
export function useRechazarEntregable(hduId: string) {
  const invalidar = useInvalidarChecklist(hduId);
  return useMutation({
    mutationFn: ({ clave, comentario }: { clave: ClaveEntregable; comentario: string }) =>
      http.post<Entregable>(`/v1/hdu/${hduId}/entregables/${clave}/rechazar`, { comentario }),
    onSuccess: invalidar,
  });
}

/** E3-F04#1: genera el certificado y devuelve su URL de descarga. */
export function useGenerarCertificado(hduId: string) {
  const invalidar = useInvalidarChecklist(hduId);
  return useMutation({
    mutationFn: () => http.post<CertificadoDescarga>(`/v1/hdu/${hduId}/certificado`),
    onSuccess: invalidar,
  });
}

/** E3-F04#3: URL firmada del certificado existente. */
export function obtenerDescargaCertificado(hduId: string): Promise<CertificadoDescarga> {
  return http.get<CertificadoDescarga>(`/v1/hdu/${hduId}/certificado`);
}

/** URL firmada de la evidencia de archivo de un entregable. */
export function obtenerDescargaEvidencia(hduId: string, clave: ClaveEntregable): Promise<EnlaceDescarga> {
  return http.get<EnlaceDescarga>(`/v1/hdu/${hduId}/entregables/${clave}/evidencia`);
}

/** E3-B03#2: verificación pública de un folio. */
export function useVerificacionCertificado(folio: string | undefined) {
  return useQuery({
    queryKey: ["certificado", "verificacion", folio],
    queryFn: () => http.get<VerificacionCertificado>(`/v1/certificados/${encodeURIComponent(folio ?? "")}/verificacion`),
    enabled: Boolean(folio),
    retry: false,
  });
}
