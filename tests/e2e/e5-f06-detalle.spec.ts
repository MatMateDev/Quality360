import { expect, test, type Page } from "@playwright/test";
import { contextoDe, estadoSesion } from "../support/e4ui";
import { crearManual, consultarOk, descartar, fila as filaApi, solicitudesJira } from "../support/e5c";
import { abrirDetalle, abrirGrupo, fila, hallazgosAxe, irAConsulta, RUTA_CONSULTA } from "../support/e5dui";
import { limpiarE5, sql } from "../support/e5";
import { consultaConDetalle, prepararDetalle } from "../support/e5d";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-F06 · Detalle completo de la HDU (10 escenarios) y E5-F05#15. Solo el Administrador. Contra el portal y el stack reales. */
test.describe.configure({ mode: "default" });
test.afterAll(async () => {
  await jiraFalso.reset();
  await limpiarE5();
});
test.afterEach(async () => {
  await jiraFalso.modo("NORMAL");
});

const sinDesborde = (page: Page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cli: document.documentElement.clientWidth }));

test.describe("E5-F06 · Detalle de la HDU", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F06#1] T01: «Ver detalle» (y Enter sobre el código) abre el panel con resumen, descripción, criterios, estado, prioridad de Jira y de Quality360, tipo, responsable, etiquetas, sprints, épica, fechas, «Abrir en Jira» y «Datos de Jira del…», sin llamar a Jira", async ({ page, request }) => {
      await consultaConDetalle(request);
      await jiraFalso.limpiarSolicitudes();
      await irAConsulta(page);
      const panel = await abrirDetalle(page, "QTY-17");
      await expect(panel).toHaveAttribute("role", "dialog");
      await expect(panel).toHaveAttribute("aria-modal", "true");
      await expect(panel.getByTestId("detalle-resumen")).toHaveText("Detalle completo con doble factor", { timeout: 15_000 });
      await expect(panel.getByTestId("detalle-estado")).toContainText("En progreso");
      await expect(panel.getByTestId("detalle-prioridad")).toContainText("Highest");
      await expect(panel.getByTestId("detalle-prioridad")).toContainText("Crítica");
      await expect(panel.getByTestId("detalle-tipo")).toContainText("Story");
      await expect(panel.getByTestId("detalle-responsable")).toContainText("Rosa Pérez");
      await expect(panel.getByTestId("detalle-epica")).toContainText("QTY-100");
      await expect(panel.getByTestId("detalle-epica")).toContainText("Autenticación");
      const sprints = panel.getByTestId("detalle-sprints");
      for (const s of ["E5 Sprint Pasado", "E5 Sprint 2", "E5 Sprint 3"]) await expect(sprints).toContainText(s);
      await expect(sprints).toContainText(/Cerrado/i);
      await expect(sprints).toContainText(/Activo/i);
      await expect(sprints).toContainText(/Futuro/i);
      await expect(panel.getByTestId("detalle-etiquetas")).toContainText("etiqueta-1");
      await expect(panel.getByTestId("detalle-etiquetas")).toContainText(/\+\d+ más/);
      const fechas = panel.getByTestId("detalle-fechas");
      await expect(fechas).toContainText("2026");
      await expect(fechas).toContainText(/Creada/i);
      await expect(fechas).toContainText(/Vence|Vencimiento/i);
      await expect(panel.getByTestId("detalle-descripcion")).toContainText("Como usuario quiero activar un segundo factor.");
      await expect(panel.getByTestId("detalle-criterios")).toContainText("Dado un usuario con 2FA activo");
      const enlace = panel.getByTestId("enlace-abrir-jira");
      await expect(enlace).toHaveAttribute("target", "_blank");
      await expect(enlace).toHaveAttribute("rel", /noopener/);
      await expect(enlace).toHaveAttribute("href", "http://127.0.0.1:4010/browse/QTY-17");
      await expect(panel).toContainText(/Datos de Jira del/);
      expect(await solicitudesJira(), "abrir el panel no llama a Jira").toEqual([]);
      // Enter sobre el código abre el mismo panel de otra fila.
      await panel.getByTestId("boton-cerrar-detalle").click();
      await expect(page.getByTestId("panel-detalle-hdu")).toHaveCount(0);
      await fila(page, "QTY-18").getByTestId("boton-codigo-QTY-18").focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("panel-detalle-hdu")).toHaveAttribute("data-codigo", "QTY-18");
      await expect(page.getByTestId("panel-detalle-hdu").getByTestId("detalle-criterios")).toContainText("El botón queda deshabilitado sin datos");
      await expect(page.getByTestId("panel-detalle-hdu").getByText("Tomados de la descripción")).toBeVisible();
    });

    test("[E5-F06#2] T02: filas «Cambiaron», «Sin cambios» y «Con error» también abren el detalle: «Cambiaron» con el antes → después, «Con error» con el motivo, y sin controles de asignación", async ({ page, request }) => {
      await prepararDetalle(request);
      await crearManual(request, "QTY-3", "Otro título en Quality360", { prioridad: "MEDIA" }); // CAMBIO
      await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" }); // SIN_CAMBIOS
      await consultarOk(request);
      await irAConsulta(page);
      await abrirGrupo(page, "cambiaron");
      let panel = await abrirDetalle(page, "QTY-3");
      await expect(panel.getByText("Qué cambió")).toBeVisible();
      await expect(panel.getByTestId("detalle-que-cambio")).toContainText("Título: Otro título en Quality360 → Exportar reporte mensual");
      await expect(panel.getByTestId("selector-qe")).toHaveCount(0);
      await expect(panel.getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
      await panel.getByTestId("boton-cerrar-detalle").click();
      await abrirGrupo(page, "sin-cambios");
      panel = await abrirDetalle(page, "QTY-4");
      await expect(panel.getByTestId("detalle-resumen")).toHaveText("Filtrar por fecha", { timeout: 15_000 });
      await expect(panel.getByTestId("selector-qe")).toHaveCount(0);
      await panel.getByTestId("boton-cerrar-detalle").click();
      await abrirGrupo(page, "con-error");
      panel = await abrirDetalle(page, "QTY-11");
      await expect(panel.getByTestId("detalle-motivo-error")).toBeVisible();
      await expect(panel.getByTestId("selector-qe")).toHaveCount(0);
      await expect(panel.getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
    });

    test("[E5-F06#3] T03: QTY-16 sin descripción, criterios, etiquetas, épica, sprint, responsable ni fechas: cada sección dice «Sin … en Jira» y las fechas «—»", async ({ page, request }) => {
      await consultaConDetalle(request);
      await irAConsulta(page);
      const panel = await abrirDetalle(page, "QTY-16");
      await expect(panel.getByTestId("detalle-vacio-descripcion")).toHaveText("Sin descripción en Jira", { timeout: 15_000 });
      await expect(panel.getByTestId("detalle-vacio-criterios")).toHaveText("Sin criterios de aceptación en Jira");
      await expect(panel.getByTestId("detalle-vacio-etiquetas")).toHaveText("Sin etiquetas en Jira");
      await expect(panel.getByTestId("detalle-vacio-epica")).toHaveText("Sin épica en Jira");
      await expect(panel.getByTestId("detalle-vacio-sprints")).toHaveText("Sin sprint en Jira");
      await expect(panel.getByTestId("detalle-vacio-responsable")).toHaveText("Sin responsable en Jira");
      const fechas = (await panel.getByTestId("detalle-fechas").innerText()).replace(/\s+/g, " ");
      expect(fechas.match(/—/g)?.length ?? 0, `cuatro fechas ausentes: ${fechas}`).toBe(4);
    });

    test("[E5-F06#4] T04: texto largo (20 KB) se recorta con «Texto recortado; ver completo en Jira», «Ver todo» abre el bloque con scroll interno, las etiquetas sobrantes son «+N más» y no hay scroll horizontal a 1280 ni a 375", async ({ page, request }) => {
      await prepararDetalle(request);
      await jiraFalso.issue("QTY-19", { tipo: "Story", summary: "S".repeat(200), description: null, priority: "Low", labels: Array.from({ length: 25 }, (_, i) => `e${i}-${"x".repeat(40)}`), sprints: [{ name: "N".repeat(80), state: "active", endDate: "2099-01-01T00:00:00.000Z" }] });
      await consultarOk(request);
      for (const ancho of [1280, 375]) {
        await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
        await irAConsulta(page);
        let panel = await abrirDetalle(page, "QTY-15");
        const descripcion = panel.getByTestId("detalle-descripcion");
        await expect(descripcion).toBeVisible({ timeout: 15_000 });
        await expect(panel.getByTestId("aviso-texto-recortado")).toContainText("Texto recortado; ver completo en Jira");
        const ver = panel.getByTestId("boton-ver-todo-descripcion");
        await expect(ver).toHaveAttribute("aria-expanded", "false");
        await ver.click();
        await expect(ver).toHaveAttribute("aria-expanded", "true");
        const medidas = await descripcion.evaluate((el) => {
          const bloque = (el.querySelector("[tabindex='0']") ?? el) as HTMLElement;
          return { scrollable: bloque.scrollHeight > bloque.clientHeight, tabindex: bloque.getAttribute("tabindex"), alto: bloque.clientHeight, texto: (el as HTMLElement).innerText.length };
        });
        expect(medidas.texto, "se muestran hasta 8.000 caracteres").toBeLessThanOrEqual(8200);
        expect(medidas.scrollable, "el bloque expandido hace scroll interno").toBe(true);
        expect(medidas.tabindex, "el scroll interno es alcanzable con teclado").toBe("0");
        const m = await sinDesborde(page);
        expect(m.doc, `sin scroll horizontal a ${ancho} con el panel abierto`).toBeLessThanOrEqual(m.cli);
        await panel.getByTestId("boton-cerrar-detalle").click();
        panel = await abrirDetalle(page, "QTY-19");
        await expect(panel.getByTestId("detalle-etiquetas")).toContainText(/\+\d+ más/, { timeout: 15_000 });
        await expect(panel.getByTestId("detalle-etiquetas")).toContainText(/\+5 más en Jira/);
        const m2 = await sinDesborde(page);
        expect(m2.doc, `título de 200 caracteres sin espacios, sprint de 80 y etiquetas largas a ${ancho}`).toBeLessThanOrEqual(m2.cli);
      }
    });

    test("[E5-F06#5] T05: el contenido peligroso de QTY-15 se ve como texto: no se ejecuta ni se crea ningún elemento (script, b, img), javascript: no es enlace, las imágenes y macros dicen «[contenido no mostrable]» y la tabla y la lista conservan su orden", async ({ page, request }) => {
      await consultaConDetalle(request);
      const dialogos: string[] = [];
      page.on("dialog", async (d) => {
        dialogos.push(d.message());
        await d.dismiss();
      });
      await irAConsulta(page);
      // También en la tarjeta: «Ver descripción» (la descripción corta de la fila) se pinta como texto.
      await fila(page, "QTY-15").locator("details summary").click();
      await expect(fila(page, "QTY-15").locator("details p")).toContainText("<script>window.__xss = 1");
      expect(await fila(page, "QTY-15").locator("details").locator("script, b, img, iframe").count()).toBe(0);
      const panel = await abrirDetalle(page, "QTY-15");
      const descripcion = panel.getByTestId("detalle-descripcion");
      await expect(descripcion).toBeVisible({ timeout: 15_000 });
      await panel.getByTestId("boton-ver-todo-descripcion").click();
      const texto = await descripcion.innerText();
      expect(texto).toContain("negrita");
      expect(texto).not.toContain("<script");
      expect(texto).toContain("[contenido no mostrable]");
      expect(texto).toContain("enlace javascript");
      expect(texto).not.toContain("javascript:");
      expect(texto).toContain("=cmd|' /C calc'!A0 · fin");
      expect(texto.indexOf("1. primero")).toBeGreaterThan(-1);
      expect(texto.indexOf("1. primero")).toBeLessThan(texto.indexOf("2. segundo"));
      expect(await panel.locator("script, b, strong img, img, iframe, object, embed").count(), "ningún elemento ejecutable ni imagen dentro del panel").toBe(0);
      expect(await panel.locator("a[href^='javascript:' i], a[href^='data:' i]").count()).toBe(0);
      const enlaces = await descripcion.locator("a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const href of enlaces) expect(href).toMatch(/^https?:\/\//);
      expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss), "el script de la descripción no se ejecutó").toBeUndefined();
      expect(await page.title()).not.toBe("xss");
      expect(dialogos).toEqual([]);
      // Etiquetas con HTML: texto literal.
      await expect(panel.getByTestId("detalle-etiquetas")).toContainText("<b>html</b>");
      expect(await panel.getByTestId("detalle-etiquetas").locator("b").count()).toBe(0);
      expect(await page.evaluate(() => document.querySelectorAll("[onerror], [onclick], [onload]").length), "ningún elemento con manejadores en línea").toBe(0);
    });

    test("[E5-F06#6] T06: una consulta anterior al detalle (detalle NULL) muestra lo que hay de la fila y el aviso «Consulta anterior al detalle completo; consulta Jira de nuevo»", async ({ page, request }) => {
      const c = (await consultaConDetalle(request)).consulta;
      await sql("UPDATE integraciones.consulta_item SET detalle = NULL WHERE id_consulta = $1", [c.id]);
      await irAConsulta(page);
      const panel = await abrirDetalle(page, "QTY-1");
      await expect(panel.getByTestId("aviso-detalle-antiguo")).toContainText("Consulta anterior al detalle completo; consulta Jira de nuevo", { timeout: 15_000 });
      await expect(panel).toContainText("Login con doble factor");
      await expect(panel).toContainText("Como usuario quiero activar 2FA");
      await expect(panel.getByTestId("selector-qe")).toBeVisible(); // la fila sigue asignable
    });

    test("[E5-F06#7] T07: si la consulta deja de estar vigente con el panel abierto (descartada desde otra pestaña), la siguiente acción avisa, cierra el panel, no deja texto de Jira y ofrece «Consultar Jira»", async ({ page, request }) => {
      const c = (await consultaConDetalle(request)).consulta;
      await irAConsulta(page);
      const panel = await abrirDetalle(page, "QTY-17");
      await expect(panel.getByTestId("detalle-resumen")).toHaveText("Detalle completo con doble factor", { timeout: 15_000 });
      expect((await descartar(request, c.id)).status).toBe(200);
      await panel.getByTestId("boton-siguiente-sin-asignar").click();
      await expect(page.getByTestId("panel-detalle-hdu")).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByText(/Detalle completo con doble factor/)).toHaveCount(0);
      await expect(page.getByText(/Dado un usuario con 2FA/)).toHaveCount(0);
      await expect(page.getByTestId("aviso-consulta-vencida").or(page.getByTestId("aviso-consulta-descartada")).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Consultar Jira/ }).or(page.getByRole("link", { name: /Consultar Jira/ })).first()).toBeVisible();
    });

    test("[E5-F06#8] T08: si el servicio falla al pedir el detalle aparece «No se pudo cargar el detalle» con «Reintentar» (role=alert), la tabla sigue usable y reintentar muestra el detalle", async ({ page, request }) => {
      await consultaConDetalle(request);
      await irAConsulta(page);
      let falla = true;
      await page.route(/\/items\/[0-9a-f-]{36}$/, (route) => (falla && route.request().method() === "GET" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "El servicio no está disponible.", traceId: "x", detalles: [] }) }) : route.continue()));
      const panel = await abrirDetalle(page, "QTY-17");
      const error = panel.getByTestId("error-detalle");
      await expect(error).toBeVisible({ timeout: 30_000 });
      await expect(error).toHaveAttribute("role", "alert");
      await expect(error).toContainText("No se pudo cargar el detalle");
      await panel.getByTestId("boton-cerrar-detalle").click();
      await expect(fila(page, "QTY-1").getByTestId("selector-celula")).toBeEnabled(); // la tabla sigue usable
      falla = false;
      await abrirDetalle(page, "QTY-17");
      await expect(page.getByTestId("panel-detalle-hdu").getByTestId("detalle-resumen")).toHaveText("Detalle completo con doble factor", { timeout: 15_000 });
      expect(await page.getByTestId("error-detalle").count()).toBe(0);
    });

    test("[E5-F06#10] T10: teclado y lector: el foco entra en «Cerrar», queda atrapado, Esc cierra y devuelve el foco al botón de la fila; encabezados por sección; anuncio «Detalle de QTY-2» al pasar a la siguiente", async ({ page, request }) => {
      await consultaConDetalle(request);
      await irAConsulta(page);
      const abrir = fila(page, "QTY-1").getByTestId("boton-ver-detalle");
      await abrir.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByTestId("panel-detalle-hdu");
      await expect(panel).toBeVisible();
      await expect(page.getByTestId("boton-cerrar-detalle")).toBeFocused();
      const nombre = await panel.getAttribute("aria-labelledby");
      expect(nombre).toBeTruthy();
      await expect(page.locator(`#${nombre}`)).toContainText("QTY-1");
      for (const h of ["Descripción", "Criterios de aceptación", "Asignación"]) await expect(panel.getByRole("heading", { name: h })).toBeVisible();
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press("Tab");
        expect(await panel.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1}: el foco sigue dentro del panel`).toBe(true);
      }
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press("Shift+Tab");
        expect(await panel.evaluate((el) => el.contains(document.activeElement)), `Shift+Tab ${i + 1}`).toBe(true);
      }
      await panel.getByTestId("boton-siguiente-sin-asignar").click();
      await expect(page.getByTestId("panel-detalle-hdu")).toHaveAttribute("data-codigo", "QTY-2");
      await expect(page.getByTestId("anuncios-consulta")).toContainText("Detalle de QTY-2");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("panel-detalle-hdu")).toHaveCount(0);
      await expect(fila(page, "QTY-2").getByTestId("boton-ver-detalle")).toBeFocused();
      // Anterior vuelve a QTY-1 (al abrir QTY-2 hay anterior).
      await fila(page, "QTY-2").getByTestId("boton-ver-detalle").click();
      await page.getByTestId("boton-anterior").click();
      await expect(page.getByTestId("panel-detalle-hdu")).toHaveAttribute("data-codigo", "QTY-1");
    });

    test("[E5-F06#10] T11: a 375 px el panel es una hoja a pantalla completa, sin scroll horizontal, con objetivos táctiles de 44 px", async ({ page, request }) => {
      await consultaConDetalle(request);
      await page.setViewportSize({ width: 375, height: 800 });
      await irAConsulta(page);
      const panel = await abrirDetalle(page, "QTY-17");
      await expect(panel.getByTestId("detalle-resumen")).toHaveText("Detalle completo con doble factor", { timeout: 15_000 });
      const caja = await panel.boundingBox();
      expect(caja?.width ?? 0, "la hoja ocupa todo el ancho").toBeGreaterThanOrEqual(370);
      for (const id of ["boton-cerrar-detalle", "boton-anterior", "boton-siguiente-sin-asignar", "enlace-abrir-jira"]) {
        const b = await panel.getByTestId(id).boundingBox();
        expect(b?.height ?? 0, `${id} mide 44 px de alto`).toBeGreaterThanOrEqual(43.5);
      }
      const m = await sinDesborde(page);
      expect(m.doc).toBeLessThanOrEqual(m.cli);
    });
  });

  for (const clave of ["qe1", "lid1", "ana1", "aud1"] as const) {
    test(`[E5-F06#9] T09: ${clave.toUpperCase()} no ve «Ver detalle» ni el panel en el portal`, async ({ browser, request }) => {
      await consultaConDetalle(request);
      const { contexto, page } = await contextoDe(browser, clave);
      try {
        const respuestas: number[] = [];
        page.on("response", (r) => {
          if (/\/jira\/consultas\/[^/]+\/items\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname)) respuestas.push(r.status());
        });
        await page.goto(RUTA_CONSULTA);
        await page.waitForLoadState("networkidle");
        await expect(page.getByTestId("boton-ver-detalle")).toHaveCount(0);
        await expect(page.getByTestId("panel-detalle-hdu")).toHaveCount(0);
        await expect(page.getByTestId("boton-confirmar-asignacion")).toHaveCount(0);
        expect(respuestas.filter((s) => s === 200), "el detalle nunca se entrega a este rol").toEqual([]);
      } finally {
        await contexto.close();
      }
    });
  }

  test.describe("ADM1 (F05#15)", () => {
    test.use({ storageState: estadoSesion("adm1") });
    test("[E5-F05#15] T12: desde cualquier fila (Nueva, Cambiaron, Sin cambios, Con error) «Ver detalle» abre el panel de E5-F06", async ({ page, request }) => {
      await prepararDetalle(request);
      await crearManual(request, "QTY-3", "Otro título", { prioridad: "MEDIA" });
      await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" });
      await consultarOk(request);
      await irAConsulta(page);
      for (const [grupo, codigo] of [["nuevas", "QTY-1"], ["cambiaron", "QTY-3"], ["sin-cambios", "QTY-4"], ["con-error", "QTY-11"]] as const) {
        await abrirGrupo(page, grupo);
        const panel = await abrirDetalle(page, codigo);
        if (grupo === "con-error") await expect(panel.getByTestId("detalle-motivo-error")).toBeVisible({ timeout: 15_000 });
        else await expect(panel.getByTestId("detalle-resumen")).toBeVisible({ timeout: 15_000 });
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("panel-detalle-hdu")).toHaveCount(0);
      }
    });
  });
});
