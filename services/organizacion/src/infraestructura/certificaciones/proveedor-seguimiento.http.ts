/**
 * Llama a `POST /v1/interno/checklist/estados` y `GET /v1/interno/resumen-auditoria`
 * de Certificaciones propagando `Authorization` y `x-trace-id`, con tiempo límite
 * (`CERTIFICACIONES_TIMEOUT_MS`, 2 s). Cualquier respuesta que no sea 200 o cualquier
 * fallo de red se traduce en `disponible: false` (D34, D46).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';
import type { SeguimientoHdu } from '../../dominio/reglas/bandejas.js';
import type {
  ProveedorSeguimiento,
  ResultadoResumenAuditoria,
  ResultadoSeguimiento,
} from '../../aplicacion/puertos/proveedor-seguimiento.js';

const LOTE_MAXIMO = 1000;

function esSeguimiento(valor: unknown): valor is SeguimientoHdu {
  if (typeof valor !== 'object' || valor === null) return false;
  const dato = valor as Record<string, unknown>;
  return (
    typeof dato.hduId === 'string' &&
    typeof dato.aprobados === 'number' &&
    typeof dato.porAprobar === 'number' &&
    typeof dato.observaciones === 'number' &&
    typeof dato.listaParaCertificar === 'boolean' &&
    typeof dato.listaParaCerrar === 'boolean'
  );
}

@Injectable()
export class ProveedorSeguimientoHttp implements ProveedorSeguimiento {
  private readonly registro = new Logger(ProveedorSeguimientoHttp.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion) {}

  async seguimiento(hduIds: readonly string[], token: string, traceId: string): Promise<ResultadoSeguimiento> {
    const mapa = new Map<string, SeguimientoHdu>();
    for (let desde = 0; desde < hduIds.length; desde += LOTE_MAXIMO) {
      const lote = hduIds.slice(desde, desde + LOTE_MAXIMO);
      const cuerpo = await this.pedir('POST', '/v1/interno/checklist/estados', token, traceId, { hduIds: lote });
      const items = (cuerpo as { items?: unknown } | null)?.items;
      if (!Array.isArray(items) || !items.every(esSeguimiento)) {
        this.registro.warn(`Certificaciones devolvió un seguimiento ilegible · traceId=${traceId}`);
        return { disponible: false };
      }
      for (const item of items) mapa.set(item.hduId, item);
    }
    if (hduIds.some((id) => !mapa.has(id))) {
      this.registro.warn(`Certificaciones omitió HDU en el seguimiento · traceId=${traceId}`);
      return { disponible: false };
    }
    return { disponible: true, mapa };
  }

  async resumenAuditoria(token: string, traceId: string): Promise<ResultadoResumenAuditoria> {
    const cuerpo = (await this.pedir('GET', '/v1/interno/resumen-auditoria', token, traceId)) as
      | { certificados?: unknown; eventosUltimos7Dias?: unknown }
      | null;
    if (cuerpo === null || typeof cuerpo.certificados !== 'number' || typeof cuerpo.eventosUltimos7Dias !== 'number') {
      return { disponible: false };
    }
    return { disponible: true, certificados: cuerpo.certificados, eventosUltimos7Dias: cuerpo.eventosUltimos7Dias };
  }

  /** Devuelve el JSON de una respuesta 200, o `null` si no respondió bien. Nunca lanza. */
  private async pedir(metodo: 'GET' | 'POST', ruta: string, token: string, traceId: string, cuerpo?: unknown): Promise<unknown | null> {
    try {
      const respuesta = await fetch(`${this.configuracion.certificacionesUrl}${ruta}`, {
        method: metodo,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          [CABECERA_TRAZA]: traceId,
          ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        redirect: 'error',
        signal: AbortSignal.timeout(this.configuracion.certificacionesTimeoutMs),
      });
      if (!respuesta.ok) {
        this.registro.warn(`Certificaciones respondió ${respuesta.status} en ${ruta} · traceId=${traceId}`);
        return null;
      }
      return (await respuesta.json()) as unknown;
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.warn(`Certificaciones no respondió ${ruta} · traceId=${traceId} · ${detalle}`);
      return null;
    }
  }
}
