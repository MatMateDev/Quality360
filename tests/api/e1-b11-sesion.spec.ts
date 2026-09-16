import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { tokenExpirado } from "../support/tokenForjado";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B11 · Expiración y cierre de sesión", () => {
  test("[E1-B11#1] una sesión vencida rechaza la operación protegida", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const vencido = tokenExpirado(sesion.userId, USUARIOS_SEMILLA.carla.correo);

    const respuesta = await api.get(request, "/v1/me", { token: vencido });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toMatchObject({ codigo: "SESION_EXPIRADA" });
  });

  test("[E1-B11#2] cerrar sesión invalida su renovación (revoca el refresh token)", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.diego.correo, env.contrasenaDemo);

    const cierre = await fetch(`${env.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${sesion.accessToken}` },
    });
    expect(cierre.status).toBeLessThan(300);

    const intentoRenovar = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: sesion.refreshToken }),
    });

    expect(intentoRenovar.status).toBeGreaterThanOrEqual(400);
    const cuerpo = await intentoRenovar.json();
    expect(cuerpo.error_code ?? cuerpo.code).toBeTruthy();
  });

  test("[E1-B11#3] el alcance de la revocación es el documentado: el access token ya emitido sigue vigente hasta su exp", async ({ request }) => {
    // apps/gateway/README.md, sección "Sesión: qué revoca signOut y qué no":
    // signOut revoca el refresh token, pero el access token ya emitido sigue
    // siendo válido hasta su `exp` (el gateway lo verifica sin consultar al
    // proveedor). La autorización real depende de Organización (D4), no del
    // token — ver E1-B07#3.
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.elena.correo, env.contrasenaDemo);

    await fetch(`${env.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${sesion.accessToken}` },
    });

    // Mismo access token, sin renovarlo: sigue autenticando (documentado, no un defecto).
    const respuesta = await api.get(request, "/v1/me", { token: sesion.accessToken });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ correo: USUARIOS_SEMILLA.elena.correo });
  });
});
