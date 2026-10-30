/**
 * `GET /v1/bandeja/{analista, qe, lider, admin, auditor}` (E7-B03, D33). Cada ruta exige
 * su propio rol y cualquier otro —incluido el Administrador— recibe el mismo 403
 * `ACCESO_DENEGADO` genérico del `AccesoGuard`. Un usuario inactivo recibe el mismo 403.
 */
import { Controller, Get, Query, Req } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Roles, obtenerTraceId, type Identidad, type ResolucionAcceso, type SolicitudAutenticada } from '@quality360/auth-nest';

import { BandejasAplicacion, type ContextoBandeja } from '../../aplicacion/bandejas.servicio.js';
import {
  BandejaAdminQueryDto,
  BandejaAnalistaQueryDto,
  BandejaAuditorQueryDto,
  BandejaLiderQueryDto,
  BandejaQeQueryDto,
} from '../dto/bandejas.dto.js';

function contexto(acceso: ResolucionAcceso, identidad: Identidad, solicitud: SolicitudAutenticada): ContextoBandeja {
  return { usuarioId: acceso.usuarioId, rol: acceso.rol, ambito: acceso.ambito, token: identidad.token, traceId: obtenerTraceId(solicitud) };
}

@Controller('v1/bandeja')
export class BandejasController {
  constructor(private readonly bandejas: BandejasAplicacion) {}

  @Roles('ANALISTA_QA')
  @Get('analista')
  analista(
    @Query() query: BandejaAnalistaQueryDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: SolicitudAutenticada,
  ) {
    return this.bandejas.analista(contexto(acceso, identidad, solicitud), query);
  }

  @Roles('QE')
  @Get('qe')
  qe(
    @Query() query: BandejaQeQueryDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: SolicitudAutenticada,
  ) {
    return this.bandejas.qe(contexto(acceso, identidad, solicitud), query);
  }

  @Roles('LIDER_QA')
  @Get('lider')
  lider(
    @Query() query: BandejaLiderQueryDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: SolicitudAutenticada,
  ) {
    return this.bandejas.lider(contexto(acceso, identidad, solicitud), query);
  }

  @Roles('ADMINISTRADOR')
  @Get('admin')
  admin(
    @Query() query: BandejaAdminQueryDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: SolicitudAutenticada,
  ) {
    return this.bandejas.admin(contexto(acceso, identidad, solicitud), query);
  }

  @Roles('AUDITOR')
  @Get('auditor')
  auditor(
    @Query() query: BandejaAuditorQueryDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: SolicitudAutenticada,
  ) {
    return this.bandejas.auditor(contexto(acceso, identidad, solicitud), {
      ...query,
      desde: query.desde === undefined ? undefined : new Date(query.desde),
      hasta: query.hasta === undefined ? undefined : new Date(query.hasta),
    });
  }
}
