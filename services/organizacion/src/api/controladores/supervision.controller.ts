/**
 * `PUT /v1/analistas/{id}/supervisor` acepta `sesionSupabase` (Administrador)
 * o `credencialServicio` (la semilla, ADR 0007): usa `SesionOServicioGuard`
 * en vez de los guards globales (`@Publico()` los apaga en esta ruta).
 */
import { Body, Controller, Get, Param, Put, Req, Res, UseGuards } from '@nestjs/common';
import { Publico, Roles } from '@quality360/auth-nest';
import type { Response } from 'express';

import { SupervisionAplicacion } from '../../aplicacion/supervision.servicio.js';
import { UsuariosAplicacion } from '../../aplicacion/usuarios.servicio.js';
import { PermiteServicio } from '../decoradores/permite-servicio.decorator.js';
import { AsignacionSupervisorDto } from '../dto/supervision.dto.js';
import { actorDeSolicitud } from '../guardias/obtener-actor.js';
import { SesionOServicioGuard, type SolicitudConActor } from '../guardias/sesion-o-servicio.guard.js';
import { uuidDeRuta } from '../validacion/uuid.js';

@Controller('v1/analistas')
export class SupervisionController {
  constructor(
    private readonly supervision: SupervisionAplicacion,
    private readonly usuarios: UsuariosAplicacion,
  ) {}

  @Publico()
  @PermiteServicio()
  @Roles('ADMINISTRADOR')
  @UseGuards(SesionOServicioGuard)
  @Put(':id/supervisor')
  async asignarSupervisor(
    @Param('id') id: string,
    @Body() dto: AsignacionSupervisorDto,
    @Req() solicitud: SolicitudConActor,
    @Res() respuesta: Response,
  ): Promise<void> {
    const analistaId = uuidDeRuta(id);
    const actor = await actorDeSolicitud(solicitud, this.usuarios);
    const resultado = await this.supervision.asignarSupervisor(analistaId, dto.qeId, dto.motivo, actor);
    respuesta.status(200).json(resultado);
  }

  @Roles('ADMINISTRADOR')
  @Get(':id/supervision/historial')
  async historial(@Param('id') id: string) {
    return this.supervision.historial(uuidDeRuta(id));
  }
}
