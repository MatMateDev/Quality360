/**
 * Puertos hacia los otros servicios. Impedimentos nunca lee el esquema de Organización ni el de
 * Certificaciones (regla no negociable 1): pregunta por API con el token del usuario propagado.
 */
import type { EstadoHdu, Persona, PersonaRol, RelacionHdu, RolUsuario } from '../dominio/tipos.js';

export interface ContextoSolicitud {
  readonly token: string;
  readonly traceId: string;
}

/** Datos de una HDU (`HduParaCertificacion` de Organización, D86). */
export interface DatosHdu {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly celula: { readonly id: string; readonly nombre: string };
  readonly sprint: { readonly id: string; readonly nombre: string };
  /** Fin del sprint vigente (`AAAA-MM-DD`), o `null` si la HDU no tiene sprint vigente. */
  readonly sprintFin: string | null;
  readonly qeResponsable: Persona;
  readonly analista: Persona | null;
}

export interface CandidatosResponsable {
  readonly registro: readonly PersonaRol[];
  readonly escalamiento: readonly PersonaRol[];
}

/** Acceso permitido a una HDU: relación, quién consulta, la HDU y, si se pidió, los candidatos. */
export interface AccesoHdu {
  readonly relacion: RelacionHdu;
  readonly actor: PersonaRol;
  readonly hdu: DatosHdu;
  readonly candidatos: CandidatosResponsable | null;
}

/** HDU que el usuario puede leer (D47): `todas` para Administrador y Auditor. */
export interface AmbitoLecturaHdu {
  readonly usuarioId: string;
  readonly rol: RolUsuario;
  readonly todas: boolean;
  readonly hduIds: readonly string[];
}

export interface RegistroExportacion {
  readonly recurso: 'IMPEDIMENTOS' | 'GESTION_IMPEDIMENTOS';
  readonly filtros: Record<string, unknown>;
  readonly filas: number;
}

/** Organización: acceso, ámbito y datos de HDU (`/v1/interno/*`). */
export abstract class ProveedorAcceso {
  /** `null` si la HDU no existe o está fuera de ámbito (D12): quien llama decide 403 o 404. */
  abstract accesoHdu(hduId: string, contexto: ContextoSolicitud, opciones?: { incluirCandidatos?: boolean }): Promise<AccesoHdu | null>;
  abstract ambito(contexto: ContextoSolicitud): Promise<AmbitoLecturaHdu>;
  abstract ambitoDetalle(contexto: ContextoSolicitud, incluirCerradas: boolean): Promise<DatosHdu[]>;
  /** Datos de las HDU pedidas; las desconocidas se omiten (Administrador y Auditor, D55). */
  abstract consultarHdu(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<DatosHdu[]>;
  /** Registra la exportación en la auditoría de Organización (D48); lanza 503 si falla. */
  abstract registrarExportacion(exportacion: RegistroExportacion, contexto: ContextoSolicitud): Promise<void>;
}

export interface SeguimientoMinimo {
  readonly hduId: string;
  readonly certificacionId: string | null;
  /** `aprobados / 10 × 100`. */
  readonly porcentaje: number;
}

/** Certificaciones: avance y ciclo activo (`POST /v1/interno/checklist/estados`). */
export abstract class ProveedorSeguimiento {
  /** Lanza `FuenteNoDisponible` si Certificaciones no responde. */
  abstract estados(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<Map<string, SeguimientoMinimo>>;
}
