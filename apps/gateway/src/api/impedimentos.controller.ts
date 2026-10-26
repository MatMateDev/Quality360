/**
 * Rutas de Impedimentos (E4, D85): se reenvían tal cual a la misma ruta del
 * servicio (`IMPEDIMENTOS_URL`), sin composición.
 *
 * Declaradas una por una, sin comodín: las que cuelgan de `/v1/hdu/:hduId/`
 * conviven con las de Organización (`analista`, `estado`, `historial`,
 * `qe-responsable`) y con las de Certificaciones (`entregables`,
 * `certificado`). Lo que no está aquí responde 404, y `/v1/interno/*` no se
 * publica (D86).
 *
 * El gateway no autoriza (D4): el rol, el estado activo y la relación con la
 * HDU los decide Impedimentos (D89). Las escrituras pasan por el límite de tasa
 * estricto de `crear-app.ts`; las exportaciones CSV se transmiten tal cual
 * (BOM, `Content-Disposition`, `X-Q360-Filas`) por `Reenviador.escribir`.
 */
import { Controller, Get, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Reenviador, type SolicitudGateway } from '../aplicacion/reenviador.js';
import { uuidDeRuta } from './validacion.js';

@Controller('v1')
export class ImpedimentosController {
  constructor(private readonly reenviador: Reenviador) {}

  /** Lecturas: propagan la query (filtros, orden y paginación, D49). Escrituras: sin query. */
  private async reenviar(solicitud: SolicitudGateway, respuesta: Response, ruta: string): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.impedimentosUrl,
      ruta,
      conConsulta: solicitud.method === 'GET',
      tiempoLimiteMs: this.reenviador.tiempoLimiteImpedimentosMs,
    });
  }

  // ------------------------------------------------------------ catálogo

  @Get('catalogos/tipos-impedimento')
  async tipos(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/catalogos/tipos-impedimento');
  }

  // ------------------------------------------------------------ por HDU

  @Get('hdu/:hduId/impedimentos')
  async listarDeHdu(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId, 'path.hduId')}/impedimentos`);
  }

  @Post('hdu/:hduId/impedimentos')
  async registrar(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId, 'path.hduId')}/impedimentos`);
  }

  @Get('hdu/:hduId/impedimentos/responsables')
  async responsables(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId, 'path.hduId')}/impedimentos/responsables`);
  }

  @Get('hdu/:hduId/riesgo')
  async riesgo(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId, 'path.hduId')}/riesgo`);
  }

  @Put('hdu/:hduId/riesgo')
  async fijarRiesgo(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId, 'path.hduId')}/riesgo`);
  }

  @Get('hdu/:hduId/gestion-impedimentos')
  async gestionDeHdu(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId, 'path.hduId')}/gestion-impedimentos`);
  }

  // ------------------------------------------------------------ impedimentos

  @Get('impedimentos')
  async listar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/impedimentos');
  }

  @Get('impedimentos/:id')
  async obtener(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/impedimentos/${uuidDeRuta(id)}`);
  }

  @Post('impedimentos/:id/resolver')
  async resolver(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/impedimentos/${uuidDeRuta(id)}/resolver`);
  }

  @Post('impedimentos/:id/escalar')
  async escalar(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/impedimentos/${uuidDeRuta(id)}/escalar`);
  }

  @Post('impedimentos/:id/reabrir')
  async reabrir(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/impedimentos/${uuidDeRuta(id)}/reabrir`);
  }

  @Post('impedimentos/:id/seguimiento')
  async seguimiento(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/impedimentos/${uuidDeRuta(id)}/seguimiento`);
  }

  // ------------------------------------------------------------ riesgo

  @Get('riesgo/hdu')
  async riesgoPorHdu(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/riesgo/hdu');
  }

  // ------------------------------------------------------------ Auditor

  @Get('auditor/impedimentos')
  async auditorImpedimentos(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/impedimentos');
  }

  @Get('auditor/gestion-impedimentos')
  async auditorGestion(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/gestion-impedimentos');
  }

  @Get('auditor/exportaciones/impedimentos')
  async exportarImpedimentos(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/exportaciones/impedimentos');
  }

  @Get('auditor/exportaciones/gestion-impedimentos')
  async exportarGestion(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/exportaciones/gestion-impedimentos');
  }
}
