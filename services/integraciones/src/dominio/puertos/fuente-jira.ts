/**
 * Puerto de la frontera con Jira Cloud (J0, plan E5). Interfaz FIJA: no se cambia sin avisar a
 * `q360-backend`, que la consume desde los casos de uso de configuración y sincronización.
 * Solo lectura. Ninguna operación devuelve el texto de un error de Jira (D105).
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
export interface SprintJira { nombre: string; estado: 'active' | 'future' | 'closed'; fin: string | null }
export interface IssueJira {
  clave: string; tipo: string; titulo: string | null; descripcionAdf: unknown;
  prioridad: string | null; estado: string | null; responsable: string | null; sprints: SprintJira[];
}
export interface PaginaJira { issues: IssueJira[]; nextPageToken: string | null; esUltima: boolean }
export interface FuenteJira {
  probar(c: CredencialJira, proyecto: string, o: OpcionesLlamada):
    Promise<ResultadoJira<{ usuarioJira: string; proyecto: { clave: string; nombre: string } }>>;
  detectarCampoSprint(c: CredencialJira, o: OpcionesLlamada): Promise<ResultadoJira<string | null>>;
  buscarPagina(c: CredencialJira, q: { proyecto: string; tipos: string[]; despuesDe?: string;
    nextPageToken?: string; campoSprint: string | null }, o: OpcionesLlamada): Promise<ResultadoJira<PaginaJira>>;
}
