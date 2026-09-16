/**
 * HDU (E2-B01 a B04). `PUT :id/analista` y `POST :id/estado` aceptan sesión O
 * credencial de servicio (`SesionOServicioGuard`); `POST :id/estado` además
 * puede responder `ErrorTransicionInvalidaHdu`/`ErrorCierreRechazadoHdu`, con
 * campos extra que el filtro global no admite (ver api/errores).
 */
import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AccesoActual, obtenerTraceId, Publico, Roles, type ResolucionAcceso } from '@quality360/auth-nest';
import type { Response } from 'express';

import { UsuariosAplicacion } from '../../aplicacion/usuarios.servicio.js';
import { ErrorCierreRechazadoHdu, ErrorTransicionInvalidaHdu } from '../../aplicacion/errores-extendidos.js';
import { type ContextoActor, HduAplicacion } from '../../aplicacion/hdu.servicio.js';
import type { AmbitoAcceso } from '../../dominio/tipos.js';
import { PermiteServicio } from '../decoradores/permite-servicio.decorator.js';
import { AsignacionAnalistaDto, ListarHduQueryDto, NuevaHduDto, SolicitudCambioEstadoDto } from '../dto/hdu.dto.js';
import { responderErrorExtendido } from '../errores/responder-error-extendido.js';
import { actorDeSolicitud } from '../guardias/obtener-actor.js';
import { SesionOServicioGuard, type SolicitudConActor } from '../guardias/sesion-o-servicio.guard.js';
import { uuidDeRuta } from '../validacion/uuid.js';

const AMBITO_VACIO: AmbitoAcceso = { qeSupervisorId: null, analistasSupervisadosIds: [] };

function contextoDeSolicitud(solicitud: SolicitudConActor): ContextoActor {
  if (solicitud.actorServicio === true) return { esServicio: true, rol: null, actorId: null, ambito: AMBITO_VACIO };
  const acceso = solicitud.acceso as ResolucionAcceso;
  return { esServicio: false, rol: acceso.rol, actorId: acceso.usuarioId, ambito: acceso.ambito };
}

@Controller('v1/hdu')
export class HduController {
  constructor(
    private readonly hdus: HduAplicacion,
    private readonly usuarios: UsuariosAplicacion,
  ) {}

  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @Get()
  async listar(@AccesoActual() acceso: ResolucionAcceso, @Query() query: ListarHduQueryDto) {
    return this.hdus.listar(
      { esServicio: false, rol: acceso.rol, actorId: acceso.usuarioId, ambito: acceso.ambito },
      { celulaId: query.celulaId, sprintId: query.sprintId, estado: query.estado },
      { pagina: query.pagina, tamanoPagina: query.tamanoPagina },
    );
  }

  @Roles('QE')
  @Post()
  async crear(@Body() dto: NuevaHduDto, @AccesoActual() acceso: ResolucionAcceso, @Res() respuesta: Response): Promise<void> {
    const actor = await this.usuarios.actorDesde(acceso.usuarioId);
    const creada = await this.hdus.crear(dto, acceso.usuarioId, actor);
    respuesta.setHeader('Location', `/v1/hdu/${creada.id}`);
    respuesta.status(201).json(creada);
  }

  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @Get(':id')
  async detalle(@Param('id') id: string, @AccesoActual() acceso: ResolucionAcceso) {
    return this.hdus.obtener(uuidDeRuta(id), { esServicio: false, rol: acceso.rol, actorId: acceso.usuarioId, ambito: acceso.ambito });
  }

  @Publico()
  @PermiteServicio()
  @Roles('ADMINISTRADOR', 'QE')
  @UseGuards(SesionOServicioGuard)
  @Put(':id/analista')
  async asignarAnalista(
    @Param('id') id: string,
    @Body() dto: AsignacionAnalistaDto,
    @Req() solicitud: SolicitudConActor,
  ) {
    const identificador = uuidDeRuta(id);
    const contexto = contextoDeSolicitud(solicitud);
    const actor = await actorDeSolicitud(solicitud, this.usuarios);
    return this.hdus.asignarAnalista(identificador, dto.analistaId, dto.motivo, contexto, actor);
  }

  @Publico()
  @PermiteServicio()
  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @UseGuards(SesionOServicioGuard)
  @Post(':id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() dto: SolicitudCambioEstadoDto,
    @Req() solicitud: SolicitudConActor,
    @Res() respuesta: Response,
  ): Promise<void> {
    const identificador = uuidDeRuta(id);
    const contexto = contextoDeSolicitud(solicitud);
    const actor = await actorDeSolicitud(solicitud, this.usuarios);
    const token = solicitud.identidad?.token ?? '';
    const traceId = obtenerTraceId(solicitud);

    try {
      const resultado = await this.hdus.cambiarEstado(identificador, dto.estado, contexto, actor, { token, traceId });
      respuesta.status(200).json(resultado);
    } catch (error) {
      if (error instanceof ErrorTransicionInvalidaHdu) {
        responderErrorExtendido(respuesta, solicitud, 409, 'TRANSICION_INVALIDA', {
          estadoActual: error.estadoActual,
          estadoSolicitado: error.estadoSolicitado,
          transicionesPermitidas: error.transicionesPermitidas,
        });
        return;
      }
      if (error instanceof ErrorCierreRechazadoHdu) {
        responderErrorExtendido(respuesta, solicitud, 409, error.codigo, { checklist: error.checklist });
        return;
      }
      throw error;
    }
  }

  @Roles('ADMINISTRADOR', 'QE', 'ANALISTA_QA')
  @Get(':id/historial')
  async historial(@Param('id') id: string, @AccesoActual() acceso: ResolucionAcceso) {
    return this.hdus.historial(uuidDeRuta(id), { esServicio: false, rol: acceso.rol, actorId: acceso.usuarioId, ambito: acceso.ambito });
  }
}
