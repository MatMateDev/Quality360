import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B10 · Perfil del usuario autenticado", () => {
  test("[E1-B10#1] la identidad se obtiene desde la sesión validada", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.marcos.correo, env.contrasenaDemo);
    const respuesta = await api.get<{ id: string; correo: string; rol: string }>(request, "/v1/me", { token: sesion.accessToken });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.id).toBe(sesion.userId);
    expect(respuesta.body.correo).toBe(USUARIOS_SEMILLA.marcos.correo);
    expect(respuesta.body.rol).toBe("QE");
  });

  test("[E1-B10#2] devuelve únicamente los datos necesarios", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.elena.correo, env.contrasenaDemo);
    const respuesta = await api.get<Record<string, unknown>>(request, "/v1/me", { token: sesion.accessToken });

    expect(respuesta.status).toBe(200);
    expect(Object.keys(respuesta.body).sort()).toEqual(["correo", "id", "nombre", "rol"]);
  });

  test("[E1-B10#3] no expone contraseñas, secretos ni credenciales", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.beatriz.correo, env.contrasenaDemo);
    const respuesta = await api.get(request, "/v1/me", { token: sesion.accessToken });

    const crudo = JSON.stringify(respuesta.body).toLowerCase();
    for (const palabra of ["password", "contrasena", "contraseña", "secret", "token", "refresh"]) {
      expect(crudo).not.toContain(palabra);
    }
  });
});
