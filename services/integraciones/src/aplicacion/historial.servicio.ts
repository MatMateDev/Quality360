/**
 * Historial (E5-B04#2, D106, D121, D126): ejecuciones, su detalle por fila y el estado de la integración.
 * Lo ven Administrador, Auditor y QE; el QE ve el resumen de todas las ejecuciones pero, en el detalle, solo las filas
 * de HDU de su ámbito (una sola llamada a `GET /v1/interno/hdu/ambito`) más las filas con error sin título ni
 * referencia. Una ejecución inexistente es 404 para Administrador y Auditor, y 403 para el QE (no revela existencia).
 */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado, noEncontrado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIntegraciones } from '../configuracion.js';
import { Presupuesto, estaAbandonada } from '../dominio/ejecucion.js';
import type { Ejecucion, ResultadoFila } from '../dominio/tipos.js';
import {
  ConfiguracionRepositorio,
  EjecucionRepositorio,
  ProveedorOrganizacion,
  Reloj,
  type FiltroEjecuciones,
  type Solicitante,
} from './puertos.js';
import { vistaEjecucion, vistaFila } from './vistas.js';

export const TAMANO_MAXIMO_PAGINA = 100;

export interface EntradaListado {
  readonly filtro: FiltroEjecuciones;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

export interface EntradaDetalle {
  readonly resultado?: ResultadoFila;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

@Injectable()
export class HistorialAplicacion {
  constructor(
    private readonly ejecuciones: EjecucionRepositorio,
    private readonly configuraciones: ConfiguracionRepositorio,
    private readonly organizacion: ProveedorOrganizacion,
    private readonly reloj: Reloj,
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIntegraciones,
  ) {}

  /** El tamaño de página mayor a 100 se recorta sin error y la respuesta informa el efectivo (D49). */
  async listar(entrada: EntradaListado) {
    const tamanoPagina = Math.min(entrada.tamanoPagina, TAMANO_MAXIMO_PAGINA);
    const pagina = await this.ejecuciones.listar(entrada.filtro, entrada.pagina, tamanoPagina);
    return { items: pagina.items.map(vistaEjecucion), total: pagina.total, pagina: pagina.pagina, tamanoPagina };
  }

  async obtener(solicitante: Solicitante, id: string) {
    return vistaEjecucion(await this.existente(solicitante, id));
  }

  async detalle(solicitante: Solicitante, id: string, entrada: EntradaDetalle) {
    await this.existente(solicitante, id);
    const tamanoPagina = Math.min(entrada.tamanoPagina, TAMANO_MAXIMO_PAGINA);
    const esQe = solicitante.rol === 'QE';
    let ambito: readonly string[] | null = null;
    if (esQe) {
      const presupuesto = new Presupuesto(this.configuracion.presupuestoMs);
      const resultado = await this.organizacion.ambito(solicitante.contexto, presupuesto.limiteDe(this.configuracion.tiempoLimiteOrganizacionMs));
      ambito = resultado.todas ? null : resultado.hduIds;
    }
    const filas = await this.ejecuciones.listarDetalle(id, { resultado: entrada.resultado, ambitoHduIds: ambito }, entrada.pagina, tamanoPagina);
    return {
      // Las filas con error del QE van completas pero sin título ni referencia (D106, D126).
      items: filas.items.map((fila) => vistaFila(fila, esQe && fila.resultado === 'ERROR')),
      total: filas.total,
      pagina: entrada.pagina,
      tamanoPagina,
      filasOcultas: filas.ocultas,
    };
  }

  /** Última ejecución, última completada (D121) y la ejecución en curso; solo el Administrador ve `jiraConfigurado` y `continuar`. */
  async estado(solicitante: Solicitante) {
    const { ultima, ultimaCompletada, ultimaJira, enCurso } = await this.ejecuciones.estado();
    const resultado: {
      ultimaEjecucion: ReturnType<typeof vistaEjecucion> | null;
      ultimaCompletada: ReturnType<typeof vistaEjecucion> | null;
      enCurso: { id: string; origen: Ejecucion['origen']; iniciadaEn: Date; abandonada: boolean } | null;
      jiraConfigurado?: boolean;
      continuar?: { desde: string; ejecucionId: string };
    } = {
      ultimaEjecucion: ultima === null ? null : vistaEjecucion(ultima),
      ultimaCompletada: ultimaCompletada === null ? null : vistaEjecucion(ultimaCompletada),
      enCurso:
        enCurso === null
          ? null
          : { id: enCurso.id, origen: enCurso.origen, iniciadaEn: enCurso.iniciadaEn, abandonada: estaAbandonada(enCurso.iniciadaEn, this.reloj.ahora(), this.configuracion.enCursoMaxMs) },
    };
    if (solicitante.rol === 'ADMINISTRADOR') {
      resultado.jiraConfigurado = (await this.configuraciones.obtener()) !== null;
      // «Continuar» solo si la última ejecución de Jira quedó incompleta con una clave desde la cual seguir (D96).
      if (enCurso === null && ultimaJira !== null && ultimaJira.resultado === 'INCOMPLETA' && ultimaJira.continuarDesde !== null) {
        resultado.continuar = { desde: ultimaJira.continuarDesde, ejecucionId: ultimaJira.id };
      }
    }
    return resultado;
  }

  /** Inexistente: 404 al Administrador y al Auditor, 403 al QE (D106, D126). */
  private async existente(solicitante: Solicitante, id: string): Promise<Ejecucion> {
    const ejecucion = await this.ejecuciones.obtener(id);
    if (ejecucion !== null) return ejecucion;
    if (solicitante.rol === 'ADMINISTRADOR' || solicitante.rol === 'AUDITOR') throw noEncontrado('ejecución inexistente');
    throw accesoDenegado('ejecución inexistente para este rol');
  }
}
