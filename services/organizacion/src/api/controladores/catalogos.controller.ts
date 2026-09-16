import { Controller, Get } from '@nestjs/common';
import { Roles } from '@quality360/auth-nest';

import { CatalogosAplicacion } from '../../aplicacion/catalogos.servicio.js';

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA'] as const;

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
}
