/**
 * `GET /v1/inicio/*`: paneles compuestos por rol.
 *
 * Cada bloque tiene su propia URL de fuente, así que tumbar la de HDU deja
 * `hdu: indisponible` mientras el resto sigue en `ok` (E1-B03#3, E1-F06#3).
 */
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Compositor, type DefinicionBloque } from '../aplicacion/compositor.js';
import type { SolicitudGateway } from '../aplicacion/reenviador.js';
import { CONFIGURACION, type ConfiguracionGateway } from '../configuracion.js';

@Controller('v1/inicio')
export class InicioController {
  constructor(
    private readonly compositor: Compositor,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionGateway,
  ) {}

  @Get('admin')
  async admin(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.responder(solicitud, respuesta, [
      {
        clave: 'usuarios',
        fuente: 'organizacion.usuarios',
        base: this.configuracion.fuentes.usuarios,
        ruta: '/v1/resumenes/admin/usuarios',
      },
      {
        clave: 'supervision',
        fuente: 'organizacion.supervision',
        base: this.configuracion.fuentes.supervision,
        ruta: '/v1/resumenes/admin/supervision',
      },
    ]);
  }

  @Get('qe')
  async qe(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.responder(solicitud, respuesta, [
      {
        clave: 'equipo',
        fuente: 'organizacion.supervision',
        base: this.configuracion.fuentes.equipo,
        ruta: '/v1/resumenes/qe/equipo',
      },
      {
        clave: 'hdu',
        fuente: 'organizacion.hdu',
        base: this.configuracion.fuentes.hdu,
        ruta: '/v1/resumenes/qe/hdu',
      },
    ]);
  }

  @Get('qa')
  async qa(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.responder(solicitud, respuesta, [
      {
        clave: 'supervisor',
        fuente: 'organizacion.supervision',
        base: this.configuracion.fuentes.supervisor,
        ruta: '/v1/resumenes/qa/supervisor',
        conConsulta: true,
      },
      {
        clave: 'hdu',
        fuente: 'organizacion.hdu',
        base: this.configuracion.fuentes.hdu,
        ruta: '/v1/resumenes/qa/hdu',
        conConsulta: true,
      },
    ]);
  }

  private async responder(
    solicitud: SolicitudGateway,
    respuesta: Response,
    definiciones: DefinicionBloque[],
  ): Promise<void> {
    const compuesta = await this.compositor.componer(solicitud, definiciones);
    respuesta.status(compuesta.estado).json(compuesta.cuerpo);
  }
}
