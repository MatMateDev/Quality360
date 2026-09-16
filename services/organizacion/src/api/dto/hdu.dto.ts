import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

import { type EstadoHdu, type PrioridadHdu } from '../../dominio/tipos.js';
import { PaginacionQueryDto } from './comunes.dto.js';

const ESTADOS: readonly EstadoHdu[] = ['PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA'];
const PRIORIDADES: readonly PrioridadHdu[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

export class NuevaHduDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo!: string;

  @IsUUID('4')
  celulaId!: string;

  @IsUUID('4')
  sprintId!: string;

  @IsIn(PRIORIDADES)
  prioridad!: PrioridadHdu;
}

export class AsignacionAnalistaDto {
  @IsUUID('4')
  analistaId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo?: string;
}

export class SolicitudCambioEstadoDto {
  @IsIn(ESTADOS)
  estado!: EstadoHdu;
}

export class ListarHduQueryDto extends PaginacionQueryDto {
  @IsOptional()
  @IsUUID('4')
  celulaId?: string;

  @IsOptional()
  @IsUUID('4')
  sprintId?: string;

  @IsOptional()
  @IsIn(ESTADOS)
  estado?: EstadoHdu;
}
