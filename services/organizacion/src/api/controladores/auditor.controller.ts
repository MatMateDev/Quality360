/**
 * `/v1/auditor/*` de Organización (E7-B04, D38, D48, D53): auditoría de usuarios y
 * exportaciones de HDU y de auditoría de usuarios. Solo rol `AUDITOR`: el Administrador
 * también recibe 403 (separa operar de auditar). Todas son lecturas; registrar la
 * exportación sí escribe en la auditoría, antes de entregar el archivo.
 */
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, obtenerTraceId, type Identidad, type ResolucionAcceso, type SolicitudAutenticada } from '@quality360/auth-nest';
import type { Response } from 'express';

import { AuditorAplicacion, type ExportacionTabular } from '../../aplicacion/auditor.servicio.js';
import { type ContextoBandeja } from '../../aplicacion/bandejas.servicio.js';
import { generarCsv, nombreArchivo } from '../../infraestructura/csv/generador-csv.js';
import { AuditoriaUsuariosQueryDto, FiltrosAuditoriaUsuariosDto, FiltrosHduAuditorDto } from '../dto/bandejas.dto.js';
import { tamanoEfectivo } from '../../dominio/reglas/bandejas.js';
import type { FiltroAuditoriaUsuarios } from '../../dominio/repositorios/auditoria.repositorio.js';

function filtroAuditoria(query: FiltrosAuditoriaUsuariosDto): FiltroAuditoriaUsuarios {
  return {
    desde: query.desde === undefined ? undefined : new Date(query.desde),
    hasta: query.hasta === undefined ? undefined : new Date(query.hasta),
    actorId: query.actorId,
    operacion: query.operacion,
    usuarioAfectadoId: query.usuarioAfectadoId,
  };
}

/** Solo los parámetros del contrato que se enviaron: es lo que queda registrado en la auditoría. */
function filtrosAplicados(query: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, valor]) => valor !== undefined));
}

function enviarCsv(respuesta: Response, solicitud: SolicitudAutenticada, exportacion: ExportacionTabular): void {
  const contenido = generarCsv(exportacion.encabezado, exportacion.filas);
  respuesta.setHeader('content-type', 'text/csv; charset=utf-8');
  respuesta.setHeader('content-disposition', `attachment; filename="${nombreArchivo(exportacion.recurso, new Date())}"`);
  respuesta.setHeader('x-q360-filas', String(exportacion.filas.length));
  respuesta.setHeader('x-trace-id', obtenerTraceId(solicitud));
  respuesta.status(200).send(contenido);
}

@Controller('v1/auditor')
export class AuditorController {
  constructor(private readonly auditor: AuditorAplicacion) {}

  @Roles('AUDITOR')
  @Get('auditoria-usuarios')
  auditoriaUsuarios(@Query() query: AuditoriaUsuariosQueryDto) {
    return this.auditor.auditoriaUsuarios(filtroAuditoria(query), { pagina: query.pagina ?? 1, tamanoPagina: tamanoEfectivo(query.tamanoPagina) });
  }

  @Roles('AUDITOR')
  @Get('exportaciones/auditoria-usuarios')
  async exportarAuditoriaUsuarios(
    @Query() query: FiltrosAuditoriaUsuariosDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: SolicitudAutenticada,
    @Res() respuesta: Response,
  ): Promise<void> {
    const actor = await this.auditor.actorDe(acceso.usuarioId);
    const exportacion = await this.auditor.exportarAuditoriaUsuarios(filtroAuditoria(query), filtrosAplicados(query), actor);
    enviarCsv(respuesta, solicitud, exportacion);
  }

  @Roles('AUDITOR')
  @Get('exportaciones/hdu')
  async exportarHdu(
    @Query() query: FiltrosHduAuditorDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: SolicitudAutenticada,
    @Res() respuesta: Response,
  ): Promise<void> {
    const actor = await this.auditor.actorDe(acceso.usuarioId);
    const contexto: ContextoBandeja = {
      usuarioId: acceso.usuarioId,
      rol: acceso.rol,
      ambito: acceso.ambito,
      token: identidad.token,
      traceId: obtenerTraceId(solicitud),
    };
    const exportacion = await this.auditor.exportarHdu(
      contexto,
      { ...query, desde: query.desde === undefined ? undefined : new Date(query.desde), hasta: query.hasta === undefined ? undefined : new Date(query.hasta) },
      filtrosAplicados(query),
      actor,
    );
    enviarCsv(respuesta, solicitud, exportacion);
  }
}
