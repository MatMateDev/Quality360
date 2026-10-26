/**
 * Puertos de persistencia. El dominio define lo que necesita; `infraestructura/prisma` los
 * implementa. Las clases abstractas sirven también de token de inyección.
 */
import type {
  AccionRegistro,
  EstadoImpedimento,
  ImpedimentoRegistro,
  NivelRiesgo,
  PersonaRol,
  Responsable,
  RiesgoFijadoRegistro,
  TipoAccion,
  TipoImpedimento,
} from './tipos.js';

export interface NuevoImpedimento {
  readonly hduId: string;
  readonly certificacionId: string | null;
  readonly tipo: TipoImpedimento;
  readonly titulo: string;
  readonly descripcion: string;
  readonly responsable: Responsable;
  readonly creadoPor: PersonaRol;
  readonly ahora: Date;
}

/** Decisión que toma el dominio con la fila bloqueada (`SELECT … FOR UPDATE`, D62). */
export interface PlanTransicion {
  readonly tipo: Exclude<TipoAccion, 'REGISTRAR'>;
  readonly estado: EstadoImpedimento;
  readonly comentario: string;
  readonly actor: PersonaRol;
  readonly ahora: Date;
  /** Solo en `ESCALAR`. */
  readonly responsableNuevo?: Responsable;
}

export interface ResultadoTransicion {
  readonly impedimento: ImpedimentoRegistro;
  readonly accion: AccionRegistro;
  /** `ABIERTO` + `ESCALADO` de la HDU después del cambio. */
  readonly abiertosHdu: number;
}

export interface FiltroImpedimentos {
  /** `null` = todas las HDU (Administrador y Auditor). */
  readonly hduIds: readonly string[] | null;
  readonly estados?: readonly EstadoImpedimento[];
  readonly tipo?: TipoImpedimento;
}

export interface FiltroAuditorImpedimentos {
  readonly desde?: Date;
  readonly hasta?: Date;
  readonly hduId?: string;
  readonly estado?: EstadoImpedimento;
  readonly tipo?: TipoImpedimento;
  /** Coincidencia parcial en el título del impedimento. */
  readonly q?: string;
  /** Con `q`, también las HDU cuyo código o título coincide (las resuelve la aplicación). */
  readonly hduIdsPorTexto?: readonly string[];
}

export type AccionGestion = 'REGISTRAR' | 'ESCALAR' | 'RESOLVER' | 'REABRIR' | 'SEGUIMIENTO' | 'FIJAR_RIESGO';

export interface EntradaGestionRegistro {
  readonly id: string;
  readonly tipo: 'IMPEDIMENTO' | 'RIESGO';
  readonly accion: AccionGestion;
  readonly hduId: string;
  readonly impedimento: { readonly id: string; readonly titulo: string; readonly tipo: TipoImpedimento } | null;
  readonly actor: PersonaRol;
  readonly fecha: Date;
  readonly anterior: string | null;
  readonly nuevo: string;
  readonly comentario: string | null;
  readonly sugeridoAlFijar: NivelRiesgo | null;
  readonly detalle: Record<string, unknown> | null;
}

export interface FiltroGestion {
  readonly desde?: Date;
  readonly hasta?: Date;
  readonly hduId?: string;
  readonly actorId?: string;
  readonly estado?: EstadoImpedimento;
  readonly tipoImpedimento?: TipoImpedimento;
  readonly accion?: AccionGestion;
  /** Solo entradas de este origen. */
  readonly tipo?: 'IMPEDIMENTO' | 'RIESGO';
}

export abstract class ImpedimentoRepositorio {
  /** Inserta el impedimento `ABIERTO` y su acción `REGISTRAR` en una transacción. */
  abstract crear(datos: NuevoImpedimento): Promise<{ impedimento: ImpedimentoRegistro; accion: AccionRegistro }>;
  abstract buscarPorId(id: string): Promise<ImpedimentoRegistro | null>;
  abstract acciones(impedimentoId: string): Promise<AccionRegistro[]>;
  /** Todos los impedimentos de una HDU. */
  abstract listarPorHdu(hduId: string): Promise<ImpedimentoRegistro[]>;
  abstract listar(filtro: FiltroImpedimentos): Promise<ImpedimentoRegistro[]>;
  /**
   * Aplica una operación con la fila bloqueada: `decidir` recibe el estado vigente y devuelve el
   * plan o lanza `ErrorTransicionImpedimento`. Cambio de estado y acción van en la misma transacción.
   */
  abstract transicionar(id: string, decidir: (actual: ImpedimentoRegistro) => PlanTransicion): Promise<ResultadoTransicion>;
  abstract contarBloqueantes(hduId: string): Promise<number>;
  /** Los `ABIERTO` y `ESCALADO` de una HDU, el más antiguo primero. */
  abstract bloqueantesDeHdu(hduId: string, limite: number): Promise<{ total: number; items: ImpedimentoRegistro[] }>;

  abstract listarAuditor(filtro: FiltroAuditorImpedimentos, desplazamiento: number, limite: number): Promise<{ items: ImpedimentoRegistro[]; total: number }>;
  abstract contarAuditor(filtro: FiltroAuditorImpedimentos): Promise<number>;
}

export interface PlanRiesgo {
  readonly nivel: NivelRiesgo;
  readonly justificacion: string;
  readonly sugeridoAlFijar: NivelRiesgo | null;
  readonly actor: PersonaRol;
  readonly ahora: Date;
}

export abstract class RiesgoRepositorio {
  /** Último nivel fijado de cada HDU pedida (las que nunca se fijaron no aparecen). */
  abstract ultimoPorHdu(hduIds: readonly string[]): Promise<Map<string, RiesgoFijadoRegistro>>;
  /**
   * Agrega una fila a `riesgo_hdu` leyendo la última con `FOR UPDATE`: `decidir` recibe la última
   * fila y devuelve el plan, o `null` si nada cambia (no se agrega fila).
   */
  abstract fijar(
    hduId: string,
    decidir: (ultimo: RiesgoFijadoRegistro | null) => PlanRiesgo | null,
  ): Promise<{ cambio: boolean; registro: RiesgoFijadoRegistro }>;
}

export abstract class GestionRepositorio {
  /** Entradas de una HDU (acciones de impedimentos y cambios de riesgo), cronológicas. */
  abstract deHdu(hduId: string, filtro: FiltroGestion, descendente: boolean): Promise<EntradaGestionRegistro[]>;
  abstract global(filtro: FiltroGestion, desplazamiento: number, limite: number): Promise<{ items: EntradaGestionRegistro[]; total: number }>;
  abstract contarGlobal(filtro: FiltroGestion): Promise<number>;
}

/** Altas idempotentes de la semilla E4 (D88). */
export interface CargaImpedimentoAccion {
  readonly tipo: Exclude<TipoAccion, never>;
  readonly estadoAnterior: EstadoImpedimento | null;
  readonly estado: EstadoImpedimento;
  readonly actor: PersonaRol;
  readonly fecha: Date;
  readonly comentario: string;
  readonly responsableNuevo?: Responsable;
}

export interface CargaImpedimentoDatos {
  readonly hduId: string;
  readonly certificacionId: string | null;
  readonly tipo: TipoImpedimento;
  readonly titulo: string;
  readonly descripcion: string;
  readonly responsableInicial: Responsable;
  readonly creadoPor: PersonaRol;
  readonly acciones: readonly CargaImpedimentoAccion[];
}

export interface CargaRiesgoDatos {
  readonly hduId: string;
  readonly nivel: NivelRiesgo;
  readonly nivelAnterior: NivelRiesgo | null;
  readonly sugeridoAlFijar: NivelRiesgo | null;
  readonly justificacion: string;
  readonly actor: PersonaRol;
  readonly fecha: Date;
}

export abstract class CargaRepositorio {
  abstract cargarImpedimento(datos: CargaImpedimentoDatos): Promise<{ creado: boolean; id: string }>;
  abstract cargarRiesgo(datos: CargaRiesgoDatos): Promise<{ creado: boolean; id: string }>;
}
