/** Lecturas en vivo (E6-B01, E6-B02#1 y #2). QE, Líder QA y Auditor; Administrador y Analista QA reciben 403. */
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { IdentidadActual, Roles, errorValidacion, type Identidad, type SolicitudAutenticada } from '@quality360/auth-nest';

import { VistasAplicacion } from '../../aplicacion/vistas.servicio.js';
import { autSesion, esUuid, leerFiltros, uuidOpcional } from '../validacion.js';

@Controller('v1/indicadores')
export class VistasController {
  constructor(private readonly vistas: VistasAplicacion) {}

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('filtros')
  filtros(@IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    return this.vistas.opcionesFiltro(autSesion(identidad, solicitud));
  }

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('cumplimiento')
  cumplimiento(@Query() query: Record<string, unknown>, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    const filtros = leerFiltros(query);
    return this.vistas.cumplimiento(autSesion(identidad, solicitud), filtros);
  }

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('semaforo')
  semaforo(@Query() query: Record<string, unknown>, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    // La vista es el estado actual: no filtra por sprint (D180).
    const celulaId = uuidOpcional(query.celulaId, 'celulaId');
    return this.vistas.semaforo(autSesion(identidad, solicitud), celulaId);
  }

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('semaforo/:celulaId/hdu')
  drilldown(@Param('celulaId') celulaId: string, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    if (!esUuid(celulaId)) throw errorValidacion([{ campo: 'celulaId', codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un UUID.' }]);
    return this.vistas.drilldown(autSesion(identidad, solicitud), celulaId.toLowerCase());
  }

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('carga')
  carga(@Query() query: Record<string, unknown>, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    const filtros = leerFiltros(query);
    return this.vistas.carga(autSesion(identidad, solicitud), filtros);
  }
}
