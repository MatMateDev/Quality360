import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AsignacionSupervisorDto {
  @IsUUID('4')
  qeId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo?: string;
}
