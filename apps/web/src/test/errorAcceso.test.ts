import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  clasificarErrorAcceso,
  clasificarErrorPerfil,
  clasificarErrorRecuperacion,
  interpretarEnlaceRecuperacion,
} from "@/auth/errorAcceso";

describe("Clasificación de errores de acceso (supabase-js)", () => {
  it("credenciales incorrectas, correo sin confirmar y usuario baneado son «credenciales»", () => {
    expect(clasificarErrorAcceso(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))).toBe("CREDENCIALES");
    expect(clasificarErrorAcceso(new AuthApiError("Email not confirmed", 400, "email_not_confirmed"))).toBe("CREDENCIALES");
    expect(clasificarErrorAcceso(new AuthApiError("User is banned", 400, "user_banned"))).toBe("CREDENCIALES");
  });

  it("429 (over_request_rate_limit) es «demasiados intentos»", () => {
    expect(clasificarErrorAcceso(new AuthApiError("Rate limit", 429, "over_request_rate_limit"))).toBe("DEMASIADOS_INTENTOS");
    expect(clasificarErrorAcceso(new AuthApiError("Rate limit", 429, undefined))).toBe("DEMASIADOS_INTENTOS");
  });

  it("AuthRetryableFetchError, status 0, 5xx y un TypeError de fetch son «servicio no disponible»", () => {
    expect(clasificarErrorAcceso(new AuthRetryableFetchError("Failed to fetch", 0))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorAcceso(new AuthRetryableFetchError("Bad gateway", 502))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorAcceso(new AuthApiError("Error", 500, "unexpected_failure"))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorAcceso(new AuthApiError("Error", 0, undefined))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorAcceso(new TypeError("Failed to fetch"))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorAcceso(new TypeError("NetworkError when attempting to fetch resource."))).toBe("SERVICIO_NO_DISPONIBLE");
  });

  it("un TypeError que no es de red (un defecto) no se disfraza de servicio caído", () => {
    expect(clasificarErrorAcceso(new TypeError("Cannot read properties of undefined"))).toBe("CREDENCIALES");
  });

  it("/v1/me: solo 401 y 403 llevan el mensaje genérico", () => {
    expect(clasificarErrorPerfil(401)).toBe("CREDENCIALES");
    expect(clasificarErrorPerfil(403)).toBe("CREDENCIALES");
    expect(clasificarErrorPerfil(429)).toBe("DEMASIADOS_INTENTOS");
    expect(clasificarErrorPerfil(503)).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorPerfil(500)).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorPerfil(undefined)).toBe("SERVICIO_NO_DISPONIBLE");
  });
});

describe("[E1-F13#2] clasificación de errores de updateUser", () => {
  it("distingue contraseña repetida, débil, enlace inválido, límite y servicio", () => {
    expect(clasificarErrorRecuperacion(new AuthApiError("Same password", 422, "same_password"))).toBe("MISMA_CONTRASENA");
    expect(clasificarErrorRecuperacion(new AuthWeakPasswordError("Weak", 422, ["length"]))).toBe("CONTRASENA_DEBIL");
    expect(clasificarErrorRecuperacion(new AuthApiError("Weak", 422, "weak_password"))).toBe("CONTRASENA_DEBIL");
    expect(clasificarErrorRecuperacion(new AuthSessionMissingError())).toBe("ENLACE_INVALIDO");
    expect(clasificarErrorRecuperacion(new AuthApiError("Invalid JWT", 401, "bad_jwt"))).toBe("ENLACE_INVALIDO");
    expect(clasificarErrorRecuperacion(new AuthApiError("Rate limit", 429, "over_request_rate_limit"))).toBe("DEMASIADOS_INTENTOS");
    expect(clasificarErrorRecuperacion(new AuthRetryableFetchError("Failed to fetch", 0))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorRecuperacion(new AuthApiError("Otra cosa", 400, "validation_failed"))).toBe("DESCONOCIDO");
  });
});

describe("[E1-F13#3] lectura de la URL del enlace del correo", () => {
  it("reconoce el flujo implícito (tokens en el hash, type=recovery)", () => {
    expect(interpretarEnlaceRecuperacion("#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery", "")).toEqual({
      tipo: "recuperacion",
    });
  });

  it("reconoce el flujo PKCE (?code=)", () => {
    expect(interpretarEnlaceRecuperacion("", "?code=xyz")).toEqual({ tipo: "codigo", codigo: "xyz" });
  });

  it("reconoce un enlace vencido o ya usado (error_code en el hash o en la consulta)", () => {
    expect(
      interpretarEnlaceRecuperacion("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", ""),
    ).toEqual({ tipo: "error", codigoError: "otp_expired" });
    expect(interpretarEnlaceRecuperacion("", "?error=access_denied&error_code=otp_expired")).toEqual({
      tipo: "error",
      codigoError: "otp_expired",
    });
  });

  it("sin enlace (se abrió la ruta a mano) no hay nada que procesar", () => {
    expect(interpretarEnlaceRecuperacion("", "")).toEqual({ tipo: "ninguno" });
    // Un hash que no es de recuperación (p. ej. un ancla) tampoco cuenta.
    expect(interpretarEnlaceRecuperacion("#seccion", "")).toEqual({ tipo: "ninguno" });
  });
});
