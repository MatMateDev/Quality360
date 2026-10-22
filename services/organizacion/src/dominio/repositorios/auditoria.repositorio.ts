import type { RecursoExportacion } from '../reglas/auditoria-usuarios.js';
import type { Actor, AccionAuditoria, EntidadAuditoria, OpcionesPaginacion, Pagina, RegistroAuditoria } from '../tipos.js';

export interface FiltroAuditoria {
  readonly entidad?: EntidadAuditoria;
  readonly entidadId?: string;
  readonly desde?: Date;
  readonly hasta?: Date;
}

/** Filtros de la auditoría de usuarios que ve el Auditor (E7-B04). */
export interface FiltroAuditoriaUsuarios {
  readonly desde?: Date;
  readonly hasta?: Date;
  readonly actorId?: string;
  readonly operacion?: AccionAuditoria;
  readonly usuarioAfectadoId?: string;
}

/** Entrada de la auditoría de usuarios con el usuario sobre el que se hizo el cambio. */
export interface RegistroAuditoriaUsuarioDominio extends RegistroAuditoria {
  readonly usuarioAfectadoId: string | null;
}

/** Token de inyección del repositorio de auditoría (las escrituras de negocio las hace cada repositorio en su propia transacción). */
export const AUDITORIA_REPOSITORIO = Symbol('AUDITORIA_REPOSITORIO');

export interface AuditoriaRepositorio {
  listar(filtro: FiltroAuditoria, paginacion: OpcionesPaginacion): Promise<Pagina<RegistroAuditoria>>;

  /** Auditoría de usuarios (entidades USUARIO, SUPERVISION y EXPORTACION), de la más reciente a la más antigua. */
  listarUsuarios(filtro: FiltroAuditoriaUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<RegistroAuditoriaUsuarioDominio>>;
  contarUsuarios(filtro: FiltroAuditoriaUsuarios): Promise<number>;
  /** Todas las que cumplen el filtro, hasta `limite` filas (para exportar). */
  listarUsuariosHasta(filtro: FiltroAuditoriaUsuarios, limite: number): Promise<RegistroAuditoriaUsuarioDominio[]>;

  /** Registra `EXPORTAR` (entidad `EXPORTACION`) con actor, recurso, filtros y filas (D35, D48). Devuelve el id. */
  registrarExportacion(input: {
    actor: Actor;
    recurso: RecursoExportacion;
    filtros: Record<string, unknown>;
    filas: number;
  }): Promise<{ id: string }>;
}
