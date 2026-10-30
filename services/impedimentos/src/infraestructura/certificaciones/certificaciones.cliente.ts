/**
 * Consulta a Certificaciones (`POST /v1/interno/checklist/estados`) con el token del usuario
 * propagado y 2 s de tiempo límite (D86). Implementa el puerto `ProveedorSeguimiento`. Si no
 * responde, lanza `FuenteNoDisponible`: quien llama decide (nunca se informa `BAJO` por una
 * fuente caída, D68).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA } from '@quality360/auth-nest';

import { ProveedorSeguimiento, type ContextoSolicitud, type SeguimientoMinimo } from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionImpedimentos } from '../../configuracion.js';
import { FuenteNoDisponible } from '../../dominio/errores.js';

@Injectable()
export class CertificacionesCliente extends ProveedorSeguimiento {
  private readonly registro = new Logger(CertificacionesCliente.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionImpedimentos) {
    super();
  }

  async estados(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<Map<string, SeguimientoMinimo>> {
    const resultado = new Map<string, SeguimientoMinimo>();
    for (let desde = 0; desde < hduIds.length; desde += 1000) {
      const lote = hduIds.slice(desde, desde + 1000);
      const cuerpo = await this.pedir(lote, contexto);
      const items = (cuerpo as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) throw new FuenteNoDisponible('certificaciones', 'respuesta ilegible');
      for (const item of items as Array<Record<string, unknown>>) {
        if (typeof item.hduId !== 'string' || typeof item.porcentaje !== 'number') {
          throw new FuenteNoDisponible('certificaciones', 'seguimiento ilegible');
        }
        resultado.set(item.hduId, {
          hduId: item.hduId,
          certificacionId: typeof item.certificacionId === 'string' ? item.certificacionId : null,
          porcentaje: item.porcentaje,
        });
      }
    }
    return resultado;
  }

  private async pedir(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<unknown> {
    const url = new URL('/v1/interno/checklist/estados', this.configuracion.certificacionesUrl);
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${contexto.token}`,
          accept: 'application/json',
          'content-type': 'application/json',
          [CABECERA_TRAZA]: contexto.traceId,
        },
        body: JSON.stringify({ hduIds }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.configuracion.tiempoLimiteCertificacionesMs),
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.warn(`Certificaciones no respondió · traceId=${contexto.traceId} · ${detalle}`);
      throw new FuenteNoDisponible('certificaciones', detalle);
    }
    if (!respuesta.ok) {
      this.registro.warn(`Certificaciones respondió ${respuesta.status} · traceId=${contexto.traceId}`);
      throw new FuenteNoDisponible('certificaciones', `HTTP ${respuesta.status}`);
    }
    try {
      return await respuesta.json();
    } catch {
      throw new FuenteNoDisponible('certificaciones', 'cuerpo ilegible');
    }
  }
}
