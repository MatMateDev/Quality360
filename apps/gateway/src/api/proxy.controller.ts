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

  /** Para la preselección `?usuario=<id>` de `/admin/usuarios` (D44). */
  @Get(':id')
  async obtener(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/usuarios/${uuidDeRuta(id)}` });
  }

  @Get(':id/celulas-lider')
  async celulasLider(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/usuarios/${uuidDeRuta(id)}/celulas-lider` });
  }

  @Put(':id/celulas-lider')
  async reemplazarCelulasLider(@Param('id') id: string, @Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: `/v1/usuarios/${uuidDeRuta(id)}/celulas-lider` });
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

@Controller('v1/roles')
export class RolesController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get()
  async roles(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/roles' });
  }
}

/** Bandejas por rol (D33, D46): Organización las compone; el gateway solo las reenvía. */
@Controller('v1/bandeja')
export class BandejasController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get('analista')
  async analista(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/bandeja/analista' });
  }

  @Get('qe')
  async qe(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/bandeja/qe' });
  }

  @Get('lider')
  async lider(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/bandeja/lider' });
  }

  @Get('admin')
  async admin(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/bandeja/admin' });
  }

  @Get('auditor')
  async auditor(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/bandeja/auditor' });
  }
}

/** Consultas y exportaciones del Auditor que atiende Organización (E7-B04). */
@Controller('v1/auditor')
export class AuditorOrganizacionController {
  constructor(private readonly reenviador: Reenviador) {}

  @Get('auditoria-usuarios')
  async auditoriaUsuarios(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/auditor/auditoria-usuarios' });
  }

  @Get('exportaciones/hdu')
  async exportarHdu(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/auditor/exportaciones/hdu' });
  }

  @Get('exportaciones/auditoria-usuarios')
  async exportarAuditoriaUsuarios(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/auditor/exportaciones/auditoria-usuarios' });
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

  /** Personas por rol para elegir al QE de una reasignación (D54). */
  @Get('personas')
  async personas(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/catalogos/personas' });
  }

  @Get('sprints')
  async sprints(@Req() solicitud: SolicitudGateway, @Res() respuesta: Response): Promise<void> {
    await this.reenviador.reenviar(solicitud, respuesta, { ruta: '/v1/catalogos/sprints' });
  }
}
