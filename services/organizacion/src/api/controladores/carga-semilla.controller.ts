/**
 * `/v1/interno/carga/*` (ADR 0007): altas idempotentes para Integraciones,
 * solo con `X-Q360-Servicio-Token` y `PERMITIR_CARGA_SEMILLA=true`
 * (`CargaSemillaGuard`, 404 en cualquier otro caso — nunca alcanzable desde
 * el navegador). `@Publico()` en la clase apaga los guards globales de
 * sesión: esta ruta no usa `sesionSupabase`.
 */
import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';
import type { Response } from 'express';

import { CargaSemillaAplicacion } from '../../aplicacion/carga-semilla.servicio.js';
import { CargaCelulaDto, CargaHduDto, CargaSprintDto, CargaUsuarioDto } from '../dto/carga-semilla.dto.js';
import { CargaSemillaGuard } from '../guardias/carga-semilla.guard.js';

@Publico()
@UseGuards(CargaSemillaGuard)
@Controller('v1/interno/carga')
export class CargaSemillaController {
  constructor(private readonly carga: CargaSemillaAplicacion) {}

  @Post('usuarios')
  async usuarios(@Body() dto: CargaUsuarioDto, @Res() respuesta: Response): Promise<void> {
    const resultado = await this.carga.cargarUsuario(dto);
    respuesta.status(resultado.creado ? 201 : 200).json(resultado);
  }

  @Post('celulas')
  async celulas(@Body() dto: CargaCelulaDto, @Res() respuesta: Response): Promise<void> {
    const resultado = await this.carga.cargarCelula(dto.nombre);
    respuesta.status(resultado.creado ? 201 : 200).json(resultado);
  }

  @Post('sprints')
  async sprints(@Body() dto: CargaSprintDto, @Res() respuesta: Response): Promise<void> {
    const resultado = await this.carga.cargarSprint(dto);
    respuesta.status(resultado.creado ? 201 : 200).json(resultado);
  }

  @Post('hdu')
  async hdu(@Body() dto: CargaHduDto, @Res() respuesta: Response): Promise<void> {
    const resultado = await this.carga.cargarHdu(dto);
    respuesta.status(resultado.creado ? 201 : 200).json(resultado);
  }
}
