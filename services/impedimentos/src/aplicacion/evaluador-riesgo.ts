/**
 * Evaluación del riesgo de varias HDU para los listados: reúne el nivel fijado, los impedimentos
 * y el avance (Certificaciones, solo si hace falta) y aplica el cálculo puro del dominio.
 */
import { Inject, Injectable } from '@nestjs/common';

import { CONFIGURACION, type ConfiguracionImpedimentos } from '../configuracion.js';
import { hoy as hoyDe } from '../dominio/dias.js';
import { FuenteNoDisponible } from '../dominio/errores.js';
import {
  calcularRiesgoSugerido,
  nivelVigente,
  type NivelVigente,
  type ResultadoRiesgo,
} from '../dominio/riesgo/calculo.js';
import { RiesgoRepositorio } from '../dominio/repositorios.js';
import type { ImpedimentoRegistro, RiesgoFijadoRegistro } from '../dominio/tipos.js';
import { ProveedorSeguimiento, type ContextoSolicitud, type DatosHdu } from './puertos.js';

export interface EvaluacionHdu {
  readonly resultado: ResultadoRiesgo;
  readonly vigente: NivelVigente;
  readonly fijado: RiesgoFijadoRegistro | null;
  /** `null` si no se pidió o Certificaciones no respondió. */
  readonly avance: number | null;
}

/** Datos mínimos de una HDU para el cálculo (los de Organización o los que envía en el lote). */
export interface HduParaEvaluar {
  readonly id: string;
  readonly estado: DatosHdu['estado'];
  readonly sprint: { id: string; nombre: string } | null;
  readonly sprintFin: string | null;
}

@Injectable()
export class EvaluadorRiesgo {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionImpedimentos,
    private readonly riesgos: RiesgoRepositorio,
    private readonly seguimiento: ProveedorSeguimiento,
  ) {}

  /** «Hoy» del cálculo (D68, D90). */
  hoy(ahora: Date): string {
    return hoyDe(ahora, this.configuracion.fechaReferencia);
  }

  /** Evaluación pura de una HDU con los datos ya reunidos. */
  evaluar(
    hdu: HduParaEvaluar,
    impedimentos: readonly ImpedimentoRegistro[],
    fijado: RiesgoFijadoRegistro | null,
    avance: number | null,
    ahora: Date,
  ): EvaluacionHdu {
    const resultado = calcularRiesgoSugerido({
      hduCerrada: hdu.estado === 'CERRADA',
      impedimentos,
      sprint: hdu.sprint,
      sprintFin: hdu.sprintFin,
      avance,
      hoy: this.hoy(ahora),
      umbrales: this.configuracion.riesgo,
    });
    return { resultado, vigente: nivelVigente(fijado, resultado), fijado, avance };
  }

  /**
   * Evalúa un lote. Consulta el avance a Certificaciones solo para las HDU que lo necesitan: no
   * cerradas, con sprint y sin nivel fijado (un nivel fijado no depende de la sugerencia).
   * Si Certificaciones no responde, `avance` queda `null` y `certificacionesCaida` en `true`.
   */
  async evaluarLote(
    hdus: readonly DatosHdu[],
    impedimentosPorHdu: ReadonlyMap<string, readonly ImpedimentoRegistro[]>,
    contexto: ContextoSolicitud,
    ahora: Date,
    opciones: { avanceDeTodas?: boolean } = {},
  ): Promise<{ evaluaciones: Map<string, EvaluacionHdu>; certificacionesCaida: boolean }> {
    const fijados = await this.riesgos.ultimoPorHdu(hdus.map((hdu) => hdu.id));
    const consultar = hdus
      .filter((hdu) => opciones.avanceDeTodas === true || (hdu.estado !== 'CERRADA' && hdu.sprintFin !== null && !fijados.has(hdu.id)))
      .map((hdu) => hdu.id);

    const avances = new Map<string, number>();
    let certificacionesCaida = false;
    if (consultar.length > 0) {
      try {
        const estados = await this.seguimiento.estados(consultar, contexto);
        for (const estado of estados.values()) avances.set(estado.hduId, estado.porcentaje);
      } catch (error) {
        if (!(error instanceof FuenteNoDisponible)) throw error;
        certificacionesCaida = true;
      }
    }

    const consultadas = new Set(consultar);
    const evaluaciones = new Map<string, EvaluacionHdu>();
    for (const hdu of hdus) {
      // Una HDU sin ciclo no figura con avance propio: Certificaciones responde 0 y es un dato válido.
      const avance = certificacionesCaida || !consultadas.has(hdu.id) ? null : (avances.get(hdu.id) ?? 0);
      evaluaciones.set(hdu.id, this.evaluar(hdu, impedimentosPorHdu.get(hdu.id) ?? [], fijados.get(hdu.id) ?? null, avance, ahora));
    }
    return { evaluaciones, certificacionesCaida };
  }
}
