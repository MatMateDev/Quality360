import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

test.describe("E1-F12 · Cerrar sesión", () => {
  test("[E1-F12#1] la opción de cerrar sesión es visible desde cualquier pantalla", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

    await page.goto(`${env.portalUrl}/qa/hdu`);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

    await page.goto(`${env.portalUrl}/perfil`);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  });

  test("[E1-F12#2] al presionar Cerrar sesión se muestra la pantalla de inicio de sesión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
  });

  test("[E1-F12#3] tras cerrar sesión, volver atrás no permite consultar información protegida", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa/hdu`);
    await expect(page.getByRole("heading", { name: "Mis HDU" })).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // El cierre de sesión reemplaza la entrada de historial protegida
    // (`navigate(..., { replace: true })` en components/Layout.tsx), así que
    // "volver atrás" nunca puede reexponer la pantalla protegida: no queda
    // una entrada de historial hacia ella.
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Mis HDU" })).toHaveCount(0);

    // Y si, aun así, se reintenta la URL protegida directamente (p.ej. desde
    // el historial del navegador), sigue exigiendo autenticarse de nuevo.
    await page.goto(`${env.portalUrl}/qa/hdu`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Mis HDU" })).toHaveCount(0);
  });
});
