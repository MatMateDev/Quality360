/** Historial de ejecuciones (E5-F04, E5-B04#2): Administrador, QE y Auditor, solo lectura (D93, D106). */
import { Controller, Get, Param, Query, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { HistorialAplicacion } from '../../aplicacion/historial.servicio.js';
import { FiltroErroresIntegraciones } from '../filtros/filtro-integraciones.js';
import { solicitanteDe } from '../solicitante.js';
import { uuidDeRuta } from '../validacion/comunes.js';
import { leerDetalle, leerListado } from '../validacion/consultas.js';

@UseFilters(FiltroErroresIntegraciones)
@Roles('ADMINISTRADOR', 'QE', 'AUDITOR')
@Controller('v1/integraciones')
export class HistorialController {
  constructor(private readonly historial: HistorialAplicacion) {}

  @Get('ejecuciones')
  async listar(@Query() consulta: Record<string, unknown>) {
    return this.historial.listar(leerListado(consulta));
  }

  @Get('estado')
  async estado(@IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.historial.estado(solicitanteDe(identidad, acceso, solicitud));
  }

  @Get('ejecuciones/:id')
  async obtener(@Param('id') id: string, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.historial.obtener(solicitanteDe(identidad, acceso, solicitud), uuidDeRuta(id, 'id'));
  }

  @Get('ejecuciones/:id/detalle')
  async detalle(
    @Param('id') id: string,
    @Query() consulta: Record<string, unknown>,
    @IdentidadActual() identidad: Identidad | undefined,
    @AccesoActual() acceso: ResolucionAcceso | undefined,
    @Req() solicitud: Request,
  ) {
    const entrada = leerDetalle(consulta);
    return this.historial.detalle(solicitanteDe(identidad, acceso, solicitud), uuidDeRuta(id, 'id'), entrada);
  }
}
