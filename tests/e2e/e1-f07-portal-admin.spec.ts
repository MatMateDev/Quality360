import path from "node:path";
import { expect, test } from "@playwright/test";
import { iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { tokenExpirado } from "../support/tokenForjado";
import { corromperSesionAlmacenada } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

test.describe("E1-F07 · Portal Administrador", () => {
  test("[E1-F07#1] redirige al portal administrativo con los accesos habilitados", async ({ page }) => {
    await page.goto(`${env.portalUrl}/`);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(USUARIOS_SEMILLA.patricia.nombre)).toBeVisible();
  });

  test("[E1-F07#2] la navegación presenta accesos a usuarios, roles y supervisión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin`);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Usuarios" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Supervisión" })).toBeVisible();
  });

  test("[E1-F07#3] con la sesión expirada, se solicita iniciar sesión nuevamente", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin`);
    await expect(page).toHaveURL(/\/admin$/);

    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const vencido = tokenExpirado(sesion.userId, USUARIOS_SEMILLA.patricia.correo);
    await corromperSesionAlmacenada(page, vencido);

    // Navega dentro de la app (no recarga) para que el cliente HTTP dispare
    // una solicitud con el token vencido y reaccione al 401 SESION_EXPIRADA.
    await page.goto(`${env.portalUrl}/admin/usuarios`);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
  });
});
