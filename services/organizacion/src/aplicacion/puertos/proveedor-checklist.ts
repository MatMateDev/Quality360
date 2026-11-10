/**
 * Puerto hacia `GET /v1/hdu/{id}/checklist` de Certificaciones (D11). Si no
 * responde, o responde `CAPACIDAD_NO_DISPONIBLE` (501, esta corrida siempre),
 * el resultado es `disponible: false` y el cierre se rechaza.
 *
 * E6 (D175): `pendientes` consulta `GET /v1/hdu/{id}/entregables` para saber qué claves
 * quedaron sin aprobar al cerrar con excepción. Solo se llama en ese camino.
 */
import type { DatosChecklist } from '../errores-extendidos.js';

export const PROVEEDOR_CHECKLIST = Symbol('PROVEEDOR_CHECKLIST');

export type ResultadoConsultaChecklist = { disponible: true; datos: DatosChecklist } | { disponible: false };

export type ResultadoPendientesChecklist = { disponible: true; aprobados: number; pendientes: string[] } | { disponible: false };

export interface ProveedorChecklist {
  consultar(hduId: string, token: string, traceId: string): Promise<ResultadoConsultaChecklist>;
  /** Claves de los entregables no aprobados, en el orden de D15. */
  pendientes(hduId: string, token: string, traceId: string): Promise<ResultadoPendientesChecklist>;
}
