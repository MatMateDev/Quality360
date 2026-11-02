import type { EstadoSprint } from '../reglas/sprint.js';
import type { Celula, Sprint } from '../tipos.js';

/** Token de inyección del repositorio de catálogos. */
export const CATALOGO_REPOSITORIO = Symbol('CATALOGO_REPOSITORIO');

export interface CatalogoRepositorio {
  listarCelulas(): Promise<Celula[]>;
  /** Con `celulaId`, solo los sprints de esa célula (E5, D120). */
  listarSprints(celulaId?: string): Promise<Sprint[]>;
  /** Sprint de la célula con ese nombre, sin distinguir mayúsculas (E5, D120). */
  buscarSprintDeCelulaPorNombre(celulaId: string, nombre: string): Promise<Sprint | null>;
  /** Célula por nombre, sin distinguir mayúsculas (E5, archivos). */
  buscarCelulaPorNombre(nombre: string): Promise<Celula | null>;
  buscarCelula(id: string): Promise<Celula | null>;
  /** Las células que existen entre `ids`. */
  buscarCelulas(ids: readonly string[]): Promise<Celula[]>;
  buscarSprint(id: string): Promise<Sprint | null>;
  /** Célula dueña del sprint (`sprint.id_celula`), o `null` si el sprint no existe. */
  celulaDeSprint(id: string): Promise<string | null>;

  /** Alta idempotente por nombre (sin distinguir mayúsculas) — carga semilla. */
  crearCelulaSiNoExiste(nombre: string): Promise<{ creado: boolean; celula: Celula }>;
  /** Alta idempotente por nombre (sin distinguir mayúsculas) — carga semilla. */
  crearSprintSiNoExiste(datos: {
    nombre: string;
    inicio: Date;
    fin: Date;
    estado: EstadoSprint;
    celulaId: string;
  }): Promise<{ creado: boolean; sprint: Sprint }>;
}
