/**
 * Tipos del dominio de la consulta de Jira (E5 consulta y asignación, D132-D152). Sin dependencias de Nest, Prisma
 * ni `fetch`. Los catálogos son los de `comun.v1.yaml` (`GrupoConsulta`, `EstadoConsulta`, `OrigenSprintPropuesto`).
 */
import type { AdvertenciaFila, MotivoFila, PrioridadHdu, ReferenciaJira } from '../tipos.js';

export type GrupoConsulta = 'NUEVA' | 'CAMBIO' | 'SIN_CAMBIOS' | 'CON_ERROR';
export const GRUPOS: readonly GrupoConsulta[] = ['NUEVA', 'CAMBIO', 'SIN_CAMBIOS', 'CON_ERROR'];
export type EstadoConsulta = 'ABIERTA' | 'CONFIRMADA' | 'REEMPLAZADA' | 'VENCIDA' | 'DESCARTADA';
export type OrigenSprint = 'JIRA' | 'RESPALDO' | 'MANUAL';
export type OrigenHduConsulta = 'MANUAL' | 'JIRA' | 'CSV' | 'JSON';

/** Campos de la asignación, en el orden en que el portal los nombra (`CampoAsignacion` del contrato). */
export type CampoAsignacion = 'celulaId' | 'qeId' | 'analistaId' | 'sprintId';
export const CAMPOS_ASIGNACION: readonly CampoAsignacion[] = ['celulaId', 'qeId', 'analistaId', 'sprintId'];

export interface Ref {
  readonly id: string;
  readonly nombre: string;
}

/** La asignación de una fila `NUEVA`: ids con el nombre resuelto al asignar (D148). Un campo sin elegir es `null`. */
export interface AsignacionFila {
  readonly celula: Ref | null;
  readonly qe: Ref | null;
  readonly analista: Ref | null;
  readonly sprint: Ref | null;
  readonly sprintOrigen: OrigenSprint | null;
}

export const ASIGNACION_VACIA: AsignacionFila = { celula: null, qe: null, analista: null, sprint: null, sprintOrigen: null };

export interface CambioValorConsulta {
  readonly antes: string | null;
  readonly despues: string | null;
}
/** Diferencias de una fila `CAMBIO`: hasta 1.000 caracteres por valor (D136). */
export interface CambiosConsulta {
  titulo?: CambioValorConsulta;
  descripcion?: CambioValorConsulta;
  prioridad?: CambioValorConsulta;
}

export interface Persona {
  readonly id: string;
  readonly nombre: string;
}

export interface ItemConsulta {
  readonly id: string;
  readonly posicion: number;
  readonly grupo: GrupoConsulta;
  readonly codigo: string | null;
  readonly titulo: string | null;
  readonly descripcion: string | null;
  readonly prioridad: PrioridadHdu | null;
  readonly sprintJira: string | null;
  readonly referencia: ReferenciaJira | null;
  readonly advertencias: AdvertenciaFila[];
  readonly motivo: MotivoFila | null;
  readonly idHistoria: string | null;
  readonly origenHdu: OrigenHduConsulta | null;
  readonly estadoHdu: string | null;
  readonly qeHduNombre: string | null;
  readonly cambios: CambiosConsulta | null;
  readonly asignacion: AsignacionFila;
  readonly avisoSinLider: boolean;
  readonly marcada: boolean;
  readonly aplicada: boolean;
  readonly asignadoPor: Persona | null;
  readonly asignadoEn: Date | null;
}

/** La cabecera de una consulta con sus contadores acumulados (D149). */
export interface Consulta {
  readonly id: string;
  readonly estado: EstadoConsulta;
  readonly version: number;
  readonly creadaPor: Persona;
  readonly creadaEn: Date;
  readonly venceEn: Date;
  readonly cerradaEn: Date | null;
  readonly cerradaPor: Persona | null;
  readonly proyecto: string;
  readonly sitioHost: string;
  readonly hayMas: boolean;
  readonly continuarDesde: string | null;
  /** Instantánea del destino de Conexión con sus nombres (D146). */
  readonly sugerencia: { readonly celula: Ref | null; readonly qe: Ref | null; readonly sprintRespaldo: Ref | null };
  readonly leidas: number;
  readonly nuevas: number;
  readonly cambiaron: number;
  readonly sinCambios: number;
  readonly conError: number;
  readonly conAdvertencias: number;
  readonly descartadas: number;
}

/** Conteos que salen de las filas mientras la consulta está abierta (cero cuando se purgaron). */
export interface ConteosFilas {
  readonly asignadas: number;
  readonly completas: number;
  readonly marcadasNuevas: number;
  readonly marcadasCambio: number;
  readonly aplicadas: number;
  readonly pendientes: number;
}

export const SIN_CONTEOS: ConteosFilas = { asignadas: 0, completas: 0, marcadasNuevas: 0, marcadasCambio: 0, aplicadas: 0, pendientes: 0 };
