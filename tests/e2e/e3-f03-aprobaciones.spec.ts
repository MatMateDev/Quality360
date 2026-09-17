import path from "node:path";
import { expect, test } from "@playwright/test";
import { crearHduAsignadaAAna, marcarConEnlace } from "../support/checklist";
import { env } from "../support/env";
import { clicChecklistConReintento, confirmarDialogoChecklistConReintento } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

const AUTH_ANA = path.join(import.meta.dirname, "..", ".auth", "ana.json");

test.describe("E3-F03 · Aprobación del QE responsable", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

  test("[E3-F03#1] aprueba un entregable por aprobar y queda con mi nombre y fecha", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F03APR");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Por aprobar");
    await clicChecklistConReintento(page, page.getByTestId("boton-aprobar-PLAN_PRUEBAS"), page.getByTestId("aviso-PLAN_PRUEBAS"));

    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Aprobado");
    await expect(page.getByTestId("aprobado-PLAN_PRUEBAS")).toContainText(`Aprobado por ${USUARIOS_SEMILLA.carla.nombre}`);
  });

  test("[E3-F03#2] rechaza con observaciones: vuelve a pendiente y el analista ve las observaciones", async ({ page, request, browser }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F03REC");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    const comentario = "La evidencia no corresponde al entregable (prueba E3-F03#2).";

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await page.getByTestId("boton-rechazar-PLAN_PRUEBAS").click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel("Observaciones para el analista").fill(comentario);
    await confirmarDialogoChecklistConReintento(page, dialogo);

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Pendiente");
    await expect(page.getByTestId("observacion-PLAN_PRUEBAS")).toContainText(comentario);

    // El analista (Ana), en su propia sesión, también ve la observación del QE.
    const contextoAna = await browser.newContext({ storageState: AUTH_ANA });
    const paginaAna = await contextoAna.newPage();
    await paginaAna.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(paginaAna.getByTestId("observacion-PLAN_PRUEBAS")).toContainText(comentario);
    await contextoAna.close();
  });

  test("[E3-F03#3] la bandeja agrupa por HDU los entregables por aprobar", async ({ page, request }) => {
    const equipoUno = await crearHduAsignadaAAna(request, "E3F03BAN1");
    const equipoDos = await crearHduAsignadaAAna(request, "E3F03BAN2");
    await marcarConEnlace(request, equipoUno.sesionAna.accessToken, equipoUno.hdu.id, "PLAN_PRUEBAS");
    await marcarConEnlace(request, equipoDos.sesionAna.accessToken, equipoDos.hdu.id, "PLAN_PRUEBAS");

    await page.goto(`${env.portalUrl}/qe`);
    await page.getByTestId("enlace-aprobaciones-pendientes").click();
    await expect(page).toHaveURL(/\/qe\/aprobaciones$/);

    const grupoUno = page.getByTestId(`grupo-bandeja-${equipoUno.hdu.codigo}`);
    const grupoDos = page.getByTestId(`grupo-bandeja-${equipoDos.hdu.codigo}`);
    await expect(grupoUno).toBeVisible();
    await expect(grupoDos).toBeVisible();
    await expect(page.getByTestId(`bandeja-${equipoUno.hdu.codigo}-PLAN_PRUEBAS`)).toContainText(USUARIOS_SEMILLA.ana.nombre);
    await expect(page.getByTestId(`bandeja-${equipoDos.hdu.codigo}-PLAN_PRUEBAS`)).toContainText(USUARIOS_SEMILLA.ana.nombre);
  });
});
