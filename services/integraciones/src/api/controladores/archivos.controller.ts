/** Archivos CSV/JSON (E5-F03, E5-B03): vista previa e importación. Solo el Administrador. */
import { Body, Controller, HttpCode, Post, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { ArchivosAplicacion } from '../../aplicacion/archivos.servicio.js';
import { vistaEjecucion } from '../../aplicacion/vistas.js';
import { FiltroErroresIntegraciones } from '../filtros/filtro-integraciones.js';
import { solicitanteDe } from '../solicitante.js';
import { leerArchivo } from '../validacion/cuerpos.js';

@UseFilters(FiltroErroresIntegraciones)
@Roles('ADMINISTRADOR')
@Controller('v1/integraciones/archivos')
export class ArchivosController {
  constructor(private readonly archivos: ArchivosAplicacion) {}

  @Post('vista-previa')
  @HttpCode(200)
  async vistaPrevia(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.archivos.vistaPrevia(solicitanteDe(identidad, acceso, solicitud), leerArchivo(cuerpo));
  }

  @Post('importaciones')
  @HttpCode(200)
  async importar(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return vistaEjecucion(await this.archivos.importar(solicitanteDe(identidad, acceso, solicitud), leerArchivo(cuerpo)));
  }
}
