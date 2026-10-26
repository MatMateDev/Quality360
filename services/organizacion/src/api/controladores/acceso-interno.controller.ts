/**
 * `/v1/interno/*`: lo consumen Certificaciones e Impedimentos a través de
 * `ResolutorDeAccesoRemoto` (packages/auth-nest), propagando el token del
 * usuario. `AccesoGuard` global ya validó rol/activo; aquí solo se devuelve
 * la resolución (que además llenó `solicitud.acceso`). Cada servicio autoriza
 * por sí mismo: estos endpoints entregan ámbito y relación, no deciden por el llamador.
 */
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AccesoActual, Roles, errorValidacion, type ResolucionAcceso } from '@quality360/auth-nest';

import {
  AccesoAplicacion,
  type AccesoHduRespuesta,
  type AmbitoLecturaHdu,
  type HduParaCertificacion,
} from '../../aplicacion/acceso.servicio.js';
import { AuditorAplicacion } from '../../aplicacion/auditor.servicio.js';
import { ConsultaHduLoteDto, RegistroExportacionDto } from '../dto/acceso-interno.dto.js';
import { uuidDeRuta } from '../validacion/uuid.js';

const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

@Controller('v1/interno')
export class AccesoInternoController {
  constructor(
    private readonly acceso: AccesoAplicacion,
    private readonly auditor: AuditorAplicacion,
  ) {}

  @Roles(...ROLES_TODOS)
  @Get('acceso')
  resolverAcceso(@AccesoActual() acceso: ResolucionAcceso): ResolucionAcceso {
    return acceso;
  }

  /** HDU del QE responsable, para la bandeja de aprobaciones de Certificaciones (E3-F03#3). */
  @Roles('QE')
  @Get('hdu/responsable')
  async hduResponsable(@AccesoActual() acceso: ResolucionAcceso): Promise<{ items: HduParaCertificacion[] }> {
    return this.acceso.hduComoResponsable(acceso.usuarioId);
  }

  /** HDU que el usuario puede leer, para autorizar lotes con una sola llamada (D47). */
  @Roles(...ROLES_TODOS)
  @Get('hdu/ambito')
  async ambitoLectura(@AccesoActual() acceso: ResolucionAcceso): Promise<AmbitoLecturaHdu> {
    return this.acceso.ambitoLectura(acceso.rol, acceso.usuarioId, acceso.ambito);
  }

  /** Datos de hasta 1000 HDU del ámbito del usuario; un id fuera de ámbito → 403 completo (D47). Es una lectura. */
  @Roles(...ROLES_TODOS)
  @Post('hdu/consulta')
  @HttpCode(200)
  async consultarHdu(@Body() dto: ConsultaHduLoteDto, @AccesoActual() acceso: ResolucionAcceso): Promise<{ items: HduParaCertificacion[] }> {
    return this.acceso.consultarLote(dto.hduIds, acceso.rol, acceso.usuarioId, acceso.ambito);
  }

  /**
   * Datos de todas las HDU del ámbito (E4, D86), para «Riesgo por HDU» de Impedimentos. Ordenadas por
   * código; las cerradas solo con `incluirCerradas=true`. El Analista QA no la usa.
   */
  @Roles('ADMINISTRADOR', 'QE', 'LIDER_QA', 'AUDITOR')
  @Get('hdu/ambito/detalle')
  async ambitoDetalle(@Query('incluirCerradas') incluirCerradas: string | undefined, @AccesoActual() acceso: ResolucionAcceso): Promise<{ items: HduParaCertificacion[] }> {
    if (incluirCerradas !== undefined && incluirCerradas !== 'true' && incluirCerradas !== 'false') {
      throw errorValidacion([{ campo: 'incluirCerradas', codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser true o false.' }]);
    }
    return this.acceso.ambitoDetalle(acceso.rol, acceso.usuarioId, acceso.ambito, incluirCerradas === 'true');
  }

  @Roles(...ROLES_TODOS)
  @Get('hdu/:id/acceso')
  async resolverAccesoHdu(
    @Param('id') id: string,
    @Query('incluirCandidatos') incluirCandidatos: string | undefined,
    @AccesoActual() acceso: ResolucionAcceso,
  ): Promise<AccesoHduRespuesta> {
    if (incluirCandidatos !== undefined && incluirCandidatos !== 'true' && incluirCandidatos !== 'false') {
      throw errorValidacion([{ campo: 'incluirCandidatos', codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser true o false.' }]);
    }
    return this.acceso.accesoHdu(uuidDeRuta(id), acceso.rol, acceso.usuarioId, acceso.ambito, incluirCandidatos === 'true');
  }

  /**
   * Certificaciones registra aquí, con el token del Auditor, sus exportaciones de bitácora y
   * de certificados antes de entregar el archivo (D48). Solo el Auditor.
   */
  @Roles('AUDITOR')
  @Post('auditoria/exportaciones')
  async registrarExportacion(@Body() dto: RegistroExportacionDto, @AccesoActual() acceso: ResolucionAcceso) {
    const actor = await this.auditor.actorDe(acceso.usuarioId);
    return this.auditor.registrarExportacion(actor, dto.recurso, dto.filtros, dto.filas);
  }
}
