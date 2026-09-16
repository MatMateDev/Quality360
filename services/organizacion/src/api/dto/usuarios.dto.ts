import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

import { ROLES, type Rol } from '../../dominio/tipos.js';
import { PaginacionQueryDto, TransformBooleanoQuery } from './comunes.dto.js';

export class NuevoUsuarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsIn(ROLES)
  rol!: Rol;
}

export class ActualizacionUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  correo?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CambioRolDto {
  @IsIn(ROLES)
  rol!: Rol;
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
