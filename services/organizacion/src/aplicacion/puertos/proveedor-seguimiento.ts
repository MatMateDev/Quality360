/**
 * Puerto hacia Certificaciones para componer las bandejas (D46): estado del
 * checklist en lote y contadores globales del Auditor. Si Certificaciones no
 * responde, el resultado es `disponible: false` y quien llama marca los bloques
 * como `indisponible`: una falla nunca se convierte en 0 ni en una lista vacía (D34).
 */
import type { SeguimientoHdu } from '../../dominio/reglas/bandejas.js';

export const PROVEEDOR_SEGUIMIENTO = Symbol('PROVEEDOR_SEGUIMIENTO');

export type ResultadoSeguimiento = { readonly disponible: true; readonly mapa: Map<string, SeguimientoHdu> } | { readonly disponible: false };

export type ResultadoResumenAuditoria =
  | { readonly disponible: true; readonly certificados: number; readonly eventosUltimos7Dias: number }
  | { readonly disponible: false };

export interface ProveedorSeguimiento {
  /** `POST /v1/interno/checklist/estados`, en lotes de hasta 1000 ids, con el token del usuario propagado. */
  seguimiento(hduIds: readonly string[], token: string, traceId: string): Promise<ResultadoSeguimiento>;
  /** `GET /v1/interno/resumen-auditoria` (solo Auditor). */
  resumenAuditoria(token: string, traceId: string): Promise<ResultadoResumenAuditoria>;
}
