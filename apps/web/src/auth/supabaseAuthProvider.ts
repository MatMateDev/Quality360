import { obtenerClienteSupabase } from "@/lib/supabaseClient";
import { establecerSesion, limpiarSesion } from "./sessionStore";

export async function iniciarSesionSupabase(correo: string, contrasena: string): Promise<void> {
  const cliente = obtenerClienteSupabase();
  const { data, error } = await cliente.auth.signInWithPassword({ email: correo, password: contrasena });
  if (error || !data.session) {
    throw new Error("CREDENCIALES_INVALIDAS");
  }
  establecerSesion({ accessToken: data.session.access_token });
}

export async function cerrarSesionSupabase(): Promise<void> {
  const cliente = obtenerClienteSupabase();
  await cliente.auth.signOut();
  limpiarSesion();
}

/** Restaura la sesión vigente (recarga de página) y se suscribe a la renovación de tokens. */
export function inicializarSesionSupabase(alCambiar: () => void): () => void {
  const cliente = obtenerClienteSupabase();

  cliente.auth.getSession().then(({ data }) => {
    if (data.session) establecerSesion({ accessToken: data.session.access_token });
    alCambiar();
  });

  const { data: suscripcion } = cliente.auth.onAuthStateChange((_evento, session) => {
    if (session) establecerSesion({ accessToken: session.access_token });
    else limpiarSesion();
    alCambiar();
  });

  return () => suscripcion.subscription.unsubscribe();
}
