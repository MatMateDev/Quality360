import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** `true`/`false` de la query string a boolean; cualquier otro valor se deja intacto (falla la validación de tipo). */
export function TransformBooleanoQuery() {
  // Se lee el valor crudo de la query: con la conversión implícita, 'false' ya llegaría como true.
  return Transform(({ value: convertido, obj, key }: { value: unknown; obj: Record<string, unknown>; key: string }) => {
    const value = obj[key] ?? convertido;
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}

export function TransformEnteroQuery() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === '') return undefined;
    const numero = Number(value);
    return Number.isNaN(numero) ? value : numero;
  });
}

export class PaginacionQueryDto {
  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @TransformEnteroQuery()
  @IsInt()
  @Min(1)
  @Max(100)
  tamanoPagina: number = 20;
}
