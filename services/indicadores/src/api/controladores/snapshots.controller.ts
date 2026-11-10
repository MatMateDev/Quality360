/**
 * Snapshot y tendencia (E6-B03). El cron y el gancho de pruebas no usan sesión (`@Publico()` con su guarda); el disparo
 * manual y las ejecuciones son solo del Administrador; la tendencia es de QE, Líder QA y Auditor.
 */
import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AccesoActual, IdentidadActual, Publico, Roles, errorValidacion, type Identidad, type ResolucionAcceso, type SolicitudAutenticada } from '@quality360/auth-nest';

import { FuenteOrganizacion } from '../../aplicacion/puertos.js';
import { SnapshotAplicacion } from '../../aplicacion/snapshot.servicio.js';
import { TendenciaAplicacion } from '../../aplicacion/tendencia.servicio.js';
import { CargaSemillaGuard, CronGuard } from '../guardias/guardias-servicio.js';
import { autSesion, fechaOpcional, leerFiltros, leerPaginacion } from '../validacion.js';

@Controller('v1')
export class SnapshotsController {
  constructor(
    private readonly snapshots: SnapshotAplicacion,
    private readonly tendencia: TendenciaAplicacion,
    private readonly organizacion: FuenteOrganizacion,
  ) {}

  /** Disparo programado de Vercel Cron: actor `SISTEMA`, origen `CRON` (D163, D178). */
  @Publico()
  @UseGuards(CronGuard)
  @Get('cron/indicadores/snapshot')
  cron() {
    return this.snapshots.ejecutar('CRON', { id: null, nombre: 'SISTEMA' });
  }

  /** «Generar snapshot ahora»: solo el Administrador (D165). Lee con la credencial de Indicadores (D177). */
  @Roles('ADMINISTRADOR')
  @Post('indicadores/snapshots')
  @HttpCode(200)
  async manual(@IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    const perfil = await this.organizacion.perfil(autSesion(identidad, solicitud));
    return this.snapshots.ejecutar('MANUAL', { id: perfil.id, nombre: perfil.nombre });
  }

  @Roles('ADMINISTRADOR')
  @Get('indicadores/snapshots/ejecuciones')
  ejecuciones(@Query() query: Record<string, unknown>) {
    const { pagina, tamanoPagina } = leerPaginacion(query, 25);
    return this.snapshots.listar(pagina, tamanoPagina);
  }

  /** Solo pruebas (D184): ejecuta el snapshot «como si» fuera `instante`. Origen `MANUAL`, actor «Carga de prueba». */
  @Publico()
  @UseGuards(CargaSemillaGuard)
  @Post('interno/carga/snapshots')
  @HttpCode(200)
  cargaDePrueba(@Body() cuerpo: unknown) {
    const instante = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as Record<string, unknown>).instante : undefined;
    const fecha = typeof instante === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(instante) ? new Date(instante) : null;
    if (fecha === null || Number.isNaN(fecha.getTime())) {
      throw errorValidacion([{ campo: 'instante', codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser una fecha y hora ISO 8601.' }]);
    }
    return this.snapshots.ejecutar('MANUAL', { id: null, nombre: 'Carga de prueba' }, fecha);
  }

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('indicadores/tendencia')
  tendenciaDe(@Query() query: Record<string, unknown>, @AccesoActual() acceso: ResolucionAcceso | undefined) {
    const filtros = leerFiltros(query);
    const desde = fechaOpcional(query.desde, 'desde');
    const hasta = fechaOpcional(query.hasta, 'hasta');
    if (acceso === undefined) throw errorValidacion([]);
    return this.tendencia.consultar({
      rol: acceso.rol,
      usuarioId: acceso.usuarioId,
      celulasIds: acceso.ambito.celulasIds,
      celulaId: filtros.celulaId,
      sprintId: filtros.sprintId,
      desde,
      hasta,
    });
  }
}
