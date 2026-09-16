/**
 * Llama a `GET /v1/hdu/{id}/checklist` de Certificaciones propagando
 * `Authorization` y `x-trace-id`, con tiempo límite (D11). Cualquier
 * respuesta que no sea `200` (incluido el `501 CAPACIDAD_NO_DISPONIBLE` de
 * esta corrida) o cualquier fallo de red se traduce en `disponible: false`.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../../configuracion.js';
import type { DatosChecklist } from '../../aplicacion/errores-extendidos.js';
import type { ProveedorChecklist, ResultadoConsultaChecklist } from '../../aplicacion/puertos/proveedor-checklist.js';

@Injectable()
export class ProveedorChecklistHttp implements ProveedorChecklist {
  private readonly registro = new Logger(ProveedorChecklistHttp.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion) {}

  async consultar(hduId: string, token: string, traceId: string): Promise<ResultadoConsultaChecklist> {
    const url = `${this.configuracion.certificacionesUrl}/v1/hdu/${hduId}/checklist`;
    try {
      const respuesta = await fetch(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json', [CABECERA_TRAZA]: traceId },
        redirect: 'error',
        signal: AbortSignal.timeout(this.configuracion.certificacionesTimeoutMs),
      });
      if (!respuesta.ok) {
        this.registro.warn(`Checklist no disponible (${respuesta.status}) · hdu=${hduId} · traceId=${traceId}`);
        return { disponible: false };
      }
      const datos = (await respuesta.json()) as DatosChecklist;
      return { disponible: true, datos };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.warn(`Certificaciones no respondió el checklist · hdu=${hduId} · traceId=${traceId} · ${detalle}`);
      return { disponible: false };
    }
  }
}
