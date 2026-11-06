import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { contextoDe } from "../support/e4ui";
import { RAIZ_REPO } from "../support/env";
import { consultarOk, crearManual, editar, fijarActivo, fila as filaApi, pares } from "../support/e5c";
import { abrirDetalle, abrirGrupo, fila, hallazgosAxe, irAConsulta } from "../support/e5dui";
import { limpiarE5, tk } from "../support/e5";
import { crearEquipo, idHdu, prepararDetalle } from "../support/e5d";
import { jiraFalso } from "../support/jira-falso/cliente";

/**
 * E5 · detalle y confirmación por HDU · accesibilidad y responsividad (axe a 1280 y 375 px, sin serious ni critical, sin desborde horizontal a 375)
 * sobre el panel de detalle, la alerta «ya asignada», los estados de error (de la fila y del panel) y la fila creada. Deja capturas para la
 * revisión visual en docs/validacion/evidencia-e5-detalle/.
 */
test.describe.configure({ mode: "default" });
test.setTimeout(420_000);
const ANCHOS = [1280, 375] as const;
const problemas: string[] = [];
const CAPTURAS = path.join(RAIZ_REPO, "docs", "validacion", "evidencia-e5-detalle");
mkdirSync(CAPTURAS, { recursive: true });
const extras: Array<() => Promise<void>> = [];

test.afterEach(() => {
  expect(problemas, problemas.join("\n")).toEqual([]);
});
test.afterAll(async () => {
  await jiraFalso.reset();
  await limpiarE5();
  for (const l of extras) await l().catch(() => undefined);
});

async function captura(page: Page, nombre: string, ancho: number) {
  await page.screenshot({ path: path.join(CAPTURAS, `${nombre}-${ancho}.png`), fullPage: false });
}

test.describe("E5 · detalle y confirmación por HDU · a11y y responsivo", () => {
  test("[E5-A11Y-D] panel de detalle (completo, vacío, texto largo y hostil) y fila con asignación automática a 1280 y 375", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-17");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      const { contexto, page } = await contextoDe(browser, "adm1");
      await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
      try {
        await irAConsulta(page);
        problemas.push(...(await hallazgosAxe(page, "Lista con fila automática y botón Confirmar asignación", ancho)));
        await captura(page, "fila-automatica", ancho);
        for (const [codigo, nombre] of [["QTY-17", "panel-completo"], ["QTY-16", "panel-vacio"], ["QTY-15", "panel-hostil"]] as const) {
          const panel = await abrirDetalle(page, codigo);
          await expect(panel.getByTestId("detalle-resumen")).not.toBeEmpty({ timeout: 15_000 });
          await expect(page.getByTestId("cargando-detalle")).toHaveCount(0, { timeout: 15_000 });
          if (codigo === "QTY-15") await panel.getByTestId("boton-ver-todo-descripcion").click();
          problemas.push(...(await hallazgosAxe(page, `Panel ${nombre}`, ancho)));
          await captura(page, nombre, ancho);
          await page.keyboard.press("Escape");
          await expect(page.getByTestId("panel-detalle-hdu")).toHaveCount(0);
        }
      } finally {
        await contexto.close();
      }
      await jiraFalso.reset();
      await limpiarE5();
    }
  });

  test("[E5-A11Y-D] alerta «Esta HDU ya fue asignada» (en la lista cargada y en el panel) a 1280 y 375", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await prepararDetalle(request);
      const p = await pares(request);
      await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" });
      await crearManual(request, "QTY-3", "Otro título distinto", { prioridad: "MEDIA" });
      const id = await idHdu("QTY-3");
      expect((await api.put<any>(request, `/v1/hdu/${id}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana1 } })).status).toBe(200);
      await consultarOk(request);
      const { contexto, page } = await contextoDe(browser, "adm1");
      await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
      try {
        await irAConsulta(page);
        await abrirGrupo(page, "sin-cambios");
        await abrirGrupo(page, "cambiaron");
        await expect(fila(page, "QTY-4").getByTestId("alerta-hdu-ya-asignada")).toBeVisible();
        await fila(page, "QTY-4").scrollIntoViewIfNeeded();
        problemas.push(...(await hallazgosAxe(page, "Alerta ya asignada en la lista (sin cambios y cambiaron)", ancho)));
        await captura(page, "alerta-lista", ancho);
        const panel = await abrirDetalle(page, "QTY-3");
        await expect(panel.getByTestId("alerta-hdu-ya-asignada")).toBeVisible({ timeout: 15_000 });
        problemas.push(...(await hallazgosAxe(page, "Alerta ya asignada en el panel", ancho)));
        await captura(page, "alerta-panel", ancho);
        if (ancho <= 375) {
          const b = await panel.getByTestId("enlace-ir-a-hdu").first().boundingBox();
          if ((b?.height ?? 0) < 43.5) problemas.push(`[${ancho}] «Ir a la HDU» mide ${b?.height}px (< 44)`);
        }
      } finally {
        await contexto.close();
      }
      await jiraFalso.reset();
      await limpiarE5();
    }
  });

  test("[E5-A11Y-D] estados de error: confirmar con Analista desactivado, error de red al confirmar y error al cargar el detalle, a 1280 y 375", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await prepararDetalle(request);
      const p = await pares(request);
      const eq = await crearEquipo(request, 1, "e5a11y");
      extras.push(eq.limpiar);
      const c = (await consultarOk(request)).consulta;
      const f = await filaApi(request, c.id, "QTY-1");
      expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: eq.qeId } })).status).toBe(200);
      const f2 = await filaApi(request, c.id, "QTY-2");
      expect((await editar(request, c.id, { itemIds: [f2.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      const { contexto, page } = await contextoDe(browser, "adm1");
      await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
      try {
        await irAConsulta(page);
        // (1) error de red al confirmar QTY-2
        await page.route(/\/items\/[0-9a-f-]{36}\/confirmaciones$/, (route) => route.abort("connectionrefused"));
        await fila(page, "QTY-2").getByTestId("boton-confirmar-asignacion").click();
        await expect(fila(page, "QTY-2").getByTestId("error-confirmar-asignacion")).toBeVisible({ timeout: 30_000 });
        await fila(page, "QTY-2").scrollIntoViewIfNeeded();
        problemas.push(...(await hallazgosAxe(page, "Error de red al confirmar", ancho)));
        await captura(page, "error-red", ancho);
        await page.unroute(/\/items\/[0-9a-f-]{36}\/confirmaciones$/);
        // (2) analista desactivado
        await fijarActivo(eq.analistas[0].id, false);
        await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").click();
        await expect(fila(page, "QTY-1").getByTestId("error-confirmar-asignacion")).toBeVisible({ timeout: 30_000 });
        await fila(page, "QTY-1").scrollIntoViewIfNeeded();
        problemas.push(...(await hallazgosAxe(page, "Error de asignación inválida", ancho)));
        await captura(page, "error-asignacion-invalida", ancho);
        // (3) error al cargar el detalle
        await page.route(/\/items\/[0-9a-f-]{36}$/, (route) => (route.request().method() === "GET" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "El servicio no está disponible.", traceId: "x", detalles: [] }) }) : route.continue()));
        const panel = await abrirDetalle(page, "QTY-3");
        await expect(panel.getByTestId("error-detalle")).toBeVisible({ timeout: 30_000 });
        problemas.push(...(await hallazgosAxe(page, "Error al cargar el detalle", ancho)));
        await captura(page, "error-detalle", ancho);
      } finally {
        await contexto.close();
      }
      await jiraFalso.reset();
      await limpiarE5();
    }
  });

  test("[E5-A11Y-D] fila creada (solo lectura) y resumen con «Confirmar marcadas» y «Terminar revisión» a 1280 y 375", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      await prepararDetalle(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      for (const k of ["QTY-1", "QTY-2", "QTY-3"]) {
        const f = await filaApi(request, c.id, k);
        expect((await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      }
      const f3 = await filaApi(request, c.id, "QTY-3");
      expect((await editar(request, c.id, { itemIds: [f3.id], marcada: true })).status).toBe(200);
      const { contexto, page } = await contextoDe(browser, "adm1");
      await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
      try {
        await irAConsulta(page);
        await fila(page, "QTY-1").getByTestId("boton-confirmar-asignacion").click();
        await expect(fila(page, "QTY-1")).toHaveAttribute("data-estado", "creada", { timeout: 30_000 });
        await fila(page, "QTY-1").scrollIntoViewIfNeeded();
        problemas.push(...(await hallazgosAxe(page, "Fila creada", ancho)));
        await captura(page, "fila-creada", ancho);
        await page.getByTestId("boton-terminar-revision").scrollIntoViewIfNeeded();
        problemas.push(...(await hallazgosAxe(page, "Resumen con Confirmar marcadas y Terminar revisión", ancho)));
        await captura(page, "resumen-lote", ancho);
        await page.getByTestId("boton-terminar-revision").click();
        await expect(page.getByTestId("dialogo-terminar-revision")).toBeVisible();
        problemas.push(...(await hallazgosAxe(page, "Diálogo Terminar revisión", ancho)));
        await captura(page, "dialogo-terminar", ancho);
        await page.getByTestId("boton-seguir-revisando-terminar").click();
      } finally {
        await contexto.close();
      }
      await jiraFalso.reset();
      await limpiarE5();
    }
  });
});
