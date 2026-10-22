/**
 * Checklist de entregables (E3). El rol lo valida `AccesoGuard`; la relación
 * con la HDU y las reglas, `ChecklistAplicacion` (D18).
 */
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { IdentidadActual, Publico, Roles, noAutenticado, obtenerTraceId, type Identidad } from '@quality360/auth-nest';
import type { Request } from 'express';

import { ChecklistAplicacion } from '../../aplicacion/checklist.servicio.js';
import type { ContextoSolicitud } from '../../infraestructura/organizacion.cliente.js';
import { claveDeRuta, hduIdDeRuta, leerMarca, leerSubida, leerTexto } from '../validacion.js';

/**
 * Las lecturas admiten los 5 roles (E7-B02): el Líder QA y el Auditor leen y descargan. Toda
 * escritura lista sus roles de forma explícita y ninguna incluye Líder ni Auditor (D32).
 */
const ROLES_TODOS = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'] as const;

function contexto(identidad: Identidad | undefined, solicitud: Request): ContextoSolicitud {
  if (identidad === undefined) throw noAutenticado('ruta sin identidad verificada');
  return { token: identidad.token, traceId: obtenerTraceId(solicitud as never) };
}

@Controller('v1/hdu/:hduId')
export class ChecklistController {
  constructor(private readonly checklist: ChecklistAplicacion) {}

  @Roles(...ROLES_TODOS)
  @Get('checklist')
  resumen(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.resumen(hduIdDeRuta(hduId), contexto(identidad, solicitud));
  }

  @Roles(...ROLES_TODOS)
  @Get('entregables')
  obtener(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.checklist(hduIdDeRuta(hduId), contexto(identidad, solicitud));
  }

  @Roles(...ROLES_TODOS)
  @Get('entregables/bitacora')
  bitacora(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.bitacora(hduIdDeRuta(hduId), contexto(identidad, solicitud));
  }

  @Roles('ANALISTA_QA')
  @Post('entregables/:clave/evidencias')
  @HttpCode(201)
  subida(
    @Param('hduId') hduId: string,
    @Param('clave') clave: string,
    @Body() cuerpo: unknown,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: Request,
  ) {
    return this.checklist.solicitarSubida(hduIdDeRuta(hduId), claveDeRuta(clave), leerSubida(cuerpo), contexto(identidad, solicitud));
  }

  @Roles('ANALISTA_QA')
  @Post('entregables/:clave/marcar')
  @HttpCode(200)
  marcar(
    @Param('hduId') hduId: string,
    @Param('clave') clave: string,
    @Body() cuerpo: unknown,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: Request,
  ) {
    return this.checklist.marcar(hduIdDeRuta(hduId), claveDeRuta(clave), leerMarca(cuerpo), contexto(identidad, solicitud));
  }

  @Roles('ANALISTA_QA')
  @Post('entregables/:clave/desmarcar')
  @HttpCode(200)
  desmarcar(
    @Param('hduId') hduId: string,
    @Param('clave') clave: string,
    @Body() cuerpo: unknown,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: Request,
  ) {
    return this.checklist.desmarcar(hduIdDeRuta(hduId), claveDeRuta(clave), leerTexto(cuerpo, 'motivo', 500), contexto(identidad, solicitud));
  }

  @Roles('QE')
  @Post('entregables/:clave/aprobar')
  @HttpCode(200)
  aprobar(@Param('hduId') hduId: string, @Param('clave') clave: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.aprobar(hduIdDeRuta(hduId), claveDeRuta(clave), contexto(identidad, solicitud));
  }

  @Roles('QE')
  @Post('entregables/:clave/rechazar')
  @HttpCode(200)
  rechazar(
    @Param('hduId') hduId: string,
    @Param('clave') clave: string,
    @Body() cuerpo: unknown,
    @IdentidadActual() identidad: Identidad,
    @Req() solicitud: Request,
  ) {
    return this.checklist.rechazar(
      hduIdDeRuta(hduId),
      claveDeRuta(clave),
      leerTexto(cuerpo, 'comentario', 1000),
      contexto(identidad, solicitud),
    );
  }

  @Roles(...ROLES_TODOS)
  @Get('entregables/:clave/evidencia')
  evidencia(@Param('hduId') hduId: string, @Param('clave') clave: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.descargarEvidencia(hduIdDeRuta(hduId), claveDeRuta(clave), contexto(identidad, solicitud));
  }

  @Roles('QE')
  @Post('certificado')
  @HttpCode(201)
  generarCertificado(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.generarCertificado(hduIdDeRuta(hduId), contexto(identidad, solicitud));
  }

  @Roles(...ROLES_TODOS)
  @Get('certificado')
  obtenerCertificado(@Param('hduId') hduId: string, @IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.obtenerCertificado(hduIdDeRuta(hduId), contexto(identidad, solicitud));
  }
}

@Controller('v1/qe')
export class BandejaController {
  constructor(private readonly checklist: ChecklistAplicacion) {}

  @Roles('QE')
  @Get('aprobaciones-pendientes')
  bandeja(@IdentidadActual() identidad: Identidad, @Req() solicitud: Request) {
    return this.checklist.bandeja(contexto(identidad, solicitud));
  }
}

@Controller('v1/certificados')
export class VerificacionController {
  constructor(private readonly checklist: ChecklistAplicacion) {}

  /** Pública (D21): cualquiera con el folio puede confirmar su validez. */
  @Publico()
  @Get(':folio/verificacion')
  verificar(@Param('folio') folio: string) {
    return this.checklist.verificar(typeof folio === 'string' ? folio.slice(0, 40) : '');
  }
}
