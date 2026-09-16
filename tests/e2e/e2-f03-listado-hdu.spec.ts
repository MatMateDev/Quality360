import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

test.describe("E2-F03 · Listado de HDU del Analista QA", () => {
  test("[E2-F03#1] el filtro por sprint muestra solo las HDU de ese sprint", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa/hdu`);
    await expect(page.locator("tbody tr").first()).toBeVisible();

    const opcionesSprint = await page.getByLabel("Sprint").locator("option").allTextContents();
    const sprintElegido = opcionesSprint.find((texto) => texto !== "Todos los sprints");
    expect(sprintElegido).toBeTruthy();

    await page.getByLabel("Sprint").selectOption({ label: sprintElegido! });
    const filas = page.locator("tbody tr");
    // La tabla pasa por "cargando" al cambiar el filtro: se espera a que
    // vuelva a haber al menos una fila antes de contar (auto-retry).
    await expect(filas.first()).toBeVisible();
    const total = await filas.count();
    expect(total).toBeGreaterThan(0);
    for (let indice = 0; indice < total; indice += 1) {
      await expect(filas.nth(indice)).toContainText(sprintElegido!);
    }
  });

  test("[E2-F03#2] informa que no hay HDU cuando ningún registro cumple los filtros", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa/hdu`);
    await expect(page.locator("tbody tr").first()).toBeVisible();

    // D11: en esta corrida ninguna HDU llega a Cerrada, así que este filtro
    // nunca tiene coincidencias para ningún usuario.
    await page.getByLabel("Estado").selectOption({ label: "Cerrada" });

    await expect(page.getByTestId("bloque-mis-hdu-vacio")).toContainText("No hay historias de usuario con esos criterios.");
  });

  test("[E2-F03#3] solo aparecen HDU asignadas al analista autenticado", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa/hdu`);
    const filas = page.locator("tbody tr");
    await expect(filas.first()).toBeVisible();

    // HDU de la semilla asignadas a Ana (ver infrastructure/seed/mvp/README.md).
    await expect(page.getByRole("link", { name: "HDU-PAG-001" })).toBeVisible();
    await expect(page.getByRole("link", { name: "HDU-PAG-003" })).toBeVisible();
    // HDU-PAG-002 y HDU-PAG-004 son de Beatriz, no de Ana: no deben listarse.
    await expect(page.getByRole("link", { name: "HDU-PAG-002" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "HDU-PAG-004" })).toHaveCount(0);
  });
});
