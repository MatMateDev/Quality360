/**
 * Consulta de Jira (E5 consulta y asignación): solo el Administrador (D142). Ninguna ruta de lectura o edición llama a
 * Jira; solo `POST consultas` y `POST …/continuaciones` lo hacen. `actual` se declara antes que `:id`.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { ConsultaAplicacion } from '../../aplicacion/consulta.servicio.js';
import { ConfirmacionAplicacion } from '../../aplicacion/confirmacion.servicio.js';
import { EdicionConsultaAplicacion } from '../../aplicacion/edicion-consulta.servicio.js';
import { FiltroErroresIntegraciones } from '../filtros/filtro-integraciones.js';
import { solicitanteDe } from '../solicitante.js';
import { uuidDeRuta } from '../validacion/comunes.js';
import { leerConfirmacion, leerConsultar, leerEdicion, leerItems } from '../validacion/consulta.js';

@UseFilters(FiltroErroresIntegraciones)
@Roles('ADMINISTRADOR')
@Controller('v1/integraciones/jira/consultas')
export class ConsultaController {
  constructor(
    private readonly consulta: ConsultaAplicacion,
    private readonly edicion: EdicionConsultaAplicacion,
    private readonly confirmacion: ConfirmacionAplicacion,
  ) {}

  @Post()
  @HttpCode(200)
  async consultar(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const entrada = leerConsultar(cuerpo);
    return this.consulta.consultar(solicitanteDe(identidad, acceso, solicitud), entrada);
  }

  @Get('actual')
  async actual() {
    return this.consulta.actual();
  }

  @Get(':id')
  async obtener(@Param('id') id: string) {
    return this.consulta.obtener(uuidDeRuta(id, 'id'));
  }

  @Post(':id/continuaciones')
  @HttpCode(200)
  async continuar(@Param('id') id: string, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.consulta.continuar(solicitanteDe(identidad, acceso, solicitud), uuidDeRuta(id, 'id'));
  }

  @Get(':id/items')
  async items(@Param('id') id: string, @Query() consulta: Record<string, unknown>) {
    const idConsulta = uuidDeRuta(id, 'id');
    return this.consulta.listarItems(idConsulta, leerItems(consulta));
  }

  /** Orden de errores: 404 (la consulta) → 400 (el cuerpo) → 410/409 (estado) → 422 (una sola fila). */
  @Patch(':id/items')
  async editar(@Param('id') id: string, @Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const idConsulta = uuidDeRuta(id, 'id');
    await this.consulta.existente(idConsulta);
    const entrada = leerEdicion(cuerpo);
    return this.edicion.editar(solicitanteDe(identidad, acceso, solicitud), idConsulta, entrada);
  }

  /** Orden de errores: 404 → 400 → 410 → 409 → 422. No llama a Jira ni lee la configuración. */
  @Post(':id/confirmaciones')
  @HttpCode(200)
  async confirmar(@Param('id') id: string, @Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    const idConsulta = uuidDeRuta(id, 'id');
    await this.consulta.existente(idConsulta);
    const entrada = leerConfirmacion(cuerpo);
    return this.confirmacion.confirmar(solicitanteDe(identidad, acceso, solicitud), idConsulta, entrada);
  }

  @Post(':id/descartes')
  @HttpCode(200)
  async descartar(@Param('id') id: string, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request) {
    return this.consulta.descartar(solicitanteDe(identidad, acceso, solicitud), uuidDeRuta(id, 'id'));
  }
}
