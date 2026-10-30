/**
 * Historial de gestión (E4-B04): `GET /v1/hdu/{hduId}/gestion-impedimentos` para quien ve la HDU y
 * `/v1/auditor/*` solo para el Auditor (el Administrador recibe 403, D38, D53). Las exportaciones
 * registran la acción en Organización antes de entregar el CSV (D48, D70).
 */
import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, obtenerTraceId, type Identidad, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Request, Response } from 'express';

import { GestionAplicacion, type ExportacionTabular } from '../../aplicacion/gestion.servicio.js';
import { generarCsv, nombreArchivo } from '../../infraestructura/csv/generador-csv.js';
import { solicitanteDe } from '../solicitante.js';
import { uuidDeRuta } from '../validacion/cuerpos.js';
import {
  NOMBRES_FILTROS_GESTION,
  NOMBRES_FILTROS_IMPEDIMENTOS,
  filtrosEnviados,
  leerFiltrosAuditorGestion,
  leerFiltrosAuditorImpedimentos,
  leerFiltrosHistorialHdu,
  leerPaginacion,
} from '../validacion/consultas.js';

type Consulta = Record<string, unknown>;

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

function enviarCsv(respuesta: Response, solicitud: Request, exportacion: ExportacionTabular): void {
  respuesta.setHeader('content-type', 'text/csv; charset=utf-8');
  respuesta.setHeader('content-disposition', `attachment; filename="${nombreArchivo(exportacion.recurso, new Date())}"`);
  respuesta.setHeader('x-q360-filas', String(exportacion.filas.length));
  respuesta.setHeader('x-trace-id', obtenerTraceId(solicitud as never));
  respuesta.status(200).send(generarCsv(exportacion.encabezado, exportacion.filas));
}

@Controller('v1')
export class GestionController {
  constructor(private readonly gestion: GestionAplicacion) {}

  @Roles(...ROLES_TODOS)
  @Get('hdu/:hduId/gestion-impedimentos')
  historialHdu(
    @Param('hduId') hduId: string,
    @Query() consulta: Consulta,
    @IdentidadActual() identidad: Identidad,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: Request,
  ) {
    return this.gestion.historialHdu(uuidDeRuta(hduId, 'hduId'), leerFiltrosHistorialHdu(consulta), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('AUDITOR')
  @Get('auditor/impedimentos')
  impedimentos(@Query() consulta: Consulta, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.gestion.impedimentosAuditor(leerFiltrosAuditorImpedimentos(consulta), leerPaginacion(consulta), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('AUDITOR')
  @Get('auditor/gestion-impedimentos')
  gestionGlobal(@Query() consulta: Consulta, @IdentidadActual() identidad: Identidad, @AccesoActual() acceso: ResolucionAcceso, @Req() solicitud: Request) {
    return this.gestion.gestionAuditor(leerFiltrosAuditorGestion(consulta), leerPaginacion(consulta), solicitanteDe(identidad, acceso, solicitud));
  }

  @Roles('AUDITOR')
  @Get('auditor/exportaciones/impedimentos')
  async exportarImpedimentos(
    @Query() consulta: Consulta,
    @IdentidadActual() identidad: Identidad,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: Request,
    @Res() respuesta: Response,
  ): Promise<void> {
    const filtro = leerFiltrosAuditorImpedimentos(consulta);
    const exportacion = await this.gestion.exportarImpedimentos(filtro, filtrosEnviados(consulta, NOMBRES_FILTROS_IMPEDIMENTOS), solicitanteDe(identidad, acceso, solicitud));
    enviarCsv(respuesta, solicitud, exportacion);
  }

  @Roles('AUDITOR')
  @Get('auditor/exportaciones/gestion-impedimentos')
  async exportarGestion(
    @Query() consulta: Consulta,
    @IdentidadActual() identidad: Identidad,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: Request,
    @Res() respuesta: Response,
  ): Promise<void> {
    const filtro = leerFiltrosAuditorGestion(consulta);
    const exportacion = await this.gestion.exportarGestion(filtro, filtrosEnviados(consulta, NOMBRES_FILTROS_GESTION), solicitanteDe(identidad, acceso, solicitud));
    enviarCsv(respuesta, solicitud, exportacion);
  }
}
