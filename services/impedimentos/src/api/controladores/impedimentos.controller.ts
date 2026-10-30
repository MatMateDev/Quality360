/**
 * Catálogo, registro, consulta y ciclo de vida de los impedimentos (E4-B01, E4-B02). La
 * autorización por relación con la HDU está en la aplicación (D89); `@Roles` solo filtra por rol.
 * Orden de validación: 401 → 403 (rol y relación) → 400 (cuerpo) → 409 `HDU_CERRADA` → 422 → 409.
 */
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseFilters } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request } from 'express';

import { ImpedimentosAplicacion } from '../../aplicacion/impedimentos.servicio.js';
import { ListadosAplicacion } from '../../aplicacion/listados.servicio.js';
import type { OperacionImpedimento } from '../../dominio/tipos.js';
import { FiltroTransicionImpedimento } from '../filtros/filtro-transicion.js';
import { solicitanteDe } from '../solicitante.js';
import { leerComentario, leerEscalamiento, leerMotivo, leerNuevoImpedimento, uuidDeRuta } from '../validacion/cuerpos.js';
import { leerFiltrosImpedimentos, leerProposito } from '../validacion/consultas.js';

type Consulta = Record<string, unknown>;

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

@UseFilters(FiltroTransicionImpedimento)
@Controller('v1')
export class ImpedimentosController {
  constructor(
    private readonly impedimentos: ImpedimentosAplicacion,
    private readonly listados: ListadosAplicacion,
  ) {}

  @Roles(...ROLES_TODOS)
  @Get('catalogos/tipos-impedimento')
  catalogo() {
    return this.impedimentos.catalogo();
  }

  @Roles(...ROLES_TODOS)
  @Get('hdu/:hduId/impedimentos')
  listarHdu(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.impedimentos.listarHdu(uuidDeRuta(hduId, 'hduId'), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('ANALISTA_QA', 'QE')
  @Post('hdu/:hduId/impedimentos')
  @HttpCode(201)
  async registrar(
    @Param('hduId') hduId: string,
    @Body() cuerpo: unknown,
    @IdentidadActual() identidad: Identidad,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: Request,
  ) {
    const solicitante = solicitanteDe(identidad, acceso, solicitud);
    const previo = await this.impedimentos.autorizarRegistro(uuidDeRuta(hduId, 'hduId'), solicitante);
    return this.impedimentos.registrar(previo, leerNuevoImpedimento(cuerpo), solicitante);
  }

  @Roles('ANALISTA_QA', 'QE')
  @Get('hdu/:hduId/impedimentos/responsables')
  responsables(
    @Param('hduId') hduId: string,
    @Query() consulta: Consulta,
    @IdentidadActual() identidad: Identidad,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: Request,
  ) {
    const proposito = leerProposito(consulta);
    return this.impedimentos.candidatos(uuidDeRuta(hduId, 'hduId'), proposito, solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('QE', 'LIDER_QA', 'ADMINISTRADOR', 'AUDITOR')
  @Get('impedimentos')
  listar(@Query() consulta: Consulta, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.listados.impedimentosDelAmbito(leerFiltrosImpedimentos(consulta), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles(...ROLES_TODOS)
  @Get('impedimentos/:id')
  obtener(@Param('id') id: string, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.impedimentos.obtener(uuidDeRuta(id, 'id'), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('QE')
  @Post('impedimentos/:id/resolver')
  @HttpCode(200)
  resolver(@Param('id') id: string, @Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.operar('RESOLVER', id, cuerpo, identidad, acceso, solicitud);
  }

  @Roles('QE')
  @Post('impedimentos/:id/escalar')
  @HttpCode(200)
  escalar(@Param('id') id: string, @Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.operar('ESCALAR', id, cuerpo, identidad, acceso, solicitud);
  }

  @Roles('QE')
  @Post('impedimentos/:id/reabrir')
  @HttpCode(200)
  reabrir(@Param('id') id: string, @Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.operar('REABRIR', id, cuerpo, identidad, acceso, solicitud);
  }

  @Roles('QE')
  @Post('impedimentos/:id/seguimiento')
  @HttpCode(200)
  seguimiento(@Param('id') id: string, @Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.operar('SEGUIMIENTO', id, cuerpo, identidad, acceso, solicitud);
  }

  private async operar(
    operacion: OperacionImpedimento,
    id: string,
    cuerpo: unknown,
    identidad: Identidad,
    acceso: ResolucionAcceso,
    solicitud: Request,
  ) {
    const solicitante = solicitanteDe(identidad, acceso, solicitud);
    const previa = await this.impedimentos.autorizarGestion(uuidDeRuta(id, 'id'), solicitante, { incluirCandidatos: operacion === 'ESCALAR' });
    const datos = operacion === 'REABRIR' ? leerMotivo(cuerpo) : operacion === 'ESCALAR' ? leerEscalamiento(cuerpo) : leerComentario(cuerpo);
    return this.impedimentos.ejecutar(operacion, previa, datos);
  }
}
