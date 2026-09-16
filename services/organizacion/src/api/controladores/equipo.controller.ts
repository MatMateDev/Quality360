import { Controller, Get, Query } from '@nestjs/common';
import { AccesoActual, Roles, accesoDenegado, errorValidacion, type ResolucionAcceso } from '@quality360/auth-nest';
import { IsOptional, IsUUID } from 'class-validator';

import { SupervisionAplicacion } from '../../aplicacion/supervision.servicio.js';

class QeIdQueryDto {
  @IsOptional()
  @IsUUID('4')
  qeId?: string;
}

@Controller('v1/qe')
export class EquipoController {
  constructor(private readonly supervision: SupervisionAplicacion) {}

  @Roles('QE', 'ADMINISTRADOR')
  @Get('analistas')
  async analistas(@AccesoActual() acceso: ResolucionAcceso, @Query() query: QeIdQueryDto) {
    if (acceso.rol === 'ADMINISTRADOR') {
      if (query.qeId === undefined) {
        throw errorValidacion([{ campo: 'query.qeId', codigo: 'REQUERIDO', mensaje: 'qeId es obligatorio.' }]);
      }
      return this.supervision.equipoVigente(query.qeId);
    }
    if (query.qeId !== undefined && query.qeId !== acceso.usuarioId) throw accesoDenegado('equipo de otro QE');
    return this.supervision.equipoVigente(acceso.usuarioId);
  }

  @Roles('QE', 'ADMINISTRADOR')
  @Get('analistas-asignables')
  async analistasAsignables(@AccesoActual() acceso: ResolucionAcceso) {
    const items = await this.supervision.analistasAsignables(acceso.rol as 'ADMINISTRADOR' | 'QE', acceso.usuarioId);
    return { items };
  }
}
