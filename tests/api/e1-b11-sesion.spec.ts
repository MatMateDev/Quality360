import { expect, test } from "@playwright/test";
import { crearCuentaSoloEnProveedor, eliminarCuenta } from "../support/adminIdentidad";
import { api, iniciarSesion, type Sesion } from "../support/api";
import { env } from "../support/env";
import { tokenExpirado } from "../support/tokenForjado";
import { USUARIOS_SEMILLA } from "../support/usuarios";

async function renovar(sesion: Sesion): Promise<{ status: number; errorCode: unknown }> {
  const respuesta = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: sesion.refreshToken }),
  });
  const cuerpo = (await respuesta.json()) as { error_code?: unknown; code?: unknown };
  return { status: respuesta.status, errorCode: cuerpo.error_code ?? cuerpo.code };
}

/** Lo que el proveedor sabe de la sesión: `GET /auth/v1/user` con ese access token. */
async function usuarioEnProveedor(accessToken: string): Promise<{ status: number; errorCode: unknown }> {
  const respuesta = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
  });
  const cuerpo = (await respuesta.json()) as { error_code?: unknown };
  return { status: respuesta.status, errorCode: cuerpo.error_code };
}

async function cerrarSesion(accessToken: string, alcance?: "local" | "global"): Promise<number> {
  const consulta = alcance ? `?scope=${alcance}` : "";
  const respuesta = await fetch(`${env.supabaseUrl}/auth/v1/logout${consulta}`, {
    method: "POST",
    headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
  });
  return respuesta.status;
}

test.describe("E1-B11 · Expiración y cierre de sesión", () => {
  test("[E1-B11#1] una sesión vencida rechaza la operación protegida", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const vencido = tokenExpirado(sesion.userId, USUARIOS_SEMILLA.carla.correo);

    const respuesta = await api.get(request, "/v1/me", { token: vencido });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toMatchObject({ codigo: "SESION_EXPIRADA" });
  });

  test("[E1-B11#2] cerrar sesión invalida su renovación (revoca el refresh token)", async () => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.diego.correo, env.contrasenaDemo);

    expect(await cerrarSesion(sesion.accessToken, "local")).toBeLessThan(300);

    const intento = await renovar(sesion);
    expect(intento.status).toBeGreaterThanOrEqual(400);
    expect(intento.errorCode).toBeTruthy();
  });

  test("[E1-B11#2] el signOut() del portal (alcance global) revoca la renovación de todas las sesiones del usuario", async () => {
    // supabase-js `signOut()` sin opciones usa scope=global: cierra la sesión
    // en todos los dispositivos del usuario, no solo en el navegador actual.
    // Cuenta propia de la prueba: un cierre global sobre alguien de la semilla
    // revocaría las sesiones que guarda tests/e2e/auth.setup.ts.
    const correo = `cierre-global-${Date.now()}@quality360.local`;
    const contrasena = "CierreGlobal#B11";
    const id = await crearCuentaSoloEnProveedor(correo, contrasena);
    try {
      const actual = await iniciarSesion(correo, contrasena);
      const otroDispositivo = await iniciarSesion(correo, contrasena);

      expect(await cerrarSesion(actual.accessToken)).toBe(204);

      for (const sesion of [actual, otroDispositivo]) {
        const intento = await renovar(sesion);
        expect(intento.status).toBe(400);
        expect(intento.errorCode).toBe("refresh_token_not_found");
      }
      // El proveedor da la sesión por cerrada: ya no reconoce ese access token.
      expect(await usuarioEnProveedor(actual.accessToken)).toEqual({ status: 403, errorCode: "session_not_found" });
    } finally {
      await eliminarCuenta(id);
    }
  });

  test("[E1-B11#3] el alcance de la revocación es el documentado: el access token ya emitido sigue vigente hasta su exp", async ({ request }) => {
    // apps/gateway/README.md, sección "Sesión: qué revoca signOut y qué no":
    // signOut revoca el refresh token, pero el access token ya emitido sigue
    // siendo válido hasta su `exp` (el gateway lo verifica sin consultar al
    // proveedor). La autorización real depende de Organización (D4), no del
    // token — ver E1-B07#3.
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.elena.correo, env.contrasenaDemo);

    await cerrarSesion(sesion.accessToken, "local");

    // El proveedor ya no reconoce la sesión (session_not_found)...
    expect(await usuarioEnProveedor(sesion.accessToken)).toEqual({ status: 403, errorCode: "session_not_found" });

    // ...pero el gateway verifica el JWT localmente (JWKS, sin consultar al
    // proveedor): mismo access token, sin renovarlo, sigue autenticando hasta
    // su exp (jwt_expiry = 3600 s en local). Documentado, no un defecto.
    const respuesta = await api.get(request, "/v1/me", { token: sesion.accessToken });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ correo: USUARIOS_SEMILLA.elena.correo });
  });
});
