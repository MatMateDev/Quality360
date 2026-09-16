import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

test.describe("E1-F02 · Portal QE", () => {
  test("[E1-F02#1] redirige al portal QE y muestra identidad y navegación de supervisión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/`);
    await expect(page).toHaveURL(/\/qe$/);
    await expect(page.getByText(USUARIOS_SEMILLA.carla.nombre)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Equipo" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Historias supervisadas" })).toBeVisible();
  });

  test("[E1-F02#2] al abrir una ruta administrativa es redirigido a su propio portal", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin`);
    await expect(page).toHaveURL(/\/qe$/);
  });

  test("[E1-F02#2] al abrir una ruta de analista es redirigido a su propio portal", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    await expect(page).toHaveURL(/\/qe$/);
  });

  test("[E1-F02#3] el menú solo trae equipo, historias supervisadas, perfil y cerrar sesión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe`);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link")).toHaveText(["Inicio", "Equipo", "Historias supervisadas", "Perfil"]);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Supervisión" })).toHaveCount(0);
  });
});
