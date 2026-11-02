import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { type ClaveE7 } from "../support/e7";
import { contextoDe } from "../support/e4ui";
import { env } from "../support/env";
import { estadoConfigBase, estadoSinConfig, hduPorCodigo, importar, leerFixture, limpiarE5, prepararR1aR4, sincronizarOk } from "../support/e5";

/**
 * E5 · Accesibilidad y responsividad: axe a 1280 y 375 px, sin violaciones serious ni critical, y sin desborde horizontal a 375 px,
 * contra el stack real, sobre las pantallas nuevas de E5 (Conexión, Sincronizar, Importar archivo, Historial, detalle de ejecución,
 * /qe/integraciones, pestaña del Auditor y la sección de descripción del detalle de HDU). Basada en e4-a11y-responsivo.spec.ts.
 */
test.describe.configure({ mode: "default" });
test.setTimeout(420_000);

const ANCHOS = [1280, 375] as const;
const problemas: string[] = [];
const BASE = `${env.portalUrl}/admin/integraciones`;

async function revisar(page: Page, nombre: string, ancho: number, listo?: string) {
  if (listo) await expect(page.locator(listo).first(), `${nombre} (${ancho}): señal de carga ${listo}`).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of graves) problemas.push(`[${ancho}] ${nombre}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  if (ancho <= 375) {
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cli: document.documentElement.clientWidth, cuerpo: document.body.scrollWidth }));
    if (m.doc > m.cli || m.cuerpo > m.cli) problemas.push(`[${ancho}] ${nombre}: desborde horizontal (scrollWidth ${m.doc} > clientWidth ${m.cli})`);
  }
}

async function con(browser: Browser, clave: ClaveE7, ancho: number): Promise<{ contexto: BrowserContext; page: Page }> {
  const { contexto, page } = await contextoDe(browser, clave);
  await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
  return { contexto, page };
}

test.afterEach(() => {
  expect(problemas, problemas.join("\n")).toEqual([]);
});
test.afterAll(async () => {
  await limpiarE5();
});

test.describe("E5 · accesibilidad y responsividad", () => {
  test("[E5-A11Y] Administrador · Conexión (sin configurar y configurada) y Sincronizar (sin configurar, con resultado y con error)", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await estadoSinConfig();
      const { contexto, page } = await con(browser, "adm1", ancho);
      try {
        await page.goto(BASE);
        await revisar(page, "Conexión sin configurar", ancho, "[data-testid=form-jira]");
        await page.goto(`${BASE}/sincronizar`);
        await revisar(page, "Sincronizar sin configuración", ancho, "[data-testid=estado-vacio-jira]");
        await estadoConfigBase(request);
        await page.goto(BASE);
        await revisar(page, "Conexión configurada", ancho, "[data-testid=token-estado]");
        await page.goto(`${BASE}/sincronizar`);
        await page.getByTestId("boton-sincronizar").click();
        await revisar(page, "Sincronizar con resultado (Con errores)", ancho, "[data-testid=resultado-ejecucion]");
        const { jiraFalso } = await import("../support/jira-falso/cliente");
        await jiraFalso.modo("CAIDO");
        await page.getByTestId("boton-sincronizar").click();
        await revisar(page, "Sincronizar con error de Jira", ancho, "[data-testid=error-sincronizacion]");
        await jiraFalso.modo("NORMAL");
      } finally {
        await contexto.close();
      }
    }
  });

  test("[E5-A11Y] Administrador · Importar archivo (vacío, vista previa, error de archivo y resultado) e Historial (lista y detalle)", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      const { r1 } = await prepararR1aR4(request);
      const { contexto, page } = await con(browser, "adm1", ancho);
      try {
        await page.goto(`${BASE}/importar`);
        await revisar(page, "Importar vacío", ancho, "[data-testid=pagina-importar]");
        await page.getByTestId("selector-archivo").setInputFiles({ name: "historias-con-errores.csv", mimeType: "text/csv", buffer: Buffer.from(leerFixture("historias-con-errores.csv")) });
        await revisar(page, "Importar con vista previa", ancho, "[data-testid=vista-previa]");
        await page.getByTestId("boton-quitar-archivo").click();
        await page.getByTestId("selector-archivo").setInputFiles({ name: "sin-columna-titulo.csv", mimeType: "text/csv", buffer: Buffer.from(leerFixture("sin-columna-titulo.csv")) });
        await revisar(page, "Importar con error de archivo", ancho, "[data-testid=error-archivo]");
        await page.getByTestId("boton-quitar-archivo").click();
        await page.getByTestId("selector-archivo").setInputFiles({ name: "historias-validas.csv", mimeType: "text/csv", buffer: Buffer.from(leerFixture("historias-validas.csv")) });
        await expect(page.getByTestId("vista-previa")).toBeVisible();
        await page.getByTestId("boton-importar").click();
        await revisar(page, "Importar con resultado", ancho, "[data-testid=resultado-ejecucion]");
        await page.goto(`${BASE}/historial`);
        await revisar(page, "Historial lista", ancho, "[data-testid=lista-ejecuciones]");
        await page.goto(`${BASE}/historial?ejecucion=${r1.id}`);
        await revisar(page, "Historial detalle de ejecución", ancho, "[data-testid=detalle-ejecucion]");
        await expect(page.getByTestId("total-detalle-ejecucion")).toBeVisible();
        await revisar(page, "Historial detalle cargado", ancho, "[data-testid=total-detalle-ejecucion]");
      } finally {
        await contexto.close();
      }
    }
  });

  test("[E5-A11Y] QE (/qe/integraciones con detalle y filas ocultas) y Auditor (pestaña Integraciones)", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      const { r1 } = await prepararR1aR4(request);
      for (const [clave, base, nombre] of [["qe1", "/qe/integraciones", "QE"], ["aud1", "/auditor/integraciones", "Auditor"]] as const) {
        const { contexto, page } = await con(browser, clave, ancho);
        try {
          await page.goto(`${env.portalUrl}${base}`);
          await revisar(page, `${nombre} historial`, ancho, "[data-testid=lista-ejecuciones]");
          await page.goto(`${env.portalUrl}${base}?ejecucion=${r1.id}`);
          await revisar(page, `${nombre} detalle`, ancho, "[data-testid=total-detalle-ejecucion]");
        } finally {
          await contexto.close();
        }
      }
    }
  });

  test("[E5-A11Y] detalle de HDU con origen y descripción de Jira (QE responsable) y vacío de descripción de una HDU manual", async ({ browser, request }) => {
    await estadoConfigBase(request);
    await sincronizarOk(request);
    await importar(request, "historias-validas.csv");
    const h = await hduPorCodigo(request, "QTY-1");
    const arc2 = await hduPorCodigo(request, "ARC-2");
    for (const ancho of ANCHOS) {
      const { contexto, page } = await con(browser, "qe2", ancho);
      try {
        await page.goto(`${env.portalUrl}/hdu/${h.id}`);
        await revisar(page, "detalle HDU con descripción de Jira", ancho, "[data-testid=hdu-descripcion]");
        await page.goto(`${env.portalUrl}/hdu/${arc2.id}`);
        await revisar(page, "detalle HDU sin descripción", ancho, "[data-testid=hdu-origen]");
      } finally {
        await contexto.close();
      }
    }
  });
});
