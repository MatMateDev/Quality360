import path from "node:path";
import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearHdu, obtenerCatalogos, obtenerUsuarioPorCorreo } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

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

  test("[E2-F03#3] solo aparecen HDU asignadas al analista autenticado", async ({ page, request }) => {
    // HDU propias de la prueba (no de la semilla): el listado no pagina
    // (siempre la primera página, ordenada por creación descendente) y con
    // decenas de HDU ya creadas por esta suite, un código de la semilla
    // puede quedar fuera de esa primera página. Una HDU recién creada y
    // asignada siempre aparece primero, sin depender de cuánto haya crecido
    // el catálogo.
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const sesionCarla = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const ana = await obtenerUsuarioPorCorreo(request, sesionAdmin.accessToken, USUARIOS_SEMILLA.ana.correo);
    const beatriz = await obtenerUsuarioPorCorreo(request, sesionAdmin.accessToken, USUARIOS_SEMILLA.beatriz.correo);
    const { celula, sprint } = await obtenerCatalogos(request, sesionCarla.accessToken);

    const hduDeAna = await crearHdu(request, sesionCarla.accessToken, { codigo: codigoHduUnico("E2F03ANA"), celulaId: celula.id, sprintId: sprint.id });
    await api.put(request, `/v1/hdu/${hduDeAna.id}/analista`, { token: sesionCarla.accessToken, body: { analistaId: ana.id } });
    const hduDeBeatriz = await crearHdu(request, sesionCarla.accessToken, { codigo: codigoHduUnico("E2F03BEA"), celulaId: celula.id, sprintId: sprint.id });
    await api.put(request, `/v1/hdu/${hduDeBeatriz.id}/analista`, { token: sesionCarla.accessToken, body: { analistaId: beatriz.id } });

    await page.goto(`${env.portalUrl}/qa/hdu`);
    const filas = page.locator("tbody tr");
    await expect(filas.first()).toBeVisible();

    await expect(page.getByRole("link", { name: hduDeAna.codigo })).toBeVisible();
    await expect(page.getByRole("link", { name: hduDeBeatriz.codigo })).toHaveCount(0);
  });
});
