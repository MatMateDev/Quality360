/** Tipos del dominio de impedimentos y riesgo. Sin dependencias de Nest, Prisma ni HTTP. */

export type RolUsuario = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA' | 'LIDER_QA' | 'AUDITOR';

export type EstadoHdu = 'PENDIENTE' | 'DISENO_PRUEBAS' | 'EN_EJECUCION' | 'PENDIENTE_CIERRE' | 'CERRADA';

/** Relación de quien consulta con la HDU, tal como la resuelve Organización (D18, D32, D57). */
export type RelacionHdu =
  | 'ADMINISTRADOR'
  | 'QE_RESPONSABLE'
  | 'QE_SUPERVISOR_DEL_ANALISTA'
  | 'ANALISTA_ASIGNADO'
  | 'LECTOR_CELULA'
  | 'LECTOR_AUDITORIA';

export const TIPOS_IMPEDIMENTO = [
  'AMBIENTE',
  'DATOS_PRUEBA',
  'ACCESO',
  'REQUISITOS',
  'DEPENDENCIA',
  'DEFECTO_BLOQUEANTE',
  'HERRAMIENTA',
  'RECURSOS',
  'OTRO',
] as const;
export type TipoImpedimento = (typeof TIPOS_IMPEDIMENTO)[number];

export const ETIQUETAS_TIPO: Readonly<Record<TipoImpedimento, string>> = {
  AMBIENTE: 'Ambiente de pruebas',
  DATOS_PRUEBA: 'Datos de prueba',
  ACCESO: 'Accesos y permisos',
  REQUISITOS: 'Requisitos',
  DEPENDENCIA: 'Dependencia de otro equipo',
  DEFECTO_BLOQUEANTE: 'Defecto bloqueante',
  HERRAMIENTA: 'Herramienta o integración',
  RECURSOS: 'Personas o tiempo',
  OTRO: 'Otro',
};

export const ESTADOS_IMPEDIMENTO = ['ABIERTO', 'ESCALADO', 'RESUELTO'] as const;
export type EstadoImpedimento = (typeof ESTADOS_IMPEDIMENTO)[number];

export const OPERACIONES_IMPEDIMENTO = ['RESOLVER', 'ESCALAR', 'REABRIR', 'SEGUIMIENTO'] as const;
export type OperacionImpedimento = (typeof OPERACIONES_IMPEDIMENTO)[number];

export type TipoAccion = 'REGISTRAR' | OperacionImpedimento;

export const NIVELES_RIESGO = ['BAJO', 'MEDIO', 'ALTO'] as const;
export type NivelRiesgo = (typeof NIVELES_RIESGO)[number];

export type OrigenRiesgo = 'MANUAL' | 'SUGERIDO';

/** Persona con rol: autor de una acción o candidato a responsable. */
export interface PersonaRol {
  readonly id: string;
  readonly nombre: string;
  readonly rol: RolUsuario;
}

export interface Persona {
  readonly id: string;
  readonly nombre: string;
}

/** Responsable de resolver el impedimento (D63): usuario de Quality360 o tercero (`id` nulo). */
export interface Responsable {
  readonly id: string | null;
  readonly nombre: string;
}

export interface ImpedimentoRegistro {
  readonly id: string;
  readonly hduId: string;
  readonly certificacionId: string | null;
  readonly tipo: TipoImpedimento;
  readonly titulo: string;
  readonly descripcion: string;
  readonly estado: EstadoImpedimento;
  readonly responsable: Responsable;
  readonly creadoPor: PersonaRol;
  readonly fechaRegistro: Date;
  readonly abiertoDesde: Date;
  readonly fechaResolucion: Date | null;
  readonly actualizadoEn: Date;
}

export interface AccionRegistro {
  readonly id: string;
  readonly impedimentoId: string;
  readonly tipo: TipoAccion;
  readonly estadoAnterior: EstadoImpedimento | null;
  readonly estado: EstadoImpedimento;
  readonly actor: PersonaRol;
  readonly fecha: Date;
  readonly comentario: string;
  readonly detalle: { readonly responsableAnterior: Responsable; readonly responsableNuevo: Responsable } | null;
}

export interface RiesgoFijadoRegistro {
  readonly id: string;
  readonly hduId: string;
  readonly nivel: NivelRiesgo;
  readonly nivelAnterior: NivelRiesgo | null;
  readonly justificacion: string;
  readonly sugeridoAlFijar: NivelRiesgo | null;
  readonly actor: PersonaRol;
  readonly fecha: Date;
}
