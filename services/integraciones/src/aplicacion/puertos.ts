/**
 * Puertos de la aplicación: lo que los casos de uso necesitan de afuera. Las implementaciones viven en
 * `infraestructura` (Prisma, HTTP hacia Organización, cifrado) o en la frontera con Jira y archivos
 * (q360-integraciones: `FuenteJira`, mapeo y lector de archivos). Las clases abstractas sirven de token de inyección.
 */
import type { FuenteJira } from '../dominio/puertos/fuente-jira.js';
import type { FilaMapeada } from '../dominio/mapeo/tipos.js';
import type { IssueJira } from '../dominio/puertos/fuente-jira.js';
import type {
  Actor,
  AdvertenciaFila,
  CambiosHdu,
  CodigoErrorArchivo,
  CodigoErrorIntegracion,
  ConfiguracionGuardada,
  Contadores,
  Ejecucion,
  EstadoConexion,
  EventoConfiguracion,
  EventoEjecucion,
  FilaDetalle,
  MotivoFila,
  OrigenEjecucion,
  Pagina,
  ResultadoEjecucion,
  ResultadoFila,
  Rol,
  TokenCifradoGuardado,
  CampoConfiguracion,
} from '../dominio/tipos.js';

export const FUENTE_JIRA = Symbol.for('quality360.FuenteJira');
export type { FuenteJira };

/** Token del usuario y traza para propagar a Organización (regla no negociable 1: nunca el esquema `organizacion`). */
export interface ContextoSolicitud {
  readonly token: string;
  readonly traceId: string;
}

/** Quién pide: el rol vigente sale de Organización (nunca del token, D4, D126). */
export interface Solicitante {
  readonly usuarioId: string;
  readonly rol: Rol;
  readonly contexto: ContextoSolicitud;
}

// ------------------------------------------------------------------ Organización
export interface DestinoHdu {
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly sprintRespaldoId: string;
}

export interface DetalleDestino {
  readonly campo: string;
  readonly codigo: string;
  readonly mensaje: string;
}

export interface DestinoResuelto {
  readonly celula: { id: string; nombre: string } | null;
  readonly qeResponsable: { id: string; nombre: string } | null;
  readonly sprintRespaldo: { id: string; nombre: string } | null;
  readonly errores: DetalleDestino[];
}

export interface FilaUpsert {
  readonly fila: number;
  readonly codigo: string;
  readonly titulo: string | null;
  readonly descripcion?: string | null;
  readonly prioridad?: string | null;
  readonly celula?: string | null;
  readonly sprint?: string | null;
  readonly qeCorreo?: string | null;
  readonly claveExterna?: string | null;
  readonly urlExterna?: string | null;
}

export interface SolicitudUpsert {
  readonly origen: OrigenEjecucion;
  readonly soloSimular: boolean;
  readonly vincularExistentes: boolean;
  readonly estricto: boolean;
  readonly destino: DestinoHdu;
  readonly sprintNoEncontrado: 'RESPALDO' | 'ERROR';
  readonly filas: readonly FilaUpsert[];
}

export interface ResultadoFilaUpsert {
  readonly fila: number;
  readonly codigo: string;
  readonly resultado: ResultadoFila;
  readonly motivo: MotivoFila | null;
  readonly idHistoria: string | null;
  readonly advertencias: AdvertenciaFila[];
  readonly cambios: CambiosHdu | null;
}

export interface ResultadoUpsert {
  readonly simulado: boolean;
  readonly filas: ResultadoFilaUpsert[];
}

export interface AmbitoHdu {
  readonly todas: boolean;
  readonly hduIds: readonly string[];
}

/** Organización por HTTP, siempre con el token del usuario propagado. Lanza `OrganizacionNoDisponible` si no responde. */
export abstract class ProveedorOrganizacion {
  /** `GET /v1/me`: el nombre del actor para el registro (el acceso solo trae id y rol). */
  abstract perfil(contexto: ContextoSolicitud, limiteMs: number): Promise<{ id: string; nombre: string }>;
  abstract destino(destino: DestinoHdu, contexto: ContextoSolicitud, limiteMs: number): Promise<DestinoResuelto>;
  abstract upsert(solicitud: SolicitudUpsert, contexto: ContextoSolicitud, limiteMs: number): Promise<ResultadoUpsert>;
  /** `GET /v1/interno/hdu/ambito`: una sola llamada para el detalle del QE (D106). */
  abstract ambito(contexto: ContextoSolicitud, limiteMs: number): Promise<AmbitoHdu>;
}

// ------------------------------------------------------------------ cifrado
export abstract class CifradorToken {
  /** `false` si falta o es inválida la llave de cifrado (D128). */
  abstract get disponible(): boolean;
  /** @throws LlaveCifradoNoDisponible */
  abstract cifrar(token: string): TokenCifradoGuardado;
  /** @throws LlaveCifradoNoDisponible, TokenNoDescifrable */
  abstract descifrar(token: TokenCifradoGuardado): string;
}

// ------------------------------------------------------------------ persistencia
export interface DatosGuardadoConfiguracion {
  readonly sitio: string;
  readonly correo: string;
  readonly proyecto: string;
  readonly tiposIssue: string[];
  readonly campoSprint: string | null;
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly sprintRespaldoId: string;
  readonly token: TokenCifradoGuardado;
  readonly actor: { id: string; nombre: string };
  readonly fecha: Date;
}

export interface DatosEventoConfiguracion {
  readonly actor: { id: string; nombre: string };
  readonly camposCambiados: CampoConfiguracion[];
  readonly tokenCambiado: boolean;
  readonly resultadoPrueba: string;
  readonly fecha: Date;
}

export abstract class ConfiguracionRepositorio {
  abstract obtener(): Promise<ConfiguracionGuardada | null>;
  /** Guarda la configuración (una sola fila) y registra el evento en la misma transacción. */
  abstract guardar(datos: DatosGuardadoConfiguracion, evento: DatosEventoConfiguracion): Promise<void>;
  /** Una prueba fallida solo actualiza el estado y la última prueba (D112). Sin fila previa no inserta nada. */
  abstract registrarPrueba(estado: EstadoConexion, codigo: CodigoErrorIntegracion | null, fecha: Date): Promise<void>;
  abstract listarEventos(pagina: number, tamanoPagina: number): Promise<Pagina<EventoConfiguracion>>;
}

export interface DatosInicioEjecucion {
  readonly origen: OrigenEjecucion;
  readonly estricto: boolean;
  readonly vincularExistentes: boolean;
  readonly actor: Actor;
  readonly proyecto: string | null;
  readonly sitioHost: string | null;
  readonly archivo: { nombre: string; tamano: number; huella: string } | null;
  readonly iniciadaEn: Date;
}

export interface DatosCierreEjecucion extends Contadores {
  readonly resultado: Exclude<ResultadoEjecucion, 'EN_CURSO'>;
  readonly terminadaEn: Date;
  readonly duracionMs: number;
  readonly codigoError: CodigoErrorIntegracion | null;
  readonly mensajeError: string | null;
  readonly eventos: readonly EventoEjecucion[];
  readonly hayMas: boolean;
  readonly continuarDesde: string | null;
}

export interface FiltroEjecuciones {
  readonly origen?: OrigenEjecucion;
  readonly resultado?: ResultadoEjecucion;
  readonly desde?: Date;
  readonly hastaExcluyente?: Date;
  readonly orden: 'asc' | 'desc';
}

export interface FiltroDetalle {
  readonly resultado?: ResultadoFila;
  /** `null`: ve todo (Administrador, Auditor). Una lista: solo esas HDU y las filas con error (QE, D106). */
  readonly ambitoHduIds: readonly string[] | null;
}

export abstract class EjecucionRepositorio {
  /**
   * En una transacción: cierra como `INTERRUMPIDA` las `EN_CURSO` de hace más de `enCursoMaxMs` (contadores desde el
   * detalle) e inserta la nueva `EN_CURSO`. @throws IntegracionEnCurso si ya hay otra activa.
   */
  abstract iniciar(datos: DatosInicioEjecucion, enCursoMaxMs: number): Promise<Ejecucion>;
  /** Solo inserción; el disparador rechaza filas de una ejecución cerrada. */
  abstract agregarDetalle(ejecucionId: string, filas: readonly FilaDetalle[]): Promise<void>;
  /** Cierra una sola vez; el disparador rechaza cualquier cambio posterior. */
  abstract cerrar(ejecucionId: string, cierre: DatosCierreEjecucion): Promise<Ejecucion>;
  /** Cierra como `INTERRUMPIDA` una ejecución abierta a la que le pasó algo inesperado (contadores desde el detalle). */
  abstract interrumpir(ejecucionId: string, terminadaEn: Date, duracionMs: number): Promise<void>;
  abstract obtener(id: string): Promise<Ejecucion | null>;
  abstract listar(filtro: FiltroEjecuciones, pagina: number, tamanoPagina: number): Promise<Pagina<Ejecucion>>;
  abstract listarDetalle(
    ejecucionId: string,
    filtro: FiltroDetalle,
    pagina: number,
    tamanoPagina: number,
  ): Promise<{ items: FilaDetalle[]; total: number; ocultas: number }>;
  abstract estado(): Promise<{ ultima: Ejecucion | null; ultimaCompletada: Ejecucion | null; ultimaJira: Ejecucion | null; enCurso: Ejecucion | null }>;
}

// ------------------------------------------------------------------ frontera con Jira y archivos (q360-integraciones)
/** Convierte una issue de Jira en una fila lista para Organización (D101, sección 5.1). Puro. */
export abstract class MapeadorIssues {
  abstract mapear(issue: IssueJira, contexto: { fila: number; sitio: string }): FilaMapeada;
}

export type ResultadoLectura =
  | { readonly ok: false; readonly codigo: CodigoErrorArchivo; readonly columnasFaltantes: Array<'codigo' | 'titulo'> }
  | { readonly ok: true; readonly filas: FilaMapeada[]; readonly columnasIgnoradas: string[] };

/** Lee y valida un CSV o JSON (D102, sección 5.2). Puro: nunca ve la base ni la red. */
export abstract class LectorArchivo {
  abstract leer(formato: 'CSV' | 'JSON', contenido: string): ResultadoLectura;
}

export abstract class Reloj {
  abstract ahora(): Date;
}
