import type { HduExistente } from '../reglas/upsert-hdu.js';
import type { Actor, OrigenHdu, PrioridadHdu } from '../tipos.js';

/** Token de inyección del repositorio del upsert de E5. */
export const INTEGRACION_HDU_REPOSITORIO = Symbol('INTEGRACION_HDU_REPOSITORIO');

export interface HduParaUpsert extends HduExistente {
  readonly id: string;
}

export interface DatosAltaUpsert {
  readonly codigo: string;
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly prioridad: PrioridadHdu;
  readonly celulaId: string;
  readonly sprintId: string;
  readonly qeResponsableId: string;
  readonly origen: OrigenHdu;
  readonly claveExterna: string | null;
  readonly urlExterna: string | null;
}

export interface DatosActualizacionUpsert {
  readonly antes: HduParaUpsert;
  /** Valores nuevos de los campos que cambian (D98: solo título, descripción y prioridad). */
  readonly datos: { titulo?: string; descripcion?: string; prioridad?: PrioridadHdu };
  /** Si la fila vincula una HDU creada a mano, su nuevo origen (y el enlace si es Jira). */
  readonly vincula: { origen: OrigenHdu; claveExterna: string | null; urlExterna: string | null } | null;
}

/** Las operaciones de una HDU dentro de UNA transacción (o sin escribir, en una simulación). */
export interface UnidadTrabajoUpsert {
  buscarPorCodigoNormalizado(codigoNormalizado: string): Promise<HduParaUpsert | null>;
  /** Mismo camino de alta que `POST /v1/hdu`: HDU en `PENDIENTE`, sprint vigente, historial inicial y auditoría `CREAR_HDU`. */
  crear(datos: DatosAltaUpsert, actor: Actor): Promise<{ id: string }>;
  /** Actualiza y audita `ACTUALIZAR_HDU` con antes y después. Nunca toca estado, analista, QE, célula ni sprint. */
  actualizar(entrada: DatosActualizacionUpsert, actor: Actor): Promise<void>;
}

export interface IntegracionHduRepositorio {
  /** Ejecuta `trabajo` en una transacción; si lanza, todo se revierte. */
  enTransaccion<T>(trabajo: (unidad: UnidadTrabajoUpsert) => Promise<T>): Promise<T>;
  /** Una unidad que solo lee: `crear` y `actualizar` no escriben ni auditan (`soloSimular`). */
  soloLectura(): UnidadTrabajoUpsert;
}
