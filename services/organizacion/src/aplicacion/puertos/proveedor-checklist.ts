/**
 * Puerto hacia `GET /v1/hdu/{id}/checklist` de Certificaciones (D11). Si no
 * responde, o responde `CAPACIDAD_NO_DISPONIBLE` (501, esta corrida siempre),
 * el resultado es `disponible: false` y el cierre se rechaza.
 */
import type { DatosChecklist } from '../errores-extendidos.js';

export const PROVEEDOR_CHECKLIST = Symbol('PROVEEDOR_CHECKLIST');

export type ResultadoConsultaChecklist = { disponible: true; datos: DatosChecklist } | { disponible: false };

export interface ProveedorChecklist {
  consultar(hduId: string, token: string, traceId: string): Promise<ResultadoConsultaChecklist>;
}
