/**
 * Rutas que se reenvían tal cual a Organización.
 *
 * Están declaradas una por una, a propósito: el gateway expone solo lo que
 * está en `gateway.v1.yaml`. No hay comodín que pueda alcanzar `/v1/interno/*`
 * ni ninguna otra ruta interna; lo que no está aquí responde 404.
 */
import { Controller, Get, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Reenviador, type SolicitudGateway } from '../aplicacion/reenviador.js';
import { uuidDeRuta } from './validacion.js';

@Controller('v1/me')
export class SesionController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get()
  async perfil(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/me' });
  }
}

@Controller('v1/qe')
export class EquipoController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get('analistas')
  async analistas(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/qe/analistas' });
  }

  @Get('analistas-asignables')
  async asignables(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/qe/analistas-asignables' });
  }
}

@Controller('v1/usuarios')
export class UsuariosController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get()
  async listar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/usuarios' });
  }

  @Post()
  async crear(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/usuarios' });
  }

  @Patch(':id')
  async actualizar(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/usuarios/${uuidDeRuta(id)}` });
  }

  @Put(':id/rol')
  async cambiarRol(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/usuarios/${uuidDeRuta(id)}/rol` });
  }
}

@Controller('v1/analistas')
export class SupervisionController {
  constructor(private readonly reenviador: Reenviador) {}

  @Put(':id/supervisor')
  async asignarSupervisor(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/analistas/${uuidDeRuta(id)}/supervisor` });
  }

  @Get(':id/supervision/historial')
  async historial(
    @Param('id') id: string,
    @Req() solicitud: SolicitudGateway,
    @Res() respuesta: Response,
  ): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, {
      ruta: `/v1/analistas/${uuidDeRuta(id)}/supervision/historial`,
    });
  }
}

@Controller('v1/auditoria')
export class AuditoriaController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get()
  async listar(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/auditoria' });
  }
}

@Controller('v1/catalogos')
export class CatalogosController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get('celulas')
  async celulas(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/catalogos/celulas' });
  }

  @Get('sprints')
  async sprints(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/catalogos/sprints' });
  }
}
