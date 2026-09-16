/**
 * Administración de usuarios y roles (E1-B06, B07, B08, B12). Usa `@Res()`
 * en las rutas que pueden responder `ErrorRelacionesIncompatibles`: ese
 * cuerpo lleva campos extra que `FiltroErroresQ360` no admite (ver
 * aplicacion/errores-extendidos.ts).
 */
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { AccesoActual, Roles, type ResolucionAcceso, type SolicitudAutenticada } from '@quality360/auth-nest';
import type { Response } from 'express';

import { ErrorRelacionesIncompatibles } from '../../aplicacion/errores-extendidos.js';
import { UsuariosAplicacion } from '../../aplicacion/usuarios.servicio.js';
import { responderErrorExtendido } from '../errores/responder-error-extendido.js';
import { ActualizacionUsuarioDto, CambioRolDto, ListarUsuariosQueryDto, NuevoUsuarioDto } from '../dto/usuarios.dto.js';
import { uuidDeRuta } from '../validacion/uuid.js';

@Controller('v1/usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosAplicacion) {}

  @Roles('ADMINISTRADOR')
  @Get()
  async listar(@Query() query: ListarUsuariosQueryDto) {
    return this.usuarios.listar(
      { q: query.q, rol: query.rol, activo: query.activo },
      { pagina: query.pagina, tamanoPagina: query.tamanoPagina },
    );
  }

  @Roles('ADMINISTRADOR')
  @Post()
  async crear(
    @Body() dto: NuevoUsuarioDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @Res() respuesta: Response,
  ): Promise<void> {
    const actor = await this.usuarios.actorDesde(acceso.usuarioId);
    const creado = await this.usuarios.crear(dto, actor);
    respuesta.setHeader('Location', `/v1/usuarios/${creado.id}`);
    respuesta.status(201).json(creado);
  }

  @Roles('ADMINISTRADOR')
  @Patch(':id')
  async actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizacionUsuarioDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: SolicitudAutenticada,
    @Res() respuesta: Response,
  ): Promise<void> {
    const identificador = uuidDeRuta(id);
    const actor = await this.usuarios.actorDesde(acceso.usuarioId);
    try {
      const actualizado = await this.usuarios.actualizar(identificador, dto, actor);
      respuesta.status(200).json(actualizado);
    } catch (error) {
      if (error instanceof ErrorRelacionesIncompatibles) {
        responderErrorExtendido(respuesta, solicitud, 409, 'RELACIONES_INCOMPATIBLES', { relaciones: error.relaciones });
        return;
      }
      throw error;
    }
  }

  @Roles('ADMINISTRADOR')
  @Put(':id/rol')
  async cambiarRol(
    @Param('id') id: string,
    @Body() dto: CambioRolDto,
    @AccesoActual() acceso: ResolucionAcceso,
    @Req() solicitud: SolicitudAutenticada,
    @Res() respuesta: Response,
  ): Promise<void> {
    const identificador = uuidDeRuta(id);
    const actor = await this.usuarios.actorDesde(acceso.usuarioId);
    try {
      const actualizado = await this.usuarios.cambiarRol(identificador, dto.rol, actor);
      respuesta.status(200).json(actualizado);
    } catch (error) {
      if (error instanceof ErrorRelacionesIncompatibles) {
        responderErrorExtendido(respuesta, solicitud, 409, 'RELACIONES_INCOMPATIBLES', { relaciones: error.relaciones });
        return;
      }
      throw error;
    }
  }
}
