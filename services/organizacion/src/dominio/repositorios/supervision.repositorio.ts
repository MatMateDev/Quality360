import type { Actor, SupervisionConUsuarios, UsuarioResumen } from '../tipos.js';

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
  /** QE vigente de cada analista dado, para enriquecer listados (`Usuario.supervisorVigente`). */
  mapaQeVigentePorAnalistas(analistaIds: readonly string[]): Promise<Map<string, UsuarioResumen>>;
  /** Cantidad de analistas vigentes de cada QE dado, para `Usuario.analistasVigentes`. */
  mapaConteoAnalistasPorQe(qeIds: readonly string[]): Promise<Map<string, number>>;

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
