import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

import type { EntidadAuditoria } from '../../dominio/tipos.js';
import { PaginacionQueryDto } from './comunes.dto.js';

const ENTIDADES: readonly EntidadAuditoria[] = ['USUARIO', 'SUPERVISION', 'HDU'];

export class AuditoriaQueryDto extends PaginacionQueryDto {
  @IsOptional()
  @IsIn(ENTIDADES)
  entidad?: EntidadAuditoria;

  @IsOptional()
  @IsUUID('4')
  entidadId?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
