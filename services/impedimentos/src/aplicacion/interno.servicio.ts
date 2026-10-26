/**
 * Consultas internas de Organización (`/v1/interno/*`, D69, D86): el cierre de una HDU (D60) y
 * las bandejas (D87). El gateway no las publica. Cada una autoriza con el token del usuario.
 */
import { Injectable } from '@nestjs/common';
import { accesoDenegado } from '@quality360/auth-nest';

import { diasAbierto } from '../dominio/dias.js';
import { ImpedimentoRepositorio, RiesgoRepositorio } from '../dominio/repositorios.js';
import type { EstadoHdu } from '../dominio/tipos.js';
import { Autorizador, type Solicitante } from './autorizador.js';
import { EvaluadorRiesgo } from './evaluador-riesgo.js';
import { ProveedorAcceso } from './puertos.js';
import { resumenDeNivel, vistaImpedimento } from './vistas.js';

/** Tope de impedimentos que se listan en el 409 de cierre (D77). */
export const MAXIMO_BLOQUEANTES = 20;

export interface HduParaEvaluacion {
  readonly hduId: string;
  readonly estado: EstadoHdu;
  readonly sprintFin: string | null;
  readonly avance: number | null;
}

@Injectable()
export class InternoAplicacion {
  constructor(
    private readonly autorizador: Autorizador,
    private readonly proveedor: ProveedorAcceso,
    private readonly impedimentos: ImpedimentoRepositorio,
    private readonly riesgos: RiesgoRepositorio,
    private readonly evaluador: EvaluadorRiesgo,
  ) {}

  /**
   * Bloqueo, conteos y riesgo de un lote de HDU con los datos que ya tiene Organización (D69).
   * Si algún id está fuera del ámbito del usuario, 403 completo y sin datos parciales (D47).
   */
  async evaluar(hdus: readonly HduParaEvaluacion[], incluirImpedimentos: boolean, solicitante: Solicitante) {
    const ambito = await this.proveedor.ambito(solicitante.contexto);
    if (!ambito.todas) {
      const permitidos = new Set(ambito.hduIds);
      if (hdus.some((hdu) => !permitidos.has(hdu.hduId))) throw accesoDenegado('lote con una HDU fuera de ámbito');
    }

    const ids = hdus.map((hdu) => hdu.hduId);
    const [bloqueantes, fijados] = await Promise.all([
      this.impedimentos.listar({ hduIds: ids, estados: ['ABIERTO', 'ESCALADO'] }),
      this.riesgos.ultimoPorHdu(ids),
    ]);
    const porHdu = new Map<string, typeof bloqueantes>();
    for (const fila of bloqueantes) porHdu.set(fila.hduId, [...(porHdu.get(fila.hduId) ?? []), fila]);

    const ahora = new Date();
    const tiempo = { ahora, hoy: this.evaluador.hoy(ahora) };
    const items = hdus.map((hdu) => {
      const filas = porHdu.get(hdu.hduId) ?? [];
      const fijado = fijados.get(hdu.hduId) ?? null;
      const evaluacion = this.evaluador.evaluar({ id: hdu.hduId, estado: hdu.estado, sprint: null, sprintFin: hdu.sprintFin }, filas, fijado, hdu.avance, ahora);
      return {
        hduId: hdu.hduId,
        bloqueada: filas.length > 0,
        abiertos: filas.length,
        escalados: filas.filter((fila) => fila.estado === 'ESCALADO').length,
        nuevos: filas.filter((fila) => ahora.getTime() - fila.fechaRegistro.getTime() < 24 * 60 * 60 * 1000).length,
        riesgo: resumenDeNivel(evaluacion.vigente),
        nivelFijado: fijado === null ? null : fijado.nivel,
        nivelSugerido: evaluacion.resultado.nivelSugerido,
      };
    });

    return {
      fechaReferencia: tiempo.hoy,
      items,
      impedimentos: incluirImpedimentos
        ? [...bloqueantes].sort((a, b) => a.abiertoDesde.getTime() - b.abiertoDesde.getTime() || a.id.localeCompare(b.id)).map((fila) => vistaImpedimento(fila, tiempo, []))
        : [],
    };
  }

  /** Impedimentos que impiden cerrar una HDU (D60, D77): los 20 más antiguos y el total. */
  async abiertos(hduId: string, solicitante: Solicitante) {
    await this.autorizador.acceso(hduId, solicitante);
    const { total, items } = await this.impedimentos.bloqueantesDeHdu(hduId, MAXIMO_BLOQUEANTES);
    const hoy = this.evaluador.hoy(new Date());
    return {
      hduId,
      total,
      items: items.map((fila) => ({
        id: fila.id,
        titulo: fila.titulo,
        tipo: fila.tipo,
        estado: fila.estado as 'ABIERTO' | 'ESCALADO',
        diasAbierto: diasAbierto(fila.abiertoDesde, fila.fechaResolucion, hoy),
      })),
    };
  }
}
