import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

test.describe("E1-F05 · Portal Analista QA", () => {
  test("[E1-F05#1] redirige al portal QA con su identidad y navegación", async ({ page }) => {
    await page.goto(`${env.portalUrl}/`);
    await expect(page).toHaveURL(/\/qa$/);
    await expect(page.getByText(USUARIOS_SEMILLA.ana.nombre)).toBeVisible();
  });

  test("[E1-F05#2] el menú y las rutas no presentan funciones administrativas ni de supervisión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link")).toHaveText(["Inicio", "Mis HDU", "Perfil"]);
    await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Equipo" })).toHaveCount(0);
  });

  test("[E1-F05#3] al abrir una ruta de QE es redirigido a su propio portal", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe`);
    await expect(page).toHaveURL(/\/qa$/);
  });

  test("[E1-F05#3] al abrir una ruta administrativa es redirigido a su propio portal", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin/usuarios`);
    await expect(page).toHaveURL(/\/qa$/);
  });
});
