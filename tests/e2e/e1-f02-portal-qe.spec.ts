import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

test.describe("E1-F02 · Portal QE", () => {
  test("[E1-F02#1] redirige al portal QE y muestra identidad y navegación de supervisión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/`);
    await expect(page).toHaveURL(/\/qe$/);
    await expect(page.getByRole("banner").getByText(USUARIOS_SEMILLA.carla.nombre)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Equipo" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Historias supervisadas" })).toBeVisible();
  });

  // Reescrita en E7 (D41, ver docs/validacion/certificacion-e7.md): antes el portal redirigía al propio portal y la
  // prueba afirmaba la URL `/qe`. Ahora una ruta de otro portal muestra «No tienes acceso a esta sección» en la URL
  // pedida, con «Ir a mi bandeja» y sin pedir datos del portal ajeno. El escenario admite «acceso denegado o
  // redirección»: sigue cumplido; solo cambia lo que afirma la prueba.
  for (const ruta of ["/admin/usuarios", "/qa/hdu"]) {
    test(`[E1-F02#2] al abrir una ruta ajena (${ruta}) ve acceso denegado en esa URL, con «Ir a mi bandeja» y sin pedir datos de ese portal`, async ({ page }) => {
      const datos: string[] = [];
      page.on("request", (solicitud) => {
        const url = new URL(solicitud.url());
        if (url.port === "3000" && url.pathname.startsWith("/v1/") && url.pathname !== "/v1/me") datos.push(url.pathname);
      });
      await page.goto(`${env.portalUrl}${ruta}`);
      const denegado = page.getByTestId("acceso-denegado");
      await expect(denegado).toBeVisible();
      await expect(denegado).toContainText("No tienes acceso a esta sección");
      await expect(denegado.getByRole("link", { name: "Ir a mi bandeja" })).toHaveAttribute("href", "/qe");
      expect(new URL(page.url()).pathname).toBe(ruta);
      await page.waitForTimeout(400);
      expect(datos).toEqual([]);
    });
  }

  // Reescrita en E7 (D29): la primera opción del menú pasó de «Inicio» a «Bandeja». Las demás no cambian.
  // Actualizada en E5 (D107): se agrega «Integraciones» después de «Impedimentos» (dato de la prueba, sección 9 del backlog E5).
  test("[E1-F02#3] el menú solo trae bandeja, equipo, historias supervisadas, impedimentos, integraciones, perfil y cerrar sesión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qe`);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link")).toHaveText(["Bandeja", "Equipo", "Historias supervisadas", "Impedimentos", "Integraciones", "Perfil"]);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Supervisión" })).toHaveCount(0);
  });
});
