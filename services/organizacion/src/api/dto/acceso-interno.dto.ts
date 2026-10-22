import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsObject, IsUUID, Min } from 'class-validator';

import { RECURSOS_EXPORTACION, type RecursoExportacion } from '../../dominio/reglas/auditoria-usuarios.js';

/** Hasta 1000 ids por consulta en lote (D47). */
export class ConsultaHduLoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  hduIds!: string[];
}

/** Exportación hecha por otro servicio, que se registra en la auditoría (D48). */
export class RegistroExportacionDto {
  @IsIn(RECURSOS_EXPORTACION)
  recurso!: RecursoExportacion;

  @IsObject()
  filtros!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  filas!: number;
}
