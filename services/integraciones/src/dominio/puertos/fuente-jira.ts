/**
 * Puerto de la frontera con Jira Cloud (J0, plan E5). Interfaz FIJA: no se cambia sin avisar a
 * `q360-backend`, que la consume desde los casos de uso de configuración y sincronización.
 * Solo lectura. Ninguna operación devuelve el texto de un error de Jira (D105).
 *
 * Crece solo de forma ADITIVA (D196, ADR 0018): campos opcionales en `IssueJira` y `SprintJira`, `campoCriterios?` en la
 * consulta de `buscarPagina` y el método `detectarCampos()`. Ninguna firma existente cambia.
 */
export type CodigoErrorJira =
  | 'JIRA_CREDENCIAL_INVALIDA' | 'JIRA_SIN_PERMISO' | 'JIRA_SITIO_NO_ENCONTRADO'
  | 'JIRA_PROYECTO_NO_ENCONTRADO' | 'JIRA_LIMITE_DE_TASA' | 'JIRA_TIEMPO_AGOTADO'
  | 'JIRA_NO_DISPONIBLE' | 'JIRA_RESPUESTA_INVALIDA';
export interface CredencialJira { sitio: string; correo: string; token: string }
export interface OpcionesLlamada { tiempoLimiteMs: number; esperaMax429Ms: number; restanteMs: () => number }
export interface EventoEspera { tipo: 'JIRA_LIMITE_DE_TASA'; esperaMs: number; fecha: Date }
export type ResultadoJira<T> =
  | { ok: true; valor: T; eventos: EventoEspera[] }
  | { ok: false; codigo: CodigoErrorJira; eventos: EventoEspera[] };
export interface SprintJira {
  nombre: string; estado: 'active' | 'future' | 'closed'; fin: string | null;
  /** `startDate` del sprint en Jira (D196). Ausente o `null` si Jira no lo trae. */
  inicio?: string | null;
}
/** El padre de la issue (`parent`), solo lo que el detalle necesita (D196). */
export interface PadreJira { clave: string; titulo: string | null; esEpica: boolean }
export interface IssueJira {
  clave: string; tipo: string; titulo: string | null; descripcionAdf: unknown;
  prioridad: string | null; estado: string | null; responsable: string | null; sprints: SprintJira[];
  labels?: string[];
  /** Fechas tal como las entrega Jira (el dominio las valida y las lleva a ISO 8601). */
  creada?: string | null;
  actualizada?: string | null;
  vencimiento?: string | null;
  resolucion?: string | null;
  padre?: PadreJira | null;
  /** Valor del campo personalizado de criterios de aceptación (ADF o texto), si fue detectado (D199). */
  criteriosAdf?: unknown;
}
export interface PaginaJira { issues: IssueJira[]; nextPageToken: string | null; esUltima: boolean }
export interface CamposDetectados { sprint: string | null; criterios: string | null }
export interface FuenteJira {
  probar(c: CredencialJira, proyecto: string, o: OpcionesLlamada):
    Promise<ResultadoJira<{ usuarioJira: string; proyecto: { clave: string; nombre: string } }>>;
  detectarCampoSprint(c: CredencialJira, o: OpcionesLlamada): Promise<ResultadoJira<string | null>>;
  /** La MISMA llamada a `/field` que `detectarCampoSprint`: Sprint y Criterios de aceptación (D199). */
  detectarCampos(c: CredencialJira, o: OpcionesLlamada): Promise<ResultadoJira<CamposDetectados>>;
  buscarPagina(c: CredencialJira, q: { proyecto: string; tipos: string[]; despuesDe?: string;
    nextPageToken?: string; campoSprint: string | null; campoCriterios?: string | null }, o: OpcionesLlamada): Promise<ResultadoJira<PaginaJira>>;
}
