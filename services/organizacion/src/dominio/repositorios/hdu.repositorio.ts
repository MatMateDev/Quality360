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

export interface ResultadoReasignacionQe {
  readonly cambio: boolean;
  readonly hdu: Hdu;
  readonly qeAnteriorId: string;
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
  /** Las HDU que existen entre `ids` (sin orden garantizado). */
  buscarPorIds(ids: readonly string[]): Promise<Hdu[]>;
  /** Todas las HDU del ámbito, sin paginar (las bandejas filtran, ordenan y paginan en memoria). */
  listarTodasPorAmbito(ambito: FiltroAmbitoHdu): Promise<Hdu[]>;
  /** Ids de las HDU del ámbito (`GET /v1/interno/hdu/ambito`, D47). */
  listarIdsPorAmbito(ambito: FiltroAmbitoHdu): Promise<string[]>;
  contarTodas(): Promise<number>;
  /** Fecha del último cambio de analista o de QE responsable de cada HDU que lo tuvo. */
  ultimosCambiosAsignacion(hduIds: readonly string[]): Promise<Map<string, Date>>;
  listarPorAmbito(ambito: FiltroAmbitoHdu, filtro: FiltroHdu, paginacion: OpcionesPaginacion): Promise<Pagina<Hdu>>;

  /** Reasigna el analista, audita y registra el historial en la misma transacción. */
  asignarAnalista(input: {
    hduId: string;
    analistaId: string;
    motivo: string | null;
    actor: Actor;
  }): Promise<ResultadoAsignacionAnalista>;

  /**
   * Reasigna el QE responsable, registra el historial y audita
   * `REASIGNAR_QE_RESPONSABLE` en la misma transacción (D54). Sin cambio si es el mismo.
   */
  reasignarQeResponsable(input: { hduId: string; qeNuevoId: string; motivo: string; actor: Actor }): Promise<ResultadoReasignacionQe>;

  /** Cambia el estado, audita y registra el historial en la misma transacción. */
  cambiarEstado(input: { hduId: string; estadoNuevo: EstadoHdu; actor: Actor }): Promise<ResultadoCambioEstado>;

  /**
   * Fija el sprint vigente (`historia_sprint`): cierra la fila vigente y abre una nueva; el mismo sprint
   * no cambia nada. Solo para la semilla E4 (D88): no audita ni toca el historial de la HDU.
   */
  fijarSprintVigente(hduId: string, sprintId: string): Promise<{ cambio: boolean }>;

  historial(hduId: string): Promise<EventoHistorialHdu[]>;

  /** HDU en el ámbito del QE (responsable o de sus analistas), por estado. */
  resumenAmbitoQe(qeResponsableId: string, analistasSupervisadosIds: readonly string[]): Promise<ResumenHduAmbito>;
  /** HDU asignadas a un analista, por estado. */
  resumenPorAnalista(analistaId: string): Promise<ResumenHduAmbito>;
}
