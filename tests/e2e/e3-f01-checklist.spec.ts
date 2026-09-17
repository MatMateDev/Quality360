import path from "node:path";
import { expect, test } from "@playwright/test";
import { aprobarEntregable, crearHduAsignadaAAna, marcarConEnlace, ORDEN_ENTREGABLES } from "../support/checklist";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E3-F01 · Checklist de 10 entregables", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

  test("[E3-F01#1] muestra los 10 entregables en orden, con estado, responsable y fecha", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F01COM");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    const panel = page.getByTestId("panel-checklist");
    await expect(panel).toBeVisible();

    for (const [indice, clave] of ORDEN_ENTREGABLES.entries()) {
      const item = page.getByTestId(`entregable-${clave}`);
      await expect(item).toBeVisible();
      await expect(item.locator(".entregable-orden")).toHaveText(String(indice + 1));
    }

    await expect(page.getByTestId("completado-PLAN_PRUEBAS")).toContainText(`Completado por ${USUARIOS_SEMILLA.ana.nombre}`);
    await expect(page.getByTestId("aprobado-PLAN_PRUEBAS")).toContainText(`Aprobado por ${USUARIOS_SEMILLA.carla.nombre}`);
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Aprobado");
    await expect(page.getByTestId("completado-DASHBOARD")).toHaveText("Sin completar");
    await expect(page.getByTestId("estado-DASHBOARD")).toHaveText("Pendiente");
  });

  test("[E3-F01#2] muestra el porcentaje de avance calculado sobre los 10 entregables", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F01PCT");
    for (const clave of ORDEN_ENTREGABLES.slice(0, 2)) {
      await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, clave);
      await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, clave);
    }

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("checklist-porcentaje")).toHaveText("20%");
    await expect(page.getByTestId("checklist-completados")).toHaveText("2 de 10 aprobados");
  });
});

test.describe("E3-F01 · Checklist en solo lectura", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

  test("[E3-F01#3] un usuario sin permiso ve el checklist pero no puede marcar entregables", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F01LEC");
    // PLAN_PRUEBAS queda POR_APROBAR: si el botón de aprobar no apareciera solo
    // por el estado, esto no probaría el permiso. Con este estado, si Patricia
    // (Administrador, sin `puedeAprobar`) tuviera el botón, sería visible.
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("panel-checklist")).toBeVisible();
    await expect(page.getByTestId("checklist-solo-lectura")).toBeVisible();
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Por aprobar");
    await expect(page.getByTestId("boton-marcar-DASHBOARD")).toHaveCount(0);
    await expect(page.getByTestId("boton-aprobar-PLAN_PRUEBAS")).toHaveCount(0);
    await expect(page.getByTestId("boton-rechazar-PLAN_PRUEBAS")).toHaveCount(0);
  });
});
