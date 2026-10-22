/**
 * Lecturas globales (E7): `/v1/interno/*` para Organización (bandejas, D46) y `/v1/auditor/*`
 * para el Auditor (B04, D47, D48). `/v1/auditor/*` exige `rol: AUDITOR` según Organización: el
 * Administrador también recibe 403. Todo es lectura; registrar la exportación escribe en la
 * auditoría de Organización, no aquí.
 */
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { IdentidadActual, Roles, noAutenticado, obtenerTraceId, type Identidad } from '@quality360/auth-nest';
import type { Request, Response } from 'express';

import { AuditorAplicacion, SeguimientoAplicacion, type ExportacionTabular } from '../../aplicacion/auditoria-global.servicio.js';
import { generarCsv, nombreArchivo } from '../../infraestructura/csv/generador-csv.js';
import type { ContextoSolicitud } from '../../infraestructura/organizacion.cliente.js';
import {
  NOMBRES_FILTROS_BITACORA,
  NOMBRES_FILTROS_CERTIFICADOS,
  filtrosEnviados,
  leerFiltrosBitacora,
  leerFiltrosCertificados,
  leerLoteHdu,
  leerPaginacion,
} from '../validacion-auditor.js';

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

function contexto(identidad: Identidad | undefined, solicitud: Request): ContextoSolicitud {
  if (identidad === undefined) throw noAutenticado('ruta sin identidad verificada');
  return { token: identidad.token, traceId: obtenerTraceId(solicitud as never) };
}

function enviarCsv(respuesta: Response, solicitud: Request, exportacion: ExportacionTabular): void {
  respuesta.setHeader('content-type', 'text/csv; charset=utf-8');
  respuesta.setHeader('content-disposition', `attachment; filename="${nombreArchivo(exportacion.recurso, new Date())}"`);
  respuesta.setHeader('x-q360-filas', String(exportacion.filas.length));
  respuesta.setHeader('x-trace-id', obtenerTraceId(solicitud as never));
  respuesta.status(200).send(generarCsv(exportacion.encabezado, exportacion.filas));
}

@Controller('v1/interno')
export class InternoController {
  constructor(private readonly seguimiento: SeguimientoAplicacion) {}

  /** Lectura en lote (POST solo para enviar hasta 1000 ids): estado del checklist de varias HDU. */
  @Roles(...ROLES_TODOS)
  @Post('checklist/estados')
  @HttpCode(200)
  estados(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.seguimiento.estados(leerLoteHdu(cuerpo), contexto(identidad, solicitud));
  }

  @Roles('AUDITOR')
  @Get('resumen-auditoria')
  resumenAuditoria() {
    return this.seguimiento.resumenAuditoria();
  }
}

@Controller('v1/auditor')
export class AuditorController {
  constructor(private readonly auditor: AuditorAplicacion) {}

  @Roles('AUDITOR')
  @Get('bitacora')
  bitacora(@Query() query: Record<string, unknown>, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.auditor.bitacora(leerFiltrosBitacora(query, true), leerPaginacion(query), contexto(identidad, solicitud));
  }

  @Roles('AUDITOR')
  @Get('certificados')
  certificados(@Query() query: Record<string, unknown>) {
    return this.auditor.certificados(leerFiltrosCertificados(query, true), leerPaginacion(query));
  }

  @Roles('AUDITOR')
  @Get('exportaciones/bitacora')
  async exportarBitacora(
    @Query() query: Record<string, unknown>,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: Request,
    @Res() respuesta: Response,
  ): Promise<void> {
    const filtro = leerFiltrosBitacora(query, false);
    const exportacion = await this.auditor.exportarBitacora(filtro, filtrosEnviados(query, NOMBRES_FILTROS_BITACORA), contexto(identidad, solicitud));
    enviarCsv(respuesta, solicitud, exportacion);
  }

  @Roles('AUDITOR')
  @Get('exportaciones/certificados')
  async exportarCertificados(
    @Query() query: Record<string, unknown>,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: Request,
    @Res() respuesta: Response,
  ): Promise<void> {
    const filtro = leerFiltrosCertificados(query, false);
    const exportacion = await this.auditor.exportarCertificados(filtro, filtrosEnviados(query, NOMBRES_FILTROS_CERTIFICADOS), contexto(identidad, solicitud));
    enviarCsv(respuesta, solicitud, exportacion);
  }
}
