import { env } from "@/lib/env";
import { cerrarSesionMock, iniciarSesionMock } from "./mockAuthProvider";
import { cerrarSesionSupabase, iniciarSesionSupabase, inicializarSesionSupabase } from "./supabaseAuthProvider";

/** Único punto de entrada del login: elige el proveedor simulado o Supabase real según VITE_USAR_MOCKS. */
export async function iniciarSesion(correo: string, contrasena: string): Promise<void> {
  if (env.usarMocks) return iniciarSesionMock(correo, contrasena);
  return iniciarSesionSupabase(correo, contrasena);
}

export async function cerrarSesion(): Promise<void> {
  if (env.usarMocks) return cerrarSesionMock();
  return cerrarSesionSupabase();
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
