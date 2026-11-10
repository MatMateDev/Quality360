/** Certificaciones (avance) e Impedimentos (bloqueo y riesgo) por HTTP, en lotes de 1000 HDU (D154, D188). */
import { Inject, Injectable } from '@nestjs/common';

import {
  FuenteCertificaciones,
  FuenteImpedimentos,
  FuenteNoDisponible,
  type Autenticacion,
  type HduParaEvaluar,
  type ResultadoEvaluacion,
} from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionIndicadores } from '../../configuracion.js';
import type { AvanceHdu, EvaluacionHdu, ImpedimentoBloqueante, NivelRiesgo } from '../../dominio/tipos.js';
import { llamar, trocear, TAMANO_LOTE } from './http.js';

type Json = Record<string, unknown>;
const objeto = (valor: unknown, fuente: 'CERTIFICACIONES' | 'IMPEDIMENTOS', que: string): Json => {
  if (typeof valor === 'object' && valor !== null && !Array.isArray(valor)) return valor as Json;
  throw new FuenteNoDisponible(fuente, `${que} ilegible`);
};

@Injectable()
export class CertificacionesCliente extends FuenteCertificaciones {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores) {
    super();
  }

  async avance(auth: Autenticacion, hduIds: readonly string[], timeoutMs: number): Promise<Map<string, AvanceHdu>> {
    const resultado = new Map<string, AvanceHdu>();
    const lotes = await Promise.all(
      trocear([...new Set(hduIds)], TAMANO_LOTE).map((lote) =>
        llamar<unknown>({
          fuente: 'CERTIFICACIONES',
          url: this.configuracion.certificacionesUrl,
          ruta: '/v1/interno/checklist/estados',
          metodo: 'POST',
          auth,
          cuerpo: { hduIds: lote },
          timeoutMs,
          reintentos: auth.tipo === 'servicio' ? 1 : 0,
        }),
      ),
    );
    for (const cuerpo of lotes) {
      const items = objeto(cuerpo, 'CERTIFICACIONES', 'el avance').items;
      if (!Array.isArray(items)) throw new FuenteNoDisponible('CERTIFICACIONES', 'el avance ilegible');
      for (const item of items) {
        const d = objeto(item, 'CERTIFICACIONES', 'un avance');
        if (typeof d.hduId !== 'string' || typeof d.aprobados !== 'number') throw new FuenteNoDisponible('CERTIFICACIONES', 'un avance ilegible');
        resultado.set(d.hduId, { hduId: d.hduId, aprobados: d.aprobados, certificado: d.certificado !== null && d.certificado !== undefined });
      }
    }
    return resultado;
  }
}

function leerEvaluacion(valor: unknown): EvaluacionHdu {
  const d = objeto(valor, 'IMPEDIMENTOS', 'una evaluación');
  const riesgo = objeto(d.riesgo, 'IMPEDIMENTOS', 'el riesgo');
  if (typeof d.hduId !== 'string' || typeof d.abiertos !== 'number' || typeof d.escalados !== 'number') throw new FuenteNoDisponible('IMPEDIMENTOS', 'una evaluación ilegible');
  return {
    hduId: d.hduId,
    bloqueada: d.bloqueada === true,
    abiertos: d.abiertos,
    escalados: d.escalados,
    riesgo: {
      nivelVigente: (riesgo.nivelVigente ?? null) as NivelRiesgo | null,
      origen: (riesgo.origen ?? null) as 'MANUAL' | 'SUGERIDO' | null,
      estado: riesgo.estado === 'indisponible' ? 'indisponible' : 'ok',
      calculoParcial: riesgo.calculoParcial === true,
    },
  };
}

function leerImpedimento(valor: unknown): ImpedimentoBloqueante {
  const d = objeto(valor, 'IMPEDIMENTOS', 'un impedimento');
  if (typeof d.id !== 'string' || typeof d.hduId !== 'string' || (d.estado !== 'ABIERTO' && d.estado !== 'ESCALADO')) throw new FuenteNoDisponible('IMPEDIMENTOS', 'un impedimento ilegible');
  return { id: d.id, hduId: d.hduId, titulo: String(d.titulo ?? ''), tipo: String(d.tipo ?? ''), estado: d.estado, diasAbierto: typeof d.diasAbierto === 'number' ? d.diasAbierto : 0 };
}

@Injectable()
export class ImpedimentosCliente extends FuenteImpedimentos {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores) {
    super();
  }

  async evaluar(auth: Autenticacion, hdu: readonly HduParaEvaluar[], incluirImpedimentos: boolean, timeoutMs: number): Promise<ResultadoEvaluacion> {
    const evaluaciones = new Map<string, EvaluacionHdu>();
    const impedimentos: ImpedimentoBloqueante[] = [];
    const lotes = await Promise.all(
      trocear(hdu, TAMANO_LOTE).map((lote) =>
        llamar<unknown>({
          fuente: 'IMPEDIMENTOS',
          url: this.configuracion.impedimentosUrl,
          ruta: '/v1/interno/impedimentos/evaluacion',
          metodo: 'POST',
          auth,
          cuerpo: { hdu: lote, incluirImpedimentos },
          timeoutMs,
          reintentos: auth.tipo === 'servicio' ? 1 : 0,
        }),
      ),
    );
    for (const cuerpo of lotes) {
      const datos = objeto(cuerpo, 'IMPEDIMENTOS', 'la evaluación');
      if (!Array.isArray(datos.items)) throw new FuenteNoDisponible('IMPEDIMENTOS', 'la evaluación ilegible');
      for (const item of datos.items) {
        const evaluacion = leerEvaluacion(item);
        evaluaciones.set(evaluacion.hduId, evaluacion);
      }
      if (Array.isArray(datos.impedimentos)) for (const item of datos.impedimentos) impedimentos.push(leerImpedimento(item));
    }
    return { evaluaciones, impedimentos };
  }
}
