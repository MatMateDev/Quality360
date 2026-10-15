/**
 * Errores tipados del acceso (login y RECUPERACION de contraseña).
 *
 * Los proveedores (`supabaseAuthProvider`, `mockAuthProvider`) traducen lo que reporta supabase-js a estos
 * tipos; el contexto y las pantallas solo conocen el tipo y el mensaje que le corresponde.
 */

/** Textos compartidos con q360-seguridad-gateway: no cambian sin acordarlo con ese agente. */
export const MENSAJE_ERROR_LOGIN = "Correo o contraseña incorrectos, o acceso no habilitado.";
export const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos de ingreso. Espera unos minutos antes de volver a intentarlo.";
export const MENSAJE_SERVICIO_NO_DISPONIBLE =
  "No pudimos conectar con el servicio de autenticación. Revisa tu conexión e inténtalo de nuevo.";
export const MENSAJE_SESION_EXPIRADA = "Tu sesión expiró. Inicia sesión nuevamente.";

/**
 * - CREDENCIALES: contraseña incorrecta, correo inexistente o sin confirmar, usuario baneado, o `/v1/me`
 *   con 401/403 (usuario inactivo o sin registro en Organización). Siempre el mismo mensaje genérico.
 * - DEMASIADOS_INTENTOS: 429 de Supabase (`over_request_rate_limit`) o del gateway.
 * - SERVICIO_NO_DISPONIBLE: red, status 0, 5xx o un `TypeError` de fetch.
 */
export type TipoErrorAcceso = "CREDENCIALES" | "DEMASIADOS_INTENTOS" | "SERVICIO_NO_DISPONIBLE";

export class ErrorAcceso extends Error {
  readonly tipo: TipoErrorAcceso;

  constructor(tipo: TipoErrorAcceso, causa?: unknown) {
    super(tipo, causa === undefined ? undefined : { cause: causa });
    this.name = "ErrorAcceso";
    this.tipo = tipo;
  }
}

export function esErrorAcceso(error: unknown): error is ErrorAcceso {
  return error instanceof ErrorAcceso;
}

export function mensajeDeErrorAcceso(tipo: TipoErrorAcceso): string {
  switch (tipo) {
    case "DEMASIADOS_INTENTOS":
      return MENSAJE_DEMASIADOS_INTENTOS;
    case "SERVICIO_NO_DISPONIBLE":
      return MENSAJE_SERVICIO_NO_DISPONIBLE;
    default:
      return MENSAJE_ERROR_LOGIN;
  }
}

interface ErrorConEstado {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

function comoErrorConEstado(error: unknown): ErrorConEstado {
  return typeof error === "object" && error !== null ? (error as ErrorConEstado) : {};
}

const CODIGOS_LIMITE = new Set(["over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit"]);

/**
 * Separa los fallos que no tienen que ver con las credenciales: límite de intentos y servicio caído.
 * Devuelve `null` si el error es de otra naturaleza (el llamador decide).
 */
export function clasificarFalloDeRed(error: unknown): "DEMASIADOS_INTENTOS" | "SERVICIO_NO_DISPONIBLE" | null {
  const { name, message, status, code } = comoErrorConEstado(error);

  if (name === "AuthRetryableFetchError") return "SERVICIO_NO_DISPONIBLE";
  // fetch rechazado: Chrome «Failed to fetch», Firefox «NetworkError…», Safari «Load failed».
  if (error instanceof TypeError && /fetch|network|load failed/i.test(typeof message === "string" ? message : "")) {
    return "SERVICIO_NO_DISPONIBLE";
  }
  if (status === 429 || (typeof code === "string" && CODIGOS_LIMITE.has(code))) return "DEMASIADOS_INTENTOS";
  if (typeof status === "number" && (status === 0 || status >= 500)) return "SERVICIO_NO_DISPONIBLE";
  return null;
}

/** Clasifica el error de `signInWithPassword`. Todo lo que no sea límite o servicio es «credenciales». */
export function clasificarErrorAcceso(error: unknown): TipoErrorAcceso {
  return clasificarFalloDeRed(error) ?? "CREDENCIALES";
}

/** Tipo de error de una petición a `/v1/me` (ErrorApi): solo 401/403 llevan el mensaje genérico. */
export function clasificarErrorPerfil(status: number | undefined): TipoErrorAcceso {
  if (status === 401 || status === 403) return "CREDENCIALES";
  if (status === 429) return "DEMASIADOS_INTENTOS";
  return "SERVICIO_NO_DISPONIBLE";
}

// --------------------------------------------------------------------------- RECUPERACION (E1-F13, E1-B13)

export const MENSAJE_RECUPERACION_ENVIADA =
  "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en unos minutos.";
export const MENSAJE_ENLACE_INVALIDO = "El enlace expiró o ya se usó. Solicita uno nuevo.";
export const MENSAJE_MISMA_CONTRASENA = "La nueva contraseña debe ser distinta de la anterior.";
export const MENSAJE_CONTRASENA_DEBIL = "La contraseña no cumple los requisitos de seguridad.";
export const MENSAJE_RECUPERACION_FALLIDA = "No pudimos actualizar tu contraseña. Inténtalo de nuevo.";
export const MENSAJE_CONTRASENA_ACTUALIZADA = "Tu contraseña se actualizó. Ingresa con la nueva.";

export type TipoErrorRecuperacion =
  | "ENLACE_INVALIDO"
  | "MISMA_CONTRASENA"
  | "CONTRASENA_DEBIL"
  | "DEMASIADOS_INTENTOS"
  | "SERVICIO_NO_DISPONIBLE"
  | "DESCONOCIDO";

export class ErrorRecuperacion extends Error {
  readonly tipo: TipoErrorRecuperacion;

  constructor(tipo: TipoErrorRecuperacion, causa?: unknown) {
    super(tipo, causa === undefined ? undefined : { cause: causa });
    this.name = "ErrorRecuperacion";
    this.tipo = tipo;
  }
}

const CODIGOS_ENLACE_INVALIDO = new Set([
  "otp_expired",
  "session_not_found",
  "session_expired",
  "bad_jwt",
  "user_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

/**
 * Decide qué se muestra cuando `resetPasswordForEmail` falla. `null` significa «tratarlo como éxito»: se
 * muestra la confirmación genérica.
 *
 * Supabase solo responde 429 `over_email_send_rate_limit` (y falla al enviar el correo) para correos
 * REGISTRADOS; con uno inexistente responde 200. Mostrarlo como «demasiados intentos» revelaría que la cuenta
 * existe. Solo `over_request_rate_limit` (el límite por IP, que no depende del correo) y las caídas de red o
 * del servicio se informan.
 */
export function clasificarErrorSolicitudRecuperacion(
  error: unknown,
): "DEMASIADOS_INTENTOS" | "SERVICIO_NO_DISPONIBLE" | null {
  const tipo = clasificarFalloDeRed(error);
  if (tipo === "SERVICIO_NO_DISPONIBLE") return tipo;
  if (tipo === "DEMASIADOS_INTENTOS") {
    return comoErrorConEstado(error).code === "over_request_rate_limit" ? tipo : null;
  }
  return null;
}

/** Clasifica el error de `updateUser({ password })` durante la recuperación. */
export function clasificarErrorRecuperacion(error: unknown): TipoErrorRecuperacion {
  const falloDeRed = clasificarFalloDeRed(error);
  if (falloDeRed) return falloDeRed;

  const { name, status, code } = comoErrorConEstado(error);
  if (code === "same_password") return "MISMA_CONTRASENA";
  if (code === "weak_password" || name === "AuthWeakPasswordError") return "CONTRASENA_DEBIL";
  if (
    name === "AuthSessionMissingError" ||
    status === 401 ||
    (typeof code === "string" && CODIGOS_ENLACE_INVALIDO.has(code))
  ) {
    return "ENLACE_INVALIDO";
  }
  return "DESCONOCIDO";
}

export function mensajeDeErrorRecuperacion(tipo: TipoErrorRecuperacion): string {
  switch (tipo) {
    case "ENLACE_INVALIDO":
      return MENSAJE_ENLACE_INVALIDO;
    case "MISMA_CONTRASENA":
      return MENSAJE_MISMA_CONTRASENA;
    case "CONTRASENA_DEBIL":
      return MENSAJE_CONTRASENA_DEBIL;
    case "DEMASIADOS_INTENTOS":
      return MENSAJE_DEMASIADOS_INTENTOS;
    case "SERVICIO_NO_DISPONIBLE":
      return MENSAJE_SERVICIO_NO_DISPONIBLE;
    default:
      return MENSAJE_RECUPERACION_FALLIDA;
  }
}

/**
 * Qué trae la URL al llegar desde el correo de recuperación. Se lee antes de que supabase-js la procese
 * (la procesa al crear el cliente y limpia el hash), por eso la página lo captura en su primer render.
 *
 * - `recuperacion`: flujo implícito, `#access_token=…&type=recovery`.
 * - `codigo`: flujo PKCE, `?code=…`.
 * - `error`: `#error=access_denied&error_code=otp_expired&error_description=…` (enlace vencido o ya usado).
 * - `ninguno`: se abrió la ruta sin enlace.
 */
export type EnlaceRecuperacion =
  | { tipo: "recuperacion" }
  | { tipo: "codigo"; codigo: string }
  | { tipo: "error"; codigoError: string }
  | { tipo: "ninguno" };

/** Resultado de comprobar el enlace: hay sesión de recuperación, no la hay, o no se pudo consultar. */
export type ResultadoEnlace = "LISTA" | "ENLACE_INVALIDO" | "SERVICIO_NO_DISPONIBLE";

export function interpretarEnlaceRecuperacion(hash: string, search: string): EnlaceRecuperacion {
  const enHash = new URLSearchParams(hash.replace(/^#/, ""));
  const enConsulta = new URLSearchParams(search.replace(/^\?/, ""));
  const leer = (nombre: string) => enHash.get(nombre) ?? enConsulta.get(nombre);

  const codigoError = leer("error_code");
  if (codigoError || leer("error") || leer("error_description")) {
    return { tipo: "error", codigoError: codigoError ?? "desconocido" };
  }
  if (enHash.get("access_token") && enHash.get("type") === "recovery") return { tipo: "recuperacion" };
  const codigo = enConsulta.get("code");
  if (codigo) return { tipo: "codigo", codigo };
  return { tipo: "ninguno" };
}
