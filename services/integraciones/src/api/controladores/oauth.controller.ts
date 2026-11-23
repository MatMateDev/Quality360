/**
 * Conexión OAuth 2.0 (3LO) con Jira (E5-B08): solo el Administrador y siempre con sesión (D210). No existe ninguna ruta
 * pública: Atlassian vuelve a una página del portal y esta API se llama con la sesión. Los cuerpos con `code` y `state` nunca
 * se registran (el registro de Nest no los toca) y la respuesta de `iniciar`, que lleva el `state`, no se guarda en cachés.
 */
import { Body, Controller, Delete, Header, HttpCode, Post, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { OauthJiraAplicacion } from '../../aplicacion/oauth-jira.servicio.js';
import { FiltroErroresIntegraciones } from '../filtros/filtro-integraciones.js';
import { solicitanteDe } from '../solicitante.js';
import { leerRetornoOauth, leerSitioOauth } from '../validacion/oauth.js';

@UseFilters(FiltroErroresIntegraciones)
@Roles('ADMINISTRADOR')
@Controller('v1/integraciones/jira/oauth')
export class OauthController {
  constructor(private readonly oauth: OauthJiraAplicacion) {}

  @Post('iniciar')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async iniciar(@IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.oauth.iniciar(solicitanteDe(identidad, acceso, solicitud));
  }

  @Post('retorno')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async retorno(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const entrada = leerRetornoOauth(cuerpo);
    return this.oauth.retorno(solicitanteDe(identidad, acceso, solicitud), entrada);
  }

  @Post('sitio')
  @HttpCode(200)
  async sitio(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const entrada = leerSitioOauth(cuerpo);
    return this.oauth.elegirSitio(solicitanteDe(identidad, acceso, solicitud), entrada);
  }

  @Delete()
  @HttpCode(204)
  async desconectar(@IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request): Promise<void> {
    await this.oauth.desconectar(solicitanteDe(identidad, acceso, solicitud));
  }
}
