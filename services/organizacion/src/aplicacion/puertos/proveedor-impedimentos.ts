/**
 * Puerto hacia Impedimentos (D60, D69, D86, D87):
 * - cierre de una HDU: `GET /v1/interno/hdu/{id}/impedimentos/abiertos`;
 * - bandejas: `POST /v1/interno/impedimentos/evaluacion`, en lotes de hasta 1000 HDU.
 * Propaga el token del usuario y `x-trace-id` con 2 s de tiempo límite. Si no responde, el resultado
 * es `disponible: false`: el cierre se rechaza con 503 y solo los bloques de impedimentos de las
 * bandejas vienen `indisponible` (una falla nunca se convierte en 0 ni en una lista vacía).
 */
import type { EstadoHdu } from '../../dominio/tipos.js';

export const PROVEEDOR_IMPEDIMENTOS = Symbol('PROVEEDOR_IMPEDIMENTOS');

export type NivelRiesgoBandeja = 'BAJO' | 'MEDIO' | 'ALTO';

export interface ImpedimentoBloqueante {
  readonly id: string;
  readonly titulo: string;
  readonly tipo: string;
  readonly estado: 'ABIERTO' | 'ESCALADO';
  readonly diasAbierto: number;
}

export type ResultadoAbiertos =
  | { readonly disponible: true; readonly total: number; readonly items: ImpedimentoBloqueante[] }
  | { readonly disponible: false };

export interface HduParaEvaluar {
  readonly hduId: string;
  readonly estado: EstadoHdu;
  /** `AAAA-MM-DD` o `null` si la HDU no tiene sprint vigente. */
  readonly sprintFin: string | null;
  /** `SeguimientoHdu.porcentaje`, o `null` si Certificaciones no respondió. */
  readonly avance: number | null;
}

export interface RiesgoResumen {
  readonly nivelVigente: NivelRiesgoBandeja | null;
  readonly origen: 'MANUAL' | 'SUGERIDO' | null;
  readonly estado: 'ok' | 'indisponible';
  readonly calculoParcial: boolean;
}

export interface EvaluacionHduImpedimentos {
  readonly hduId: string;
  readonly bloqueada: boolean;
  readonly abiertos: number;
  readonly escalados: number;
  readonly nuevos: number;
  readonly riesgo: RiesgoResumen;
  readonly nivelFijado: NivelRiesgoBandeja | null;
  readonly nivelSugerido: NivelRiesgoBandeja | null;
}

/** Impedimento `ABIERTO` o `ESCALADO` que devuelve la evaluación con `incluirImpedimentos`. */
export interface ImpedimentoDeLote {
  readonly id: string;
  readonly hduId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly estado: 'ABIERTO' | 'ESCALADO';
  readonly responsable: { id: string | null; nombre: string; externo: boolean };
  readonly creadoPor: { id: string; nombre: string; rol: string };
  readonly fechaRegistro: string;
  readonly abiertoDesde: string;
  readonly diasAbierto: number;
  readonly esNuevo: boolean;
}

export type ResultadoEvaluacion =
  | {
      readonly disponible: true;
      readonly porHdu: Map<string, EvaluacionHduImpedimentos>;
      readonly impedimentos: ImpedimentoDeLote[];
    }
  | { readonly disponible: false };

export interface ProveedorImpedimentos {
  abiertos(hduId: string, token: string, traceId: string): Promise<ResultadoAbiertos>;
  evaluar(hdu: readonly HduParaEvaluar[], incluirImpedimentos: boolean, token: string, traceId: string): Promise<ResultadoEvaluacion>;
}
