import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { env } from "../support/env";
import { hduFixture, type ClaveE7 } from "../support/e7";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

/** Las 5 bandejas (más las pestañas del Auditor y el detalle de solo lectura) con la sesión de su rol y la señal de que cargaron. */
const PANTALLAS: Array<{ nombre: string; clave: ClaveE7; ruta: string; listo: string }> = [
  { nombre: "bandeja del Analista QA", clave: "ana2", ruta: "/qa", listo: "lista-mis-hdu" },
  { nombre: "bandeja del QE", clave: "qe1", ruta: "/qe", listo: "lista-requiere-accion" },
  { nombre: "bandeja del Líder QA", clave: "lid1", ruta: "/lider", listo: "lista-hdu-lider" },
  { nombre: "bandeja del Administrador", clave: "adm1", ruta: "/admin", listo: "lista-pendientes" },
  { nombre: "bandeja del Auditor (HDU)", clave: "aud1", ruta: "/auditor", listo: "lista-auditor-hdu" },
  { nombre: "Auditor · Certificados", clave: "aud1", ruta: "/auditor/certificados", listo: "lista-certificados" },
  { nombre: "Auditor · Auditoría de usuarios", clave: "aud1", ruta: "/auditor/auditoria-usuarios", listo: "lista-auditoria-usuarios" },
  { nombre: "Administrador · Usuarios (E7-F07)", clave: "adm1", ruta: "/admin/usuarios", listo: "total-usuarios" },
  { nombre: "bandeja del Líder QA sin células", clave: "lid2", ruta: "/lider", listo: "estado-vacio-celulas" },
  { nombre: "bandeja del Analista QA sin HDU", clave: "ana4", ruta: "/qa", listo: "estado-vacio-mis-hdu" },
];

async function analizar(page: Page) {
  const resultado = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return resultado.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

function resumen(violaciones: Awaited<ReturnType<typeof analizar>>): string {
  return violaciones.map((v) => `${v.id} [${v.impact}] (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`).join("\n");
}

test.describe("E7 · Accesibilidad (axe) y responsividad de las bandejas", () => {
  for (const p of PANTALLAS) {
    test.describe(p.nombre, () => {
      test.use({ storageState: estadoSesion(p.clave) });

      test(`[E7-A11Y] ${p.nombre}: axe sin violaciones serious ni critical a 1280 px`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`${env.portalUrl}${p.ruta}`);
        await expect(page.getByTestId(p.listo)).toBeVisible();
        await page.waitForTimeout(500);
        const violaciones = await analizar(page);
        expect(violaciones, resumen(violaciones)).toEqual([]);
      });

      test(`[E7-RESP] ${p.nombre}: a 375 px no hay desborde horizontal`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${env.portalUrl}${p.ruta}`);
        await expect(page.getByTestId(p.listo)).toBeVisible();
        await page.waitForTimeout(500);
        const medidas = await page.evaluate(() => ({
          documento: document.documentElement.scrollWidth,
          cliente: document.documentElement.clientWidth,
          cuerpo: document.body.scrollWidth,
        }));
        expect(medidas.documento, `scrollWidth ${medidas.documento} > clientWidth ${medidas.cliente}`).toBeLessThanOrEqual(medidas.cliente);
        expect(medidas.cuerpo).toBeLessThanOrEqual(medidas.cliente);
      });

      test(`[E7-A11Y] ${p.nombre}: a 375 px axe no encuentra violaciones serious ni critical`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${env.portalUrl}${p.ruta}`);
        await expect(page.getByTestId(p.listo)).toBeVisible();
        await page.waitForTimeout(500);
        const violaciones = await analizar(page);
        expect(violaciones, resumen(violaciones)).toEqual([]);
      });
    });
  }

  test.describe("detalle de solo lectura y estados de error", () => {
    test.use({ storageState: estadoSesion("lid1") });

    test("[E7-A11Y] detalle de HDU del Líder (solo lectura) a 375 px: sin desborde ni violaciones serious/critical", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H7"].id}`);
      await expect(page.getByTestId("panel-checklist")).toBeVisible();
      const medidas = await page.evaluate(() => ({ d: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(medidas.d).toBeLessThanOrEqual(medidas.c);
      const violaciones = await analizar(page);
      expect(violaciones, resumen(violaciones)).toEqual([]);
    });

    test("[E7-A11Y] la pantalla de acceso denegado a 375 px: sin desborde ni violaciones serious/critical", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${env.portalUrl}/admin`);
      await expect(page.getByTestId("acceso-denegado")).toBeVisible();
      const medidas = await page.evaluate(() => ({ d: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(medidas.d).toBeLessThanOrEqual(medidas.c);
      const violaciones = await analizar(page);
      expect(violaciones, resumen(violaciones)).toEqual([]);
    });
  });

  test.describe("objetivos táctiles a 375 px", () => {
    test.use({ storageState: estadoSesion("qe1") });

    test("[E7-A11Y] los botones de acción de la bandeja del QE miden al menos 44 px de alto a 375 px", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${env.portalUrl}/qe`);
      await expect(page.getByTestId("lista-requiere-accion")).toBeVisible();
      const botones = page.locator('[data-testid^="boton-accion-"]');
      const n = await botones.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i += 1) {
        const caja = await botones.nth(i).boundingBox();
        expect(caja?.height ?? 0, `botón ${i}`).toBeGreaterThanOrEqual(43.5);
      }
    });
  });
});
