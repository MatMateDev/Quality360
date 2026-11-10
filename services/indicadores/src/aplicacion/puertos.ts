/**
 * Puertos hacia las fuentes (D154) y el reloj. Clases abstractas: sirven de token de inyección y el dominio no las
 * importa. Los clientes HTTP viven en `infraestructura/fuentes` y no importan código de otros servicios.
 */
import type { AmbitoOrganizacion, AvanceHdu, EvaluacionHdu, HduAmbito, ImpedimentoBloqueante, Ref } from '../dominio/tipos.js';

/** Cómo se autentica una llamada interna: sesión del usuario (token propagado) o la credencial de Indicadores (D177). */
export type Autenticacion =
  | { readonly tipo: 'sesion'; readonly token: string; readonly traceId: string }
  | { readonly tipo: 'servicio'; readonly credencial: string; readonly traceId: string };

export type NombreFuente = 'ORGANIZACION' | 'CERTIFICACIONES' | 'IMPEDIMENTOS';

/** La fuente no respondió a tiempo, devolvió algo ilegible o falló (5xx). */
export class FuenteNoDisponible extends Error {
  constructor(
    readonly fuente: NombreFuente,
    detalle: string,
  ) {
    super(`${fuente} no disponible: ${detalle}`);
    this.name = 'FuenteNoDisponible';
  }
}

/** La fuente rechazó la credencial entre servicios (401/403): el snapshot queda `CONFIGURACION_INVALIDA` (D177). */
export class CredencialRechazada extends Error {
  constructor(readonly fuente: NombreFuente) {
    super(`${fuente} rechazó la credencial de Indicadores`);
    this.name = 'CredencialRechazada';
  }
}

/** La fuente respondió 403: el usuario no tiene acceso (rol o estado vigentes en Organización). */
export class AccesoRechazadoPorFuente extends Error {
  constructor(readonly fuente: NombreFuente) {
    super(`${fuente} negó el acceso`);
    this.name = 'AccesoRechazadoPorFuente';
  }
}

export interface DatosSnapshotFuente {
  readonly total: number;
  readonly hdu: readonly HduAmbito[];
  readonly ambitosQe: ReadonlyArray<{ qe: Ref; hduIds: readonly string[] }>;
}

export interface RegistroExportacion {
  readonly recurso: 'INDICADORES';
  readonly filtros: Record<string, unknown>;
  readonly filas: number;
}

export abstract class FuenteOrganizacion {
  /** Ámbito D153 del usuario del token (`GET /v1/interno/indicadores/ambito`). */
  abstract ambito(auth: Autenticacion & { tipo: 'sesion' }): Promise<AmbitoOrganizacion>;
  /** Todas las HDU y el ámbito de cada QE (`GET /v1/interno/indicadores/snapshot`), con la credencial. */
  abstract snapshot(auth: Autenticacion & { tipo: 'servicio' }, limite: number, timeoutMs: number): Promise<DatosSnapshotFuente>;
  /** Nombre del usuario del token (`GET /v1/me`): actor de la ejecución manual del snapshot. */
  abstract perfil(auth: Autenticacion & { tipo: 'sesion' }): Promise<Ref>;
  /** La célula del catálogo, o `null` si no existe (solo para el 404 del Auditor en el drill-down). */
  abstract buscarCelula(auth: Autenticacion & { tipo: 'sesion' }, celulaId: string): Promise<Ref | null>;
  /** Registra el `EXPORTAR` en la auditoría; si falla, lanza y no se entrega archivo (D168). */
  abstract registrarExportacion(auth: Autenticacion & { tipo: 'sesion' }, registro: RegistroExportacion): Promise<void>;
}

export abstract class FuenteCertificaciones {
  /** Avance y certificado de las HDU pedidas, en lotes de 1000 (`POST /v1/interno/checklist/estados`). */
  abstract avance(auth: Autenticacion, hduIds: readonly string[], timeoutMs: number): Promise<Map<string, AvanceHdu>>;
}

export interface HduParaEvaluar {
  readonly hduId: string;
  readonly estado: string;
  readonly sprintFin: string | null;
  readonly avance: number | null;
}

export interface ResultadoEvaluacion {
  readonly evaluaciones: Map<string, EvaluacionHdu>;
  readonly impedimentos: ImpedimentoBloqueante[];
}

export abstract class FuenteImpedimentos {
  /** Bloqueo y riesgo de las HDU pedidas, en lotes de 1000 (`POST /v1/interno/impedimentos/evaluacion`). */
  abstract evaluar(auth: Autenticacion, hdu: readonly HduParaEvaluar[], incluirImpedimentos: boolean, timeoutMs: number): Promise<ResultadoEvaluacion>;
}

export abstract class Reloj {
  abstract ahora(): Date;
}
