/**
 * `/v1/interno/carga/*` (ADR 0007, D88): altas idempotentes para la semilla E4, solo con
 * `X-Q360-Servicio-Token` y `PERMITIR_CARGA_SEMILLA=true`. `@Publico()` apaga los guards de
 * sesión: la ruta usa `credencialServicio`, nunca `sesionSupabase`.
 */
import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';
import type { Response } from 'express';

import { CargaSemillaAplicacion } from '../../aplicacion/carga-semilla.servicio.js';
import { CargaSemillaGuard } from '../guardias/carga-semilla.guard.js';
import { leerCargaImpedimento, leerCargaRiesgo } from '../validacion/carga.js';

@Publico()
@UseGuards(CargaSemillaGuard)
@Controller('v1/interno/carga')
export class CargaSemillaController {
  constructor(private readonly carga: CargaSemillaAplicacion) {}

  @Post('impedimentos')
  async impedimentos(@Body() cuerpo: unknown, @Res() respuesta: Response): Promise<void> {
    const resultado = await this.carga.cargarImpedimento(leerCargaImpedimento(cuerpo));
    respuesta.status(resultado.creado ? 201 : 200).json(resultado);
  }

  @Post('riesgo')
  async riesgo(@Body() cuerpo: unknown, @Res() respuesta: Response): Promise<void> {
    const resultado = await this.carga.cargarRiesgo(leerCargaRiesgo(cuerpo));
    respuesta.status(resultado.creado ? 201 : 200).json(resultado);
  }
}
