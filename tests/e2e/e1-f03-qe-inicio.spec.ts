import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";

test.describe("E1-F03 · Inicio del QE (con datos)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

  test("[E1-F03#1] muestra el resumen de equipo e historias, con acceso a ambos listados", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe`);

    const tarjetaEquipo = page.getByTestId("tarjeta-equipo");
    await expect(tarjetaEquipo).toContainText(/\d+/);
    const tarjetaHdu = page.getByTestId("tarjeta-hdu-qe");
    await expect(tarjetaHdu).toContainText(/\d+/);

    await expect(page.getByRole("link", { name: "Ver equipo" })).toHaveAttribute("href", "/qe/equipo");
    await expect(page.getByRole("link", { name: "Ver historias supervisadas" })).toHaveAttribute("href", "/qe/hdu");
  });
});

test.describe("E1-F03 · Inicio del QE (sin datos)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "sofia.json") });

  test("[E1-F03#2] informa explícitamente la ausencia de analistas, sin cifras ficticias", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe`);
    const tarjetaEquipo = page.getByTestId("tarjeta-equipo");
    await expect(tarjetaEquipo).toContainText("0");
  });
});
