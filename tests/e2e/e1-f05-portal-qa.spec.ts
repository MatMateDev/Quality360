import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

test.describe("E1-F05 · Portal Analista QA", () => {
  test("[E1-F05#1] redirige al portal QA con su identidad y navegación", async ({ page }) => {
    await page.goto(`${env.portalUrl}/`);
    await expect(page).toHaveURL(/\/qa$/);
    await expect(page.getByRole("banner").getByText(USUARIOS_SEMILLA.ana.nombre)).toBeVisible();
  });

  // Reescrita en E7 (D29): la primera opción del menú pasó de «Inicio» a «Bandeja». Las demás no cambian.
  test("[E1-F05#2] el menú (Bandeja, Mis HDU, Perfil) y las rutas no presentan funciones administrativas ni de supervisión", async ({ page }) => {
    await page.goto(`${env.portalUrl}/qa`);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link")).toHaveText(["Bandeja", "Mis HDU", "Perfil"]);
    await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Equipo" })).toHaveCount(0);
  });

  // Reescritas en E7 (D41, ver docs/validacion/certificacion-e7.md): antes el portal redirigía al propio portal y la
  // prueba afirmaba la URL `/qa`. Ahora una ruta de otro portal muestra «No tienes acceso a esta sección» en la URL
  // pedida, con «Ir a mi bandeja» y sin pedir datos del portal ajeno. El escenario admite «acceso denegado o
  // redirección»: sigue cumplido; solo cambia lo que afirma la prueba.
  for (const ruta of ["/qe", "/admin/usuarios"]) {
    test(`[E1-F05#3] al abrir una ruta ajena (${ruta}) ve acceso denegado en esa URL, con «Ir a mi bandeja» y sin pedir datos de ese portal`, async ({ page }) => {
      const datos: string[] = [];
      page.on("request", (solicitud) => {
        const url = new URL(solicitud.url());
        if (url.port === "3000" && url.pathname.startsWith("/v1/") && url.pathname !== "/v1/me") datos.push(url.pathname);
      });
      await page.goto(`${env.portalUrl}${ruta}`);
      const denegado = page.getByTestId("acceso-denegado");
      await expect(denegado).toBeVisible();
      await expect(denegado).toContainText("No tienes acceso a esta sección");
      await expect(denegado.getByRole("link", { name: "Ir a mi bandeja" })).toHaveAttribute("href", "/qa");
      expect(new URL(page.url()).pathname).toBe(ruta);
      await page.waitForTimeout(400);
      expect(datos).toEqual([]);
    });
  }
});
