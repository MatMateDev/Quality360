/**
 * `/v1/interno/indicadores/*` (E6, D176, D177). El ámbito usa el token del usuario; el snapshot solo la credencial
 * propia de Indicadores (`@Publico()` apaga los guards de sesión y `IndicadoresServicioGuard` es el único control).
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccesoActual, Publico, Roles, errorValidacion, type ResolucionAcceso } from '@quality360/auth-nest';

import {
  IndicadoresInternoAplicacion,
  type AmbitoIndicadores,
  type DatosSnapshotOrganizacion,
} from '../../aplicacion/indicadores.servicio.js';
import { IndicadoresServicioGuard } from '../guardias/indicadores-servicio.guard.js';

const LIMITE_DEFECTO = 1001;
const LIMITE_MAXIMO = 5000;

@Controller('v1/interno/indicadores')
export class IndicadoresInternoController {
  constructor(private readonly indicadores: IndicadoresInternoAplicacion) {}

  @Roles('QE', 'LIDER_QA', 'AUDITOR')
  @Get('ambito')
  async ambito(@AccesoActual() acceso: ResolucionAcceso): Promise<AmbitoIndicadores> {
    return this.indicadores.ambito(acceso.rol, acceso.usuarioId, acceso.ambito);
  }

  @Publico()
  @UseGuards(IndicadoresServicioGuard)
  @Get('snapshot')
  async snapshot(@Query('limite') limite: string | undefined): Promise<DatosSnapshotOrganizacion> {
    let tope = LIMITE_DEFECTO;
    if (limite !== undefined) {
      const numero = Number(limite);
      if (!/^\d+$/.test(limite) || numero < 1 || numero > LIMITE_MAXIMO) {
        throw errorValidacion([{ campo: 'limite', codigo: 'VALOR_NO_PERMITIDO', mensaje: `Debe ser un entero de 1 a ${LIMITE_MAXIMO}.` }]);
      }
      tope = numero;
    }
    return this.indicadores.snapshot(tope);
  }
}
