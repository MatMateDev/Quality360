import { expect, test } from "@playwright/test";
import { fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { enlaceDeVerificacion, esperarCorreoNuevo, idsRecibidos } from "../support/correoLocal";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * E1-B13 · Restablecimiento seguro de la contraseña («¿Olvidaste tu contraseña?»).
 *
 * El portal llama a `resetPasswordForEmail(correo, { redirectTo: origin +
 * "/restablecer-contrasena" })` y, en esa ruta, a `updateUser({ password })`
 * seguido de `signOut()`. El gateway no participa: todo ocurre contra Supabase
 * Auth (el gateway no recibe contraseñas). Estas pruebas reproducen las mismas
 * llamadas HTTP del cliente `@supabase/supabase-js` (flujo `implicit`, el que
 * usa el portal) contra Supabase local y leen el correo en su Mailpit.
 *
 * Usa un Analista QA creado por la propia prueba (regla de aislamiento: no se
 * muta un usuario de la semilla). Cambiar la contraseña y el signOut() global
 * revocan todas las sesiones del usuario, así que hacerlo con alguien de la
 * semilla invalidaría las sesiones que guarda tests/e2e/auth.setup.ts.
 */

const PORTAL_LOCAL = "http://localhost:5173";
const REDIRECCION = `${PORTAL_LOCAL}/restablecer-contrasena`;
const CONTRASENA_INICIAL = "Quality360Recupera#1";
const USUARIO = { correo: "" };

interface RespuestaAuth {
  status: number;
  body: Record<string, unknown>;
}

async function postAuth(ruta: string, cuerpo: unknown, token?: string, metodo = "POST"): Promise<RespuestaAuth> {
  const headers: Record<string, string> = { apikey: env.supabaseAnonKey, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const respuesta = await fetch(`${env.supabaseUrl}/auth/v1${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, body: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

/** Igual que `resetPasswordForEmail`: `POST /recover?redirect_to=...` con `{ email }`. */
function solicitarRecuperacion(correo: string, redireccion = REDIRECCION): Promise<RespuestaAuth> {
  return postAuth(`/recover?redirect_to=${encodeURIComponent(redireccion)}`, { email: correo });
}

/**
 * Solicita la recuperación respetando `max_frequency` del proveedor (1 s en
 * local, 60 s por defecto en la nube): si el envío anterior al mismo usuario
 * es demasiado reciente, espera lo que indica Supabase y reintenta una vez.
 */
async function solicitarRecuperacionCuandoSePueda(correo: string, redireccion = REDIRECCION): Promise<RespuestaAuth> {
  const primera = await solicitarRecuperacion(correo, redireccion);
  if (primera.status !== 429 || primera.body.error_code !== "over_email_send_rate_limit") return primera;
  const segundos = Number(String(primera.body.msg ?? "").match(/after (\d+) seconds?/)?.[1] ?? "1");
  await new Promise((resolver) => setTimeout(resolver, (segundos + 1.2) * 1000));
  return solicitarRecuperacion(correo, redireccion);
}

async function codigoLogin(correo: string, contrasena: string): Promise<RespuestaAuth> {
  return postAuth("/token?grant_type=password", { email: correo, password: contrasena });
}

/** Pide el correo de recuperación y devuelve el enlace recibido en Mailpit. */
async function enlaceDeRecuperacion(redireccion = REDIRECCION): Promise<URL> {
  const previos = await idsRecibidos(USUARIO.correo);
  const solicitud = await solicitarRecuperacionCuandoSePueda(USUARIO.correo, redireccion);
  expect(solicitud.status).toBe(200);
  return enlaceDeVerificacion(await esperarCorreoNuevo(USUARIO.correo, previos));
}

/** Abre el enlace como lo haría el navegador, sin seguir la redirección. */
async function abrirEnlace(enlace: URL): Promise<{ status: number; destino: URL; fragmento: URLSearchParams }> {
  const respuesta = await fetch(enlace, { redirect: "manual" });
  const destino = new URL(respuesta.headers.get("location") ?? "about:blank");
  return { status: respuesta.status, destino, fragmento: new URLSearchParams(destino.hash.slice(1)) };
}

test.describe("E1-B13 · Recuperación de contraseña con Supabase Auth", () => {
  test.describe.configure({ mode: "serial" });

  let usuarioId = "";

  test.beforeAll(async ({ request }) => {
    // Alta real por Organización (invitación) y contraseña inicial fijada con
    // la Admin API, como si el usuario ya hubiera aceptado la invitación.
    const admin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const creado = await crearUsuario(request, admin.accessToken, {
      nombre: nombreUnico("Recupera Clave"),
      correo: correoUnico("recupera-clave"),
      rol: "ANALISTA_QA",
    });
    usuarioId = creado.id;
    USUARIO.correo = creado.correo;
    await fijarContrasena(usuarioId, CONTRASENA_INICIAL);
  });

  /** Deja la contraseña inicial conocida antes de cada escenario que la necesita. */
  async function restablecerContrasenaInicial(): Promise<void> {
    await fijarContrasena(usuarioId, CONTRASENA_INICIAL);
  }

  test("[E1-B13#1] pedir el restablecimiento responde igual para un correo registrado y para uno inexistente", async () => {
    const registrado = await solicitarRecuperacionCuandoSePueda(USUARIO.correo);
    const inexistente = await solicitarRecuperacionCuandoSePueda(`no-existe-${Date.now()}@quality360.local`);

    expect(registrado.status).toBe(200);
    expect(inexistente.status).toBe(registrado.status);
    expect(inexistente.body).toEqual(registrado.body);
    expect(registrado.body).toEqual({});
  });

  test("[E1-B13#1] el correo llega al buzón local con un enlace de recuperación hacia /restablecer-contrasena", async () => {
    const enlace = await enlaceDeRecuperacion();

    expect(enlace.pathname).toBe("/auth/v1/verify");
    expect(enlace.searchParams.get("type")).toBe("recovery");
    expect(enlace.searchParams.get("token")).toBeTruthy();
    expect(enlace.searchParams.get("redirect_to")).toBe(REDIRECCION);

    // Al abrirlo, Supabase redirige al portal con la sesión de recuperación en
    // el fragmento (flujo implicit), que es lo que lee /restablecer-contrasena.
    const apertura = await abrirEnlace(enlace);
    expect(apertura.status).toBe(303);
    expect(`${apertura.destino.origin}${apertura.destino.pathname}`).toBe(REDIRECCION);
    expect(apertura.fragmento.get("type")).toBe("recovery");
    expect(apertura.fragmento.get("access_token")).toBeTruthy();
  });

  test("[E1-B13#2] con el enlace se fija una contraseña nueva: la anterior deja de servir y la nueva sí", async ({ request }) => {
    await restablecerContrasenaInicial();
    const sesionPrevia = await iniciarSesion(USUARIO.correo, CONTRASENA_INICIAL);
    const enlace = await enlaceDeRecuperacion();
    const { fragmento } = await abrirEnlace(enlace);
    const tokenRecuperacion = fragmento.get("access_token") ?? "";
    expect(tokenRecuperacion).toBeTruthy();

    // updateUser({ password }) y luego signOut(), como hace el portal.
    const nueva = `Recuperada#${Date.now()}`;
    const cambio = await postAuth("/user", { password: nueva }, tokenRecuperacion, "PUT");
    expect(cambio.status).toBe(200);
    const cierre = await fetch(`${env.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${tokenRecuperacion}` },
    });
    expect(cierre.status).toBeLessThan(300);

    const conAnterior = await codigoLogin(USUARIO.correo, CONTRASENA_INICIAL);
    expect(conAnterior.status).toBe(400);
    expect(conAnterior.body.error_code).toBe("invalid_credentials");

    const conNueva = await iniciarSesion(USUARIO.correo, nueva);
    const perfil = await api.get(request, "/v1/me", { token: conNueva.accessToken });
    expect(perfil.status).toBe(200);
    expect(perfil.body).toMatchObject({ correo: USUARIO.correo });

    // Cambiar la contraseña revoca la renovación de las sesiones abiertas antes.
    const renovarPrevia = await postAuth("/token?grant_type=refresh_token", { refresh_token: sesionPrevia.refreshToken });
    expect(renovarPrevia.status).toBe(400);
  });

  test("[E1-B13#1] el mismo enlace usado dos veces falla", async () => {
    const enlace = await enlaceDeRecuperacion();

    const primera = await abrirEnlace(enlace);
    expect(primera.fragmento.get("access_token")).toBeTruthy();

    const segunda = await abrirEnlace(enlace);
    expect(segunda.fragmento.get("access_token")).toBeNull();
    expect(segunda.fragmento.get("error_code")).toBe("otp_expired");
    expect(segunda.fragmento.get("error")).toBe("access_denied");
  });

  test("[E1-B13#3] un redirectTo fuera de la lista permitida no se respeta (sin redirección abierta)", async () => {
    const enlace = await enlaceDeRecuperacion("https://sitio-ajeno.example/restablecer-contrasena");

    const destino = enlace.searchParams.get("redirect_to") ?? "";
    expect(destino).not.toContain("sitio-ajeno.example");
    // Supabase cae al site_url del proyecto (http://127.0.0.1:5173 en local).
    expect(new URL(destino).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  });

  test("[E1-B13#3] un reenvío inmediato a un correo registrado responde 429 over_email_send_rate_limit: el portal debe tratarlo como éxito", async () => {
    // Comportamiento del proveedor que el portal debe neutralizar: Supabase
    // limita el reenvío por usuario (max_frequency) solo cuando la cuenta
    // existe; para un correo inexistente siempre responde 200. Si el portal
    // mostrara un error distinto ante este 429, revelaría que el correo está
    // registrado. Se fija aquí para que el contrato del front no se pierda.
    const primera = await solicitarRecuperacionCuandoSePueda(USUARIO.correo);
    expect(primera.status).toBe(200);
    const inmediata = await solicitarRecuperacion(USUARIO.correo);
    expect(inmediata.status).toBe(429);
    expect(inmediata.body.error_code).toBe("over_email_send_rate_limit");

    const inexistente = `no-existe-${Date.now()}@quality360.local`;
    expect((await solicitarRecuperacion(inexistente)).status).toBe(200);
    expect((await solicitarRecuperacion(inexistente)).status).toBe(200);
  });
});
