/**
 * Punto único de enlace con la frontera de q360-integraciones: el cliente HTTP de Jira (`FuenteJira`), el mapeo de
 * issues y el lector de CSV/JSON. Los casos de uso solo conocen los puertos de `aplicacion/puertos.ts`; aquí se
 * adaptan las piezas reales a esos puertos.
 */
import type { LectorArchivo, MapeadorIssues, ResultadoLectura } from './aplicacion/puertos.js';
import type { ConfiguracionIntegraciones } from './configuracion.js';
import { mapearIssue } from './dominio/mapeo/issue.js';
import { ErrorEstructuraArchivo } from './dominio/mapeo/tipos.js';
import type { AutorizadorAtlassian } from './dominio/puertos/autorizador-atlassian.js';
import type { FuenteJira } from './dominio/puertos/fuente-jira.js';
import { leerArchivo } from './infraestructura/archivos/lector-archivo.js';
import { ClienteAtlassianHttp } from './infraestructura/atlassian/cliente-atlassian-http.js';
import { ClienteJiraHttp } from './infraestructura/jira/cliente-jira-http.js';

export function crearFuenteJira(configuracion: ConfiguracionIntegraciones): FuenteJira {
  // `permitirHostPrueba` ya es `false` con NODE_ENV=production (D95): lo fija la configuración.
  return new ClienteJiraHttp({
    permitirHostPrueba: configuracion.permitirHostPrueba,
    tamanoPagina: configuracion.jiraTamanoPagina,
    urlApiOauth: configuracion.oauth.urlApi,
  });
}

/**
 * El cliente de Atlassian para OAuth. Sin las tres credenciales de la app (D216) no hay con qué armarlo: los casos de uso
 * responden 503 `JIRA_OAUTH_NO_CONFIGURADO` antes de llegar aquí, y este reemplazo nunca sale a la red.
 */
export function crearAutorizador(configuracion: ConfiguracionIntegraciones): AutorizadorAtlassian {
  const { clientId, clientSecret, redirectUri } = configuracion.oauth;
  if (clientId === null || clientSecret === null || redirectUri === null) {
    const caido = async () => ({ ok: false as const, fallo: 'NO_DISPONIBLE' as const });
    return { canjear: caido, renovar: caido, sitios: caido };
  }
  return new ClienteAtlassianHttp({
    clientId,
    clientSecret,
    redirectUri,
    urlAutorizacion: configuracion.oauth.urlAutorizacion,
    urlApi: configuracion.oauth.urlApi,
    permitirHostPrueba: configuracion.permitirHostPrueba,
  });
}

export function crearMapeador(): MapeadorIssues {
  return { mapear: (issue, contexto) => mapearIssue(issue, contexto.fila, contexto.sitio) };
}

export function crearLector(): LectorArchivo {
  return {
    leer(formato, contenido): ResultadoLectura {
      try {
        const leido = leerArchivo({ formato, contenido });
        return { ok: true, filas: leido.filas, columnasIgnoradas: leido.columnasIgnoradas };
      } catch (error) {
        if (!(error instanceof ErrorEstructuraArchivo)) throw error;
        // El servicio ya comprobó tamaño y formato antes de llamar; aquí solo llegan los de estructura.
        return {
          ok: false,
          codigo: error.codigo as Exclude<typeof error.codigo, 'ARCHIVO_MUY_GRANDE'>,
          columnasFaltantes: error.columnasFaltantes.filter((c): c is 'codigo' | 'titulo' => c === 'codigo' || c === 'titulo'),
        };
      }
    },
  };
}
