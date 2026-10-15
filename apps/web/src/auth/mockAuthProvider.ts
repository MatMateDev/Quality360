import { buscarUsuarioPorCorreo, usuarios } from "@/mocks/data";
import { PREFIJO_TOKEN_MOCK } from "@/mocks/utils";
import {
  ErrorAcceso,
  ErrorRecuperacion,
  interpretarEnlaceRecuperacion,
  type EnlaceRecuperacion,
  type ResultadoEnlace,
  type TipoErrorAcceso,
  type TipoErrorRecuperacion,
} from "./errorAcceso";
import { establecerSesion, limpiarSesion } from "./sessionStore";

/**
 * Qué falla o cuánto tarda el proveedor simulado. Solo lo usan las pruebas unitarias; el valor por
 * defecto es el comportamiento normal (credenciales de `mocks/data.ts`, enlace de recuperación válido).
 */
export interface SimulacionMock {
  /** Hace que `iniciarSesionMock` falle con este tipo aunque las credenciales sean correctas. */
  errorAcceso: TipoErrorAcceso | null;
  /** Hace que `solicitarRecuperacionMock` falle (límite de intentos o servicio caído). */
  errorSolicitudRecuperacion: Extract<TipoErrorAcceso, "DEMASIADOS_INTENTOS" | "SERVICIO_NO_DISPONIBLE"> | null;
  /** Hace que `actualizarContrasenaMock` falle con este tipo. */
  errorActualizacion: TipoErrorRecuperacion | null;
  /** Si es `"vencido"`, no hay sesión de recuperación (enlace vencido, ya usado o ausente). */
  enlaceRecuperacion: "valido" | "vencido";
  /** Retiene el login o la recuperación hasta que la promesa se resuelva (para observar «ingresando»). */
  compuerta: Promise<void> | null;
}

const SIMULACION_INICIAL: SimulacionMock = {
  errorAcceso: null,
  errorSolicitudRecuperacion: null,
  errorActualizacion: null,
  enlaceRecuperacion: "valido",
  compuerta: null,
};

let simulacion: SimulacionMock = { ...SIMULACION_INICIAL };
let solicitudesRecuperacion: string[] = [];
let contrasenasActualizadas: string[] = [];
let cierresGlobales = 0;
let cierresLocales = 0;

export function simularAccesoMock(parcial: Partial<SimulacionMock>): void {
  simulacion = { ...simulacion, ...parcial };
}

export function reiniciarSimulacionMock(): void {
  simulacion = { ...SIMULACION_INICIAL };
  solicitudesRecuperacion = [];
  contrasenasActualizadas = [];
  cierresGlobales = 0;
  cierresLocales = 0;
}

/** Correos para los que se pidió un enlace de recuperación desde el último reinicio. */
export function solicitudesRecuperacionMock(): readonly string[] {
  return solicitudesRecuperacion;
}

/** Contraseñas fijadas con `updateUser` desde el último reinicio. */
export function contrasenasActualizadasMock(): readonly string[] {
  return contrasenasActualizadas;
}

/** Cuántos cierres de sesión pidió el portal desde el último reinicio: globales (todos los dispositivos) y locales. */
export function cierresDeSesionMock(): { globales: number; locales: number } {
  return { globales: cierresGlobales, locales: cierresLocales };
}

/** Login simulado (VITE_USAR_MOCKS=true): valida contra los usuarios de `mocks/data.ts`, sin Supabase. */
export async function iniciarSesionMock(correo: string, contrasena: string): Promise<void> {
  await simulacion.compuerta;
  if (simulacion.errorAcceso) throw new ErrorAcceso(simulacion.errorAcceso);

  const usuario = buscarUsuarioPorCorreo(correo);
  if (!usuario || usuario.contrasena !== contrasena) {
    throw new ErrorAcceso("CREDENCIALES");
  }
  establecerSesion({ accessToken: `${PREFIJO_TOKEN_MOCK}${usuario.id}` });
}

export async function cerrarSesionMock(): Promise<void> {
  cierresGlobales += 1;
  limpiarSesion();
}

/** Cierre solo local (equivale a `signOut({ scope: "local" })`): no cierra las sesiones de otros dispositivos. */
export async function cerrarSesionLocalMock(): Promise<void> {
  cierresLocales += 1;
  limpiarSesion();
}

// --------------------------------------------------------------------------- RECUPERACION (E1-F13, E1-B13)

/** Responde siempre igual (no revela si el correo existe), salvo que se simule un fallo. */
export async function solicitarRecuperacionMock(correo: string): Promise<void> {
  await simulacion.compuerta;
  if (simulacion.errorSolicitudRecuperacion) throw new ErrorAcceso(simulacion.errorSolicitudRecuperacion);
  solicitudesRecuperacion.push(correo);
}

/** Sin hash que limpiar en el modo simulado: solo interpreta la URL. */
export function leerEnlaceRecuperacionMock(): EnlaceRecuperacion {
  return interpretarEnlaceRecuperacion(window.location.hash, window.location.search);
}

/**
 * Como supabase-js al abrir el enlace del correo, un enlace válido deja una sesión REAL de recuperación
 * (aquí, un token mock del primer usuario). Así las pruebas comprueban que `AuthContext` no la usa
 * para llamar a `/v1/me` ni para llevar al portal.
 */
export function verificarEnlaceRecuperacionMock(
  _enlace: EnlaceRecuperacion,
  alResolver: (resultado: ResultadoEnlace) => void,
): () => void {
  let activo = true;
  void Promise.resolve(simulacion.compuerta).then(() => {
    if (!activo) return;
    if (simulacion.enlaceRecuperacion === "vencido") {
      alResolver("ENLACE_INVALIDO");
      return;
    }
    establecerSesion({ accessToken: `${PREFIJO_TOKEN_MOCK}${usuarios[0]?.id ?? "recuperacion"}` });
    alResolver("LISTA");
  });
  return () => {
    activo = false;
  };
}

export async function actualizarContrasenaMock(contrasena: string): Promise<void> {
  await simulacion.compuerta;
  if (simulacion.errorActualizacion) throw new ErrorRecuperacion(simulacion.errorActualizacion);
  contrasenasActualizadas.push(contrasena);
}
