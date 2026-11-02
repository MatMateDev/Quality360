/**
 * `/v1/interno/integraciones/*` (E5, D100, D120, D124): los llama Integraciones con el token del Administrador
 * propagado. No se publican en el gateway. Van `@Publico()` porque `AdministradorConSesionGuard` reemplaza a los
 * guards globales y rechaza con 403 la credencial de servicio (la semilla no escribe HDU por aquí).
 */
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';

import { IntegracionesAplicacion } from '../../aplicacion/integraciones.servicio.js';
import { UsuariosAplicacion } from '../../aplicacion/usuarios.servicio.js';
import { actorDeSolicitud } from '../guardias/obtener-actor.js';
import { AdministradorConSesionGuard } from '../guardias/administrador-con-sesion.guard.js';
import type { SolicitudConActor } from '../guardias/sesion-o-servicio.guard.js';
import { leerDestino, leerSolicitudUpsert } from '../validacion/integraciones.js';

@Publico()
@UseGuards(AdministradorConSesionGuard)
@Controller('v1/interno/integraciones')
export class IntegracionesInternoController {
  constructor(
    private readonly integraciones: IntegracionesAplicacion,
    private readonly usuarios: UsuariosAplicacion,
  ) {}

  /** Es una lectura que usa POST para enviar el destino; responde 200 con `errores[]`. */
  @Post('destino')
  @HttpCode(200)
  async destino(@Body() cuerpo: unknown) {
    return this.integraciones.resolverDestino(leerDestino(cuerpo));
  }

  @Post('hdu/upsert')
  @HttpCode(200)
  async upsert(@Body() cuerpo: unknown, @Req() solicitud: SolicitudConActor) {
    const dto = leerSolicitudUpsert(cuerpo);
    const actor = await actorDeSolicitud(solicitud, this.usuarios);
    return this.integraciones.upsert(dto, actor);
  }
}
