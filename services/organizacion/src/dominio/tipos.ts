/**
 * Tipos del dominio de Organización. Sin dependencias de Nest ni Prisma
 * (informe p. 12): son los tipos que usan las reglas y las interfaces de
 * repositorio, y que la infraestructura traduce desde/hacia Prisma.
 */

/** Catálogo cerrado de roles (comun.v1.yaml#/components/schemas/Rol). */
export type Rol = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA';

export const ROLES: readonly Rol[] = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA'];

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

export type EntidadAuditoria = 'USUARIO' | 'SUPERVISION' | 'HDU';

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
  | 'REASIGNAR_ANALISTA';

/** Motivo del acceso a una HDU (comun.v1.yaml#/components/schemas/AccesoHdu). */
export type RelacionAccesoHdu = 'ADMINISTRADOR' | 'QE_RESPONSABLE' | 'QE_SUPERVISOR_DEL_ANALISTA' | 'ANALISTA_ASIGNADO';

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
}

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

export type EventoHistorialHdu = EventoEstadoHdu | EventoAsignacionHdu;

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
