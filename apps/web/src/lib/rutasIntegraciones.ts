/** Rutas de las pestañas del Administrador en «Integraciones» (E5). */
export const RUTAS_INTEGRACIONES = {
  conexion: "/admin/integraciones",
  sincronizar: "/admin/integraciones/sincronizar",
  importar: "/admin/integraciones/importar",
  historial: "/admin/integraciones/historial",
} as const;

/** Ruta a la que Atlassian devuelve al Administrador (D210). Debe coincidir letra por letra con la `redirect_uri` del servidor. */
export const RUTA_RETORNO_OAUTH = "/admin/integraciones/jira/oauth/retorno";
