import type { Actor, AsignacionCelulaLider, CatalogoRef, UsuarioResumen } from '../tipos.js';

/** Token de inyección del repositorio de células de líder (`celula_lider`, D30). */
export const CELULA_LIDER_REPOSITORIO = Symbol('CELULA_LIDER_REPOSITORIO');

export type ResultadoReemplazoCelulas =
  | { readonly tipo: 'ROL_INCOMPATIBLE' }
  | {
      readonly tipo: 'OK';
      /** `false` si el conjunto pedido ya era el vigente: no se audita. */
      readonly cambio: boolean;
      readonly antes: CatalogoRef[];
      readonly despues: CatalogoRef[];
    };

export interface CelulaLiderRepositorio {
  /** Asignaciones vigentes, ordenadas por nombre de célula. */
  listarVigentes(usuarioId: string): Promise<AsignacionCelulaLider[]>;
  /** Todas, vigentes y terminadas, de la más reciente a la más antigua por `desde`. */
  listarHistorial(usuarioId: string): Promise<AsignacionCelulaLider[]>;
  /** Células vigentes de cada usuario dado, ordenadas por nombre (para `Usuario.celulasVigentes`). */
  mapaCelulasVigentes(usuarioIds: readonly string[]): Promise<Map<string, CatalogoRef[]>>;

  /**
   * Fija el conjunto vigente en una transacción con bloqueo de la fila del
   * usuario: cierra las que sobran con `fecha_hasta = now()`, abre las nuevas y
   * audita `ASIGNAR_CELULAS_LIDER` solo si hubo diferencias (D30, E7-B01).
   * Responde `ROL_INCOMPATIBLE` si el usuario no es Líder QA.
   */
  reemplazar(input: { usuarioId: string; celulaIds: readonly string[]; actor: Actor }): Promise<ResultadoReemplazoCelulas>;

  /** Líderes activos sin células vigentes (pendientes del Administrador, D51). */
  lideresActivosSinCelulas(): Promise<UsuarioResumen[]>;
  /** Células activas sin ningún líder vigente (D51). */
  celulasActivasSinLider(): Promise<CatalogoRef[]>;
}
