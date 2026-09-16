/** Fuentes de los bloques de `/v1/inicio/*` del gateway (una ruta por bloque, D · regla 4). */
import { Controller, Get, Query } from '@nestjs/common';
import { AccesoActual, Roles, type ResolucionAcceso } from '@quality360/auth-nest';

import { ResumenesAplicacion } from '../../aplicacion/resumenes.servicio.js';
import { SupervisionAplicacion } from '../../aplicacion/supervision.servicio.js';
import { UsuariosAplicacion } from '../../aplicacion/usuarios.servicio.js';
import { AnalistaIdQueryDto } from '../dto/resumenes.dto.js';

@Controller('v1/resumenes')
export class ResumenesController {
  constructor(
    private readonly resumenes: ResumenesAplicacion,
    private readonly supervision: SupervisionAplicacion,
    private readonly usuarios: UsuariosAplicacion,
  ) {}

  @Roles('ADMINISTRADOR')
  @Get('admin/usuarios')
  async resumenUsuariosAdmin() {
    return this.usuarios.resumenAdmin();
  }

  @Roles('ADMINISTRADOR')
  @Get('admin/supervision')
  async resumenSupervisionAdmin() {
    return this.supervision.resumenAdmin();
  }

  @Roles('QE')
  @Get('qe/equipo')
  async resumenEquipoQe(@AccesoActual() acceso: ResolucionAcceso) {
    return this.supervision.resumenEquipoQe(acceso.usuarioId);
  }

  @Roles('QE')
  @Get('qe/hdu')
  async resumenHduQe(@AccesoActual() acceso: ResolucionAcceso) {
    return this.resumenes.resumenHduQe(acceso.usuarioId, acceso.ambito.analistasSupervisadosIds);
  }

  @Roles('ANALISTA_QA', 'ADMINISTRADOR')
  @Get('qa/supervisor')
  async resumenSupervisorQa(@AccesoActual() acceso: ResolucionAcceso, @Query() query: AnalistaIdQueryDto) {
    const analistaId = await this.resumenes.resolverAnalistaId(acceso.rol, acceso.usuarioId, query.analistaId);
    return this.supervision.resumenSupervisorQa(analistaId);
  }

  @Roles('ANALISTA_QA', 'ADMINISTRADOR')
  @Get('qa/hdu')
  async resumenHduQa(@AccesoActual() acceso: ResolucionAcceso, @Query() query: AnalistaIdQueryDto) {
    const analistaId = await this.resumenes.resolverAnalistaId(acceso.rol, acceso.usuarioId, query.analistaId);
    return this.resumenes.resumenHduQa(analistaId);
  }
}
