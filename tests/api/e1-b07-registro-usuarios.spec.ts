import { expect, test } from "@playwright/test";
import { fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B07 · Registro y actualización de usuarios", () => {
  test("[E1-B07#1] rechaza un correo duplicado tras validar los campos", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const correo = correoUnico("duplicado");

    const primero = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("Original"), correo, rol: "ANALISTA_QA" });
    expect(primero.correo).toBe(correo);

    const segundo = await api.post(request, "/v1/usuarios", {
      token: sesion.accessToken,
      body: { nombre: nombreUnico("Duplicado"), correo, rol: "ANALISTA_QA" },
    });
    expect(segundo.status).toBe(409);
    expect(segundo.body).toMatchObject({ codigo: "CORREO_DUPLICADO" });
  });

  test("[E1-B07#2] el identificador se mantiene estable al actualizar el correo", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const creado = await crearUsuario(request, sesion.accessToken, {
      nombre: nombreUnico("Correo Cambia"),
      correo: correoUnico("correo-original"),
      rol: "ANALISTA_QA",
    });

    const nuevoCorreo = correoUnico("correo-actualizado");
    const actualizado = await api.patch<{ id: string; correo: string }>(request, `/v1/usuarios/${creado.id}`, {
      token: sesion.accessToken,
      body: { correo: nuevoCorreo },
    });

    expect(actualizado.status).toBe(200);
    expect(actualizado.body.id).toBe(creado.id);
    expect(actualizado.body.correo).toBe(nuevoCorreo.toLowerCase());
  });

  test("[E1-B07#3] un usuario desactivado no puede seguir operando aunque su token siga vigente", async ({ request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const contrasena = "Quality360Prueba#B07!";
    const nuevo = await crearUsuario(request, sesionAdmin.accessToken, {
      nombre: nombreUnico("Se Desactiva"),
      correo: correoUnico("se-desactiva"),
      rol: "ANALISTA_QA",
    });
    await fijarContrasena(nuevo.id, contrasena);
    const sesionNuevo = await iniciarSesion(nuevo.correo, contrasena);

    // El token sigue siendo válido; antes de desactivar, la operación funciona.
    const antes = await api.get(request, "/v1/me", { token: sesionNuevo.accessToken });
    expect(antes.status).toBe(200);

    const desactivacion = await api.patch(request, `/v1/usuarios/${nuevo.id}`, { token: sesionAdmin.accessToken, body: { activo: false } });
    expect(desactivacion.status).toBe(200);

    // Mismo token, sin volver a iniciar sesión: la siguiente solicitud se rechaza.
    const despues = await api.get(request, "/v1/me", { token: sesionNuevo.accessToken });
    expect(despues.status).toBe(403);
    expect(despues.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });
});
