import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { obtenerUsuarioPorCorreo } from "../support/fixtures";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B02 · Sesión, rol y ámbito en cada solicitud", () => {
  test("[E1-B02#1] sin sesión válida, la operación protegida es rechazada", async ({ request }) => {
    const sinToken = await api.get(request, "/v1/me");
    expect(sinToken.status).toBe(401);
    expect(sinToken.body).toMatchObject({ codigo: "NO_AUTENTICADO" });

    const tokenBasura = await api.get(request, "/v1/usuarios", { token: "esto-no-es-un-jwt-valido" });
    expect(tokenBasura.status).toBe(401);
  });

  test("[E1-B02#2] un Analista QA no puede consultar el resumen de otro analista", async ({ request }) => {
    const sesionPatricia = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const beatriz = await obtenerUsuarioPorCorreo(request, sesionPatricia.accessToken, USUARIOS_SEMILLA.beatriz.correo);

    const sesionAna = await iniciarSesion(USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo);
    const respuesta = await api.get(request, `/v1/inicio/qa?analistaId=${beatriz.id}`, { token: sesionAna.accessToken });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });

  test("[E1-B02#3] un QE no puede consultar el equipo de otro QE", async ({ request }) => {
    const sesionPatricia = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const marcos = await obtenerUsuarioPorCorreo(request, sesionPatricia.accessToken, USUARIOS_SEMILLA.marcos.correo);

    const sesionCarla = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const respuesta = await api.get(request, `/v1/qe/analistas?qeId=${marcos.id}`, { token: sesionCarla.accessToken });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });
});
