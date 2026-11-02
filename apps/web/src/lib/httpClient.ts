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

let manejadorAccesoDenegado: (() => void) | null = null;

/** El contexto registra aquí la reconsulta de `/v1/me` ante un 403 (el rol pudo cambiar, E7-F01-T07). */
export function registrarManejadorAccesoDenegado(manejador: (() => void) | null): void {
  manejadorAccesoDenegado = manejador;
}

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
  let cuerpo: unknown;
  try {
    cuerpo = texto ? (JSON.parse(texto) as unknown) : undefined;
  } catch (error) {
    // Un error del proxy (502/504 con HTML) no trae JSON: sigue siendo un `ErrorApi` con su estado (E5, D115).
    if (respuesta.ok) throw error;
    cuerpo = undefined;
  }

  if (!respuesta.ok) {
    const error = new ErrorApi(respuesta.status, cuerpo as Partial<ErrorApiCuerpo>);
    if (respuesta.status === 401 && error.codigo === "SESION_EXPIRADA") {
      limpiarSesion();
      manejadorSesionExpirada?.();
    }
    if (respuesta.status === 403 && ruta !== "/v1/me") manejadorAccesoDenegado?.();
    throw error;
  }

  return cuerpo as T;
}

export interface ArchivoDescargado {
  blob: Blob;
  /** Cabecera `X-Q360-Filas` (cantidad de filas exportadas), si viene. */
  filas: number | null;
  /** Nombre sugerido por `Content-Disposition`, si viene. */
  nombre: string | null;
}

/** Descarga autenticada (CSV del Auditor): mismo Bearer y mismo manejo de errores, pero devuelve un `Blob`. */
export async function descargar(ruta: string): Promise<ArchivoDescargado> {
  const token = obtenerAccessToken();
  const encabezados = new Headers();
  if (token) encabezados.set("Authorization", `Bearer ${token}`);
  let respuesta: Response;
  try {
    respuesta = await fetch(`${env.gatewayUrl}${ruta}`, { headers: encabezados });
  } catch {
    throw new ErrorApi(503, {
      codigo: "SERVICIO_NO_DISPONIBLE",
      mensaje: "El servicio no está disponible. Intenta nuevamente.",
      traceId: "",
      detalles: [],
    });
  }
  if (!respuesta.ok) {
    const texto = await respuesta.text();
    let cuerpo: Partial<ErrorApiCuerpo> | undefined;
    try {
      cuerpo = texto ? (JSON.parse(texto) as Partial<ErrorApiCuerpo>) : undefined;
    } catch {
      cuerpo = undefined;
    }
    const error = new ErrorApi(respuesta.status, cuerpo);
    if (respuesta.status === 401 && error.codigo === "SESION_EXPIRADA") {
      limpiarSesion();
      manejadorSesionExpirada?.();
    }
    if (respuesta.status === 403) manejadorAccesoDenegado?.();
    throw error;
  }
  const cabeceraFilas = respuesta.headers.get("X-Q360-Filas");
  const disposicion = respuesta.headers.get("Content-Disposition") ?? "";
  return {
    blob: await respuesta.blob(),
    filas: cabeceraFilas !== null && Number.isFinite(Number(cabeceraFilas)) ? Number(cabeceraFilas) : null,
    nombre: /filename="?([^";]+)"?/i.exec(disposicion)?.[1] ?? null,
  };
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
