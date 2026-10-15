import { obtenerClienteSupabase } from "@/lib/supabaseClient";
import {
  ErrorAcceso,
  ErrorRecuperacion,
  clasificarErrorAcceso,
  clasificarErrorRecuperacion,
  clasificarErrorSolicitudRecuperacion,
  clasificarFalloDeRed,
  interpretarEnlaceRecuperacion,
  type EnlaceRecuperacion,
  type ResultadoEnlace,
} from "./errorAcceso";
import { autenticadoConContrasena } from "./jwt";
import { establecerSesion, limpiarSesion } from "./sessionStore";

export async function iniciarSesionSupabase(correo: string, contrasena: string): Promise<void> {
  let resultado;
  try {
    const cliente = obtenerClienteSupabase();
    resultado = await cliente.auth.signInWithPassword({ email: correo, password: contrasena });
  } catch (error) {
    // supabase-js devuelve los AuthError, pero un fetch roto puede escapar como TypeError.
    throw new ErrorAcceso(clasificarErrorAcceso(error), error);
  }

  const { data, error } = resultado;
  if (error) throw new ErrorAcceso(clasificarErrorAcceso(error), error);
  // Sin error y sin sesión (p. ej. falta un segundo factor): para el usuario es un acceso no habilitado.
  if (!data.session) throw new ErrorAcceso("CREDENCIALES");
  establecerSesion({ accessToken: data.session.access_token });
}

export async function cerrarSesionSupabase(): Promise<void> {
  const cliente = obtenerClienteSupabase();
  await cliente.auth.signOut();
  limpiarSesion();
}

/**
 * Cierra solo la sesión de este navegador (`scope: "local"`): no revoca las sesiones del usuario en otros
 * dispositivos. Es el cierre para rechazos de Organización y para abandonar una recuperación.
 */
export async function cerrarSesionLocalSupabase(): Promise<void> {
  try {
    await obtenerClienteSupabase().auth.signOut({ scope: "local" });
  } finally {
    limpiarSesion();
  }
}

const RUTA_RESTABLECER = "/restablecer-contrasena";

/**
 * Una sesión solo entra al portal si se obtuvo con contraseña (`amr` incluye `password`). La que deja el
 * enlace de recuperación (`otp`) solo se admite en `/restablecer-contrasena`, donde sirve para cambiar la
 * contraseña. Sin esto, abrir otra ruta con esa sesión guardada entraría al portal sin contraseña.
 */
function sesionAdmitida(accessToken: string): boolean {
  return autenticadoConContrasena(accessToken) || window.location.pathname === RUTA_RESTABLECER;
}

/** Restaura la sesión vigente (recarga de página) y se suscribe a la renovación de tokens. */
export function inicializarSesionSupabase(alCambiar: () => void): () => void {
  const cliente = obtenerClienteSupabase();
  const descartarLocal = () => cliente.auth.signOut({ scope: "local" }).catch(() => undefined);

  cliente.auth.getSession().then(async ({ data }) => {
    if (data.session && sesionAdmitida(data.session.access_token)) {
      establecerSesion({ accessToken: data.session.access_token });
    } else if (data.session) {
      // Sesión de recuperación (u otra sin contraseña) fuera de su pantalla: se descarta y no se establece.
      limpiarSesion();
      await descartarLocal();
    }
    alCambiar();
  });

  const { data: suscripcion } = cliente.auth.onAuthStateChange((_evento, session) => {
    if (session && sesionAdmitida(session.access_token)) {
      establecerSesion({ accessToken: session.access_token });
    } else if (session) {
      limpiarSesion();
      // Dentro de este callback no se llama a otros métodos del cliente (puede bloquearse): se difiere.
      setTimeout(() => void descartarLocal(), 0);
    } else {
      limpiarSesion();
    }
    alCambiar();
  });

  return () => suscripcion.subscription.unsubscribe();
}

// --------------------------------------------------------------------------- RECUPERACION (E1-F13, E1-B13)

/**
 * Envía el correo de recuperación. Solo se propagan el límite por IP (`over_request_rate_limit`) y la caída
 * del servicio; cualquier otro fallo —incluido el 429 `over_email_send_rate_limit`, que Supabase solo da
 * para correos registrados— se trata como éxito para no revelar si el correo existe.
 */
export async function solicitarRecuperacionSupabase(correo: string): Promise<void> {
  try {
    const cliente = obtenerClienteSupabase();
    const { error } = await cliente.auth.resetPasswordForEmail(correo, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });
    if (error) throw error;
  } catch (error) {
    const tipo = clasificarErrorSolicitudRecuperacion(error);
    if (tipo) throw new ErrorAcceso(tipo, error);
  }
}

// StrictMode ejecuta los efectos dos veces en desarrollo y un código PKCE solo se canjea una vez.
let canjeEnCurso: { codigo: string; promesa: Promise<ResultadoEnlace> } | null = null;

async function canjearCodigo(codigo: string): Promise<ResultadoEnlace> {
  if (canjeEnCurso?.codigo === codigo) return canjeEnCurso.promesa;
  const promesa = (async (): Promise<ResultadoEnlace> => {
    try {
      const { error } = await obtenerClienteSupabase().auth.exchangeCodeForSession(codigo);
      if (!error) return "LISTA";
      return clasificarFalloDeRed(error) === "SERVICIO_NO_DISPONIBLE" ? "SERVICIO_NO_DISPONIBLE" : "ENLACE_INVALIDO";
    } catch (error) {
      return clasificarFalloDeRed(error) === "SERVICIO_NO_DISPONIBLE" ? "SERVICIO_NO_DISPONIBLE" : "ENLACE_INVALIDO";
    }
  })();
  canjeEnCurso = { codigo, promesa };
  return promesa;
}

/** Tokens del hash del enlace (flujo implícito), guardados en memoria mientras se establece la sesión. */
interface EnlaceCapturado {
  enlace: EnlaceRecuperacion;
  accessToken: string | null;
  refreshToken: string | null;
}

let enlaceCapturado: EnlaceCapturado | null = null;
let verificacionEnCurso: Promise<ResultadoEnlace> | null = null;

/**
 * Lee el enlace del correo ANTES de que supabase-js cree su cliente y, si trae tokens o un error en el hash,
 * lo quita de la URL con `history.replaceState`. Así la entrada de historial no conserva `#access_token…`
 * (con «Atrás» se recuperaría) y supabase-js no hace `location.hash = ""`, que añade otra entrada.
 * La sesión no se pierde: `verificarEnlaceRecuperacionSupabase` la establece con `setSession`.
 *
 * Es idempotente mientras la verificación no termina (StrictMode renderiza dos veces).
 */
export function leerEnlaceRecuperacionSupabase(): EnlaceRecuperacion {
  if (enlaceCapturado) return enlaceCapturado.enlace;

  const enlace = interpretarEnlaceRecuperacion(window.location.hash, window.location.search);
  if (enlace.tipo === "recuperacion" || enlace.tipo === "error") {
    const parametros = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    enlaceCapturado = {
      enlace,
      accessToken: parametros.get("access_token"),
      refreshToken: parametros.get("refresh_token"),
    };
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  // `?code=` (PKCE) y «ninguno» no se tocan: supabase-js ya limpia el código sin añadir una entrada.
  return enlace;
}

/** Establece la sesión de recuperación con los tokens capturados del hash (una sola vez, aunque se llame dos). */
function establecerSesionDelEnlace(): Promise<ResultadoEnlace> {
  if (verificacionEnCurso) return verificacionEnCurso;
  const captura = enlaceCapturado;
  if (!captura?.accessToken || !captura.refreshToken) return Promise.resolve("ENLACE_INVALIDO");

  const promesa = (async (): Promise<ResultadoEnlace> => {
    try {
      const { error } = await obtenerClienteSupabase().auth.setSession({
        access_token: captura.accessToken as string,
        refresh_token: captura.refreshToken as string,
      });
      if (!error) return "LISTA";
      return clasificarFalloDeRed(error) === "SERVICIO_NO_DISPONIBLE" ? "SERVICIO_NO_DISPONIBLE" : "ENLACE_INVALIDO";
    } catch (error) {
      return clasificarFalloDeRed(error) === "SERVICIO_NO_DISPONIBLE" ? "SERVICIO_NO_DISPONIBLE" : "ENLACE_INVALIDO";
    }
  })();
  verificacionEnCurso = promesa;
  // Terminado el trámite se sueltan los tokens: una visita posterior a la ruta ya no los ve.
  void promesa.finally(() => {
    enlaceCapturado = null;
    verificacionEnCurso = null;
  });
  return promesa;
}

/**
 * Comprueba que existe una sesión de recuperación. En el flujo implícito la establece con los tokens que
 * `leerEnlaceRecuperacionSupabase` sacó de la URL; con PKCE canjea `?code=` (o lo hace supabase-js si el
 * cliente usa `flowType: "pkce"`). Devuelve la función que cancela la espera.
 */
export function verificarEnlaceRecuperacionSupabase(
  enlace: EnlaceRecuperacion,
  alResolver: (resultado: ResultadoEnlace) => void,
): () => void {
  let activo = true;
  let resuelto = false;
  const resolver = (resultado: ResultadoEnlace) => {
    if (!activo || resuelto) return;
    resuelto = true;
    alResolver(resultado);
  };

  // Un enlace vencido o ya usado llega con el error en la URL: no hay sesión que esperar.
  if (enlace.tipo === "error" || enlace.tipo === "ninguno") {
    queueMicrotask(() => {
      if (enlace.tipo === "error") enlaceCapturado = null;
      resolver("ENLACE_INVALIDO");
    });
    return () => {
      activo = false;
    };
  }

  const cliente = obtenerClienteSupabase();
  const { data: suscripcion } = cliente.auth.onAuthStateChange((evento) => {
    if (evento === "PASSWORD_RECOVERY") resolver("LISTA");
  });

  if (enlace.tipo === "recuperacion") {
    void establecerSesionDelEnlace().then(resolver);
  } else {
    void (async () => {
      try {
        // `getSession` espera a que supabase-js termine de inicializar (y de procesar la URL).
        const { data, error } = await cliente.auth.getSession();
        if (error && clasificarFalloDeRed(error) === "SERVICIO_NO_DISPONIBLE") return resolver("SERVICIO_NO_DISPONIBLE");

        // supabase-js quita `?code=` solo cuando logró establecer la sesión: si sigue en la URL, se canjea aquí.
        const codigoSinProcesar = new URLSearchParams(window.location.search).has("code");
        if (!codigoSinProcesar) return resolver(data.session ? "LISTA" : "ENLACE_INVALIDO");
        resolver(await canjearCodigo(enlace.codigo));
      } catch (error) {
        resolver(clasificarFalloDeRed(error) === "SERVICIO_NO_DISPONIBLE" ? "SERVICIO_NO_DISPONIBLE" : "ENLACE_INVALIDO");
      }
    })();
  }

  return () => {
    activo = false;
    suscripcion.subscription.unsubscribe();
  };
}

/** Fija la contraseña nueva con la sesión de recuperación vigente. */
export async function actualizarContrasenaSupabase(contrasena: string): Promise<void> {
  try {
    const cliente = obtenerClienteSupabase();
    const { error } = await cliente.auth.updateUser({ password: contrasena });
    if (error) throw error;
  } catch (error) {
    throw new ErrorRecuperacion(clasificarErrorRecuperacion(error), error);
  }
}
