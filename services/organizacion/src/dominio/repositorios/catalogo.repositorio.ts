import type { Celula, Sprint } from '../tipos.js';

/** Token de inyección del repositorio de catálogos. */
export const CATALOGO_REPOSITORIO = Symbol('CATALOGO_REPOSITORIO');

export interface CatalogoRepositorio {
  listarCelulas(): Promise<Celula[]>;
  listarSprints(): Promise<Sprint[]>;
  buscarCelula(id: string): Promise<Celula | null>;
  buscarSprint(id: string): Promise<Sprint | null>;

  /** Alta idempotente por nombre (sin distinguir mayúsculas) — carga semilla. */
  crearCelulaSiNoExiste(nombre: string): Promise<{ creado: boolean; celula: Celula }>;
  /** Alta idempotente por nombre (sin distinguir mayúsculas) — carga semilla. */
  crearSprintSiNoExiste(nombre: string, inicio: Date, fin: Date): Promise<{ creado: boolean; sprint: Sprint }>;
}
