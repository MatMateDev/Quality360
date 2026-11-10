/** `GET /v1/indicadores/exportacion` (E6-B04, D168, D186). QE, Líder QA y Auditor; el resto recibe 403. */
import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { AccesoActual, CABECERA_TRAZA, IdentidadActual, Roles, errorValidacion, obtenerTraceId, type Identidad, type ResolucionAcceso, type SolicitudAutenticada } from '@quality360/auth-nest';
import type { Response } from 'express';

import { ExportacionAplicacion, FORMATOS, VISTAS, type FormatoExportacion, type VistaExportable } from '../../aplicacion/exportacion.servicio.js';
import { generarCsv } from '../../infraestructura/exportacion/csv.js';
import { generarPdf } from '../../infraestructura/exportacion/pdf.js';
import { autSesion, fechaOpcional, leerFiltros, textoOpcional } from '../validacion.js';

@Controller('v1/indicadores/exportacion')
export class ExportacionController {
  constructor(private readonly exportacion: ExportacionAplicacion) {}

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get()
  async exportar(
    @Query() query: Record<string, unknown>,
    @IdentidadActual() identidad: Identidad | undefined,
    @AccesoActual() acceso: ResolucionAcceso | undefined,
    @Req() solicitud: SolicitudAutenticada,
    @Res() respuesta: Response,
  ): Promise<void> {
    const vista = textoOpcional(query.vista, 'vista');
    if (vista === null || !(VISTAS as readonly string[]).includes(vista)) {
      throw errorValidacion([{ campo: 'vista', codigo: vista === null ? 'REQUERIDO' : 'VALOR_NO_PERMITIDO', mensaje: `Debe ser una de: ${VISTAS.join(', ')}.` }]);
    }
    const formato = textoOpcional(query.formato, 'formato');
    if (formato === null || !(FORMATOS as readonly string[]).includes(formato)) {
      throw errorValidacion([{ campo: 'formato', codigo: formato === null ? 'REQUERIDO' : 'VALOR_NO_PERMITIDO', mensaje: `Debe ser una de: ${FORMATOS.join(', ')}.` }]);
    }
    const filtros = leerFiltros(query);
    const desde = fechaOpcional(query.desde, 'desde');
    const hasta = fechaOpcional(query.hasta, 'hasta');

    const archivo = await this.exportacion.exportar(autSesion(identidad, solicitud), {
      vista: vista as VistaExportable,
      formato: formato as FormatoExportacion,
      celulaId: filtros.celulaId,
      sprintId: filtros.sprintId,
      desde,
      hasta,
      celulasIdsLider: acceso?.ambito.celulasIds ?? [],
    });

    // El archivo se genera después de registrar la exportación; si el registro falló ya se respondió 503.
    const cuerpo = archivo.formato === 'csv' ? Buffer.from(generarCsv(archivo.documento), 'utf8') : Buffer.from(await generarPdf(archivo.documento));
    respuesta.setHeader(CABECERA_TRAZA, obtenerTraceId(solicitud));
    respuesta.setHeader('content-type', archivo.formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf');
    respuesta.setHeader('content-disposition', `attachment; filename="${archivo.nombreArchivo}"`);
    respuesta.setHeader('x-q360-filas', String(archivo.filas));
    respuesta.status(200).send(cuerpo);
  }
}
