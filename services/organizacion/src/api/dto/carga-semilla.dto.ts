/**
 * DTO de `/v1/interno/carga/*`. Desviación del contrato: `CargaUsuario` no
 * lleva `contrasenaInicial` — la carga reutiliza la invitación de la Admin
 * API (igual que `POST /v1/usuarios`), sin manejar contraseñas.
 */
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { ROLES, type PrioridadHdu, type Rol } from '../../dominio/tipos.js';

const PRIORIDADES: readonly PrioridadHdu[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

export class CargaUsuarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(254)
  correo!: string;

  @IsIn(ROLES)
  rol!: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CargaCelulaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre!: string;
}

export class CargaSprintDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre!: string;

  @IsISO8601({ strict: true })
  inicio!: string;

  @IsISO8601({ strict: true })
  fin!: string;
}

export class CargaHduDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
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

  @IsUUID('4')
  qeResponsableId!: string;
}
