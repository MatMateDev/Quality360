import { buscarUsuarioPorCorreo } from "@/mocks/data";
import { PREFIJO_TOKEN_MOCK } from "@/mocks/utils";
import { establecerSesion, limpiarSesion } from "./sessionStore";

/** Login simulado (VITE_USAR_MOCKS=true): valida contra los usuarios de `mocks/data.ts`, sin Supabase. */
export async function iniciarSesionMock(correo: string, contrasena: string): Promise<void> {
  const usuario = buscarUsuarioPorCorreo(correo);
  if (!usuario || usuario.contrasena !== contrasena) {
    throw new Error("CREDENCIALES_INVALIDAS");
  }
  establecerSesion({ accessToken: `${PREFIJO_TOKEN_MOCK}${usuario.id}` });
}

export async function cerrarSesionMock(): Promise<void> {
  limpiarSesion();
}
