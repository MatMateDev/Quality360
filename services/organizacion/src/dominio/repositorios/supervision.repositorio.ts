import type { Actor, SupervisionConUsuarios } from '../tipos.js';

export interface ResultadoCambioSupervision {
  readonly cambio: boolean;
  readonly vigente: SupervisionConUsuarios;
  readonly anterior: SupervisionConUsuarios | null;
}

export interface ResumenSupervisionAdmin {
  readonly relacionesVigentes: number;
  readonly analistasSinSupervisor: number;
  readonly qeSinAnalistas: number;
}

/** Token de inyección del repositorio de supervisión. */
export const SUPERVISION_REPOSITORIO = Symbol('SUPERVISION_REPOSITORIO');

export interface SupervisionRepositorio {
  buscarQeVigente(analistaId: string): Promise<string | null>;
  listarAnalistasVigentesIds(qeId: string): Promise<string[]>;
  /** Equipo vigente del QE, con los datos del analista y desde cuándo lo supervisa. */
  listarEquipoVigente(qeId: string): Promise<Array<{ analista: { id: string; nombre: string; correo: string; activo: boolean }; desde: Date }>>;
  listarHistorialPorAnalista(analistaId: string): Promise<SupervisionConUsuarios[]>;

  /**
   * Cierra la relación vigente del analista (si existe) y crea la nueva, en
   * una transacción respaldada por el índice único parcial. Audita
   * `ASIGNAR_SUPERVISOR` (primera vez) o `CAMBIAR_SUPERVISOR` (reemplazo).
   */
  cerrarYCrearVigente(input: {
    analistaId: string;
    qeId: string;
    motivo: string | null;
    actor: Actor;
  }): Promise<ResultadoCambioSupervision>;

  resumenAdmin(): Promise<ResumenSupervisionAdmin>;
}
