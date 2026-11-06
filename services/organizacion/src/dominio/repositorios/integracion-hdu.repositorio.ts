import type { HduExistente } from '../reglas/upsert-hdu.js';
import type { Actor, Celula, OrigenHdu, PrioridadHdu, Sprint, Usuario } from '../tipos.js';

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
  /** Solo al confirmar una consulta (D141): analista inicial y consulta de origen. */
  readonly analistaId?: string | null;
  readonly consultaId?: string | null;
}

export interface DatosActualizacionUpsert {
  readonly antes: HduParaUpsert;
  /** Valores nuevos de los campos que cambian (D98: solo título, descripción y prioridad). */
  readonly datos: { titulo?: string; descripcion?: string; prioridad?: PrioridadHdu };
  /** Si la fila vincula una HDU creada a mano, su nuevo origen (y el enlace si es Jira). */
  readonly vincula: { origen: OrigenHdu; claveExterna: string | null; urlExterna: string | null } | null;
}

/** Quién tiene hoy una HDU y si la creó esta consulta y este actor (D202, D204). */
export interface HduExistenteUpsert {
  readonly idHistoria: string;
  readonly qe: string;
  readonly analista: string | null;
  readonly creadaPorEstaConsulta: boolean;
  readonly creadaPorActor: boolean;
}

/** Las operaciones de una HDU dentro de UNA transacción (o sin escribir, en una simulación). */
export interface UnidadTrabajoUpsert {
  buscarPorCodigoNormalizado(codigoNormalizado: string): Promise<HduParaUpsert | null>;
  /** Las referencias de la fila usan la misma conexión que el alta, incluso con un pool de tamaño 1. */
  buscarCelulaPorNombre(nombre: string): Promise<Celula | null>;
  buscarSprintDeCelulaPorNombre(celulaId: string, nombre: string): Promise<Sprint | null>;
  buscarUsuarioPorCorreo(correo: string): Promise<Usuario | null>;
  /** Describe la HDU `idHistoria` con la misma conexión de la unidad (nunca otra del pool). `null` si ya no existe. */
  describirExistente(idHistoria: string, consultaId: string, actorId: string): Promise<HduExistenteUpsert | null>;
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
