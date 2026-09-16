import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { obtenerUsuarioPorCorreo } from "../support/fixtures";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B05 · Resumen de inicio del Analista QA", () => {
  test("[E1-B05#1] obtiene el supervisor vigente y las historias del analista autenticado", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo);
    const respuesta = await api.get<{ supervisor: { estado: string; datos?: { supervisor: { correo: string } | null } }; hdu: { estado: string; datos?: { hduAsignadas: number } } }>(
      request,
      "/v1/inicio/qa",
      { token: sesion.accessToken },
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.supervisor.datos?.supervisor?.correo).toBe(USUARIOS_SEMILLA.carla.correo);
    expect(respuesta.body.hdu.estado).toBe("ok");
    expect(respuesta.body.hdu.datos?.hduAsignadas).toBeGreaterThanOrEqual(3); // HDU-PAG-001, 003, 005
  });

  test("[E1-B05#2] representa explícitamente la ausencia de supervisor", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.francisco.correo, env.contrasenaDemo);
    const respuesta = await api.get<{ supervisor: { estado: string; datos?: { supervisor: unknown } } }>(
      request,
      "/v1/inicio/qa",
      { token: sesion.accessToken },
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.supervisor).toMatchObject({ estado: "ok", datos: { supervisor: null } });
  });

  test("[E1-B05#3] un analista no puede pedir el resumen de otro sin permiso", async ({ request }) => {
    const sesionPatricia = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const beatriz = await obtenerUsuarioPorCorreo(request, sesionPatricia.accessToken, USUARIOS_SEMILLA.beatriz.correo);

    const sesionAna = await iniciarSesion(USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo);
    const respuesta = await api.get(request, `/v1/inicio/qa?analistaId=${beatriz.id}`, { token: sesionAna.accessToken });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });
});
