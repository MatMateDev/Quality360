import path from "node:path";
import { expect, test } from "@playwright/test";
import { certificacionesCaida, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { CONTRASENA, USUARIOS_E7, hduFixture, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

test.describe("E7-F02 · Bandeja del Analista QA", () => {
  test.describe("con sesión del fixture", () => {
    test.use({ storageState: estadoSesion("ana2") });

    test("[E7-F02#1] T01: ANA2 ve Abiertas 2, Con observaciones 1, Esperando aprobación 0; E7-H2 primero con insignia y E7-H8 en 10/10", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("bandeja-analista")).toBeVisible();
      await expect(page.getByTestId("contador-abiertas")).toHaveText("2");
      await expect(page.getByTestId("contador-con-observaciones")).toHaveText("1");
      await expect(page.getByTestId("contador-esperando-aprobacion")).toHaveText("0");

      const filas = page.getByTestId("lista-mis-hdu").locator("tbody tr");
      await expect(filas).toHaveCount(2);
      await expect(filas.first()).toContainText("E7-H2");
      await expect(page.getByTestId(`insignia-observaciones-${h["E7-H2"].id}`)).toContainText("1 observación");
      await expect(page.getByTestId(`celda-avance-${h["E7-H8"].id}`)).toContainText("10/10");
      await expect(page.getByTestId(`celda-siguiente-${h["E7-H8"].id}`)).toContainText("Todos aprobados");
      // Se conservan los resúmenes certificados de E1-F06.
      await expect(page.getByTestId("tarjeta-supervisor")).toContainText("QE1 Quality Engineer");
      await expect(page.getByTestId("tarjeta-hdu-qa")).toContainText("2");
    });

    test("[E7-F02#3] T05: filtrar «Solo con observaciones» deja solo E7-H2 y el contador no cambia", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("lista-mis-hdu").locator("tbody tr")).toHaveCount(2);
      await page.locator("#filtro-solo-observaciones").click();
      await expect(page.locator("#filtro-solo-observaciones")).toBeChecked();
      await expect(page.getByTestId("lista-mis-hdu").locator("tbody tr")).toHaveCount(1);
      await expect(page.getByTestId(`fila-hdu-${h["E7-H2"].id}`)).toBeVisible();
      await expect(page.getByTestId("contador-con-observaciones")).toHaveText("1");
      await expect(page.getByTestId("contador-abiertas")).toHaveText("2");
      await expect(page).toHaveURL(/solo-obs=1/);
    });

    test("[E7-F02#1] T07: pulsar la fila de E7-H2 abre el detalle con el checklist y la observación «Falta evidencia de datos»", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qa`);
      await page.getByTestId(`fila-hdu-${h["E7-H2"].id}`).locator("td").nth(2).click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${h["E7-H2"].id}$`));
      await expect(page.getByTestId("panel-checklist")).toBeVisible();
      await expect(page.getByTestId("observacion-DASHBOARD")).toContainText("Falta evidencia de datos");
    });
  });

  test.describe("ANA1", () => {
    test.use({ storageState: estadoSesion("ana1") });

    test("[E7-F02#1] T02: ANA1 ve Abiertas 2, Con observaciones 0, Esperando aprobación 1 y el siguiente entregable de E7-H1 es el 4", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("contador-abiertas")).toHaveText("2");
      await expect(page.getByTestId("contador-con-observaciones")).toHaveText("0");
      await expect(page.getByTestId("contador-esperando-aprobacion")).toHaveText("1");
      await expect(page.getByTestId(`celda-siguiente-${h["E7-H1"].id}`)).toContainText("4 · Aprobación de casos de prueba");
      await expect(page.getByTestId(`celda-avance-${h["E7-H1"].id}`)).toContainText("3/10");
    });

    test("[E7-F02#3] T06: ANA1 abre por URL el detalle de E7-H3 (de otra analista) y ve acceso denegado", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H3"].id}`);
      await expect(page.getByTestId("acceso-denegado")).toBeVisible();
      await expect(page.getByTestId("acceso-denegado")).toContainText("No tienes acceso");
      await expect(page.getByTestId("valor-analista-hdu")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("Historia E7 H3");
    });

    test("[E7-F02#3] T05b: la búsqueda por código y los filtros muestran solo HDU propias; una búsqueda sin coincidencias muestra «No hay HDU con esos filtros»", async ({ page }) => {
      await page.goto(`${env.portalUrl}/qa`);
      await page.locator("#filtro-busqueda").fill("E7-H6");
      await expect(page.getByTestId("lista-mis-hdu").locator("tbody tr")).toHaveCount(1);
      await page.locator("#filtro-busqueda").fill("E7-H3");
      await expect(page.getByTestId("estado-vacio-filtros-mis-hdu")).toContainText("No hay HDU con esos filtros");
      await expect(page.getByTestId("contador-abiertas")).toHaveText("2");
    });
  });

  test.describe("ANA4 (sin HDU ni supervisor)", () => {
    test.use({ storageState: estadoSesion("ana4") });

    test("[E7-F02#2] T03: ANA4 ve contadores en 0, «No tienes HDU asignadas» y «Sin supervisor asignado», sin mensaje de error", async ({ page }) => {
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("contador-abiertas")).toHaveText("0");
      await expect(page.getByTestId("contador-con-observaciones")).toHaveText("0");
      await expect(page.getByTestId("contador-esperando-aprobacion")).toHaveText("0");
      await expect(page.getByTestId("estado-vacio-mis-hdu")).toContainText("No tienes HDU asignadas");
      await expect(page.getByTestId("valor-supervisor")).toHaveText("Sin supervisor asignado");
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByText("Ocurrió un error")).toHaveCount(0);
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

    test("[E7-F02#2] T04: ANA1 ve «No disponible» en observaciones y aprobación, la lista de E7-H1 y E7-H6 sigue y «Abiertas» sigue en 2", async ({ page }) => {
      await iniciarSesionUI(page, USUARIOS_E7.ana1.correo, CONTRASENA, pila.portalUrl);
      await expect(page.getByTestId("bandeja-analista")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("contador-abiertas")).toHaveText("2");
      for (const clave of ["con-observaciones", "esperando-aprobacion"]) {
        await expect(page.getByTestId(`estado-indisponible-${clave}`)).toContainText("No disponible");
        await expect(page.getByTestId(`contador-${clave}`)).toHaveCount(0);
      }
      const filas = page.getByTestId("lista-mis-hdu").locator("tbody tr");
      await expect(filas).toHaveCount(2);
      await expect(filas.filter({ hasText: "E7-H1" })).toHaveCount(1);
      await expect(filas.filter({ hasText: "E7-H6" })).toHaveCount(1);
      // Avance y siguiente entregable dicen «No disponible»; nunca 0/10 ni vacío.
      await expect(page.getByTestId("estado-indisponible-avance").first()).toContainText("No disponible");
      await expect(page.getByTestId("lista-mis-hdu")).not.toContainText("0/10");
      await expect(page.getByTestId("tarjeta-supervisor")).toContainText("QE1 Quality Engineer");
    });
  });
});
