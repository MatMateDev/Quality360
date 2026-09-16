import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { obtenerUsuarioPorCorreo } from "../support/fixtures";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface EquipoQe {
  qe: { id: string; correo: string };
  items: Array<{ id: string; correo: string }>;
  total: number;
}

test.describe("E1-B04 · Analistas supervisados vigentes", () => {
  test("[E1-B04#1] solo devuelve relaciones vigentes, sin las finalizadas", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const respuesta = await api.get<EquipoQe>(request, "/v1/qe/analistas", { token: sesion.accessToken });

    expect(respuesta.status).toBe(200);
    const correos = respuesta.body.items.map((item) => item.correo);
    expect(correos).toContain(USUARIOS_SEMILLA.ana.correo);
    expect(correos).toContain(USUARIOS_SEMILLA.beatriz.correo);
    // Diego fue reasignado de Carla a Marcos: su relación con Carla ya terminó.
    expect(correos).not.toContain(USUARIOS_SEMILLA.diego.correo);
  });

  test("[E1-B04#2] un QE no puede pedir el equipo de otro QE (sin acceso administrativo)", async ({ request }) => {
    const sesionPatricia = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const marcos = await obtenerUsuarioPorCorreo(request, sesionPatricia.accessToken, USUARIOS_SEMILLA.marcos.correo);

    const sesionCarla = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const respuesta = await api.get(request, `/v1/qe/analistas?qeId=${marcos.id}`, { token: sesionCarla.accessToken });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });

  test("[E1-B04#3] un Administrador sí puede consultar el equipo de un QE indicando qeId", async ({ request }) => {
    const sesionPatricia = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const carla = await obtenerUsuarioPorCorreo(request, sesionPatricia.accessToken, USUARIOS_SEMILLA.carla.correo);

    const respuesta = await api.get<EquipoQe>(request, `/v1/qe/analistas?qeId=${carla.id}`, { token: sesionPatricia.accessToken });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.qe.correo).toBe(USUARIOS_SEMILLA.carla.correo);
    expect(respuesta.body.items.map((item) => item.correo)).toContain(USUARIOS_SEMILLA.ana.correo);
  });
});
