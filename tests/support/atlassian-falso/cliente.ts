import type { ModoAtlassian, ResumenSolicitudes } from "./servidor";

/** Cliente del control del Atlassian falso (puerto 4011). Dueño: q360-qa. */
export const ATLASSIAN_FALSO = process.env.ATLASSIAN_FALSO_URL ?? "http://127.0.0.1:4011";

export interface ResultadoAutorizacion {
  /** Estado HTTP de `/authorize`: 302 si redirigió (con `code` o `error`), 400 si rechazó el pedido sin redirigir. */
  estado: number;
  code?: string;
  state?: string;
  error?: string;
  /** Dirección completa de retorno (contiene `code` y `state`: no registrarla). */
  location?: string;
}

/** Cliente del falso en `base` (las pruebas propias del falso usan otro puerto); `atlassianFalso` apunta al de la corrida (:4011). */
export function crearClienteAtlassianFalso(base: string) {
  async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<any> {
    const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    if (!r.ok) throw new Error(`Atlassian falso ${metodo} ${ruta}: ${r.status}`);
    return r.json();
  }
  return {
    /** Cambia opciones: `modo`, `expiresIn` (segundos; `null` lo restablece), `avanzarSegundos` (adelanta el reloj del falso) y `estadoProyecto` (404 o 403). */
    control: (c: { modo?: ModoAtlassian; expiresIn?: number | null; avanzarSegundos?: number; estadoProyecto?: 403 | 404 }) => pedir("POST", "/__control", c),
    modo: (modo: ModoAtlassian) => pedir("POST", "/__control", { modo }),
    /** Restablece modo, tokens, códigos, contadores, reloj y solicitudes. */
    reset: () => pedir("POST", "/__reset"),
    /** Método, ruta (sin query), estado HTTP, si el Bearer era válido y contadores. Nunca valores de tokens ni del secreto. */
    solicitudes: (): Promise<ResumenSolicitudes> => pedir("GET", "/__solicitudes"),
    /** Renovaciones exitosas hasta ahora. */
    renovaciones: async (): Promise<number> => (await pedir("GET", "/__solicitudes")).renovaciones,
    /** ¿Filtra `texto` algún `code`, `state`, token o el secreto que el falso emitió o vio? Devuelve solo las clases halladas, p. ej. `["token-acceso"]`. */
    fugas: async (texto: string): Promise<string[]> => (await pedir("POST", "/__fugas", { texto })).fugas,
    /**
     * Hace de navegador: abre la `urlAutorizacion` que devolvió `oauth/iniciar` (consentimiento automático) sin seguir la redirección y
     * devuelve lo que Atlassian mandaría al portal. Falla si la URL no apunta al falso (el servidor no tiene los hosts de prueba).
     */
    autorizar: async (urlAutorizacion: string): Promise<ResultadoAutorizacion> => {
      const u = new URL(urlAutorizacion);
      if (u.origin !== new URL(base).origin) throw new Error(`La urlAutorizacion no apunta al Atlassian falso (${u.origin}): ¿faltan JIRA_OAUTH_URL_AUTORIZACION e INTEGRACIONES_PERMITIR_HOST_PRUEBA en Integraciones?`);
      const r = await fetch(u, { redirect: "manual" });
      const location = r.headers.get("location") ?? undefined;
      if (!location) return { estado: r.status };
      const d = new URL(location);
      return {
        estado: r.status,
        code: d.searchParams.get("code") ?? undefined,
        state: d.searchParams.get("state") ?? undefined,
        error: d.searchParams.get("error") ?? undefined,
        location,
      };
    },
  };
}

export const atlassianFalso = crearClienteAtlassianFalso(ATLASSIAN_FALSO);
