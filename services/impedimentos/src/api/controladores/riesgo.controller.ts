/**
 * Riesgo de las HDU (E4-B03): nivel vigente y sugerido, cambio manual del QE responsable y
 * listado «Riesgo por HDU». El Analista QA no ve el riesgo (D73): `@Roles` lo deja fuera con 403.
 */
import { Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { ListadosAplicacion } from '../../aplicacion/listados.servicio.js';
import { RiesgoAplicacion } from '../../aplicacion/riesgo.servicio.js';
import { solicitanteDe } from '../solicitante.js';
import { leerCambioRiesgo, uuidDeRuta } from '../validacion/cuerpos.js';
import { leerFiltrosRiesgoHdu } from '../validacion/consultas.js';

type Consulta = Record<string, unknown>;

@Controller('v1')
export class RiesgoController {
  constructor(
    private readonly riesgo: RiesgoAplicacion,
    private readonly listados: ListadosAplicacion,
  ) {}

  @Roles('QE', 'LIDER_QA', 'ADMINISTRADOR', 'AUDITOR')
  @Get('hdu/:hduId/riesgo')
  obtener(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.riesgo.obtener(uuidDeRuta(hduId, 'hduId'), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('QE')
  @Put('hdu/:hduId/riesgo')
  async fijar(
    @Param('hduId') hduId: string,
    @Body() cuerpo: unknown,
    @IdentidadActual() identidad: Identidad,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: Request,
  ) {
    const solicitante = solicitanteDe(identidad, acceso, solicitud);
    const previo = await this.riesgo.autorizarFijar(uuidDeRuta(hduId, 'hduId'), solicitante);
    return this.riesgo.fijar(previo, leerCambioRiesgo(cuerpo), solicitante);
  }

  @Roles('QE', 'LIDER_QA', 'ADMINISTRADOR', 'AUDITOR')
  @Get('riesgo/hdu')
  listar(@Query() consulta: Consulta, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.listados.riesgoPorHdu(leerFiltrosRiesgoHdu(consulta), solicitanteDe(identidad, acceso, solicitud));
  }
}
