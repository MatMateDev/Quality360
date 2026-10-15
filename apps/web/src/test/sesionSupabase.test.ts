import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearJwtConPayload } from "./jwtPrueba";

/**
 * Proveedor de Supabase con un cliente simulado. Cada prueba carga el módulo de nuevo
 * (`vi.resetModules`) porque guarda estado propio: el enlace capturado y la sesión.
 *
 * - D1 (E1-F13): una sesión del enlace de recuperación (amr otp) fuera de /restablecer-contrasena se descarta.
 * - D2 (E1-F13): los tokens del enlace salen de la URL con replaceState, sin perder la sesión.
 * - D6: el cierre por rechazo de Organización y por abandono es solo local.
 */

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  obtenerClienteSupabase: () => ({ auth }),
}));

type MetodoAmr = "password" | "otp";

function crearJwt(metodo?: MetodoAmr): string {
  return crearJwtConPayload({ sub: "u1", ...(metodo ? { amr: [{ method: metodo, timestamp: 1 }] } : {}) });
}

const sesionCon = (metodo?: MetodoAmr) => ({ access_token: crearJwt(metodo), refresh_token: "r", user: { id: "u1" } });

function irA(rutaCompleta: string) {
  window.history.replaceState(null, "", rutaCompleta);
}

async function cargar() {
  vi.resetModules();
  const proveedor = await import("@/auth/supabaseAuthProvider");
  const almacen = await import("@/auth/sessionStore");
  return { ...proveedor, ...almacen };
}

/** Captura el callback que el proveedor registra en onAuthStateChange. */
let emitir: (evento: string, sesion: unknown) => void;

beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.setSession.mockReset();
  auth.onAuthStateChange.mockReset().mockImplementation((callback: typeof emitir) => {
    emitir = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  irA("/");
});

describe("[E1-F13 · D1] restauración de sesión: solo con contraseña, salvo en /restablecer-contrasena", () => {
  it("una sesión otp (enlace de recuperación) fuera de /restablecer se descarta y no se establece", async () => {
    irA("/qa");
    auth.getSession.mockResolvedValue({ data: { session: sesionCon("otp") }, error: null });
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    const alCambiar = vi.fn();

    inicializarSesionSupabase(alCambiar);

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(obtenerSesion()).toBeNull();
  });

  it("una sesión de contraseña se restaura", async () => {
    irA("/qa");
    const sesion = sesionCon("password");
    auth.getSession.mockResolvedValue({ data: { session: sesion }, error: null });
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    const alCambiar = vi.fn();

    inicializarSesionSupabase(alCambiar);

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled());
    expect(obtenerSesion()).toEqual({ accessToken: sesion.access_token });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("una sesión otp DENTRO de /restablecer-contrasena se mantiene (modo recuperación)", async () => {
    irA("/restablecer-contrasena");
    const sesion = sesionCon("otp");
    auth.getSession.mockResolvedValue({ data: { session: sesion }, error: null });
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    const alCambiar = vi.fn();

    inicializarSesionSupabase(alCambiar);

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled());
    expect(obtenerSesion()).toEqual({ accessToken: sesion.access_token });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("un token sin amr legible se descarta fuera de /restablecer (falla cerrado)", async () => {
    irA("/admin");
    auth.getSession.mockResolvedValue({ data: { session: sesionCon(undefined) }, error: null });
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    const alCambiar = vi.fn();

    inicializarSesionSupabase(alCambiar);

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(obtenerSesion()).toBeNull();
  });

  it("sin sesión guardada no hay nada que descartar", async () => {
    irA("/qa");
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    const alCambiar = vi.fn();

    inicializarSesionSupabase(alCambiar);

    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalled());
    expect(obtenerSesion()).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("[E1-F13 · D1] onAuthStateChange aplica la misma regla", () => {
  it("un evento con sesión otp fuera de /restablecer se descarta (cierre local diferido)", async () => {
    irA("/qa");
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    inicializarSesionSupabase(vi.fn());

    emitir("TOKEN_REFRESHED", sesionCon("otp"));

    expect(obtenerSesion()).toBeNull();
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
  });

  it("un evento con sesión de contraseña se establece y SIGNED_OUT la limpia", async () => {
    irA("/login");
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    inicializarSesionSupabase(vi.fn());
    const sesion = sesionCon("password");

    emitir("SIGNED_IN", sesion);
    expect(obtenerSesion()).toEqual({ accessToken: sesion.access_token });
    expect(auth.signOut).not.toHaveBeenCalled();

    emitir("SIGNED_OUT", null);
    expect(obtenerSesion()).toBeNull();
  });

  it("un evento con sesión otp en /restablecer-contrasena se establece", async () => {
    irA("/restablecer-contrasena");
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    inicializarSesionSupabase(vi.fn());
    const sesion = sesionCon("otp");

    emitir("PASSWORD_RECOVERY", sesion);

    expect(obtenerSesion()).toEqual({ accessToken: sesion.access_token });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("la misma sesión otp se descarta apenas la persona sale de /restablecer-contrasena", async () => {
    irA("/restablecer-contrasena");
    const { inicializarSesionSupabase, obtenerSesion } = await cargar();
    inicializarSesionSupabase(vi.fn());
    const sesion = sesionCon("otp");
    emitir("USER_UPDATED", sesion);
    expect(obtenerSesion()).not.toBeNull();

    irA("/login");
    emitir("TOKEN_REFRESHED", sesion);

    expect(obtenerSesion()).toBeNull();
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
  });
});

describe("[E1-F13 · D2] el hash del enlace sale de la URL sin dejar una entrada de historial", () => {
  const HASH_RECUPERACION =
    "#access_token=ACCESO&refresh_token=REFRESCO&expires_in=3600&token_type=bearer&type=recovery";

  it("quita los tokens con replaceState (no añade entradas) y la sesión se establece con setSession", async () => {
    irA(`/restablecer-contrasena${HASH_RECUPERACION}`);
    const entradasAntes = window.history.length;
    auth.setSession.mockResolvedValue({ data: { session: sesionCon("otp") }, error: null });
    const { leerEnlaceRecuperacionSupabase, verificarEnlaceRecuperacionSupabase } = await cargar();

    const enlace = leerEnlaceRecuperacionSupabase();

    expect(enlace).toEqual({ tipo: "recuperacion" });
    // La URL ya no contiene los tokens y la entrada actual fue reemplazada, no apilada.
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/restablecer-contrasena");
    expect(window.location.href).not.toContain("access_token");
    expect(window.history.length).toBe(entradasAntes);

    const resultado = await new Promise((resolver) => verificarEnlaceRecuperacionSupabase(enlace, resolver));
    expect(resultado).toBe("LISTA");
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "ACCESO", refresh_token: "REFRESCO" });
  });

  it("es idempotente con el doble render y el doble efecto de StrictMode: un solo setSession", async () => {
    irA(`/restablecer-contrasena${HASH_RECUPERACION}`);
    auth.setSession.mockResolvedValue({ data: { session: sesionCon("otp") }, error: null });
    const { leerEnlaceRecuperacionSupabase, verificarEnlaceRecuperacionSupabase } = await cargar();

    const primero = leerEnlaceRecuperacionSupabase();
    const segundo = leerEnlaceRecuperacionSupabase();
    expect(segundo).toEqual(primero);

    const alResolver = vi.fn();
    const cancelar = verificarEnlaceRecuperacionSupabase(primero, alResolver);
    cancelar(); // desmontaje simulado de StrictMode
    verificarEnlaceRecuperacionSupabase(primero, alResolver);

    await vi.waitFor(() => expect(alResolver).toHaveBeenCalledWith("LISTA"));
    expect(alResolver).toHaveBeenCalledTimes(1);
    expect(auth.setSession).toHaveBeenCalledTimes(1);
  });

  it("al terminar suelta los tokens: una visita posterior a la ruta no ve un enlace", async () => {
    irA(`/restablecer-contrasena${HASH_RECUPERACION}`);
    auth.setSession.mockResolvedValue({ data: { session: sesionCon("otp") }, error: null });
    const { leerEnlaceRecuperacionSupabase, verificarEnlaceRecuperacionSupabase } = await cargar();
    const enlace = leerEnlaceRecuperacionSupabase();
    await new Promise((resolver) => verificarEnlaceRecuperacionSupabase(enlace, resolver));
    await Promise.resolve();

    expect(leerEnlaceRecuperacionSupabase()).toEqual({ tipo: "ninguno" });
  });

  it("si setSession rechaza los tokens, el enlace es inválido; si el servicio cae, es servicio no disponible", async () => {
    irA(`/restablecer-contrasena${HASH_RECUPERACION}`);
    auth.setSession.mockResolvedValue({ data: { session: null }, error: new AuthApiError("Invalid JWT", 401, "bad_jwt") });
    let modulo = await cargar();
    let enlace = modulo.leerEnlaceRecuperacionSupabase();
    expect(await new Promise((resolver) => modulo.verificarEnlaceRecuperacionSupabase(enlace, resolver))).toBe("ENLACE_INVALIDO");

    irA(`/restablecer-contrasena${HASH_RECUPERACION}`);
    auth.setSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError("Failed to fetch", 0) });
    modulo = await cargar();
    enlace = modulo.leerEnlaceRecuperacionSupabase();
    expect(await new Promise((resolver) => modulo.verificarEnlaceRecuperacionSupabase(enlace, resolver))).toBe(
      "SERVICIO_NO_DISPONIBLE",
    );
  });

  it("un enlace vencido (#error_code=otp_expired) también se quita de la URL y no llama a setSession", async () => {
    irA("/restablecer-contrasena#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
    const entradasAntes = window.history.length;
    const { leerEnlaceRecuperacionSupabase, verificarEnlaceRecuperacionSupabase } = await cargar();

    const enlace = leerEnlaceRecuperacionSupabase();

    expect(enlace).toEqual({ tipo: "error", codigoError: "otp_expired" });
    expect(window.location.hash).toBe("");
    expect(window.history.length).toBe(entradasAntes);
    expect(await new Promise((resolver) => verificarEnlaceRecuperacionSupabase(enlace, resolver))).toBe("ENLACE_INVALIDO");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("sin enlace o con ?code= (PKCE) no se toca la URL", async () => {
    irA("/restablecer-contrasena");
    const { leerEnlaceRecuperacionSupabase } = await cargar();
    expect(leerEnlaceRecuperacionSupabase()).toEqual({ tipo: "ninguno" });

    irA("/restablecer-contrasena?code=abc123");
    const otro = await cargar();
    expect(otro.leerEnlaceRecuperacionSupabase()).toEqual({ tipo: "codigo", codigo: "abc123" });
    expect(window.location.search).toBe("?code=abc123");
  });
});

describe("[D6] cierre de sesión local frente a global", () => {
  it("cerrarSesionLocalSupabase usa signOut({ scope: \"local\" }) y limpia la sesión en memoria", async () => {
    const { cerrarSesionLocalSupabase, establecerSesion, obtenerSesion } = await cargar();
    establecerSesion({ accessToken: "t" });

    await cerrarSesionLocalSupabase();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(obtenerSesion()).toBeNull();
  });

  it("aunque signOut falle, la sesión en memoria queda limpia", async () => {
    auth.signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    const { cerrarSesionLocalSupabase, establecerSesion, obtenerSesion } = await cargar();
    establecerSesion({ accessToken: "t" });

    await expect(cerrarSesionLocalSupabase()).rejects.toThrow();

    expect(obtenerSesion()).toBeNull();
  });

  it("el cierre del usuario (cerrarSesionSupabase) sigue siendo global: signOut sin scope local", async () => {
    const { cerrarSesionSupabase } = await cargar();

    await cerrarSesionSupabase();

    expect(auth.signOut).toHaveBeenCalledWith();
  });
});
