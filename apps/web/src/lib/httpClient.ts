import { env } from "./env";
import { obtenerAccessToken, limpiarSesion } from "@/auth/sessionStore";
import type { components } from "@contracts/gateway.v1";

export type ErrorApiCuerpo = components["schemas"]["Error"];

/** Error tipado lanzado por `solicitar` para cualquier respuesta no exitosa (D · comun.v1.yaml). */
export class ErrorApi extends Error {
  readonly status: number;
  readonly codigo: string;
  /** Texto para mostrar al usuario (alias en español de `message`). */
  readonly mensaje: string;
  readonly detalles: ErrorApiCuerpo["detalles"];
  readonly traceId?: string;
  readonly cuerpo: unknown;

  constructor(status: number, cuerpo: Partial<ErrorApiCuerpo> | undefined) {
    const mensaje = cuerpo?.mensaje ?? "Ocurrió un error inesperado.";
    super(mensaje);
    this.status = status;
    this.codigo = cuerpo?.codigo ?? "ERROR_INTERNO";
    this.mensaje = mensaje;
    this.detalles = cuerpo?.detalles ?? [];
    this.traceId = cuerpo?.traceId;
    this.cuerpo = cuerpo;
  }
}

type Opciones = Omit<RequestInit, "body"> & { body?: unknown };

let manejadorSesionExpirada: (() => void) | null = null;

/** El contexto de autenticación registra aquí qué hacer ante un 401 `SESION_EXPIRADA`. */
export function registrarManejadorSesionExpirada(manejador: (() => void) | null): void {
  manejadorSesionExpirada = manejador;
}

/** Cliente HTTP único: agrega `Authorization: Bearer` y reacciona a `SESION_EXPIRADA` (D6). */
export async function solicitar<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const token = obtenerAccessToken();
  const encabezados = new Headers(opciones.headers);
  if (!encabezados.has("Content-Type") && opciones.body !== undefined) {
    encabezados.set("Content-Type", "application/json");
  }
  if (token) {
    encabezados.set("Authorization", `Bearer ${token}`);
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${env.gatewayUrl}${ruta}`, {
      ...opciones,
      headers: encabezados,
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new ErrorApi(503, {
      codigo: "SERVICIO_NO_DISPONIBLE",
      mensaje: "El servicio no está disponible. Intenta nuevamente.",
      traceId: "",
      detalles: [],
    });
  }

  if (respuesta.status === 204) {
    return undefined as T;
  }

  const texto = await respuesta.text();
  const cuerpo = texto ? (JSON.parse(texto) as unknown) : undefined;

  if (!respuesta.ok) {
    const error = new ErrorApi(respuesta.status, cuerpo as Partial<ErrorApiCuerpo>);
    if (respuesta.status === 401 && error.codigo === "SESION_EXPIRADA") {
      limpiarSesion();
      manejadorSesionExpirada?.();
    }
    throw error;
  }

  return cuerpo as T;
}

export const http = {
  get: <T>(ruta: string, opciones?: Opciones) => solicitar<T>(ruta, { ...opciones, method: "GET" }),
  post: <T>(ruta: string, body?: unknown, opciones?: Opciones) =>
    solicitar<T>(ruta, { ...opciones, method: "POST", body }),
  put: <T>(ruta: string, body?: unknown, opciones?: Opciones) =>
    solicitar<T>(ruta, { ...opciones, method: "PUT", body }),
  patch: <T>(ruta: string, body?: unknown, opciones?: Opciones) =>
    solicitar<T>(ruta, { ...opciones, method: "PATCH", body }),
};
