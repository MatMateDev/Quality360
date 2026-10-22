/**
 * Rutas de Certificaciones (E3): se reenvían tal cual a la misma ruta del
 * servicio (`CERTIFICACIONES_URL`). Declaradas una por una, igual que las de
 * Organización: lo que no está aquí responde 404.
 */
import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Publico, errorValidacion, noEncontrado } from '@quality360/auth-nest';
import type { Response } from 'express';

import { Reenviador, type SolicitudGateway } from '../aplicacion/reenviador.js';
import { uuidDeRuta } from './validacion.js';

const CLAVES = new Set([
  'PLAN_PRUEBAS',
  'DASHBOARD',
  'CASOS_PRUEBA',
  'APROBACION_CASOS',
  'EJECUCION',
  'EVIDENCIAS',
  'DEFECTOS',
  'APROBACION_UAT',
  'CERTIFICADO',
  'CIERRE_PRUEBAS',
]);

function claveDeRuta(clave: string): string {
  if (!CLAVES.has(clave)) {
    throw errorValidacion([{ campo: 'path.clave', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'El entregable indicado no existe.' }]);
  }
  return clave;
}

function folioDeRuta(folio: string): string {
  if (typeof folio !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(folio)) {
    throw errorValidacion([{ campo: 'path.folio', codigo: 'FORMATO_INVALIDO', mensaje: 'El folio no tiene un formato válido.' }]);
  }
  return folio;
}

@Controller('v1/hdu/:hduId')
export class ChecklistController {
  constructor(private readonly reenviador: Reenviador) {}

  private async reenviar(solicitud: SolicitudGateway, respuesta: Response, ruta: string): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.certificacionesUrl,
      ruta,
      conConsulta: false,
    });
  }

  @Get('entregables')
  async checklist(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId)}/entregables`);
  }

  @Get('entregables/bitacora')
  async bitacora(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId)}/entregables/bitacora`);
  }

  @Post('entregables/:clave/:accion')
  async accion(
    @Param('hduId') hduId: string,
    @Param('clave') clave: string,
    @Param('accion') accion: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    if (!['evidencias', 'marcar', 'desmarcar', 'aprobar', 'rechazar'].includes(accion)) {
      throw noEncontrado(`acción de entregable desconocida: ${accion}`);
    }
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId)}/entregables/${claveDeRuta(clave)}/${accion}`);
  }

  @Get('entregables/:clave/evidencia')
  async evidencia(
    @Param('hduId') hduId: string,
    @Param('clave') clave: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId)}/entregables/${claveDeRuta(clave)}/evidencia`);
  }

  @Post('certificado')
  async generarCertificado(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId)}/certificado`);
  }

  @Get('certificado')
  async obtenerCertificado(@Param('hduId') hduId: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, `/v1/hdu/${uuidDeRuta(hduId)}/certificado`);
  }
}

@Controller('v1/qe/aprobaciones-pendientes')
export class BandejaAprobacionesController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get()
  async bandeja(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.certificacionesUrl,
      ruta: '/v1/qe/aprobaciones-pendientes',
      conConsulta: false,
    });
  }
}

/** Consultas y exportaciones del Auditor que atiende Certificaciones (E7-B04): se propaga la query. */
@Controller('v1/auditor')
export class AuditorCertificacionesController {
  constructor(private readonly reenviador: Reenviador) {}

  private async reenviar(solicitud: SolicitudGateway, respuesta: Response, ruta: string): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { base: this.reenviador.certificacionesUrl, ruta });
  }

  @Get('bitacora')
  async bitacora(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/bitacora');
  }

  @Get('certificados')
  async certificados(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/certificados');
  }

  @Get('exportaciones/bitacora')
  async exportarBitacora(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/exportaciones/bitacora');
  }

  @Get('exportaciones/certificados')
  async exportarCertificados(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviar(solicitud, respuesta, '/v1/auditor/exportaciones/certificados');
  }
}

@Controller('v1/certificados')
export class VerificacionCertificadoController {
  constructor(private readonly reenviador: Reenviador) {}

  /** Pública (D21): no exige sesión ni propaga `Authorization`. */
  @Publico()
  @Get(':folio/verificacion')
  async verificar(@Param('folio') folio: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      base: this.reenviador.certificacionesUrl,
      ruta: `/v1/certificados/${encodeURIComponent(folioDeRuta(folio))}/verificacion`,
      conConsulta: false,
      publico: true,
    });
  }
}
