/**
 * Riesgo de una HDU (E4-B03): nivel vigente, sugerido y sus factores (`GET`) y cambio manual
 * del QE responsable (`PUT`). El Analista QA no ve el riesgo (D73).
 *
 * Orden de validación del `PUT` (D89): 401 → 403 → 400 → 409 `HDU_CERRADA` → 422.
 */
import { Injectable } from '@nestjs/common';
import { ExcepcionQ360 } from '@quality360/auth-nest';

import { FuenteNoDisponible } from '../dominio/errores.js';
import { puedeGestionarPorRelacion, puedeVerRiesgoPorRelacion, permisosDe } from '../dominio/permisos.js';
import { sugerenciaDistinta } from '../dominio/riesgo/calculo.js';
import { ImpedimentoRepositorio, RiesgoRepositorio } from '../dominio/repositorios.js';
import type { NivelRiesgo } from '../dominio/tipos.js';
import { Autorizador, hduCerrada, type Solicitante } from './autorizador.js';
import { EvaluadorRiesgo, type EvaluacionHdu } from './evaluador-riesgo.js';
import { ProveedorSeguimiento, type AccesoHdu } from './puertos.js';
import { vistaFactor, vistaFijado } from './vistas.js';

export interface DatosCambioRiesgo {
  readonly nivel: NivelRiesgo;
  /** Puede venir en blanco (422 `JUSTIFICACION_REQUERIDA`). */
  readonly justificacion: string;
}

@Injectable()
export class RiesgoAplicacion {
  constructor(
    private readonly autorizador: Autorizador,
    private readonly impedimentos: ImpedimentoRepositorio,
    private readonly riesgos: RiesgoRepositorio,
    private readonly seguimiento: ProveedorSeguimiento,
    private readonly evaluador: EvaluadorRiesgo,
  ) {}

  /** `GET /v1/hdu/{hduId}/riesgo`: todos los que ven la HDU salvo el Analista asignado (403). */
  async obtener(hduId: string, solicitante: Solicitante) {
    const acceso = await this.autorizador.accesoCon(hduId, solicitante, puedeVerRiesgoPorRelacion);
    const ahora = new Date();
    return this.vista(acceso, await this.evaluar(acceso, solicitante, ahora), ahora);
  }

  /** Paso previo al `PUT`: solo el QE responsable. */
  autorizarFijar(hduId: string, solicitante: Solicitante): Promise<AccesoHdu> {
    return this.autorizador.accesoCon(hduId, solicitante, puedeGestionarPorRelacion);
  }

  async fijar(acceso: AccesoHdu, datos: DatosCambioRiesgo, solicitante: Solicitante) {
    if (acceso.hdu.estado === 'CERRADA') throw hduCerrada();
    const justificacion = datos.justificacion.trim();
    if (justificacion.length === 0) {
      throw new ExcepcionQ360(422, 'JUSTIFICACION_REQUERIDA', {
        detalles: [{ campo: 'justificacion', codigo: 'REQUERIDO', mensaje: 'La justificación es obligatoria.' }],
      });
    }

    const ahora = new Date();
    // La sugerencia del momento se guarda con el cambio (E4-B03#3); si no se pudo calcular, queda NULL.
    const sugerido = (await this.evaluar(acceso, solicitante, ahora)).resultado.nivelSugerido;
    const { cambio } = await this.riesgos.fijar(acceso.hdu.id, (ultimo) => {
      if (ultimo !== null && ultimo.nivel === datos.nivel && ultimo.justificacion === justificacion) return null;
      return { nivel: datos.nivel, justificacion, sugeridoAlFijar: sugerido, actor: acceso.actor, ahora };
    });

    return { cambio, riesgo: this.vista(acceso, await this.evaluar(acceso, solicitante, ahora), ahora) };
  }

  /** Reúne fijado, impedimentos y avance de la HDU y aplica el cálculo. */
  private async evaluar(acceso: AccesoHdu, solicitante: Solicitante, ahora: Date): Promise<EvaluacionHdu> {
    const hdu = acceso.hdu;
    const [fijados, filas] = await Promise.all([this.riesgos.ultimoPorHdu([hdu.id]), this.impedimentos.listarPorHdu(hdu.id)]);
    let avance: number | null = null;
    if (hdu.estado !== 'CERRADA' && hdu.sprintFin !== null) {
      try {
        avance = (await this.seguimiento.estados([hdu.id], solicitante.contexto)).get(hdu.id)?.porcentaje ?? 0;
      } catch (error) {
        if (!(error instanceof FuenteNoDisponible)) throw error;
      }
    }
    return this.evaluador.evaluar(hdu, filas, fijados.get(hdu.id) ?? null, avance, ahora);
  }

  private vista(acceso: AccesoHdu, evaluacion: EvaluacionHdu, ahora: Date) {
    const { resultado, vigente, fijado } = evaluacion;
    return {
      hduId: acceso.hdu.id,
      hduCerrada: acceso.hdu.estado === 'CERRADA',
      nivelVigente: vigente.nivelVigente,
      origen: vigente.origen,
      fijado: fijado === null ? null : vistaFijado(fijado),
      nivelSugerido: resultado.nivelSugerido,
      estado: resultado.estado,
      motivoSinSugerencia: resultado.motivoSinSugerencia,
      calculoParcial: resultado.calculoParcial,
      factores: resultado.factores.map(vistaFactor),
      factoresNoEvaluados: [...resultado.factoresNoEvaluados],
      sugerenciaDistinta: sugerenciaDistinta(fijado, resultado),
      fechaReferencia: this.evaluador.hoy(ahora),
      permisos: { puedeFijarRiesgo: permisosDe(acceso.relacion, acceso.hdu.estado).puedeFijarRiesgo },
    };
  }
}
