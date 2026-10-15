import { env } from "@/lib/env";
import type { EnlaceRecuperacion, ResultadoEnlace } from "./errorAcceso";
import {
  actualizarContrasenaMock,
  cerrarSesionLocalMock,
  cerrarSesionMock,
  iniciarSesionMock,
  leerEnlaceRecuperacionMock,
  solicitarRecuperacionMock,
  verificarEnlaceRecuperacionMock,
} from "./mockAuthProvider";
import {
  actualizarContrasenaSupabase,
  cerrarSesionLocalSupabase,
  cerrarSesionSupabase,
  iniciarSesionSupabase,
  inicializarSesionSupabase,
  leerEnlaceRecuperacionSupabase,
  solicitarRecuperacionSupabase,
  verificarEnlaceRecuperacionSupabase,
} from "./supabaseAuthProvider";

/** Único punto de entrada del login: elige el proveedor simulado o Supabase real según VITE_USAR_MOCKS. */
export async function iniciarSesion(correo: string, contrasena: string): Promise<void> {
  if (env.usarMocks) return iniciarSesionMock(correo, contrasena);
  return iniciarSesionSupabase(correo, contrasena);
}

export async function cerrarSesion(): Promise<void> {
  if (env.usarMocks) return cerrarSesionMock();
  return cerrarSesionSupabase();
}

/**
 * Cierra solo la sesión de este navegador: no revoca las del usuario en otros dispositivos. Para rechazos de
 * Organización (`/v1/me` 401/403) y para abandonar una recuperación.
 */
export async function cerrarSesionLocal(): Promise<void> {
  if (env.usarMocks) return cerrarSesionLocalMock();
  return cerrarSesionLocalSupabase();
}

/** Restaura la sesión existente al cargar la app. Devuelve una función de limpieza para el efecto que la invoca. */
export function inicializarSesion(alCambiar: () => void): () => void {
  if (env.usarMocks) {
    // El proveedor mock no persiste entre recargas: no hay sesión previa que restaurar.
    alCambiar();
    return () => {};
  }
  return inicializarSesionSupabase(alCambiar);
}

// --------------------------------------------------------------------------- RECUPERACION (E1-F13, E1-B13)

/** Pide el correo de recuperación. Lanza `ErrorAcceso` solo para límite de intentos o servicio caído. */
export async function solicitarRecuperacion(correo: string): Promise<void> {
  if (env.usarMocks) return solicitarRecuperacionMock(correo);
  return solicitarRecuperacionSupabase(correo);
}

/**
 * Lee el enlace del correo al abrir `/restablecer-contrasena`. Con Supabase real quita los tokens del hash de la URL
 * sin añadir una entrada de historial; debe llamarse antes de que se cree el cliente (primer render de la página).
 */
export function leerEnlaceRecuperacion(): EnlaceRecuperacion {
  if (env.usarMocks) return leerEnlaceRecuperacionMock();
  return leerEnlaceRecuperacionSupabase();
}

/** Comprueba que el enlace del correo dejó una sesión de recuperación. Devuelve la función que cancela la espera. */
export function verificarEnlaceRecuperacion(
  enlace: EnlaceRecuperacion,
  alResolver: (resultado: ResultadoEnlace) => void,
): () => void {
  if (env.usarMocks) return verificarEnlaceRecuperacionMock(enlace, alResolver);
  return verificarEnlaceRecuperacionSupabase(enlace, alResolver);
}

/** Fija la contraseña nueva con la sesión de recuperación. Lanza `ErrorRecuperacion`. */
export async function actualizarContrasena(contrasena: string): Promise<void> {
  if (env.usarMocks) return actualizarContrasenaMock(contrasena);
  return actualizarContrasenaSupabase(contrasena);
}
