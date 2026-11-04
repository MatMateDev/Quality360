/**
 * Rutas de Integraciones (E5, D127): se reenvían tal cual a la misma ruta del
 * servicio (`INTEGRACIONES_URL`), sin composición.
 *
 * Declaradas una por una (las 16 rutas y 18 operaciones de
 * `integraciones.v1.yaml`), sin comodín: lo que no está aquí responde 404 y
 * `/v1/interno/*` no se publica. `POST jira/sincronizaciones` se retiró con la
 * consulta y asignación (D132): responde 404 como cualquier ruta inexistente.
 *
 * - Si `INTEGRACIONES_URL` falta en producción o es inválida, la URL es `null`
 *   y estas rutas responden 503 `SERVICIO_NO_DISPONIBLE` sin llamar a nadie; el
 *   resto del gateway funciona.
 * - Tiempo límite propio, `INTEGRACIONES_TIMEOUT_MS` (12 s), mayor que el
 *   presupuesto del servicio (D114, D115), para que el gateway no corte antes.
 * - El cuerpo de hasta 1,5 MB de `archivos/*` lo admite `crear-app.ts`.
 * - El gateway no autoriza (D4, D126): el rol y el ámbito los decide
 *   Integraciones, y su 403 o 404 llega tal cual. Las escrituras pasan por el
 *   límite de tasa estricto, salvo `PATCH jira/consultas/:id/items`, que usa
 *   su propio cubo (D152).
 * - Los 409, 410 y 422 de la consulta y sus cuerpos extendidos llegan tal cual.
 */
import { Controller, Get, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
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

  // ------------------------------------------------------------ Consulta y asignación (E5-B02, E5-B05)

  @Post('jira/consultas')
  async consultar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/consultas');
  }

  // Antes de `jira/consultas/:id`, para que `actual` no se tome como id.
  @Get('jira/consultas/actual')
  async consultaActual(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/integraciones/jira/consultas/actual');
  }

  @Get('jira/consultas/:id')
  async consulta(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/jira/consultas/${uuidDeRuta(id)}`);
  }

  @Post('jira/consultas/:id/continuaciones')
  async continuar(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/jira/consultas/${uuidDeRuta(id)}/continuaciones`);
  }

  @Get('jira/consultas/:id/items')
  async items(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/jira/consultas/${uuidDeRuta(id)}/items`);
  }

  @Patch('jira/consultas/:id/items')
  async editarItems(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/jira/consultas/${uuidDeRuta(id)}/items`);
  }

  @Post('jira/consultas/:id/confirmaciones')
  async confirmar(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/jira/consultas/${uuidDeRuta(id)}/confirmaciones`);
  }

  @Post('jira/consultas/:id/descartes')
  async descartar(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/integraciones/jira/consultas/${uuidDeRuta(id)}/descartes`);
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
