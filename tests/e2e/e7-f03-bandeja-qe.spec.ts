import path from "node:path";
import { expect, test } from "@playwright/test";
import { certificacionesCaida, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { CONTRASENA, USUARIOS_E7, hduFixture, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

test.describe("E7-F03 · Bandeja del QE", () => {
  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });

    test("[E7-F03#1] T01: QE1 ve Por aprobar 1 (en 1 HDU), Sin analista 1, Listas para certificar 1 y Listas para cerrar 1, con 4 filas y su acción", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qe`);
      await expect(page.getByTestId("bandeja-qe")).toBeVisible();
      await expect(page.getByTestId("contador-por-aprobar")).toHaveText("1");
      await expect(page.getByTestId("contador-por-aprobar-hdu")).toContainText("en 1 HDU");
      await expect(page.getByTestId("contador-sin-analista")).toHaveText("1");
      await expect(page.getByTestId("contador-listas-certificar")).toHaveText("1");
      await expect(page.getByTestId("contador-listas-cerrar")).toHaveText("1");

      const filas = page.getByTestId("lista-requiere-accion").locator("tbody tr");
      await expect(filas).toHaveCount(4);
      await expect(page.getByTestId(`celda-accion-${h["E7-H1"].id}`)).toContainText("Aprobar 1 entregable");
      await expect(page.getByTestId(`celda-accion-${h["E7-H5"].id}`)).toContainText("Asignar analista");
      await expect(page.getByTestId(`celda-accion-${h["E7-H6"].id}`)).toContainText("Generar certificado");
      await expect(page.getByTestId(`celda-accion-${h["E7-H8"].id}`)).toContainText("Cerrar HDU");
      // Cada fila tiene su botón.
      for (const [codigo, tipo] of [["E7-H1", "aprobar"], ["E7-H5", "asignar"], ["E7-H6", "certificar"], ["E7-H8", "cerrar"]] as const) {
        await expect(page.getByTestId(`boton-accion-${h[codigo].id}-${tipo}`)).toBeVisible();
      }
      // Se conserva el resumen de equipo y los accesos rápidos certificados de E1-F03 y E3-F03.
      await expect(page.getByTestId("tarjeta-equipo")).toContainText("2");
      await expect(page.getByTestId("enlace-aprobaciones-pendientes")).toBeVisible();
    });

    test("[E7-F03#1] T02: «Aprobar» en E7-H1 abre /qe/aprobaciones con E7-H1 visible", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qe`);
      await page.getByTestId(`boton-accion-${h["E7-H1"].id}-aprobar`).click();
      await expect(page).toHaveURL(new RegExp(`/qe/aprobaciones\\?hdu=${h["E7-H1"].id}$`));
      await expect(page.getByTestId("grupo-bandeja-E7-H1")).toBeVisible();
    });

    test("[E7-F03#3] T05: ninguna HDU de las que otro QE tiene como responsable (E7-H3, E7-H4, E7-H7) aparece en la lista", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qe`);
      await expect(page.getByTestId("lista-requiere-accion").locator("tbody tr")).toHaveCount(4);
      for (const codigo of ["E7-H3", "E7-H4", "E7-H7"] as const) {
        await expect(page.getByTestId(`fila-accion-${h[codigo].id}-aprobar`)).toHaveCount(0);
        await expect(page.getByTestId("lista-requiere-accion")).not.toContainText(codigo);
      }
    });

    test("[E7-F03#3] T06: «Asignar analista» en E7-H5 abre el detalle con el selector de analistas del equipo (solo ANA1 y ANA2)", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qe`);
      await page.getByTestId(`boton-accion-${h["E7-H5"].id}-asignar`).click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${h["E7-H5"].id}`));
      await expect(page.getByTestId("valor-analista-hdu")).toHaveText("Sin asignar");
      const dialogo = page.getByRole("dialog", { name: "Asignar analista" });
      if (!(await dialogo.isVisible())) await page.getByRole("button", { name: "Asignar analista" }).click();
      await expect(dialogo).toBeVisible();
      const opciones = (await dialogo.getByLabel("Analista QA").locator("option").allTextContents()).map((t) => t.trim()).filter((t) => /^ANA\d/.test(t));
      expect(opciones.sort()).toEqual(["ANA1 Analista", "ANA2 Analista"]);
    });

    test("[E7-F03#3] T06b: «Certificar» y «Cerrar» llevan al detalle de la HDU correspondiente", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qe`);
      await page.getByTestId(`boton-accion-${h["E7-H6"].id}-certificar`).click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${h["E7-H6"].id}`));
      await page.goto(`${env.portalUrl}/qe`);
      await page.getByTestId(`boton-accion-${h["E7-H8"].id}-cerrar`).click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${h["E7-H8"].id}`));
    });

    test("[E7-F03#1] T06c: el filtro por tipo de acción deja solo las filas de ese tipo", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qe`);
      await page.locator("#filtro-tipo-accion").selectOption({ label: "Asignar analista" });
      await expect(page.getByTestId("lista-requiere-accion").locator("tbody tr")).toHaveCount(1);
      await expect(page.getByTestId(`fila-accion-${h["E7-H5"].id}-asignar`)).toBeVisible();
      await expect(page.getByTestId("contador-por-aprobar")).toHaveText("1");
    });
  });

  test.describe("QE2", () => {
    test.use({ storageState: estadoSesion("qe2") });

    test("[E7-F03#2] T03: QE2 ve los contadores en 0, «No tienes acciones pendientes» y conserva el resumen del equipo (1 analista)", async ({ page }) => {
      await page.goto(`${env.portalUrl}/qe`);
      for (const clave of ["por-aprobar", "sin-analista", "listas-certificar", "listas-cerrar"]) {
        await expect(page.getByTestId(`contador-${clave}`)).toHaveText("0");
      }
      await expect(page.getByTestId("estado-vacio-requiere-accion")).toContainText("No tienes acciones pendientes");
      await expect(page.getByTestId("tarjeta-equipo")).toContainText("1");
    });
  });

  test.describe("con Certificaciones detenida", () => {
    let pila: PilaCaida;
    test.beforeAll(async () => {
      pila = await certificacionesCaida(true);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E7-F03#2] T04: QE1 ve «No disponible» en por aprobar, listas para certificar y para cerrar; «Sin analista» sigue en 1 con la fila de E7-H5", async ({ page, request }) => {
      const h = await hduFixture(request);
      await iniciarSesionUI(page, USUARIOS_E7.qe1.correo, CONTRASENA, pila.portalUrl);
      await expect(page.getByTestId("bandeja-qe")).toBeVisible({ timeout: 20_000 });
      for (const clave of ["por-aprobar", "listas-certificar", "listas-cerrar"]) {
        await expect(page.getByTestId(`estado-indisponible-${clave}`)).toContainText("No disponible");
        await expect(page.getByTestId(`contador-${clave}`)).toHaveCount(0);
      }
      await expect(page.getByTestId("contador-sin-analista")).toHaveText("1");
      await expect(page.getByTestId(`fila-accion-${h["E7-H5"].id}-asignar`)).toBeVisible();
      await expect(page.getByTestId("estado-indisponible-requiere-accion-parcial")).toContainText("Certificaciones no disponible");
      // No se reemplaza por un vacío falso.
      await expect(page.getByTestId("estado-vacio-requiere-accion")).toHaveCount(0);
      await expect(page.getByTestId("tarjeta-equipo")).toContainText("2");
    });
  });
});
