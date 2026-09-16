/**
 * `/v1/interno/*`: lo consumen Certificaciones e Impedimentos a través de
 * `ResolutorDeAccesoRemoto` (packages/auth-nest), propagando el token del
 * usuario. `AccesoGuard` global ya validó rol/activo; aquí solo se devuelve
 * la resolución (que además llenó `solicitud.acceso`).
 */
import { Controller, Get, Param } from '@nestjs/common';
import { AccesoActual, Roles, type ResolucionAcceso } from '@quality360/auth-nest';

import { AccesoAplicacion, type AccesoHduRespuesta } from '../../aplicacion/acceso.servicio.js';
import { uuidDeRuta } from '../validacion/uuid.js';

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA'] as const;

@Controller('v1/interno')
export class AccesoInternoController {
  constructor(private readonly acceso: AccesoAplicacion) {}

  @Roles(...ROLES_TODOS)
  @Get('acceso')
  resolverAcceso(@AccesoActual() acceso: ResolucionAcceso): ResolucionAcceso {
    return acceso;
  }

  @Roles(...ROLES_TODOS)
  @Get('hdu/:id/acceso')
  async resolverAccesoHdu(@Param('id') id: string, @AccesoActual() acceso: ResolucionAcceso): Promise<AccesoHduRespuesta> {
    return this.acceso.accesoHdu(uuidDeRuta(id), acceso.rol, acceso.usuarioId, acceso.ambito);
  }
}
