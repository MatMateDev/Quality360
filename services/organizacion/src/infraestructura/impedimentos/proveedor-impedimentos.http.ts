/**
 * Llama a Impedimentos (`/v1/interno/*`) propagando `Authorization` y `x-trace-id`, con tiempo límite
 * (`IMPEDIMENTOS_TIMEOUT_MS`, 2 s). Cualquier respuesta que no sea 200 o cualquier fallo de red se
 * traduce en `disponible: false` (D34, D60, D87).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';
import type {
  EvaluacionHduImpedimentos,
  HduParaEvaluar,
  ImpedimentoBloqueante,
  ImpedimentoDeLote,
  ProveedorImpedimentos,
  ResultadoAbiertos,
  ResultadoEvaluacion,
} from '../../aplicacion/puertos/proveedor-impedimentos.js';

const LOTE_MAXIMO = 1000;

@Injectable()
export class ProveedorImpedimentosHttp implements ProveedorImpedimentos {
  private readonly registro = new Logger(ProveedorImpedimentosHttp.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion) {}

  async abiertos(hduId: string, token: string, traceId: string): Promise<ResultadoAbiertos> {
    const cuerpo = (await this.pedir('GET', `/v1/interno/hdu/${hduId}/impedimentos/abiertos`, token, traceId)) as
      | { total?: unknown; items?: unknown }
      | null;
    if (cuerpo === null || typeof cuerpo.total !== 'number' || !Array.isArray(cuerpo.items)) return { disponible: false };
    return { disponible: true, total: cuerpo.total, items: cuerpo.items as ImpedimentoBloqueante[] };
  }

  async evaluar(hdu: readonly HduParaEvaluar[], incluirImpedimentos: boolean, token: string, traceId: string): Promise<ResultadoEvaluacion> {
    const porHdu = new Map<string, EvaluacionHduImpedimentos>();
    const impedimentos: ImpedimentoDeLote[] = [];
    for (let desde = 0; desde < hdu.length; desde += LOTE_MAXIMO) {
      const lote = hdu.slice(desde, desde + LOTE_MAXIMO);
      const cuerpo = (await this.pedir('POST', '/v1/interno/impedimentos/evaluacion', token, traceId, { hdu: lote, incluirImpedimentos })) as
        | { items?: unknown; impedimentos?: unknown }
        | null;
      if (cuerpo === null || !Array.isArray(cuerpo.items) || !Array.isArray(cuerpo.impedimentos)) return { disponible: false };
      for (const item of cuerpo.items as EvaluacionHduImpedimentos[]) porHdu.set(item.hduId, item);
      impedimentos.push(...(cuerpo.impedimentos as ImpedimentoDeLote[]));
    }
    if (hdu.some((h) => !porHdu.has(h.hduId))) {
      this.registro.warn(`Impedimentos omitió HDU en la evaluación · traceId=${traceId}`);
      return { disponible: false };
    }
    return { disponible: true, porHdu, impedimentos };
  }

  /** Devuelve el JSON de una respuesta 200, o `null` si no respondió bien. Nunca lanza. */
  private async pedir(metodo: 'GET' | 'POST', ruta: string, token: string, traceId: string, cuerpo?: unknown): Promise<unknown | null> {
    try {
      const respuesta = await fetch(`${this.configuracion.impedimentosUrl}${ruta}`, {
        method: metodo,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          [CABECERA_TRAZA]: traceId,
          ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        redirect: 'error',
        signal: AbortSignal.timeout(this.configuracion.impedimentosTimeoutMs),
      });
      if (!respuesta.ok) {
        this.registro.warn(`Impedimentos respondió ${respuesta.status} en ${ruta} · traceId=${traceId}`);
        return null;
      }
      return (await respuesta.json()) as unknown;
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.warn(`Impedimentos no respondió ${ruta} · traceId=${traceId} · ${detalle}`);
      return null;
    }
  }
}
