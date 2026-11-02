/**
 * Configuración de Jira (E5-F01, E5-B01): solo el Administrador (D93, D126). El rol sale de Organización en cada
 * solicitud; el token que viaja en el cuerpo nunca se registra ni vuelve a salir en ninguna respuesta.
 */
import { Body, Controller, Get, HttpCode, Inject, Post, Put, Query, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { ConfiguracionAplicacion } from '../../aplicacion/configuracion.servicio.js';
import { CONFIGURACION, type ConfiguracionIntegraciones } from '../../configuracion.js';
import { FiltroErroresIntegraciones } from '../filtros/filtro-integraciones.js';
import { solicitanteDe } from '../solicitante.js';
import { leerPaginaEventos } from '../validacion/consultas.js';
import { leerGuardado, leerPrueba } from '../validacion/cuerpos.js';

@UseFilters(FiltroErroresIntegraciones)
@Roles('ADMINISTRADOR')
@Controller('v1/integraciones/jira/configuracion')
export class ConexionController {
  constructor(
    private readonly configuraciones: ConfiguracionAplicacion,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  @Get()
  async obtener(@IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.configuraciones.obtener(solicitanteDe(identidad, acceso, solicitud));
  }

  @Put()
  @HttpCode(200)
  async guardar(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const entrada = leerGuardado(cuerpo, this.configuracion);
    return this.configuraciones.guardar(solicitanteDe(identidad, acceso, solicitud), entrada);
  }

  @Post('probar')
  @HttpCode(200)
  async probar(@Body() cuerpo: unknown) {
    return this.configuraciones.probar(leerPrueba(cuerpo, this.configuracion));
  }

  @Get('eventos')
  async eventos(@Query() consulta: Record<string, unknown>) {
    const { pagina, tamanoPagina } = leerPaginaEventos(consulta);
    return this.configuraciones.eventos(pagina, tamanoPagina);
  }
}
