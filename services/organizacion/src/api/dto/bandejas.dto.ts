/**
 * Parámetros de las bandejas y de las consultas del Auditor (D49): `celulaId`, `sprintId`,
 * `estado`, `qeId`, `analistaId`, `q` (mínimo 2 caracteres), `orden=columna:asc|desc`,
 * `pagina` y `tamanoPagina` (25 por defecto; un valor mayor a 100 se recorta, sin error).
 * Cada bandeja acepta solo los suyos: cualquier otro responde 400.
 */
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

import { TIPOS_ACCION_QE, type TipoAccionQe } from '../../dominio/reglas/bandejas.js';
import { OPERACIONES_AUDITORIA_USUARIOS } from '../../dominio/reglas/auditoria-usuarios.js';
import type { AccionAuditoria, EstadoHdu } from '../../dominio/tipos.js';
import { TransformBooleanoQuery, TransformEnteroQuery } from './comunes.dto.js';

const ESTADOS: readonly EstadoHdu[] = ['PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA'];

/** Sin máximo en el DTO: un tamaño mayor a 100 se recorta en el caso de uso. */
export class PaginacionBandejaDto {
  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  tamanoPagina?: number;
}

export class BandejaAnalistaQueryDto extends PaginacionBandejaDto {
  @IsOptional()
  @IsIn(ESTADOS)
  estado?: EstadoHdu;

  @IsOptional()
  @IsUUID('all')
  celulaId?: string;

  @IsOptional()
  @IsUUID('all')
  sprintId?: string;

  @IsOptional()
  @TransformBooleanoQuery()
  @IsBoolean()
  soloConObservaciones?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]+:(asc|desc)$/)
  orden?: string;
}

export class BandejaQeQueryDto extends PaginacionBandejaDto {
  @IsOptional()
  @IsIn(TIPOS_ACCION_QE)
  tipoAccion?: TipoAccionQe;

  @IsOptional()
  @IsUUID('all')
  celulaId?: string;

  @IsOptional()
  @IsUUID('all')
  sprintId?: string;

  @IsOptional()
  @IsUUID('all')
  analistaId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;
}

export class BandejaLiderQueryDto extends PaginacionBandejaDto {
  @IsOptional()
  @IsUUID('all')
  celulaId?: string;

  @IsOptional()
  @IsUUID('all')
  sprintId?: string;

  @IsOptional()
  @IsIn(ESTADOS)
  estado?: EstadoHdu;

  @IsOptional()
  @IsUUID('all')
  qeId?: string;

  @IsOptional()
  @IsUUID('all')
  analistaId?: string;

  @IsOptional()
  @TransformBooleanoQuery()
  @IsBoolean()
  sinAnalista?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]+:(asc|desc)$/)
  orden?: string;
}

export class BandejaAdminQueryDto extends PaginacionBandejaDto {}

/** Filtros de la pestaña HDU del Auditor; los usa también su exportación. */
export class FiltrosHduAuditorDto {
  @IsOptional()
  @IsUUID('all')
  celulaId?: string;

  @IsOptional()
  @IsUUID('all')
  sprintId?: string;

  @IsOptional()
  @IsIn(ESTADOS)
  estado?: EstadoHdu;

  @IsOptional()
  @IsUUID('all')
  qeId?: string;

  @IsOptional()
  @IsUUID('all')
  analistaId?: string;

  @IsOptional()
  @IsIn(['con', 'sin'])
  certificado?: 'con' | 'sin';

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;
}

export class BandejaAuditorQueryDto extends FiltrosHduAuditorDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]+:(asc|desc)$/)
  orden?: string;

  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  tamanoPagina?: number;
}

/** Filtros de la auditoría de usuarios; la exportación usa los mismos. */
export class FiltrosAuditoriaUsuariosDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsUUID('all')
  actorId?: string;

  @IsOptional()
  @IsIn(OPERACIONES_AUDITORIA_USUARIOS)
  operacion?: AccionAuditoria;

  @IsOptional()
  @IsUUID('all')
  usuarioAfectadoId?: string;
}

export class AuditoriaUsuariosQueryDto extends FiltrosAuditoriaUsuariosDto {
  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  tamanoPagina?: number;
}
