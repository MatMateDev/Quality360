import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '@quality360/auth-nest';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { CatalogosAplicacion } from '../../aplicacion/catalogos.servicio.js';
import { ROLES, type Rol } from '../../dominio/tipos.js';
import { TransformBooleanoQuery } from '../dto/comunes.dto.js';

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

class PersonasQueryDto {
  @IsOptional()
  @IsIn(ROLES)
  rol?: Rol;

  @IsOptional()
  @TransformBooleanoQuery()
  @IsBoolean()
  activo?: boolean;
}

@Controller('v1/catalogos')
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosAplicacion) {}

  @Roles(...ROLES_TODOS)
  @Get('celulas')
  async celulas() {
    return this.catalogos.celulas();
  }

  @Roles(...ROLES_TODOS)
  @Get('sprints')
  async sprints() {
    return this.catalogos.sprints();
  }

  /** Personas por rol para elegir al QE de una reasignación (D54). Solo el Administrador: trae correos. */
  @Roles('ADMINISTRADOR')
  @Get('personas')
  async personas(@Query() query: PersonasQueryDto) {
    return this.catalogos.personas(query);
  }
}
