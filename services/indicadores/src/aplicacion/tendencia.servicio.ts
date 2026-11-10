/**
 * Tendencia (E6-B03#3, D166, D167, D185). Lee solo `snapshot_indicadores`: el QE ve sus filas `QE:<id>`; el Líder y el
 * Auditor, las filas `TODOS` (el Líder solo de sus células vigentes, con toda su historia). El Administrador no ve series.
 */
import { Injectable } from '@nestjs/common';
import { errorValidacion } from '@quality360/auth-nest';

import { diasEntre, fechaSantiago, sumarDias } from '../dominio/fechas.js';
import { SnapshotRepositorio } from '../dominio/repositorios.js';
import { ambitoQe, AMBITO_TODOS } from '../dominio/snapshot.js';
import { armarSeries } from '../dominio/tendencia.js';
import { SIN_SPRINT, type MotivoSinDatos, type Rol } from '../dominio/tipos.js';
import { Reloj } from './puertos.js';

export interface ConsultaTendencia {
  readonly rol: Rol;
  readonly usuarioId: string;
  /** Células vigentes del Líder (de `GET /v1/interno/acceso`). */
  readonly celulasIds: readonly string[];
  readonly celulaId: string | null;
  readonly sprintId: string | null;
  readonly desde: string | null;
  readonly hasta: string | null;
}

const DIAS_POR_DEFECTO = 89;
const DIAS_MAXIMOS = 366;

export function resolverRango(desde: string | null, hasta: string | null, hoy: string): { desde: string; hasta: string } {
  const fin = hasta ?? hoy;
  const inicio = desde ?? sumarDias(fin, -DIAS_POR_DEFECTO);
  if (inicio > fin) throw errorValidacion([{ campo: 'desde', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'desde no puede ser posterior a hasta.' }]);
  if (diasEntre(inicio, fin) > DIAS_MAXIMOS) throw errorValidacion([{ campo: 'desde', codigo: 'VALOR_NO_PERMITIDO', mensaje: `El rango no puede superar ${DIAS_MAXIMOS} días.` }]);
  return { desde: inicio, hasta: fin };
}

@Injectable()
export class TendenciaAplicacion {
  constructor(
    private readonly snapshots: SnapshotRepositorio,
    private readonly reloj: Reloj,
  ) {}

  async consultar(consulta: ConsultaTendencia) {
    const ahora = this.reloj.ahora();
    const hoy = fechaSantiago(ahora);
    const rango = resolverRango(consulta.desde, consulta.hasta, hoy);
    const filtros = { celulaId: consulta.celulaId, sprintId: consulta.sprintId, desde: rango.desde, hasta: rango.hasta };
    const base = { generadoEn: ahora.toISOString(), filtros };
    const conFiltros = consulta.celulaId !== null || consulta.sprintId !== null;

    // Los snapshots no guardan HDU sin sprint (D162, D180).
    if (consulta.sprintId === SIN_SPRINT) {
      return { ...base, sinDatos: true, motivoSinDatos: 'FILTRO_SIN_COINCIDENCIAS' satisfies MotivoSinDatos, totalSeries: 0, series: [] };
    }
    let celulaIds: string[] | undefined;
    if (consulta.rol === 'LIDER_QA') {
      celulaIds = consulta.celulaId === null ? [...consulta.celulasIds] : consulta.celulasIds.includes(consulta.celulaId) ? [consulta.celulaId] : [];
    } else if (consulta.celulaId !== null) celulaIds = [consulta.celulaId];

    const filas =
      celulaIds !== undefined && celulaIds.length === 0
        ? []
        : await this.snapshots.consultar({
            ambito: consulta.rol === 'QE' ? ambitoQe(consulta.usuarioId) : AMBITO_TODOS,
            desde: rango.desde,
            hasta: rango.hasta,
            ...(celulaIds === undefined ? {} : { celulaIds }),
            ...(consulta.sprintId === null ? {} : { sprintId: consulta.sprintId }),
          });
    const { totalSeries, series } = armarSeries(filas, hoy, conFiltros);
    const sinDatos = series.length === 0;
    return {
      ...base,
      sinDatos,
      motivoSinDatos: sinDatos ? ((conFiltros ? 'FILTRO_SIN_COINCIDENCIAS' : 'SIN_HISTORIAL') satisfies MotivoSinDatos) : null,
      totalSeries,
      series,
    };
  }
}
