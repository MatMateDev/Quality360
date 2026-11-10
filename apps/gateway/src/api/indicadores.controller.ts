/**
 * Rutas de Indicadores (E6, G1; D178 y D179): se reenvían tal cual a la misma
 * ruta del servicio (`INDICADORES_URL`), sin composición.
 *
 * Declaradas una por una (las 11 rutas y 12 operaciones de `/v1/indicadores/*`
 * más el cron), sin comodín: lo que no está aquí responde 404. No se publican
 * `/v1/interno/indicadores/*` ni `/v1/interno/carga/snapshots`.
 *
 * - Si `INDICADORES_URL` falta en producción o es inválida, la URL es `null` y
 *   estas rutas responden 503 `SERVICIO_NO_DISPONIBLE` sin llamar a nadie; el
 *   resto del gateway funciona.
 * - Tiempo límite propio, `INDICADORES_TIMEOUT_MS` (25 s), porque cada cálculo
 *   consulta varias fuentes.
 * - El gateway verifica la sesión pero no autoriza (D4, D126): el rol de
 *   `x-roles` y el ámbito los decide Indicadores con Organización, y su 403 o
 *   404 llega tal cual. Los roles de cada operación se anotan abajo solo como
 *   referencia del contrato.
 * - La exportación llega en bytes (`text/csv` o `application/pdf`) con
 *   `Content-Type`, `Content-Disposition` y `X-Q360-Filas` (D186).
 * - El cron (`GET /v1/cron/indicadores/snapshot`) es público: no se verifica la
 *   sesión y `Authorization` viaja tal cual; solo Indicadores la compara con
 *   `CRON_SECRET`, que el gateway no conoce (D178). Pasa por el límite de tasa
 *   de escritura (`limite-tasa.ts`).
 */
import { Controller, Get, Param, Post, Put, Req, Res } from '@nestjs/common';
import { Publico } from '@quality360/auth-nest';
import type { Response } from 'express';

import { Reenviador, type SolicitudGateway } from '../aplicacion/reenviador.js';
import { uuidDeRuta } from './validacion.js';

/** Ruta pública del cron, también usada por el límite de tasa. */
export const RUTA_CRON_INDICADORES = '/v1/cron/indicadores/snapshot';

@Controller('v1/indicadores')
export class IndicadoresController {
  constructor(private readonly reenviador: Reenviador) {}

  /** Lecturas: propagan la query (filtros, fechas, paginación). Escrituras: sin query. */
  private async reenviar(solicitud: SolicitudGateway, respuesta: Response, ruta: string): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.indicadoresUrl,
      ruta,
      conConsulta: solicitud.method === 'GET',
      tiempoLimiteMs: this.reenviador.tiempoLimiteIndicadoresMs,
    });
  }

  // ------------------------------------------------------------ Filtros y cumplimiento (E6-B01)

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('filtros')
  async filtros(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/filtros');
  }

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('cumplimiento')
  async cumplimiento(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/cumplimiento');
  }

  // ------------------------------------------------------------ Semáforo y carga (E6-B02)

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('semaforo')
  async semaforo(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/semaforo');
  }

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('semaforo/:celulaId/hdu')
  async drilldown(
    @Param('celulaId') celulaId: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/indicadores/semaforo/${uuidDeRuta(celulaId, 'path.celulaId')}/hdu`);
  }

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('carga')
  async carga(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/carga');
  }

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('umbral-carga')
  async umbral(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/umbral-carga');
  }

  /** x-roles: QE (solo el propio umbral, D183). */
  @Put('umbral-carga')
  async fijarUmbral(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/umbral-carga');
  }

  /** x-roles: QE, AUDITOR. */
  @Get('umbral-carga/historial')
  async historialUmbral(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/umbral-carga/historial');
  }

  // ------------------------------------------------------------ Tendencia (E6-B03) y exportación (E6-B04)

  /** x-roles: QE, LIDER_QA, AUDITOR. */
  @Get('tendencia')
  async tendencia(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/tendencia');
  }

  /** x-roles: QE, LIDER_QA, AUDITOR. CSV o PDF en bytes (D186). */
  @Get('exportacion')
  async exportacion(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/exportacion');
  }

  // ------------------------------------------------------------ Snapshots (E6-B03)

  /** x-roles: ADMINISTRADOR. */
  @Post('snapshots')
  async generarSnapshot(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/snapshots');
  }

  /** x-roles: ADMINISTRADOR. */
  @Get('snapshots/ejecuciones')
  async ejecuciones(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/indicadores/snapshots/ejecuciones');
  }
}

/** x-roles: CRON. Sin sesión; `Authorization` viaja tal cual (D178). */
@Controller('v1/cron/indicadores')
export class CronIndicadoresController {
  constructor(private readonly reenviador: Reenviador) {}

  @Publico()
  @Get('snapshot')
  async snapshot(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.indicadoresUrl,
      ruta: RUTA_CRON_INDICADORES,
      conConsulta: false,
      tiempoLimiteMs: this.reenviador.tiempoLimiteIndicadoresMs,
      autorizacionCruda: true,
    });
  }
}
