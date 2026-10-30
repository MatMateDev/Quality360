/**
 * Tipos del dominio de Organización. Sin dependencias de Nest ni Prisma
 * (informe p. 12): son los tipos que usan las reglas y las interfaces de
 * repositorio, y que la infraestructura traduce desde/hacia Prisma.
 */

/** Catálogo cerrado de roles (comun.v1.yaml#/components/schemas/Rol). */
export type Rol = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA' | 'LIDER_QA' | 'AUDITOR';

/** Un rol por usuario (D28). `LIDER_QA` y `AUDITOR` son de solo lectura (D32). */
export const ROLES: readonly Rol[] = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'];

/** Roles que nunca modifican datos (D32). */
export const ROLES_SOLO_LECTURA: readonly Rol[] = ['LIDER_QA', 'AUDITOR'];

export function esRolSoloLectura(rol: Rol): boolean {
  return ROLES_SOLO_LECTURA.includes(rol);
}

/** Prioridad de una HDU. */
export type PrioridadHdu = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

/** Estados de HDU (D10). */
export type EstadoHdu = 'PENDIENTE' | 'DISENO_PRUEBAS' | 'EN_EJECUCION' | 'PENDIENTE_CIERRE' | 'CERRADA';

/** Quién ejecuta un cambio: un usuario autenticado o el servicio de carga semilla. */
export type TipoActor = 'USUARIO' | 'SERVICIO';

export interface Actor {
  readonly tipo: TipoActor;
  readonly id: string;
  readonly nombre: string;
}

export type EntidadAuditoria = 'USUARIO' | 'SUPERVISION' | 'HDU' | 'EXPORTACION';

export type AccionAuditoria =
  | 'CREAR_USUARIO'
  | 'ACTUALIZAR_USUARIO'
  | 'ACTIVAR_USUARIO'
  | 'DESACTIVAR_USUARIO'
  | 'CAMBIAR_ROL'
  | 'ASIGNAR_SUPERVISOR'
  | 'CAMBIAR_SUPERVISOR'
  | 'CREAR_HDU'
  | 'CAMBIAR_ESTADO_HDU'
  | 'ASIGNAR_ANALISTA'
  | 'REASIGNAR_ANALISTA'
  | 'ASIGNAR_CELULAS_LIDER'
  | 'EXPORTAR'
  | 'REASIGNAR_QE_RESPONSABLE'
  | 'ACTUALIZAR_HDU';

/** Motivo del acceso a una HDU (comun.v1.yaml#/components/schemas/AccesoHdu). */
export type RelacionAccesoHdu =
  | 'ADMINISTRADOR'
  | 'QE_RESPONSABLE'
  | 'QE_SUPERVISOR_DEL_ANALISTA'
  | 'ANALISTA_ASIGNADO'
  | 'LECTOR_CELULA'
  | 'LECTOR_AUDITORIA';

export interface UsuarioResumen {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
}

export interface Usuario {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface Supervision {
  readonly id: string;
  readonly qeId: string;
  readonly analistaId: string;
  readonly desde: Date;
  readonly hasta: Date | null;
  readonly motivo: string | null;
}

/** Relación de supervisión con los datos de usuario resueltos, para respuestas. */
export interface SupervisionConUsuarios extends Supervision {
  readonly qe: UsuarioResumen;
  readonly analista: UsuarioResumen;
  readonly registradoPor: Actor;
}

export interface Celula {
  readonly id: string;
  readonly nombre: string;
}

export interface Sprint {
  readonly id: string;
  readonly nombre: string;
  readonly inicio: Date;
  readonly fin: Date;
  /** Célula a la que pertenece el sprint (E5, D120). */
  readonly celulaId: string;
}

/** Fuente de una HDU (E5, D97): las creadas a mano y las de la semilla son `MANUAL`. */
export type OrigenHdu = 'MANUAL' | 'JIRA' | 'CSV' | 'JSON';

export interface Hdu {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly celulaId: string;
  readonly sprintId: string;
  readonly prioridad: PrioridadHdu;
  readonly qeResponsableId: string;
  readonly analistaId: string | null;
  readonly estado: EstadoHdu;
  readonly estadoActualizadoEn: Date;
  readonly creadoPor: Actor;
  readonly creadoEn: Date;
  readonly descripcion: string | null;
  readonly origen: OrigenHdu;
  /** Clave de la issue de Jira (solo origen `JIRA`, D124). */
  readonly claveExterna: string | null;
  readonly urlExterna: string | null;
}

export interface ConteoPorEstado {
  PENDIENTE: number;
  DISENO_PRUEBAS: number;
  EN_EJECUCION: number;
  PENDIENTE_CIERRE: number;
  CERRADA: number;
}

export function conteoPorEstadoVacio(): ConteoPorEstado {
  return { PENDIENTE: 0, DISENO_PRUEBAS: 0, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 };
}

export interface EventoEstadoHdu {
  readonly tipo: 'ESTADO';
  readonly fecha: Date;
  readonly actor: Actor;
  readonly estadoAnterior: EstadoHdu | null;
  readonly estadoNuevo: EstadoHdu;
}

export interface EventoAsignacionHdu {
  readonly tipo: 'ASIGNACION';
  readonly fecha: Date;
  readonly actor: Actor;
  readonly analistaAnterior: UsuarioResumen | null;
  readonly analistaNuevo: UsuarioResumen;
  readonly motivo: string | null;
}

/** Reasignación del QE responsable (D54). */
export interface EventoResponsableHdu {
  readonly tipo: 'QE_RESPONSABLE';
  readonly fecha: Date;
  readonly actor: Actor;
  readonly qeAnterior: UsuarioResumen;
  readonly qeNuevo: UsuarioResumen;
  readonly motivo: string;
}

export type EventoHistorialHdu = EventoEstadoHdu | EventoAsignacionHdu | EventoResponsableHdu;

/** HDU citada en un error o una lista corta (comun.v1.yaml#/components/schemas/HduReferencia). */
export interface HduReferencia {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
}

/** Referencia a un catálogo (célula o sprint). */
export interface CatalogoRef {
  readonly id: string;
  readonly nombre: string;
}

/** Una fila de `celula_lider` (D30). Vigente si `hasta` es `null`. */
export interface AsignacionCelulaLider {
  readonly id: string;
  readonly celula: CatalogoRef;
  readonly desde: Date;
  readonly hasta: Date | null;
  readonly asignadoPor: Actor;
  readonly retiradoPor: Actor | null;
}

export interface RegistroAuditoria {
  readonly id: string;
  readonly fecha: Date;
  readonly actor: Actor;
  readonly entidad: EntidadAuditoria;
  readonly entidadId: string;
  readonly accion: AccionAuditoria;
  readonly antes: Record<string, unknown> | null;
  readonly despues: Record<string, unknown> | null;
  readonly motivo: string | null;
}

/** Ámbito vigente de acceso, igual forma que `ResolucionAcceso.ambito` de auth-nest. */
export interface AmbitoAcceso {
  readonly qeSupervisorId: string | null;
  readonly analistasSupervisadosIds: readonly string[];
  /** Células vigentes de un Líder QA (D30, D47). */
  readonly celulasIds: readonly string[];
}

export interface Pagina<T> {
  readonly items: T[];
  readonly total: number;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

export interface OpcionesPaginacion {
  readonly pagina: number;
  readonly tamanoPagina: number;
}
