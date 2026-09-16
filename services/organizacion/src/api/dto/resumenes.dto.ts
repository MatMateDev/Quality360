import { IsOptional, IsUUID } from 'class-validator';

/** Opcional para Analista QA (solo su propio id); obligatorio para Administrador. */
export class AnalistaIdQueryDto {
  @IsOptional()
  @IsUUID('4')
  analistaId?: string;
}
