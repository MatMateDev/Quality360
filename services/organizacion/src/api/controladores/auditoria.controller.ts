import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '@quality360/auth-nest';

import { AuditoriaAplicacion } from '../../aplicacion/auditoria.servicio.js';
import { AuditoriaQueryDto } from '../dto/auditoria.dto.js';

@Controller('v1/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaAplicacion) {}

  @Roles('ADMINISTRADOR')
  @Get()
  async listar(@Query() query: AuditoriaQueryDto) {
    return this.auditoria.listar(
      {
        entidad: query.entidad,
        entidadId: query.entidadId,
        desde: query.desde !== undefined ? new Date(query.desde) : undefined,
        hasta: query.hasta !== undefined ? new Date(query.hasta) : undefined,
      },
      { pagina: query.pagina, tamanoPagina: query.tamanoPagina },
    );
  }
}
