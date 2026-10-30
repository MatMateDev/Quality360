/**
 * Rutas de Integraciones (E5, D127): se reenvían tal cual a la misma ruta del
 * servicio (`INTEGRACIONES_URL`), sin composición.
 *
 * Declaradas una por una (las 10 rutas y 11 operaciones de
 * `integraciones.v1.yaml`), sin comodín: lo que no está aquí responde 404 y
 * `/v1/interno/*` no se publica.
 *
 * - Si `INTEGRACIONES_URL` falta en producción o es inválida, la URL es `null`
 *   y estas rutas responden 503 `SERVICIO_NO_DISPONIBLE` sin llamar a nadie; el
 *   resto del gateway funciona.
 * - Tiempo límite propio, `INTEGRACIONES_TIMEOUT_MS` (12 s), mayor que el
 *   presupuesto del servicio (D114, D115), para que el gateway no corte antes.
 * - El cuerpo de hasta 1,5 MB de `archivos/*` lo admite `crear-app.ts`.
 * - El gateway no autoriza (D4, D126): el rol y el ámbito los decide
 *   Integraciones, y su 403 o 404 llega tal cual. Las escrituras pasan por el
 *   límite de tasa estricto.
 */
import { Controller, Get, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Reenviador, type SolicitudGateway } from '../aplicacion/reenviador.js';
import { uuidDeRuta } from './validacion.js';

@Controller('v1/integraciones')
export class IntegracionesController {
  constructor(private readonly reenviador: Reenviador) {}

  /** Lecturas: propagan la query (filtros y paginación). Escrituras: sin query. */
  private async reenviar(solicitud: SolicitudGateway, respuesta: Response, ruta: string): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.integracionesUrl,
      ruta,
      conConsulta: solicitud.method === 'GET',
      tiempoLimiteMs: this.reenviador.tiempoLimiteIntegracionesMs,
    });
  }

  // ------------------------------------------------------------ Conexión (E5-B01)

  @Get('jira/configuracion')
  async obtenerConfiguracion(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/configuracion');
  }

  @Put('jira/configuracion')
  async guardarConfiguracion(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/configuracion');
  }

  @Post('jira/configuracion/probar')
  async probarConexion(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/configuracion/probar');
  }

  @Get('jira/configuracion/eventos')
  async eventos(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/configuracion/eventos');
  }

  // ------------------------------------------------------------ Sincronización (E5-B02)

  @Post('jira/sincronizaciones')
  async sincronizar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/sincronizaciones');
  }

  // ------------------------------------------------------------ Archivos (E5-B03)

  @Post('archivos/vista-previa')
  async vistaPrevia(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/archivos/vista-previa');
  }

  @Post('archivos/importaciones')
  async importar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/archivos/importaciones');
  }

  // ------------------------------------------------------------ Historial (E5-B04)

  @Get('ejecuciones')
  async ejecuciones(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/ejecuciones');
  }

  @Get('ejecuciones/:id')
  async ejecucion(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/ejecuciones/${uuidDeRuta(id)}`);
  }

  @Get('ejecuciones/:id/detalle')
  async detalle(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/ejecuciones/${uuidDeRuta(id)}/detalle`);
  }

  @Get('estado')
  async estado(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/estado');
  }
}
