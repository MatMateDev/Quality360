/**
 * `GET /v1/hdu/{hduId}/checklist`: el checklist de 10 entregables llega con
 * E3 (fuera de alcance en esta corrida). Responde siempre 501
 * `CAPACIDAD_NO_DISPONIBLE`, que es la señal con la que Organización rechaza
 * el cierre de una HDU (D11).
 */
import { Controller, Get, Param } from '@nestjs/common';
import { Roles, capacidadNoDisponible } from '@quality360/auth-nest';

@Controller('v1/hdu')
export class ChecklistController {
  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @Get(':hduId/checklist')
  obtener(@Param('hduId') hduId: string): never {
    throw capacidadNoDisponible(501, `checklist de la HDU ${hduId}: E3 fuera de alcance en esta corrida`);
  }
}
