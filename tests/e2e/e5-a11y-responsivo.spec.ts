import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { type ClaveE7 } from "../support/e7";
import { contextoDe } from "../support/e4ui";
import { env } from "../support/env";
import { estadoConfigBase, estadoSinConfig, hduPorCodigo, importar, leerFixture, limpiarE5 } from "../support/e5";
import { adfTexto, asignarYMarcar, consultaACompletaConfirmada, consultarOk, pares, prepararCambiosB, prepararR1aR4 } from "../support/e5c";
import { jiraFalso } from "../support/jira-falso/cliente";

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
  test("[E5-A11Y] Administrador · Conexión (sin configurar y configurada) y Sincronizar/Consultar (sin configurar, con resultado, con QTY-15 de borde y con error)", async ({ browser, request }) => {
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
        await jiraFalso.issue("QTY-15", { tipo: "Story", summary: "T".repeat(200), description: adfTexto("D".repeat(1000)), priority: "High", sprints: [{ name: "S".repeat(80), state: "active", endDate: "2099-01-01T00:00:00.000Z" }] });
        await page.goto(`${BASE}/sincronizar`);
        await page.getByTestId("boton-consultar-jira").click();
        await revisar(page, "Consultar con resultado (Con errores)", ancho, "[data-testid=resultado-ejecucion]");
        await revisar(page, "Consulta abierta recién creada", ancho, "[data-testid=consulta-abierta]");
        await jiraFalso.modo("CAIDO");
        await page.getByTestId("boton-consultar-jira").click();
        await page.getByTestId("boton-reemplazar-consulta").click();
        await revisar(page, "Consultar con error de Jira", ancho, "[data-testid=error-consulta]");
        await jiraFalso.modo("NORMAL");
      } finally {
        await contexto.close();
      }
    }
  });

  test("[E5-A11Y] Administrador · revisión de la consulta (Nuevas con QTY-15, Cambiaron, Sin cambios, Con error, panel de grupo, diálogos, resultado de confirmación, solo lectura)", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await estadoConfigBase(request);
      const p = await pares(request);
      await jiraFalso.issue("QTY-15", { tipo: "Story", summary: "T".repeat(200), description: adfTexto("D".repeat(1000)), priority: "High", sprints: [{ name: "S".repeat(80), state: "active", endDate: "2099-01-01T00:00:00.000Z" }] });
      const { contexto, page } = await con(browser, "adm1", ancho);
      try {
        const c = (await consultarOk(request)).consulta;
        expect((await asignarYMarcar(request, c.id, ["QTY-1", "QTY-2", "QTY-15"])).status).toBe(200);
        await page.goto(`${BASE}/sincronizar`);
        await revisar(page, "Consulta abierta · Nuevas (QTY-15 de borde)", ancho, "[data-testid=fila-QTY-15]");
        await page.getByTestId("fila-QTY-4").getByTestId("casilla-seleccionar").check();
        if (ancho < 700) await page.locator("details.panel-asignar-grupo__plegable > summary").click(); // a 375 px el panel es plegable
        await revisar(page, "Consulta abierta · panel de asignación de grupo", ancho, "[data-testid=panel-asignar-grupo]");
        await page.getByTestId("fila-QTY-3").getByTestId("selector-celula").selectOption(p.celA);
        await revisar(page, "Fila incompleta con CEL-A", ancho, "[data-testid=fila-QTY-3]");
        for (const g of ["sin-cambios", "con-error"] as const) {
          const b = page.getByTestId(`boton-grupo-${g}`);
          if ((await b.count()) > 0 && (await b.getAttribute("aria-expanded")) === "false") await b.click();
        }
        await revisar(page, "Consulta abierta · Con error", ancho, "[data-testid=grupo-con-error]");
        await page.getByTestId("boton-confirmar").click();
        await revisar(page, "Diálogo de confirmación", ancho, "[data-testid=dialogo-confirmar-consulta]");
        await page.getByTestId("boton-confirmar-dialogo").click();
        await revisar(page, "Resultado de la confirmación", ancho, "[data-testid=resultado-confirmacion]");
        await revisar(page, "Consulta confirmada (solo lectura)", ancho, "[data-testid=consulta-abierta]");
        // Consulta B: Cambiaron y Sin cambios.
        await limpiarE5();
        await estadoConfigBase(request);
        await prepararCambiosB(request);
        await consultarOk(request);
        await page.goto(`${BASE}/sincronizar`);
        for (const g of ["cambiaron", "sin-cambios"] as const) {
          const b = page.getByTestId(`boton-grupo-${g}`);
          if ((await b.count()) > 0 && (await b.getAttribute("aria-expanded")) === "false") await b.click();
        }
        await revisar(page, "Consulta B · Cambiaron en Jira", ancho, "[data-testid=grupo-cambiaron]");
        await revisar(page, "Consulta B · Sin cambios", ancho, "[data-testid=grupo-sin-cambios]");
        await page.getByTestId("boton-descartar-consulta").click();
        await revisar(page, "Diálogo de descarte", ancho, "[data-testid=dialogo-descartar]");
        await page.getByTestId("boton-descartar-confirmar").click();
        await revisar(page, "Consulta descartada (solo lectura)", ancho, "[data-testid=aviso-consulta-descartada]");
      } finally {
        await contexto.close();
      }
    }
  });

  test("[E5-A11Y] Administrador · aviso «consulta reemplazada» (consulta anterior en solo lectura y botón «Ir a la nueva consulta»), 1280 y 375 px", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await limpiarE5();
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      const { contexto, page } = await con(browser, "adm1", ancho);
      try {
        await page.goto(`${BASE}/sincronizar`);
        await expect(page.getByTestId("consulta-abierta")).toBeVisible({ timeout: 30_000 });
        await consultarOk(request, { reemplazar: true });
        await page.getByTestId("fila-QTY-1").getByTestId("selector-celula").selectOption(p.celC);
        await expect(page.getByTestId("aviso-consulta-reemplazada")).toContainText("Esta consulta fue reemplazada por", { timeout: 30_000 });
        await expect(page.getByTestId("boton-ir-nueva-consulta")).toBeVisible();
        await revisar(page, "Aviso de consulta reemplazada (solo lectura)", ancho, "[data-testid=aviso-consulta-reemplazada]");
        await page.getByTestId("boton-ir-nueva-consulta").click();
        await revisar(page, "Consulta nueva tras «Ir a la nueva consulta»", ancho, "[data-testid=consulta-abierta]");
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
    await consultaACompletaConfirmada(request);
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
