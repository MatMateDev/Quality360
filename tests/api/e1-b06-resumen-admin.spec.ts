import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface InicioAdmin {
  usuarios: { estado: string; datos?: { total: number; activos: number; inactivos: number } };
  supervision: { estado: string; datos?: { relacionesVigentes: number } };
}

test.describe("E1-B06 · Resumen de inicio del Administrador", () => {
  test("[E1-B06#1] un usuario no administrador no puede pedir el resumen administrativo", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const respuesta = await api.get(request, "/v1/inicio/admin", { token: sesion.accessToken });
    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });

  test("[E1-B06#2] devuelve información consistente con el registro de usuarios y supervisión", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const respuesta = await api.get<InicioAdmin>(request, "/v1/inicio/admin", { token: sesion.accessToken });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuarios.estado).toBe("ok");
    expect(respuesta.body.supervision.estado).toBe("ok");
    const datosUsuarios = respuesta.body.usuarios.datos!;
    expect(datosUsuarios.total).toBe(datosUsuarios.activos + datosUsuarios.inactivos);
    expect(datosUsuarios.total).toBeGreaterThanOrEqual(10); // al menos la semilla
  });

  test("[E1-B06#3] un usuario recién registrado se refleja de inmediato (sin caché)", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    const antes = await api.get<InicioAdmin>(request, "/v1/inicio/admin", { token: sesion.accessToken });
    const totalAntes = antes.body.usuarios.datos!.total;

    await crearUsuario(request, sesion.accessToken, {
      nombre: nombreUnico("Usuario Reciente"),
      correo: correoUnico("usuario-reciente"),
      rol: "ANALISTA_QA",
    });

    const despues = await api.get<InicioAdmin>(request, "/v1/inicio/admin", { token: sesion.accessToken });
    expect(despues.body.usuarios.datos!.total).toBe(totalAntes + 1);
  });
});
