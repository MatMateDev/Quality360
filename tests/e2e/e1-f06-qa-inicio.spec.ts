import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-F06 · Inicio del Analista QA (con supervisor)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

  test("[E1-F06#1] muestra el nombre del QE supervisor y la cantidad de HDU asignadas", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    await expect(page.getByTestId("valor-supervisor")).toHaveText(USUARIOS_SEMILLA.carla.nombre);
    await expect(page.getByTestId("tarjeta-hdu-qa")).toContainText(/\d+/);
    await expect(page.getByRole("link", { name: "Ver mis HDU" })).toHaveAttribute("href", "/qa/hdu");
  });
});

test.describe("E1-F06 · Inicio del Analista QA (sin supervisor)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "francisco.json") });

  test("[E1-F06#2] informa que no tiene supervisor asignado", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    await expect(page.getByTestId("valor-supervisor")).toHaveText("Sin supervisor asignado");
  });
});
