import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

test.describe("E1-F08 · Inicio del Administrador", () => {
  test("[E1-F08#1] muestra accesos a gestión de usuarios, roles y supervisión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin`);

    await expect(page.getByTestId("tarjeta-usuarios-total")).toContainText(/\d+/);
    await expect(page.getByTestId("tarjeta-usuarios-activos")).toContainText(/\d+/);
    await expect(page.getByTestId("tarjeta-supervision-vigentes")).toContainText(/\d+/);
    await expect(page.getByTestId("tarjeta-supervision-sin-supervisor")).toContainText(/\d+/);

    await expect(page.getByRole("link", { name: "Gestionar usuarios" })).toHaveAttribute("href", "/admin/usuarios");
    await expect(page.getByRole("link", { name: "Gestionar supervisión" })).toHaveAttribute("href", "/admin/supervision");
  });

  test("[E1-F08#3] al seleccionar un acceso se abre la pantalla correspondiente", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin`);
    await page.getByRole("link", { name: "Gestionar usuarios" }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

    await page.goto(`${env.portalUrl}/admin`);
    await page.getByRole("link", { name: "Gestionar supervisión" }).click();
    await expect(page).toHaveURL(/\/admin\/supervision$/);
    await expect(page.getByRole("heading", { name: "Supervisión", level: 1 })).toBeVisible();
  });
});
