/**
 * Rutas de HDU. Todas se reenvían a Organización, salvo el detalle, que además
 * agrega el bloque `checklist` de Certificaciones.
 */
import { Controller, Get, Inject, Param, Post, Put, Req, Res } from '@nestjs/common';
import { servicioNoDisponible } from '@quality360/auth-nest';
import type { Response } from 'express';

import { Compositor, bloqueDe } from '../aplicacion/compositor.js';
import { Reenviador, type SolicitudGateway } from '../aplicacion/reenviador.js';
import { CONFIGURACION, type ConfiguracionGateway } from '../configuracion.js';
import { uuidDeRuta } from './validacion.js';

@Controller('v1/hdu')
export class HduController {
  constructor(
    private readonly reenviador: Reenviador,
    private readonly compositor: Compositor,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionGateway,
  ) {}

  @Get()
  async listar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/hdu' });
  }

  @Post()
  async crear(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/hdu' });
  }

  /**
   * Detalle compuesto: Organización es obligatoria (su 400, 403 o 404 se
   * devuelve tal cual; si no responde, 503) y el checklist de Certificaciones
   * es un bloque que puede quedar `indisponible`. En esta corrida siempre lo
   * está (D11, `certificaciones.v1.yaml`).
   */
  @Get(':id')
  async detalle(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    const identificador = uuidDeRuta(id);

    const [organizacion, checklist] = await Promise.all([
      this.reenviador.consultar(solicitud, {
        ruta: `/v1/hdu/${identificador}`,
        conConsulta: false,
        tiempoLimiteMs: this.configuracion.tiempoLimiteFuenteMs,
      }),
      this.compositor.consultarBloque(solicitud, {
        clave: 'checklist',
        fuente: 'certificaciones.checklist',
        base: this.configuracion.fuentes.checklist,
        ruta: `/v1/hdu/${identificador}/checklist`,
      }),
    ]);

    if (organizacion.tipo === 'fallo') {
      throw servicioNoDisponible(`detalle de HDU: ${organizacion.motivo}`);
    }

    const detalle = organizacion.respuesta;
    const esObjeto = typeof detalle.json === 'object' && detalle.json !== null && !Array.isArray(detalle.json);
    if (detalle.estado !== 200 || !esObjeto) {
      this.reenviador.escribir(respuesta, detalle);
      return;
    }

    respuesta.status(200).json({ ...(detalle.json as Record<string, unknown>), checklist: bloqueDe(checklist) });
  }

  @Put(':id/analista')
  async asignarAnalista(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/hdu/${uuidDeRuta(id)}/analista` });
  }

  @Post(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/hdu/${uuidDeRuta(id)}/estado` });
  }

  @Get(':id/historial')
  async historial(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/hdu/${uuidDeRuta(id)}/historial` });
  }
}
