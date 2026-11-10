/**
 * Consultas internas para Organización (`/v1/interno/*`, D69, D86). El gateway no las publica.
 * Se autorizan con el token del usuario propagado.
 */
import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Publico, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { InternoAplicacion } from '../../aplicacion/interno.servicio.js';
import { SesionOIndicadoresGuard, type SolicitudConCredencial } from '../guardias/sesion-o-indicadores.guard.js';
import { solicitanteDe } from '../solicitante.js';
import { uuidDeRuta } from '../validacion/cuerpos.js';
import { leerEvaluacion } from '../validacion/consultas.js';

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

@Controller('v1/interno')
export class InternoController {
  constructor(private readonly interno: InternoAplicacion) {}

  /** Lectura en lote (POST solo para enviar hasta 1000 HDU) para las bandejas. */
  /**
   * Acepta la sesión O la credencial de Indicadores (E6, D177). Con la credencial es una lectura global: sin
   * usuario ni ámbito. Ninguna otra ruta de este servicio acepta esa credencial.
   */
  @Publico()
  @UseGuards(SesionOIndicadoresGuard)
  @Roles(...ROLES_TODOS)
  @Post('impedimentos/evaluacion')
  @HttpCode(200)
  evaluacion(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @AccesoActual() acceso: ResolucionAcceso | undefined, @Req() solicitud: Request & SolicitudConCredencial) {
    const datos = leerEvaluacion(cuerpo);
    if (solicitud.servicioIndicadores === true) return this.interno.evaluar(datos.hdu, datos.incluirImpedimentos, null);
    return this.interno.evaluar(datos.hdu, datos.incluirImpedimentos, solicitanteDe(identidad, acceso, solicitud));
  }

  /** Impedimentos que impiden cerrar la HDU (D60, D77). */
  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @Get('hdu/:hduId/impedimentos/abiertos')
  abiertos(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.interno.abiertos(uuidDeRuta(hduId, 'hduId'), solicitanteDe(identidad, acceso, solicitud));
  }
}
