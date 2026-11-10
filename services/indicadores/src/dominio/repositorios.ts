/**
 * Puertos de persistencia del servicio (E6). Son clases abstractas para que sirvan de token de inyección sin que el
 * dominio importe Nest ni Prisma; la implementación vive en `infraestructura/prisma`.
 */
import type { ColorSemaforo, MotivoFalloSnapshot, OrigenSnapshot, ResultadoSnapshot } from './tipos.js';

/** Una fila de `snapshot_indicadores` (D162, §5 del backlog). */
export interface FilaSnapshot {
  readonly fecha: string; // AAAA-MM-DD de Santiago
  readonly idCelula: string;
  readonly celulaNombre: string;
  readonly idSprint: string;
  readonly sprintNombre: string;
  readonly sprintInicio: string;
  readonly sprintFin: string;
  readonly ambito: string; // `TODOS` o `QE:<uuid>`
  readonly hduTotal: number;
  readonly certificadas: number;
  readonly cerradasExcepcion: number;
  readonly enCurso: number;
  readonly sinIniciar: number;
  readonly bloqueadas: number;
  readonly sumaAvance: number;
  readonly cumplimientoPromedio: number | null;
  readonly hduRiesgoAlto: number;
  readonly hduRiesgoMedio: number;
  readonly impedimentosAbiertos: number;
  readonly impedimentosEscalados: number;
  readonly semaforo: ColorSemaforo;
}

export interface FilaSnapshotGuardada extends FilaSnapshot {
  readonly id: string;
  readonly idEjecucion: string;
  readonly generadoEn: Date;
}

export interface ConsultaSnapshots {
  readonly ambito: string;
  readonly desde: string;
  readonly hasta: string;
  readonly celulaIds?: readonly string[];
  readonly sprintId?: string;
}

export abstract class SnapshotRepositorio {
  /**
   * Escribe todas las filas o ninguna (una transacción) como *upsert* por `(fecha, celula, sprint, ámbito)`
   * (D164). Devuelve cuántas eran nuevas y cuántas se actualizaron.
   */
  abstract guardarLote(filas: readonly FilaSnapshot[], idEjecucion: string, generadoEn: Date): Promise<{ nuevas: number; actualizadas: number }>;
  /** Filas del ámbito entre dos fechas, por fecha ascendente. */
  abstract consultar(consulta: ConsultaSnapshots): Promise<FilaSnapshotGuardada[]>;
  abstract contar(): Promise<number>;
}

export interface Ejecucion {
  readonly id: string;
  readonly fecha: string;
  readonly origen: OrigenSnapshot;
  readonly actorId: string | null;
  readonly actorNombre: string;
  readonly inicio: Date;
  readonly fin: Date | null;
  readonly resultado: ResultadoSnapshot;
  readonly filasEscritas: number;
  readonly filasNuevas: number;
  readonly filasActualizadas: number;
  readonly motivo: MotivoFalloSnapshot | null;
}

/** Otra ejecución `EN_CURSO` de menos de 5 minutos (D164): 409 `EJECUCION_EN_CURSO`. */
export class EjecucionEnCursoError extends Error {
  constructor() {
    super('Ya hay un snapshot en ejecución.');
    this.name = 'EjecucionEnCursoError';
  }
}

export abstract class EjecucionRepositorio {
  /**
   * Cierra como `FALLIDA`/`INTERRUMPIDA` las ejecuciones `EN_CURSO` de más de `abandonoMs` (D184) y registra la nueva
   * como `EN_CURSO`. Lanza `EjecucionEnCursoError` si otra sigue activa.
   */
  abstract iniciar(datos: { fecha: string; origen: OrigenSnapshot; actorId: string | null; actorNombre: string; ahora: Date; abandonoMs: number }): Promise<Ejecucion>;
  abstract terminarExitosa(id: string, nuevas: number, actualizadas: number, fin: Date): Promise<Ejecucion>;
  abstract terminarFallida(id: string, motivo: MotivoFalloSnapshot, fin: Date): Promise<Ejecucion>;
  abstract listar(pagina: number, tamanoPagina: number): Promise<{ items: Ejecucion[]; total: number }>;
}

export interface UmbralGuardado {
  readonly idQe: string;
  readonly valor: number;
  readonly actualizadoPor: string;
  readonly actualizadoEn: Date;
}

export interface EventoUmbral {
  readonly id: string;
  readonly idQe: string;
  readonly valorAnterior: number;
  readonly valorNuevo: number;
  readonly actorId: string;
  readonly actorNombre: string;
  readonly fecha: Date;
}

export abstract class UmbralRepositorio {
  abstract obtener(idQe: string): Promise<UmbralGuardado | null>;
  abstract obtenerVarios(idsQe: readonly string[]): Promise<Map<string, UmbralGuardado>>;
  /**
   * En una transacción: bloquea la fila del QE (o la crea), compara con el vigente (`defecto` si no hay fila) y, si el
   * valor cambia, inserta el evento con el valor anterior efectivo (D161, D183). Igual al vigente: `cambio: false`.
   */
  abstract fijar(datos: { idQe: string; valor: number; defecto: number; actorId: string; actorNombre: string }): Promise<{ umbral: UmbralGuardado | null; cambio: boolean }>;
  abstract historial(idQe: string, pagina: number, tamanoPagina: number): Promise<{ items: EventoUmbral[]; total: number }>;
}
