/**
 * Puertos de la aplicación: lo que los casos de uso necesitan de afuera. Las implementaciones viven en
 * `infraestructura` (Prisma, HTTP hacia Organización, cifrado) o en la frontera con Jira y archivos
 * (q360-integraciones: `FuenteJira`, mapeo y lector de archivos). Las clases abstractas sirven de token de inyección.
 */
import type { FuenteJira } from '../dominio/puertos/fuente-jira.js';
import type { ErrorValidacion, ValidacionAsignacion } from '../dominio/consulta/asignacion.js';
import type { HduExistente } from '../dominio/consulta/clasificacion.js';
import type { CampoAsignacion, Consulta, ConteosFilas, EstadoConsulta, GrupoConsulta, ItemConsulta, Persona } from '../dominio/consulta/tipos.js';
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
  FaseEjecucion,
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

/** Modo archivo (E5): `destino` y `sprintNoEncontrado` obligatorios. */
export interface SolicitudUpsert {
  readonly origen: OrigenEjecucion;
  readonly soloSimular: boolean;
  readonly vincularExistentes: boolean;
  readonly estricto: boolean;
  readonly destino: DestinoHdu;
  readonly sprintNoEncontrado: 'RESPALDO' | 'ERROR';
  readonly filas: readonly FilaUpsert[];
}

export interface AsignacionUpsert {
  readonly celulaId: string;
  readonly qeResponsableId: string;
  readonly analistaId: string;
  readonly sprintId: string;
}

export interface FilaUpsertConfirmacion extends FilaUpsert {
  readonly operacion: 'CREAR' | 'ACTUALIZAR';
  /** Solo en `CREAR`. */
  readonly asignacion?: AsignacionUpsert;
}

/** Modo confirmación (D140, D151): la consulta que se confirma y, por fila, su operación. */
export interface SolicitudConfirmacionUpsert {
  readonly origen: 'JIRA';
  readonly consultaId: string;
  readonly filas: readonly FilaUpsertConfirmacion[];
}

export interface ResultadoFilaUpsert {
  readonly fila: number;
  readonly codigo: string;
  readonly resultado: ResultadoFila;
  readonly motivo: MotivoFila | null;
  readonly idHistoria: string | null;
  readonly advertencias: AdvertenciaFila[];
  readonly cambios: CambiosHdu | null;
  /** Solo con `ASIGNACION_INVALIDA` (D140). */
  readonly errorAsignacion?: ErrorValidacion;
}

export interface ResultadoUpsert {
  readonly simulado: boolean;
  readonly filas: ResultadoFilaUpsert[];
}

/** Una combinación a validar (`AsignacionAValidar`): los campos ausentes no se validan. */
export interface AsignacionAValidar {
  readonly ref: string;
  readonly celulaId?: string;
  readonly qeResponsableId?: string;
  readonly analistaId?: string;
  readonly sprintId?: string;
  readonly proponerSprint?: { readonly nombreJira: string | null; readonly respaldoId: string | null };
}

export interface AsignacionValidadaConRef extends ValidacionAsignacion {
  readonly ref: string;
}

export interface SugerenciaDestino {
  readonly celula: { id: string; nombre: string } | null;
  readonly qe: Persona | null;
  readonly sprintRespaldo: { id: string; nombre: string } | null;
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
  abstract upsert(solicitud: SolicitudUpsert | SolicitudConfirmacionUpsert, contexto: ContextoSolicitud, limiteMs: number): Promise<ResultadoUpsert>;
  /** `hdu/estado-codigos` en lotes de 100 (D136): lectura. Uno por código pedido, en el mismo orden; `null` si no existe. */
  abstract estadoCodigos(codigos: readonly string[], contexto: ContextoSolicitud, limiteMs: number): Promise<Array<HduExistente | null>>;
  /** `asignaciones/validar` en lotes de 100 (D138): lectura. Uno por combinación, en el mismo orden. */
  abstract validarAsignaciones(asignaciones: readonly AsignacionAValidar[], contexto: ContextoSolicitud, limiteMs: number): Promise<AsignacionValidadaConRef[]>;
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
  /** Por defecto `DIRECTA` (archivos). `CONSULTA` y `CONFIRMACION` son siempre de origen Jira (D141). */
  readonly fase?: FaseEjecucion;
  readonly consultaId?: string | null;
}

export interface DatosCierreEjecucion extends Contadores {
  /** Solo fase `CONSULTA`: filas de la tanda por grupo (D141). */
  readonly nuevas?: number;
  readonly cambiaron?: number;
  readonly sinCambios?: number;
  /** La primera tanda de una consulta se registra antes de que la consulta exista: se fija una sola vez al cerrar. */
  readonly consultaId?: string | null;
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
  readonly fase?: FaseEjecucion;
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
  abstract estado(): Promise<{ ultima: Ejecucion | null; ultimaCompletada: Ejecucion | null; enCurso: Ejecucion | null }>;
}

// ------------------------------------------------------------------ consulta de Jira (D133-D141)
export interface DatosFilaNueva {
  readonly posicion: number;
  readonly grupo: GrupoConsulta;
  readonly codigo: string | null;
  readonly titulo: string | null;
  readonly descripcion: string | null;
  readonly prioridad: string | null;
  readonly sprintJira: string | null;
  readonly referencia: { estado: string | null; responsable: string | null } | null;
  readonly advertencias: AdvertenciaFila[];
  readonly motivo: MotivoFila | null;
  readonly existente: HduExistente | null;
  readonly cambios: ItemConsulta['cambios'];
}

export interface DatosNuevaConsulta {
  readonly creadaPor: Persona;
  readonly creadaEn: Date;
  readonly proyecto: string;
  readonly sitioHost: string;
  readonly sugerencia: {
    readonly celulaId: string;
    readonly celulaNombre: string | null;
    readonly qeId: string;
    readonly qeNombre: string | null;
    readonly sprintRespaldoId: string;
    readonly sprintRespaldoNombre: string | null;
  };
}

/** Todo lo que se guarda de una tanda, en UNA transacción junto con el cierre de su ejecución (IC3). */
export interface DatosTanda {
  readonly ejecucionId: string;
  readonly cierre: DatosCierreEjecucion;
  /** `null`: crea la consulta. Con id: acumula en esa consulta. */
  readonly consultaId: string | null;
  readonly nueva: DatosNuevaConsulta | null;
  /** La consulta abierta que esta tanda reemplaza (se cierra `REEMPLAZADA` y se purga en la misma transacción). */
  readonly reemplaza: { readonly id: string; readonly por: Persona; readonly en: Date } | null;
  readonly filas: readonly DatosFilaNueva[];
  readonly venceEn: Date;
  readonly hayMas: boolean;
  readonly continuarDesde: string | null;
}

export interface DatosCierreConsulta {
  readonly estado: Exclude<EstadoConsulta, 'ABIERTA'>;
  readonly en: Date;
  readonly por: Persona | null;
  readonly descartadas?: number;
}

export interface EdicionDeFila {
  readonly itemId: string;
  readonly asignacion: ItemConsulta['asignacion'];
  readonly avisoSinLider: boolean;
  readonly marcada: boolean;
  readonly advertencias: AdvertenciaFila[];
  readonly asignadoPor: Persona | null;
  readonly asignadoEn: Date | null;
}

export interface FiltroItems {
  readonly grupo: GrupoConsulta;
  readonly q?: string;
}

export abstract class ConsultaRepositorio {
  /** La consulta `ABIERTA` (puede haber pasado `venceEn`), o `null`. */
  abstract obtenerAbierta(): Promise<Consulta | null>;
  abstract obtener(id: string): Promise<Consulta | null>;
  /** La más reciente que no está abierta. */
  abstract ultimaCerrada(): Promise<Consulta | null>;
  abstract conteos(id: string): Promise<ConteosFilas>;
  /** Códigos (en mayúsculas) ya guardados en la consulta: gana la primera lectura (D135). */
  abstract codigosGuardados(id: string): Promise<Set<string>>;
  /** Guarda la tanda y cierra su ejecución. @throws ConsultaAbiertaDuplicada si otra se abrió mientras tanto. */
  abstract guardarTanda(datos: DatosTanda): Promise<Consulta>;
  /** Cierra una consulta abierta, purga sus filas y sube `version`. Devuelve `null` si ya no estaba abierta. */
  abstract cerrar(id: string, cierre: DatosCierreConsulta): Promise<Consulta | null>;
  abstract listarItems(consultaId: string, filtro: FiltroItems, pagina: number, tamanoPagina: number): Promise<{ items: ItemConsulta[]; total: number }>;
  abstract obtenerItems(consultaId: string, itemIds: readonly string[]): Promise<ItemConsulta[]>;
  abstract itemsDeGrupo(consultaId: string, grupo: GrupoConsulta, q?: string): Promise<ItemConsulta[]>;
  /** Todas las filas marcadas sin aplicar (para confirmar). */
  abstract itemsMarcadosPendientes(consultaId: string): Promise<ItemConsulta[]>;
  /**
   * Guarda las ediciones y sube `version` en 1, en una transacción con `WHERE estado = 'ABIERTA' AND vence_en > now()`.
   * Devuelve la `version` nueva, o `null` si la consulta dejó de estar abierta o vigente.
   */
  /**
   * Ejecuta `accion` con las filas dadas bloqueadas (`SELECT ... FOR UPDATE`, en orden estable por id para evitar
   * interbloqueos). Quien espera el bloqueo lee, al entrar, el estado ya confirmado por el anterior (DEF-E5C-01).
   */
  abstract conFilasBloqueadas<T>(consultaId: string, itemIds: readonly string[], accion: () => Promise<T>): Promise<T>;
  abstract guardarEdiciones(consultaId: string, ediciones: readonly EdicionDeFila[], ahora: Date): Promise<number | null>;
  /** Desmarca las filas dadas y sube `version` (pre-validación fallida de la confirmación). Devuelve la versión nueva. */
  abstract desmarcar(consultaId: string, itemIds: readonly string[]): Promise<number | null>;
  /**
   * Inicia la confirmación: en UNA transacción bloquea la fila de la consulta (\`SELECT ... FOR UPDATE\`), comprueba que
   * siga abierta, vigente y en la \`version\` vista, e inserta la ejecución \`CONFIRMACION\` (el índice de \`en curso\` hace
   * que dos confirmaciones simultáneas sean una sola). @throws IntegracionEnCurso
   */
  abstract iniciarConfirmacion(
    consultaId: string,
    version: number,
    datos: DatosInicioEjecucion,
    enCursoMaxMs: number,
  ): Promise<{ tipo: 'OK'; ejecucion: Ejecucion } | { tipo: 'NO_ENCONTRADA' } | { tipo: 'CERRADA' | 'MODIFICADA'; consulta: Consulta }>;
  /** Cierra la ejecución; con \`cierreConsulta\` además cierra la consulta (\`CONFIRMADA\`), purga sus filas y cuenta las descartadas. */
  abstract cerrarConfirmacion(
    consultaId: string,
    ejecucionId: string,
    cierre: DatosCierreEjecucion,
    cierreConsulta: DatosCierreConsulta | null,
  ): Promise<{ consulta: Consulta; ejecucion: Ejecucion }>;
  /** Marca las filas como aplicadas, sube `version` y guarda el detalle de la ejecución, todo junto (por lote). */
  abstract aplicarLote(consultaId: string, itemIds: readonly string[], ejecucionId: string, detalle: readonly FilaDetalle[]): Promise<void>;
}

export type { CampoAsignacion, ConteosFilas };

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
