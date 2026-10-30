/**
 * Errores de negocio cuyo cuerpo HTTP lleva campos además de los del error
 * común (`ErrorTransicionInvalida`, `ErrorCierreRechazado`,
 * `ErrorRelacionesIncompatibles` de comun.v1.yaml). `FiltroErroresQ360`
 * (packages/auth-nest) no los soporta —solo emite `{codigo,mensaje,traceId,
 * detalles}`—, así que estos NO son `ExcepcionQ360`: el controlador los
 * atrapa y arma la respuesta extendida él mismo (ver api/errores).
 */
import type { RelacionesUsuario } from '../dominio/reglas/rol-celulas.js';
import type { EstadoHdu } from '../dominio/tipos.js';

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

/** 409 `HDU_BLOQUEADA` al pedir `CERRADA` con impedimentos abiertos o escalados (D60, D77). */
export class ErrorHduBloqueada extends Error {
  constructor(
    readonly total: number,
    readonly items: ReadonlyArray<{ id: string; titulo: string; tipo: string; estado: 'ABIERTO' | 'ESCALADO'; diasAbierto: number }>,
  ) {
    super('No se puede cerrar la HDU: tiene impedimentos abiertos o escalados.');
    this.name = 'ErrorHduBloqueada';
  }
}

/** 503 al pedir `CERRADA` cuando Impedimentos no responde (D60): no se puede verificar, no se cierra. */
export class ErrorImpedimentosNoVerificables extends Error {
  constructor() {
    super('No pudimos verificar los impedimentos de la HDU');
    this.name = 'ErrorImpedimentosNoVerificables';
  }
}

export type RelacionesIncompatibles = RelacionesUsuario;

const lista = (nombres: readonly string[]): string => nombres.join(', ');

/**
 * Mensaje del 409 `RELACIONES_INCOMPATIBLES` (D43): nombra a quiénes reasignar y qué
 * HDU o células resolver. Los mismos datos viajan estructurados en `relaciones`.
 */
export function mensajeRelacionesIncompatibles(relaciones: RelacionesIncompatibles): string {
  const partes: string[] = [];
  if (relaciones.analistasVigentes.length > 0) {
    partes.push(`reasigna primero a sus analistas supervisados: ${lista(relaciones.analistasVigentes.map((analista) => analista.nombre))}`);
  }
  if (relaciones.supervisorVigente !== null) {
    partes.push(`quítale primero el supervisor vigente (${relaciones.supervisorVigente.nombre})`);
  }
  if (relaciones.hduAbiertas.total > 0) {
    const codigos = relaciones.hduAbiertas.items.map((hdu) => hdu.codigo);
    const resto = relaciones.hduAbiertas.total - codigos.length;
    partes.push(
      `tiene ${relaciones.hduAbiertas.total} HDU abiertas (${lista(codigos)}${resto > 0 ? ` y ${resto} más` : ''}): ciérralas o reasígnalas`,
    );
  }
  if (relaciones.celulasVigentes.length > 0) {
    partes.push(`quítale primero las células a su cargo: ${lista(relaciones.celulasVigentes.map((celula) => celula.nombre))}`);
  }
  return partes.length === 0
    ? 'Resuelve las relaciones de supervisión antes de continuar.'
    : `Resuelve las relaciones abiertas antes de continuar: ${partes.join('; ')}.`;
}

export class ErrorRelacionesIncompatibles extends Error {
  constructor(readonly relaciones: RelacionesIncompatibles) {
    super(mensajeRelacionesIncompatibles(relaciones));
    this.name = 'ErrorRelacionesIncompatibles';
  }
}
