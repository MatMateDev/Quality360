import type { FiltroAmbitoHdu } from '../reglas/ambito.js';
import type {
  Actor,
  ConteoPorEstado,
  EstadoHdu,
  EventoHistorialHdu,
  Hdu,
  OpcionesPaginacion,
  Pagina,
  PrioridadHdu,
} from '../tipos.js';

export interface DatosNuevaHdu {
  readonly codigo: string;
  readonly titulo: string;
  readonly celulaId: string;
  readonly sprintId: string;
  readonly prioridad: PrioridadHdu;
  readonly qeResponsableId: string;
}

export interface FiltroHdu {
  readonly celulaId?: string;
  readonly sprintId?: string;
  readonly estado?: EstadoHdu;
}

export interface ResumenHduAmbito {
  readonly total: number;
  readonly porEstado: ConteoPorEstado;
}

export interface ResultadoAsignacionAnalista {
  readonly cambio: boolean;
  readonly hdu: Hdu;
  readonly analistaAnteriorId: string | null;
  readonly fecha: Date;
}

export interface ResultadoCambioEstado {
  readonly hdu: Hdu;
  readonly estadoAnterior: EstadoHdu;
  readonly fecha: Date;
}

/** Token de inyección del repositorio de HDU. */
export const HDU_REPOSITORIO = Symbol('HDU_REPOSITORIO');

export interface HduRepositorio {
  /** Crea la HDU en `PENDIENTE` y audita `CREAR_HDU` en la misma transacción. */
  crear(datos: DatosNuevaHdu, actor: Actor): Promise<Hdu>;
  buscarPorId(id: string): Promise<Hdu | null>;
  buscarPorCodigoNormalizado(codigoNormalizado: string): Promise<Hdu | null>;
  listarPorAmbito(ambito: FiltroAmbitoHdu, filtro: FiltroHdu, paginacion: OpcionesPaginacion): Promise<Pagina<Hdu>>;

  /** Reasigna el analista, audita y registra el historial en la misma transacción. */
  asignarAnalista(input: {
    hduId: string;
    analistaId: string;
    motivo: string | null;
    actor: Actor;
  }): Promise<ResultadoAsignacionAnalista>;

  /** Cambia el estado, audita y registra el historial en la misma transacción. */
  cambiarEstado(input: { hduId: string; estadoNuevo: EstadoHdu; actor: Actor }): Promise<ResultadoCambioEstado>;

  historial(hduId: string): Promise<EventoHistorialHdu[]>;

  /** HDU en el ámbito del QE (responsable o de sus analistas), por estado. */
  resumenAmbitoQe(qeResponsableId: string, analistasSupervisadosIds: readonly string[]): Promise<ResumenHduAmbito>;
  /** HDU asignadas a un analista, por estado. */
  resumenPorAnalista(analistaId: string): Promise<ResumenHduAmbito>;
}
