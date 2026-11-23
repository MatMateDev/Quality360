/**
 * Permisos (scopes) de OAuth 2.0 (3LO) de Atlassian (D218). Solo lectura: nunca se pide un permiso de escritura. La lista
 * vive aquí, en una constante, porque E5-MAN-02 puede obligar a pasar a scopes granulares (el contrato no la fija).
 */
export const PERMISO_LEER_TRABAJO = 'read:jira-work';
export const PERMISO_LEER_USUARIO = 'read:jira-user';
export const PERMISO_RENOVAR = 'offline_access';

/** Los que se piden al autorizar, en este orden. */
export const PERMISOS_REQUERIDOS: readonly string[] = [PERMISO_LEER_TRABAJO, PERMISO_LEER_USUARIO, PERMISO_RENOVAR];

/** Los que debe traer cada sitio de `accessible-resources`: `offline_access` no es un permiso de un sitio. */
export const PERMISOS_REQUERIDOS_POR_SITIO: readonly string[] = PERMISOS_REQUERIDOS.filter((p) => p !== PERMISO_RENOVAR);

/** Las llamadas a Jira que hace el servicio (tabla «Permisos por endpoint» de D218). */
export type EndpointJira = 'myself' | 'project' | 'field' | 'search';

export const PERMISOS_POR_ENDPOINT: Readonly<Record<EndpointJira, readonly string[]>> = {
  myself: [PERMISO_LEER_USUARIO],
  project: [PERMISO_LEER_TRABAJO],
  field: [PERMISO_LEER_TRABAJO],
  search: [PERMISO_LEER_TRABAJO],
};

/** El endpoint que corresponde a una ruta de la API REST de Jira, o `null` si no es una de las cuatro del servicio. */
export function endpointDeRuta(ruta: string): EndpointJira | null {
  if (ruta === '/rest/api/3/myself') return 'myself';
  if (ruta === '/rest/api/3/field') return 'field';
  if (ruta === '/rest/api/3/search/jql') return 'search';
  if (ruta.startsWith('/rest/api/3/project/')) return 'project';
  return null;
}

/** Los permisos concedidos como los entrega Atlassian (separados por espacio) o como los guarda el servicio. */
export function parsearPermisos(texto: string | null | undefined): string[] {
  if (texto === null || texto === undefined) return [];
  const vistos = new Set<string>();
  for (const parte of texto.split(/\s+/)) if (parte.length > 0) vistos.add(parte);
  return [...vistos];
}

export function unirPermisos(permisos: readonly string[]): string {
  return permisos.join(' ');
}

/** Lo que falta de `requeridos` en `concedidos`, en el orden en que se piden. */
export function permisosFaltantes(concedidos: readonly string[], requeridos: readonly string[] = PERMISOS_REQUERIDOS): string[] {
  const tiene = new Set(concedidos);
  return requeridos.filter((permiso) => !tiene.has(permiso));
}
