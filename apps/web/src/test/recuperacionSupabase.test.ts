import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clasificarErrorSolicitudRecuperacion, esErrorAcceso } from "@/auth/errorAcceso";

const resetPasswordForEmail = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  obtenerClienteSupabase: () => ({ auth: { resetPasswordForEmail } }),
}));

// Se importa después de declarar el mock (vi.mock se iza, pero así queda explícito).
const { solicitarRecuperacionSupabase } = await import("@/auth/supabaseAuthProvider");

/**
 * [E1-B13#1] Supabase responde 200 a `resetPasswordForEmail` con un correo inexistente, pero 429
 * `over_email_send_rate_limit` (o un fallo de envío) solo con correos registrados. Mostrarlo revelaría que la
 * cuenta existe: se trata como éxito. Solo `over_request_rate_limit` (por IP) y la caída del servicio se informan.
 */
describe("[E1-B13#1] solicitarRecuperacionSupabase · no revela si el correo existe", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
  });

  it("pide el correo con redirectTo = origen + /restablecer-contrasena", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(solicitarRecuperacionSupabase("ana@empresa.cl")).resolves.toBeUndefined();

    expect(resetPasswordForEmail).toHaveBeenCalledWith("ana@empresa.cl", {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });
  });

  it("429 over_email_send_rate_limit se trata EXACTAMENTE como el éxito (confirmación genérica)", async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: new AuthApiError("For security purposes, you can only request this after 52 seconds.", 429, "over_email_send_rate_limit"),
    });

    await expect(solicitarRecuperacionSupabase("registrado@empresa.cl")).resolves.toBeUndefined();
  });

  it("429 sin código identificable tampoco se muestra: solo over_request_rate_limit lo hace", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new AuthApiError("Too many requests", 429, undefined) });

    await expect(solicitarRecuperacionSupabase("registrado@empresa.cl")).resolves.toBeUndefined();
  });

  it("429 over_request_rate_limit (por IP, no depende del correo) sí es «demasiados intentos»", async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"),
    });

    const fallo = await solicitarRecuperacionSupabase("cualquiera@empresa.cl").catch((error: unknown) => error);

    expect(esErrorAcceso(fallo)).toBe(true);
    expect(fallo).toMatchObject({ tipo: "DEMASIADOS_INTENTOS" });
  });

  it("la red caída o un 5xx son «servicio no disponible»", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("Failed to fetch", 0) });
    await expect(solicitarRecuperacionSupabase("a@empresa.cl")).rejects.toMatchObject({ tipo: "SERVICIO_NO_DISPONIBLE" });

    resetPasswordForEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(solicitarRecuperacionSupabase("a@empresa.cl")).rejects.toMatchObject({ tipo: "SERVICIO_NO_DISPONIBLE" });

    resetPasswordForEmail.mockResolvedValue({ data: null, error: new AuthApiError("Bad gateway", 502, undefined) });
    await expect(solicitarRecuperacionSupabase("a@empresa.cl")).rejects.toMatchObject({ tipo: "SERVICIO_NO_DISPONIBLE" });
  });

  it("cualquier otro error del servidor (p. ej. 400 email_address_invalid) se trata como éxito", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new AuthApiError("Invalid", 400, "email_address_invalid") });

    await expect(solicitarRecuperacionSupabase("a@empresa.cl")).resolves.toBeUndefined();
  });
});

describe("[E1-B13#1] clasificarErrorSolicitudRecuperacion", () => {
  it("devuelve null (éxito) salvo para over_request_rate_limit y las caídas", () => {
    expect(clasificarErrorSolicitudRecuperacion(new AuthApiError("x", 429, "over_email_send_rate_limit"))).toBeNull();
    expect(clasificarErrorSolicitudRecuperacion(new AuthApiError("x", 429, "over_sms_send_rate_limit"))).toBeNull();
    expect(clasificarErrorSolicitudRecuperacion(new AuthApiError("x", 429, undefined))).toBeNull();
    expect(clasificarErrorSolicitudRecuperacion(new AuthApiError("x", 400, "validation_failed"))).toBeNull();
    expect(clasificarErrorSolicitudRecuperacion(new AuthApiError("x", 429, "over_request_rate_limit"))).toBe("DEMASIADOS_INTENTOS");
    expect(clasificarErrorSolicitudRecuperacion(new AuthRetryableFetchError("x", 0))).toBe("SERVICIO_NO_DISPONIBLE");
    expect(clasificarErrorSolicitudRecuperacion(new AuthApiError("x", 503, undefined))).toBe("SERVICIO_NO_DISPONIBLE");
  });
});
