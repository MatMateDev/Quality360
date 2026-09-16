import type { EntidadAuditoria, OpcionesPaginacion, Pagina, RegistroAuditoria } from '../tipos.js';

export interface FiltroAuditoria {
  readonly entidad?: EntidadAuditoria;
  readonly entidadId?: string;
  readonly desde?: Date;
  readonly hasta?: Date;
}

/** Token de inyección del repositorio de auditoría (solo lectura: las escrituras las hace cada repositorio en su propia transacción). */
export const AUDITORIA_REPOSITORIO = Symbol('AUDITORIA_REPOSITORIO');

export interface AuditoriaRepositorio {
  listar(filtro: FiltroAuditoria, paginacion: OpcionesPaginacion): Promise<Pagina<RegistroAuditoria>>;
}
