// Alias cortos hacia los tipos generados desde contracts/gateway.v1.yaml
// (D7). Único punto de entrada para no repetir `components["schemas"][...]`
// por todo el código.
import type { components } from "@contracts/gateway.v1";

export type Rol = components["schemas"]["Rol"];
export type EstadoHdu = components["schemas"]["EstadoHdu"];
export type PrioridadHdu = components["schemas"]["PrioridadHdu"];
export type CodigoError = components["schemas"]["CodigoError"];

export type Perfil = components["schemas"]["Perfil"];
export type Usuario = components["schemas"]["Usuario"];
export type PaginaUsuarios = components["schemas"]["PaginaUsuarios"];
export type NuevoUsuario = components["schemas"]["NuevoUsuario"];
export type ActualizacionUsuario = components["schemas"]["ActualizacionUsuario"];
export type CambioRol = components["schemas"]["CambioRol"];

export type UsuarioResumen = components["schemas"]["UsuarioResumen"];
export type EquipoQe = components["schemas"]["EquipoQe"];
export type AnalistaSupervisado = components["schemas"]["AnalistaSupervisado"];
export type ListaAnalistasAsignables = components["schemas"]["ListaAnalistasAsignables"];
export type AsignacionSupervisor = components["schemas"]["AsignacionSupervisor"];
export type ResultadoCambioSupervision = components["schemas"]["ResultadoCambioSupervision"];
export type RelacionSupervision = components["schemas"]["RelacionSupervision"];
export type HistorialSupervision = components["schemas"]["HistorialSupervision"];

export type InicioAdmin = components["schemas"]["InicioAdmin"];
export type InicioQe = components["schemas"]["InicioQe"];
export type InicioQa = components["schemas"]["InicioQa"];

export type CatalogoRef = components["schemas"]["CatalogoRef"];
export type ListaCelulas = components["schemas"]["ListaCelulas"];
export type Sprint = components["schemas"]["Sprint"];
export type ListaSprints = components["schemas"]["ListaSprints"];

export type HduResumen = components["schemas"]["HduResumen"];
export type HduDetalleBase = components["schemas"]["HduDetalleBase"];
export type HduDetalle = components["schemas"]["HduDetalle"];
export type PaginaHdu = components["schemas"]["PaginaHdu"];
export type NuevaHdu = components["schemas"]["NuevaHdu"];
export type PermisosHdu = components["schemas"]["PermisosHdu"];
export type AsignacionAnalista = components["schemas"]["AsignacionAnalista"];
export type ResultadoAsignacion = components["schemas"]["ResultadoAsignacion"];
export type SolicitudCambioEstado = components["schemas"]["SolicitudCambioEstado"];
export type ResultadoCambioEstado = components["schemas"]["ResultadoCambioEstado"];
export type HistorialHdu = components["schemas"]["HistorialHdu"];
export type EventoHistorialHdu = components["schemas"]["EventoHistorialHdu"];

export type ErrorApiCuerpo = components["schemas"]["Error"];

// E3 · checklist de entregables, evidencias y certificado
export type ClaveEntregable = components["schemas"]["ClaveEntregable"];
export type EstadoEntregable = components["schemas"]["EstadoEntregable"];
export type Entregable = components["schemas"]["Entregable"];
export type ChecklistHdu = components["schemas"]["ChecklistHdu"];
export type EntradaEvidencia = components["schemas"]["EntradaEvidencia"];
export type SubidaEvidencia = components["schemas"]["SubidaEvidencia"];
export type EnlaceDescarga = components["schemas"]["EnlaceDescarga"];
export type CertificadoDescarga = components["schemas"]["CertificadoDescarga"];
export type VerificacionCertificado = components["schemas"]["VerificacionCertificado"];
export type BandejaAprobaciones = components["schemas"]["BandejaAprobaciones"];
export type BitacoraChecklist = components["schemas"]["BitacoraChecklist"];
export type EventoChecklist = components["schemas"]["EventoChecklist"];

export const ROLES_CATALOGO: Rol[] = ["ADMINISTRADOR", "QE", "ANALISTA_QA"];

export const ESTADOS_HDU: EstadoHdu[] = [
  "PENDIENTE",
  "DISENO_PRUEBAS",
  "EN_EJECUCION",
  "PENDIENTE_CIERRE",
  "CERRADA",
];

/** Transiciones permitidas por estado (D10 / `comun.v1.yaml#EstadoHdu.x-transiciones`). */
export const TRANSICIONES_HDU: Record<EstadoHdu, EstadoHdu[]> = {
  PENDIENTE: ["DISENO_PRUEBAS"],
  DISENO_PRUEBAS: ["EN_EJECUCION"],
  EN_EJECUCION: ["PENDIENTE_CIERRE"],
  PENDIENTE_CIERRE: ["CERRADA", "EN_EJECUCION"],
  CERRADA: [],
};

export const ETIQUETAS_ROL: Record<Rol, string> = {
  ADMINISTRADOR: "Administrador",
  QE: "QE",
  ANALISTA_QA: "Analista QA",
};

export const ETIQUETAS_ESTADO_HDU: Record<EstadoHdu, string> = {
  PENDIENTE: "Pendiente",
  DISENO_PRUEBAS: "Diseño de pruebas",
  EN_EJECUCION: "En ejecución",
  PENDIENTE_CIERRE: "Pendiente de cierre",
  CERRADA: "Cerrada",
};

export const ETIQUETAS_ESTADO_ENTREGABLE: Record<EstadoEntregable, string> = {
  PENDIENTE: "Pendiente",
  POR_APROBAR: "Por aprobar",
  APROBADO: "Aprobado",
};

export const ETIQUETAS_ACCION_CHECKLIST: Record<EventoChecklist["accion"], string> = {
  MARCAR: "marcó",
  DESMARCAR: "desmarcó",
  APROBAR: "aprobó",
  RECHAZAR: "rechazó",
  GENERAR_CERTIFICADO: "generó el certificado de",
};

/** Tipos y tamaño de archivo aceptados como evidencia (D20). */
export const TIPOS_EVIDENCIA = ["application/pdf", "image/png", "image/jpeg"] as const;
export const TAMANO_MAXIMO_EVIDENCIA = 10 * 1024 * 1024;

export const ETIQUETAS_PRIORIDAD: Record<PrioridadHdu, string> = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export function rutaPortal(rol: Rol): string {
  if (rol === "ADMINISTRADOR") return "/admin";
  if (rol === "QE") return "/qe";
  return "/qa";
}
