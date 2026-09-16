import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearHdu, obtenerCatalogos, obtenerUsuarioPorCorreo } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

async function crearHduSinAnalista(request: APIRequestContext, prefijo: string) {
  const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
  const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
  return crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico(prefijo), celulaId: celula.id, sprintId: sprint.id });
}

test.describe("E2-F02 · Asignación de analista", () => {
  test("[E2-F02#1] asigna un analista de mi equipo y queda visible para él", async ({ page, request }) => {
    const hdu = await crearHduSinAnalista(request, "E2F02A");

    await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
    await page.getByRole("button", { name: "Asignar analista" }).click();
    const dialogo = page.getByRole("dialog", { name: "Asignar analista" });
    await dialogo.getByLabel("Analista QA").selectOption({ label: USUARIOS_SEMILLA.ana.nombre });
    await dialogo.getByRole("button", { name: "Confirmar" }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByTestId("valor-analista-hdu")).toHaveText(USUARIOS_SEMILLA.ana.nombre);
  });

  test("[E2-F02#2] el selector solo lista analistas de mi equipo vigente", async ({ page, request }) => {
    const hdu = await crearHduSinAnalista(request, "E2F02B");

    await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
    await page.getByRole("button", { name: "Asignar analista" }).click();
    const dialogo = page.getByRole("dialog", { name: "Asignar analista" });
    const opciones = await dialogo.getByLabel("Analista QA").locator("option").allTextContents();

    expect(opciones).toContain(USUARIOS_SEMILLA.ana.nombre);
    expect(opciones).toContain(USUARIOS_SEMILLA.beatriz.nombre);
    // Diego es del equipo de Marcos, no del de Carla.
    expect(opciones).not.toContain(USUARIOS_SEMILLA.diego.nombre);
  });

  test("[E2-F02#3] reasignar pide confirmación y registra el cambio", async ({ page, request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2F02C"), celulaId: celula.id, sprintId: sprint.id });

    // Primera asignación por API para llegar directo al escenario de reasignación.
    // `GET /v1/usuarios` es solo de Administrador (contrato): se busca el id
    // con la sesión de Patricia y se asigna con la de Carla (QE responsable).
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const beatriz = await obtenerUsuarioPorCorreo(request, sesionAdmin.accessToken, USUARIOS_SEMILLA.beatriz.correo);
    await api.put(request, `/v1/hdu/${hdu.id}/analista`, { token: sesion.accessToken, body: { analistaId: beatriz.id } });

    await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
    await expect(page.getByTestId("valor-analista-hdu")).toHaveText(USUARIOS_SEMILLA.beatriz.nombre);

    await page.getByRole("button", { name: "Reasignar analista" }).click();
    const dialogo = page.getByRole("dialog", { name: "Reasignar analista" });
    await dialogo.getByLabel("Analista QA").selectOption({ label: USUARIOS_SEMILLA.ana.nombre });
    await expect(dialogo.getByLabel("Motivo del cambio")).toBeVisible();
    await dialogo.getByLabel("Motivo del cambio").fill("Motivo de prueba E2-F02#3 desde la interfaz.");
    await dialogo.getByRole("button", { name: "Confirmar" }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByTestId("valor-analista-hdu")).toHaveText(USUARIOS_SEMILLA.ana.nombre);

    await expect(page.locator(".historial-lista")).toContainText("Motivo de prueba E2-F02#3 desde la interfaz.");
  });
});
