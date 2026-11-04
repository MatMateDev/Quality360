/**
 * Errores de la consulta de Jira (D134-D148). La capa `api` los traduce al formato común de `comun.v1.yaml`
 * (`ErrorConsulta`, `ErrorConsultaAbierta`, `ErrorAsignacionesInvalidas`). Ninguno lleva textos de Jira.
 */
import type { MotivoRechazo } from './asignacion.js';
import type { CampoAsignacion, Consulta, Persona } from './tipos.js';

export type CodigoErrorConsulta = 'CONSULTA_NO_ABIERTA' | 'CONSULTA_VENCIDA' | 'CONSULTA_MODIFICADA' | 'CONSULTA_LLENA' | 'CONSULTA_COMPLETA';

/** Error de estado de la consulta: 409 (410 si venció). Trae el estado, la versión actual y quién la cerró (`ErrorConsulta`). */
export class ErrorDeConsulta extends Error {
  constructor(
    readonly codigo: CodigoErrorConsulta,
    readonly consulta: Pick<Consulta, 'id' | 'estado' | 'version' | 'cerradaPor'>,
  ) {
    super(codigo);
  }
}

/** Id de consulta inexistente, o `itemId` de otra consulta (404, solo Administrador, D142). */
export class ConsultaNoEncontrada extends Error {
  constructor() {
    super('CONSULTA_NO_ENCONTRADA');
  }
}

/** Ya hay una consulta abierta y vigente y no se pidió reemplazar (409, `ErrorConsultaAbierta`). */
export class ConsultaAbierta extends Error {
  constructor(
    readonly consultaId: string,
    readonly creadaPor: Persona,
    readonly creadaEn: Date,
    readonly asignadas: number,
  ) {
    super('CONSULTA_ABIERTA');
  }
}

/** Otra consulta se abrió mientras esta tanda leía de Jira (índice único parcial): se informa como `CONSULTA_ABIERTA`. */
export class ConsultaAbiertaDuplicada extends Error {
  constructor() {
    super('CONSULTA_ABIERTA');
  }
}

/** Ninguna fila marcada sin aplicar (422 `SIN_SELECCION`). */
export class SinSeleccion extends Error {
  constructor() {
    super('SIN_SELECCION');
  }
}

export interface FilaRechazadaDto {
  readonly itemId: string;
  readonly codigo: string | null;
  readonly campo: CampoAsignacion | null;
  readonly motivo: MotivoRechazo;
  readonly faltantes?: CampoAsignacion[];
}

/** Las asignaciones marcadas dejaron de ser válidas (409 `ASIGNACIONES_INVALIDAS`, nada se escribió). */
export class AsignacionesInvalidas extends Error {
  constructor(
    readonly filas: FilaRechazadaDto[],
    readonly version: number,
  ) {
    super('ASIGNACIONES_INVALIDAS');
  }
}

/** Alcance de una sola fila rechazado: 422 con el código del motivo (D145). */
export class FilaRechazadaUnica extends Error {
  constructor(readonly fila: FilaRechazadaDto) {
    super(fila.motivo);
  }
}
