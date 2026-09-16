import path from "node:path";
import { expect, test } from "@playwright/test";
import { fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { esperarPortal, iniciarSesionUI } from "../support/ui";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-F11 · Perfil (con sesión de la semilla)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

  test("[E1-F11#1] muestra nombre, correo y rol del usuario autenticado", async ({ page }) => {
    await page.goto(`${env.portalUrl}/perfil`);
    const contenido = page.locator("main");
    await expect(contenido.getByText(USUARIOS_SEMILLA.ana.nombre)).toBeVisible();
    await expect(contenido.getByText(USUARIOS_SEMILLA.ana.correo)).toBeVisible();
    await expect(contenido.getByText("Analista QA", { exact: false })).toBeVisible();
  });

  test("[E1-F11#2] el rol no es editable desde el perfil personal", async ({ page }) => {
    await page.goto(`${env.portalUrl}/perfil`);
    await expect(page.getByText("no es editable desde tu perfil")).toBeVisible();
    // No hay ningún control de formulario (select/input) para el rol en esta pantalla.
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
  });
});

test.describe("E1-F11 · Perfil (rol recién cambiado)", () => {
  test("[E1-F11#3] al reabrir el perfil se refleja el rol vigente tras un cambio del Administrador", async ({ page, request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const contrasena = "Quality360Prueba#F11!";
    const nuevo = await crearUsuario(request, sesionAdmin.accessToken, {
      nombre: nombreUnico("Perfil Actualizado"),
      correo: correoUnico("perfil-actualizado"),
      rol: "ANALISTA_QA",
    });
    await fijarContrasena(nuevo.id, contrasena);

    await iniciarSesionUI(page, nuevo.correo, contrasena);
    await esperarPortal(page, "ANALISTA_QA");
    await page.goto(`${env.portalUrl}/perfil`);
    const contenido = page.locator("main");
    await expect(contenido.getByText("Analista QA", { exact: false })).toBeVisible();

    await api.put(request, `/v1/usuarios/${nuevo.id}/rol`, { token: sesionAdmin.accessToken, body: { rol: "QE" } });

    await page.reload();
    await expect(contenido.getByText("Analista QA")).toHaveCount(0);
    await expect(contenido.locator(".badge", { hasText: "QE" })).toBeVisible();
  });
});
