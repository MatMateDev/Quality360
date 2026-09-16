import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { codigoHduUnico } from "../support/unique";
import { clicConReintentoPorLimiteTasa } from "../support/ui";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

const PATRON_URL_CREAR_HDU = /\/v1\/hdu$/;

async function completarFormularioBase(page: import("@playwright/test").Page) {
  await page.getByLabel("Célula").selectOption({ index: 1 });
  await page.getByLabel("Sprint").selectOption({ index: 1 });
}

test.describe("E2-F01 · Registro de HDU", () => {
  test("[E2-F01#1] con datos válidos crea la HDU en Pendiente y aparece en el listado", async ({ page }) => {
    const codigo = codigoHduUnico("E2F01");
    await page.goto(`${env.portalUrl}/qe/hdu/nueva`);

    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("Título").fill(`Historia de prueba ${codigo}`);
    await completarFormularioBase(page);
    await clicConReintentoPorLimiteTasa(page, page.getByRole("button", { name: "Guardar" }), PATRON_URL_CREAR_HDU);

    await expect(page).toHaveURL(/\/hdu\/[0-9a-f-]+$/);
    await expect(page.getByText(codigo, { exact: true })).toBeVisible();
    const filaEstado = page.locator("article", { has: page.getByText("Estado", { exact: true }) });
    await expect(filaEstado).toContainText("Pendiente");
  });

  test("[E2-F01#2] indica los campos faltantes y no crea la HDU", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe/hdu/nueva`);
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("El código es obligatorio.")).toBeVisible();
    await expect(page.getByText("El título es obligatorio.")).toBeVisible();
    await expect(page).toHaveURL(/\/qe\/hdu\/nueva$/);
  });

  test("[E2-F01#3] informa el duplicado y pide corregirlo", async ({ page }) => {
    const codigo = codigoHduUnico("E2F01DUP");

    await page.goto(`${env.portalUrl}/qe/hdu/nueva`);
    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("Título").fill(`Historia duplicada ${codigo}`);
    await completarFormularioBase(page);
    await clicConReintentoPorLimiteTasa(page, page.getByRole("button", { name: "Guardar" }), PATRON_URL_CREAR_HDU);
    await expect(page).toHaveURL(/\/hdu\/[0-9a-f-]+$/);

    await page.goto(`${env.portalUrl}/qe/hdu/nueva`);
    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("Título").fill(`Historia duplicada otra vez ${codigo}`);
    await completarFormularioBase(page);
    await clicConReintentoPorLimiteTasa(page, page.getByRole("button", { name: "Guardar" }), PATRON_URL_CREAR_HDU);

    await expect(page.getByTestId("error-codigo-hdu")).toBeVisible();
    await expect(page).toHaveURL(/\/qe\/hdu\/nueva$/);
  });
});
