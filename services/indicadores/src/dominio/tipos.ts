/** Tipos del dominio de Indicadores (E6). Puro: sin Nest, Prisma ni `fetch`. */

export type EstadoHdu = 'PENDIENTE' | 'DISENO_PRUEBAS' | 'EN_EJECUCION' | 'PENDIENTE_CIERRE' | 'CERRADA';
export const ESTADOS_HDU: readonly EstadoHdu[] = ['PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA'];
export type Rol = 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA' | 'LIDER_QA' | 'AUDITOR';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';
export type ColorSemaforo = 'ROJO' | 'AMARILLO' | 'VERDE';
export type OrigenSnapshot = 'CRON' | 'MANUAL';
export type ResultadoSnapshot = 'EN_CURSO' | 'EXITOSA' | 'FALLIDA';
export type MotivoFalloSnapshot =
  | 'ORGANIZACION_NO_DISPONIBLE'
  | 'CERTIFICACIONES_NO_DISPONIBLE'
  | 'IMPEDIMENTOS_NO_DISPONIBLE'
  | 'EXCEDE_TOPE'
  | 'CONFIGURACION_INVALIDA'
  | 'INTERRUMPIDA'
  | 'ERROR_INTERNO';
export type MotivoSinDatos = 'AMBITO_VACIO' | 'FILTRO_SIN_COINCIDENCIAS' | 'SIN_HISTORIAL';

/** Valor del filtro «sin sprint» (D180). */
export const SIN_SPRINT = 'SIN_SPRINT';

export interface Ref {
  readonly id: string;
  readonly nombre: string;
}

/** HDU tal como la entrega Organización a Indicadores (`HduIndicadores`, D176). */
export interface HduAmbito {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly cierreParcial: boolean;
  readonly celula: Ref;
  readonly sprint: { readonly id: string; readonly nombre: string; readonly inicio: string; readonly fin: string } | null;
  readonly qeResponsable: Ref;
  readonly analista: { readonly id: string; readonly nombre: string; readonly activo: boolean } | null;
}

export interface AnalistaAmbito {
  readonly id: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly supervisor: Ref | null;
}

export interface AmbitoOrganizacion {
  readonly usuario: { readonly id: string; readonly nombre: string; readonly rol: Rol };
  readonly todas: boolean;
  readonly celulas: readonly Ref[];
  readonly hdu: readonly HduAmbito[];
  readonly analistas: readonly AnalistaAmbito[];
  /** QE que quien consulta puede nombrar en el umbral (D176); el Auditor recibe todos los activos. */
  readonly qes: readonly Ref[];
}

/** Avance y certificado de una HDU según Certificaciones. */
export interface AvanceHdu {
  readonly hduId: string;
  readonly aprobados: number;
  readonly certificado: boolean;
}

export interface RiesgoHdu {
  readonly nivelVigente: NivelRiesgo | null;
  readonly origen: 'MANUAL' | 'SUGERIDO' | null;
  readonly estado: 'ok' | 'indisponible';
  readonly calculoParcial: boolean;
}

export interface EvaluacionHdu {
  readonly hduId: string;
  readonly bloqueada: boolean;
  /** Impedimentos ABIERTO más ESCALADO (contrato de la evaluación); los estrictamente abiertos son `abiertos - escalados`. */
  readonly abiertos: number;
  readonly escalados: number;
  readonly riesgo: RiesgoHdu;
}

export interface ImpedimentoBloqueante {
  readonly id: string;
  readonly hduId: string;
  readonly titulo: string;
  readonly tipo: string;
  readonly estado: 'ABIERTO' | 'ESCALADO';
  readonly diasAbierto: number;
}

export interface FiltrosVista {
  readonly celulaId: string | null;
  readonly sprintId: string | null;
}
