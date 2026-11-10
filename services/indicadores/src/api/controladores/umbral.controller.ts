/** Umbral de sobrecarga (E6-B02#3, D183). `PUT` solo del QE dueño; lectura de QE, Líder QA y Auditor; historial de QE y Auditor. */
import { Body, Controller, Get, HttpCode, Inject, Put, Query, Req } from '@nestjs/common';
import { ExcepcionQ360, IdentidadActual, MENSAJES, Roles, errorValidacion, type Identidad, type SolicitudAutenticada } from '@quality360/auth-nest';

import { UmbralAplicacion } from '../../aplicacion/umbral.servicio.js';
import { CONFIGURACION, type ConfiguracionIndicadores } from '../../configuracion.js';
import { autSesion, leerPaginacion, uuidOpcional } from '../validacion.js';

@Controller('v1/indicadores/umbral-carga')
export class UmbralController {
  constructor(
    private readonly umbral: UmbralAplicacion,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores,
  ) {}

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get()
  obtener(@Query() query: Record<string, unknown>, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    const qeId = uuidOpcional(query.qeId, 'qeId');
    return this.umbral.obtener(autSesion(identidad, solicitud), qeId);
  }

  /** `valor` debe ser un número JSON entero (otro tipo → `VALIDACION`); fuera de 1 a 50 → `VALOR_FUERA_DE_RANGO`. */
  @Roles('QE')
  @Put()
  @HttpCode(200)
  fijar(@Body() cuerpo: unknown, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    const valor = typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>).valor : undefined;
    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
      throw errorValidacion([{ campo: 'valor', codigo: valor === undefined || valor === null ? 'REQUERIDO' : 'FORMATO_INVALIDO', mensaje: 'Debe ser un número entero.' }]);
    }
    const { umbralMin, umbralMax } = this.configuracion;
    if (valor < umbralMin || valor > umbralMax) {
      throw new ExcepcionQ360(400, 'VALOR_FUERA_DE_RANGO', {
        mensaje: MENSAJES.VALOR_FUERA_DE_RANGO,
        detalles: [{ campo: 'valor', codigo: 'VALOR_NO_PERMITIDO', mensaje: MENSAJES.VALOR_FUERA_DE_RANGO }],
      });
    }
    return this.umbral.fijar(autSesion(identidad, solicitud), valor);
  }

  @Roles('QE', 'AUDITOR')
  @Get('historial')
  historial(@Query() query: Record<string, unknown>, @IdentidadActual() identidad: Identidad | undefined, @Req() solicitud: SolicitudAutenticada) {
    const qeId = uuidOpcional(query.qeId, 'qeId');
    const { pagina, tamanoPagina } = leerPaginacion(query, 5);
    return this.umbral.historial(autSesion(identidad, solicitud), qeId, pagina, tamanoPagina);
  }
}
