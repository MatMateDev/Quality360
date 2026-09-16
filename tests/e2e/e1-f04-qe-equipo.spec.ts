import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-F04 · Equipo del QE (con analistas vigentes)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

  test("[E1-F04#1] muestra solo analistas con supervisión vigente, con nombre y correo", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe/equipo`);
    await expect(page.getByText(USUARIOS_SEMILLA.ana.correo)).toBeVisible();
    await expect(page.getByText(USUARIOS_SEMILLA.beatriz.correo)).toBeVisible();
  });

  test("[E1-F04#2] un analista reasignado a otro QE no aparece en el listado", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe/equipo`);
    // Diego fue reasignado de Carla a Marcos (ver infrastructure/seed/mvp/README.md).
    await expect(page.getByText(USUARIOS_SEMILLA.diego.correo)).toHaveCount(0);
  });
});

test.describe("E1-F04 · Equipo del QE (sin analistas)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "sofia.json") });

  test("[E1-F04#3] informa que no hay analistas asignados", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe/equipo`);
    await expect(page.getByTestId("bloque-equipo-lista-vacio")).toContainText("No tienes analistas asignados.");
  });
});
