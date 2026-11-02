/** Sincronización con Jira (E5-F02, E5-B02): solo el Administrador. Responde la `Ejecucion` cerrada (D113). */
import { Body, Controller, HttpCode, Post, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { SincronizacionAplicacion } from '../../aplicacion/sincronizacion.servicio.js';
import { vistaEjecucion } from '../../aplicacion/vistas.js';
import { FiltroErroresIntegraciones } from '../filtros/filtro-integraciones.js';
import { solicitanteDe } from '../solicitante.js';
import { leerSincronizacion } from '../validacion/cuerpos.js';

@UseFilters(FiltroErroresIntegraciones)
@Roles('ADMINISTRADOR')
@Controller('v1/integraciones/jira/sincronizaciones')
export class SincronizacionController {
  constructor(private readonly sincronizacion: SincronizacionAplicacion) {}

  @Post()
  @HttpCode(200)
  async sincronizar(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const entrada = leerSincronizacion(cuerpo);
    return vistaEjecucion(await this.sincronizacion.sincronizar(solicitanteDe(identidad, acceso, solicitud), entrada));
  }
}
