import type { APIRequestContext, APIResponse } from "@playwright/test";
import { env } from "./env";

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/**
 * Password grant directo contra Supabase Auth local (no pasa por el
 * gateway). El `apikey` es la clave pública de `apps/web/.env.local`.
 */
export async function iniciarSesion(correo: string, contrasena: string, supabaseUrl = env.supabaseUrl): Promise<Sesion> {
  const respuesta = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password: contrasena }),
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(`No fue posible iniciar sesión como ${correo}: ${respuesta.status} ${texto}`);
  }
  const datos = JSON.parse(texto) as { access_token: string; refresh_token: string; user: { id: string } };
  return { accessToken: datos.access_token, refreshToken: datos.refresh_token, userId: datos.user.id };
}

export interface RespuestaApi<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string>;
  traceId?: string;
}

interface OpcionesLlamada {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  baseURL?: string;
}

async function cuerpoJson(respuesta: APIResponse): Promise<unknown> {
  const texto = await respuesta.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/**
 * Llama al gateway (o a otra base, para las pruebas de fuente caída) con
 * reintento automático ante 429 `DEMASIADAS_SOLICITUDES` (límite de tasa del
 * gateway, no parte de los 96 escenarios certificados: reintentar evita que
 * la propia suite se autobloquee).
 */
export async function llamarApi<T = unknown>(
  request: APIRequestContext,
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  ruta: string,
  opciones: OpcionesLlamada = {},
): Promise<RespuestaApi<T>> {
  const base = opciones.baseURL ?? env.gatewayUrl;
  const url = `${base}${ruta}`;
  const headers: Record<string, string> = { ...(opciones.headers ?? {}) };
  if (opciones.token) headers.Authorization = `Bearer ${opciones.token}`;

  for (let intento = 1; ; intento += 1) {
    const respuesta = await request.fetch(url, {
      method: metodo,
      headers,
      data: opciones.body,
      failOnStatusCode: false,
    });
    if (respuesta.status() === 429 && intento < 5) {
      const reintentar = Number(respuesta.headers()["retry-after"] ?? "2");
      await new Promise((resolver) => setTimeout(resolver, (reintentar + 0.3) * 1000));
      continue;
    }
    const body = (await cuerpoJson(respuesta)) as T;
    const cabeceras = respuesta.headers();
    return { status: respuesta.status(), body, headers: cabeceras, traceId: cabeceras["x-trace-id"] };
  }
}

export const api = {
  get: <T = unknown>(request: APIRequestContext, ruta: string, opciones?: Omit<OpcionesLlamada, "body">) =>
    llamarApi<T>(request, "GET", ruta, opciones),
  post: <T = unknown>(request: APIRequestContext, ruta: string, opciones?: OpcionesLlamada) =>
    llamarApi<T>(request, "POST", ruta, opciones),
  put: <T = unknown>(request: APIRequestContext, ruta: string, opciones?: OpcionesLlamada) =>
    llamarApi<T>(request, "PUT", ruta, opciones),
  patch: <T = unknown>(request: APIRequestContext, ruta: string, opciones?: OpcionesLlamada) =>
    llamarApi<T>(request, "PATCH", ruta, opciones),
};
