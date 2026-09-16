// Almacén de sesión desacoplado de React: el cliente HTTP lo lee en forma
// síncrona y el contexto de autenticación se suscribe para re-renderizar.
export type Sesion = { accessToken: string } | null;

let sesionActual: Sesion = null;
const escuchas = new Set<() => void>();

export function obtenerSesion(): Sesion {
  return sesionActual;
}

export function obtenerAccessToken(): string | null {
  return sesionActual?.accessToken ?? null;
}

export function establecerSesion(sesion: Sesion): void {
  sesionActual = sesion;
  for (const escucha of escuchas) {
    escucha();
  }
}

export function limpiarSesion(): void {
  establecerSesion(null);
}

export function suscribirSesion(escucha: () => void): () => void {
  escuchas.add(escucha);
  return () => escuchas.delete(escucha);
}
