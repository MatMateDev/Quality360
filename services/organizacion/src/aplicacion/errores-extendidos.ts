/**
 * Errores de negocio cuyo cuerpo HTTP lleva campos además de los del error
 * común (`ErrorTransicionInvalida`, `ErrorCierreRechazado`,
 * `ErrorRelacionesIncompatibles` de comun.v1.yaml). `FiltroErroresQ360`
 * (packages/auth-nest) no los soporta —solo emite `{codigo,mensaje,traceId,
 * detalles}`—, así que estos NO son `ExcepcionQ360`: el controlador los
 * atrapa y arma la respuesta extendida él mismo (ver api/errores).
 */
import type { EstadoHdu, UsuarioResumen } from '../dominio/tipos.js';

export class ErrorTransicionInvalidaHdu extends Error {
  constructor(
    readonly estadoActual: EstadoHdu,
    readonly estadoSolicitado: EstadoHdu,
    readonly transicionesPermitidas: EstadoHdu[],
  ) {
    super('La HDU no puede pasar a ese estado.');
    this.name = 'ErrorTransicionInvalidaHdu';
  }
}

export interface DatosChecklist {
  readonly hduId: string;
  readonly totalEntregables: number;
  readonly completados: number;
  readonly porcentajeCumplimiento: number;
  readonly completo: boolean;
}

export type BloqueChecklist =
  | { fuente: 'certificaciones.checklist'; estado: 'ok'; datos: DatosChecklist }
  | { fuente: 'certificaciones.checklist'; estado: 'indisponible' };

export class ErrorCierreRechazadoHdu extends Error {
  constructor(
    readonly codigo: 'CHECKLIST_INCOMPLETO' | 'CHECKLIST_NO_DISPONIBLE',
    readonly checklist: BloqueChecklist,
  ) {
    super(
      codigo === 'CHECKLIST_INCOMPLETO'
        ? 'No se puede cerrar la HDU: el checklist de entregables está incompleto.'
        : 'No se puede cerrar la HDU: el checklist de entregables no está disponible para verificarse.',
    );
    this.name = 'ErrorCierreRechazadoHdu';
  }
}

export interface RelacionesIncompatibles {
  readonly analistasVigentes: UsuarioResumen[];
  readonly supervisorVigente: UsuarioResumen | null;
}

export class ErrorRelacionesIncompatibles extends Error {
  constructor(readonly relaciones: RelacionesIncompatibles) {
    super('Resuelve las relaciones de supervisión antes de continuar.');
    this.name = 'ErrorRelacionesIncompatibles';
  }
}
