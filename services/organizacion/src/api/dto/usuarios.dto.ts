import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';

import { ROLES, type Rol } from '../../dominio/tipos.js';
import { PaginacionQueryDto, TransformBooleanoQuery } from './comunes.dto.js';

export class NuevoUsuarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  @MaxLength(150)
  correo!: string;

  @IsIn(ROLES)
  rol!: Rol;

  /** Células iniciales de un Líder QA (D42); con otro rol y una lista no vacía, 400 `NO_PERMITIDO`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  celulaIds?: string[];
}

export class ActualizacionUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  correo?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CambioRolDto {
  @IsIn(ROLES)
  rol!: Rol;

  /** Con `LIDER_QA`, fija las células en la misma transacción que el rol (D42). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  celulaIds?: string[];
}

export class SolicitudCelulasLiderDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  celulaIds!: string[];
}

export class ListarUsuariosQueryDto extends PaginacionQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  q?: string;

  @IsOptional()
  @IsIn(ROLES)
  rol?: Rol;

  @IsOptional()
  @TransformBooleanoQuery()
  @IsBoolean()
  activo?: boolean;
}
