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

// E7 · bandejas por rol
export type AccionChecklist = components["schemas"]["AccionChecklist"];
export type OperacionAuditoriaUsuarios = components["schemas"]["OperacionAuditoriaUsuarios"];
export type TipoAccionQe = components["schemas"]["TipoAccionQe"];
export type TipoPendienteAdmin = components["schemas"]["TipoPendienteAdmin"];
export type Contador = components["schemas"]["Contador"];
export type SeguimientoHdu = components["schemas"]["SeguimientoHdu"];
export type ItemBandejaHdu = components["schemas"]["ItemBandejaHdu"];
export type PaginaBandejaHdu = components["schemas"]["PaginaBandejaHdu"];
export type BloqueListaHdu = components["schemas"]["BloqueListaHdu"];
export type BandejaAnalista = components["schemas"]["BandejaAnalista"];
export type BandejaQe = components["schemas"]["BandejaQe"];
export type AccionPendienteQe = components["schemas"]["AccionPendienteQe"];
export type BandejaLider = components["schemas"]["BandejaLider"];
export type BandejaAdmin = components["schemas"]["BandejaAdmin"];
export type BandejaAuditor = components["schemas"]["BandejaAuditor"];
export type ResumenCelulaLider = components["schemas"]["ResumenCelulaLider"];
export type PendienteConfiguracion = components["schemas"]["PendienteConfiguracion"];
export type RegistroAuditoriaUsuario = components["schemas"]["RegistroAuditoriaUsuario"];
export type PaginaAuditoriaUsuarios = components["schemas"]["PaginaAuditoriaUsuarios"];
export type PaginaBitacoraGlobal = components["schemas"]["PaginaBitacoraGlobal"];
export type EventoBitacoraGlobal = components["schemas"]["EventoBitacoraGlobal"];
export type PaginaCertificadosAuditoria = components["schemas"]["PaginaCertificadosAuditoria"];
export type CertificadoAuditoria = components["schemas"]["CertificadoAuditoria"];
export type CelulasLider = components["schemas"]["CelulasLider"];
export type SolicitudCelulasLider = components["schemas"]["SolicitudCelulasLider"];
export type ErrorRelacionesIncompatibles = components["schemas"]["ErrorRelacionesIncompatibles"];

/**
 * Reasignación del QE responsable de una HDU (E7-B05, solo Administrador). Declarado a mano porque el
 * contrato aún no trae `PUT /v1/hdu/{id}/qe-responsable`.
 * PENDIENTE: reemplazar por `components["schemas"][...]` al regenerar los tipos al integrar.
 */
export interface ReasignacionQeResponsable {
  qeResponsableId: string;
  /** Obligatorio, 3 a 500 caracteres. */
  motivo: string;
}
export interface ResultadoReasignacionQe {
  cambio: boolean;
  hdu: HduResumen;
  qeAnterior: UsuarioResumen;
  qeNuevo: UsuarioResumen;
  motivo: string;
}

/** Orden de los selectores de rol (diseño E7 §3.1). */
export const ROLES_CATALOGO: Rol[] = ["ANALISTA_QA", "QE", "LIDER_QA", "ADMINISTRADOR", "AUDITOR"];

/** Roles de solo lectura (D32): sin ninguna acción de escritura en el portal. */
export const ROLES_SOLO_LECTURA: Rol[] = ["LIDER_QA", "AUDITOR"];

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
  LIDER_QA: "Líder QA",
  AUDITOR: "Auditor",
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

/** Acción de bitácora en infinitivo (filtros y columnas del Auditor, D45). */
export const ETIQUETAS_ACCION_BITACORA: Record<AccionChecklist, string> = {
  MARCAR: "Marcar",
  DESMARCAR: "Desmarcar",
  APROBAR: "Aprobar",
  RECHAZAR: "Rechazar",
  GENERAR_CERTIFICADO: "Certificar",
};

/** Operaciones de la auditoría de usuarios (D45, tabla de `comun.v1.yaml#AccionAuditoria`). */
export const ETIQUETAS_OPERACION: Record<OperacionAuditoriaUsuarios, string> = {
  CREAR_USUARIO: "Registro de usuario",
  ACTUALIZAR_USUARIO: "Actualización de datos",
  ACTIVAR_USUARIO: "Activación",
  DESACTIVAR_USUARIO: "Desactivación",
  CAMBIAR_ROL: "Cambio de rol",
  ASIGNAR_SUPERVISOR: "Asignación de supervisor",
  CAMBIAR_SUPERVISOR: "Cambio de supervisor",
  ASIGNAR_CELULAS_LIDER: "Asignación de células",
  EXPORTAR: "Exportación",
};

export const ETIQUETAS_TIPO_ACCION_QE: Record<TipoAccionQe, string> = {
  APROBAR: "Aprobar",
  ASIGNAR: "Asignar analista",
  CERTIFICAR: "Generar certificado",
  CERRAR: "Cerrar HDU",
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
  switch (rol) {
    case "ADMINISTRADOR":
      return "/admin";
    case "QE":
      return "/qe";
    case "LIDER_QA":
      return "/lider";
    case "AUDITOR":
      return "/auditor";
    default:
      return "/qa";
  }
}

const ROL_POR_PORTAL: Record<string, Rol> = {
  admin: "ADMINISTRADOR",
  qe: "QE",
  qa: "ANALISTA_QA",
  lider: "LIDER_QA",
  auditor: "AUDITOR",
};

/** Rol dueño de un portal según la primera parte de la ruta, o `null` si la ruta es compartida (`/hdu/:id`, `/perfil`). */
export function rolDePortal(ruta: string): Rol | null {
  const primero = ruta.split(/[?#]/)[0]?.split("/")[1] ?? "";
  return ROL_POR_PORTAL[primero] ?? null;
}

/** Una ruta pedida antes del login solo se reutiliza si pertenece al portal del propio rol (D41). */
export function rutaPermitidaParaRol(ruta: string, rol: Rol): boolean {
  const duenio = rolDePortal(ruta);
  return duenio === null || duenio === rol;
}
