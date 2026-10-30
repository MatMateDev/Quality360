import { expect, test, type Page } from "@playwright/test";
import { env } from "../support/env";
import { contextoDe, estadoSesion } from "../support/e4ui";
import {
  contarHdu, estadoConfigBase, estadoSinConfig, guardarConfigBase, hduPorCodigo, limpiarE5, sincronizarOk, sql, TOKEN_FALSO,
} from "../support/e5";
import { levantarIntegraciones } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-F02 · Sincronizar las HDU de un proyecto Jira (3 escenarios, T01..T11; T12 es la regresión de la suite completa). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const RUTA = `${env.portalUrl}/admin/integraciones/sincronizar`;
const contador = async (page: Page, clave: string) => Number(await page.getByTestId(`res-${clave}`).locator("dd").first().innerText());

async function sincronizarEnPantalla(page: Page) {
  await page.goto(RUTA);
  await page.getByTestId("boton-sincronizar").click();
  await expect(page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
}

test.describe("E5-F02 · Sincronizar con Jira", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F02#1] T01: «Sincronizar con Jira» lee 11, crea 10, 0 actualizadas, 0 omitidas, 1 con error y 5 advertencias; resultado «Con errores» y QTY-11 con «El título es obligatorio»", async ({ page, request }) => {
      await estadoConfigBase(request);
      await sincronizarEnPantalla(page);
      expect(await contador(page, "leidas")).toBe(11);
      expect(await contador(page, "creadas")).toBe(10);
      expect(await contador(page, "actualizadas")).toBe(0);
      expect(await contador(page, "omitidas")).toBe(0);
      expect(await contador(page, "con-error")).toBe(1);
      expect(await contador(page, "advertencias")).toBe(5);
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
      await expect(page.getByTestId("resultado-ejecucion")).toContainText("Con errores");
      const creadas = page.getByTestId("lista-hdu-creadas");
      await expect(creadas).toBeVisible();
      const textoCreadas = await creadas.innerText();
      for (const k of ["QTY-1", "QTY-2", "QTY-3", "QTY-4", "QTY-5", "QTY-6", "QTY-8", "QTY-9", "QTY-10", "QTY-12"]) expect(textoCreadas, k).toContain(k);
      expect(textoCreadas).not.toContain("QTY-7");
      expect(textoCreadas).not.toContain("QTY-11");
      await expect(page.getByTestId("lista-filas-con-error")).toContainText("QTY-11");
      await expect(page.getByTestId("lista-filas-con-error")).toContainText("El título es obligatorio");
    });

    test("[E5-F02#1] T02: las 10 HDU nuevas suman al total, aparecen en «Asignar analista» de QE2 y el detalle de QTY-1 muestra origen Jira, prioridad Alta, sprint E5 Sprint 2, su descripción y estado Pendiente", async ({ page, request, browser }) => {
      await estadoConfigBase(request);
      const total0 = await contarHdu(request);
      const qe = await contextoDe(browser, "qe2");
      try {
        await qe.page.goto(`${env.portalUrl}/qe`);
        await expect(qe.page.getByTestId("contador-sin-analista")).toBeVisible();
        const sin0 = Number(await qe.page.getByTestId("contador-sin-analista").innerText());
        await sincronizarEnPantalla(page);
        expect(await contarHdu(request)).toBe(total0 + 10);
        await page.goto(`${env.portalUrl}/admin`);
        await expect(page.getByTestId("contador-hdu-total")).toHaveText(String(total0 + 10));
        await qe.page.goto(`${env.portalUrl}/qe`);
        await expect(qe.page.getByTestId("contador-sin-analista")).toHaveText(String(sin0 + 10));
        const h = await hduPorCodigo(request, "QTY-1");
        await qe.page.goto(`${env.portalUrl}/hdu/${h.id}`);
        await expect(qe.page.getByTestId("hdu-origen")).toContainText("Jira");
        await expect(qe.page.getByTestId("hdu-descripcion")).toContainText("Como usuario quiero activar 2FA");
        const cuerpo = await qe.page.locator("main").innerText();
        expect(cuerpo).toContain("Alta");
        expect(cuerpo).toContain("E5 Sprint 2");
        expect(cuerpo).toMatch(/Pendiente/i);
      } finally {
        await qe.contexto.close();
      }
    });

    test("[E5-F02#1] T03: tras cambiar QTY-2 y QTY-1 en Jira, la segunda sincronización actualiza 2, omite 8 y muestra «Título: Recuperar contraseña → Recuperar clave» y «Prioridad: Media → Crítica»", async ({ page, request }) => {
      await estadoConfigBase(request);
      await sincronizarOk(request);
      await jiraFalso.issue("QTY-2", { summary: "Recuperar clave", priority: "Highest" });
      await jiraFalso.issue("QTY-1", { description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Otra descripción de QTY-1" }] }] } });
      await sincronizarEnPantalla(page);
      expect(await contador(page, "actualizadas")).toBe(2);
      expect(await contador(page, "omitidas")).toBe(8);
      expect(await contador(page, "creadas")).toBe(0);
      expect(await contador(page, "con-error")).toBe(1);
      const lista = page.getByTestId("lista-hdu-actualizadas");
      await expect(lista).toContainText("QTY-2");
      await expect(lista).toContainText("Recuperar contraseña");
      await expect(lista).toContainText("Recuperar clave");
      await expect(lista).toContainText(/Media/);
      await expect(lista).toContainText(/Cr[ií]tica/);
    });

    test("[E5-F02#2] T04: sin QTY-11, dos sincronizaciones seguidas: la 1.ª crea 10 y es «Exitosa»; la 2.ª muestra «Sin cambios» con 10 omitidas y 0 creadas", async ({ page, request }) => {
      await estadoConfigBase(request);
      await jiraFalso.borrarIssue("QTY-11");
      await sincronizarEnPantalla(page);
      expect(await contador(page, "creadas")).toBe(10);
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
      await sincronizarEnPantalla(page);
      await expect(page.getByTestId("mensaje-sin-cambios")).toBeVisible();
      await expect(page.getByTestId("mensaje-sin-cambios")).toContainText("Sin cambios");
      expect(await contador(page, "creadas")).toBe(0);
      expect(await contador(page, "actualizadas")).toBe(0);
      expect(await contador(page, "omitidas")).toBe(10);
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
    });

    test("[E5-F02#3] T05 (negativo): con Jira CAIDO aparece JIRA_NO_DISPONIBLE con «Importar un archivo», la ejecución queda Fallida en el Historial y no se creó ninguna HDU", async ({ page, request }) => {
      await estadoConfigBase(request);
      const total0 = await contarHdu(request);
      await jiraFalso.modo("CAIDO");
      await page.goto(RUTA);
      await page.getByTestId("boton-sincronizar").click();
      const error = page.getByTestId("error-sincronizacion");
      await expect(error).toHaveAttribute("data-codigo", "JIRA_NO_DISPONIBLE", { timeout: 30_000 });
      await expect(error).toContainText("Jira no está disponible por ahora.");
      await error.getByTestId("enlace-importar-archivo").click();
      await expect(page).toHaveURL(/\/admin\/integraciones\/importar$/);
      await page.getByTestId("pestana-historial").click();
      await expect(page.getByTestId("lista-ejecuciones").locator("tbody tr").first()).toContainText("Fallida");
      expect(await contarHdu(request)).toBe(total0);
    });

    test("[E5-F02#3] T06 (negativo): con TOKEN_REVOCADO aparece JIRA_CREDENCIAL_INVALIDA con enlace a Conexión y el token no aparece en la página aunque el falso lo repita", async ({ page, request }) => {
      await estadoConfigBase(request);
      await jiraFalso.modo("TOKEN_REVOCADO");
      const cuerpos: string[] = [];
      page.on("response", async (r) => {
        if (r.url().includes("/v1/")) cuerpos.push(await r.text().catch(() => ""));
      });
      await page.goto(RUTA);
      await page.getByTestId("boton-sincronizar").click();
      const error = page.getByTestId("error-sincronizacion");
      await expect(error).toHaveAttribute("data-codigo", "JIRA_CREDENCIAL_INVALIDA", { timeout: 30_000 });
      await expect(error.getByTestId("enlace-ir-conexion")).toBeVisible();
      expect(await page.content()).not.toContain(TOKEN_FALSO);
      expect(cuerpos.join("\n")).not.toContain(TOKEN_FALSO);
    });

    test("[E5-F02#1] T07: BIG (230) en tres ejecuciones con «Continuar»: 100 con aviso y botón, otras 100, y 30 «Exitosa» sin botón; 230 HDU BIG", async ({ page, request }) => {
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      await sincronizarEnPantalla(page);
      expect(await contador(page, "leidas")).toBe(100);
      expect(await contador(page, "creadas")).toBe(100);
      await expect(page.getByTestId("aviso-incompleta")).toContainText("Se procesaron 100 historias");
      await expect(page.getByTestId("boton-continuar")).toBeVisible();
      await page.getByTestId("boton-continuar").click();
      await expect(page.getByTestId("res-leidas")).toContainText("100", { timeout: 60_000 });
      await expect(page.getByTestId("aviso-incompleta")).toBeVisible();
      await page.getByTestId("boton-continuar").click();
      await expect(page.getByTestId("res-leidas")).toContainText("30", { timeout: 60_000 });
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
      await expect(page.getByTestId("boton-continuar")).toHaveCount(0);
      expect(await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'")).toEqual([{ n: 230 }]);
    });

    test("[E5-F02#1] T08: con el falso en LIMITE la sincronización termina «Con errores» con 10 creadas y el aviso «Jira pidió esperar 2 veces; se reintentó»", async ({ page, request }) => {
      await estadoConfigBase(request);
      await jiraFalso.modo("LIMITE");
      await sincronizarEnPantalla(page);
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
      expect(await contador(page, "creadas")).toBe(10);
      await expect(page.getByTestId("aviso-limite-tasa")).toContainText("Jira pidió esperar 2 veces; se reintentó");
    });

    test("[E5-F02#1] T09 (negativo): con dos pestañas el botón queda «Sincronizando…» y la segunda recibe «Ya hay una sincronización en curso»; una sola ejecución en el historial", async ({ page, request, browser }) => {
      test.setTimeout(180_000);
      await estadoConfigBase(request);
      // El perfil de pruebas de la instancia principal corta a 1,5 s por petición. Como pide el backlog («falso en LENTO con límite alto»), las dos
      // pestañas envían la sincronización a una instancia de pruebas con límite alto (:3109); el resto de las lecturas sigue en la instancia principal.
      const alta = await levantarIntegraciones(3109, { JIRA_TIEMPO_LIMITE_MS: "20000", INTEGRACIONES_PRESUPUESTO_MS: "9500" });
      const redirigir = async (p: Page) =>
        p.route("**/v1/integraciones/jira/sincronizaciones", async (route) => {
          const r = await route.fetch({ url: `${alta.url}/v1/integraciones/jira/sincronizaciones` });
          await route.fulfill({ response: r });
        });
      await jiraFalso.modo("LENTO");
      const otra = await contextoDe(browser, "adm1");
      await redirigir(page);
      await redirigir(otra.page);
      try {
        await page.goto(RUTA);
        await otra.page.goto(RUTA);
        await page.getByTestId("boton-sincronizar").click();
        await expect(page.getByTestId("boton-sincronizar")).toBeDisabled();
        await expect(page.getByTestId("boton-sincronizar")).toContainText("Sincronizando…");
        await otra.page.waitForTimeout(400);
        await otra.page.getByTestId("boton-sincronizar").click();
        await expect(otra.page.getByTestId("aviso-en-curso")).toContainText("Ya hay una sincronización en curso", { timeout: 20_000 });
        await expect(page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
        const ejecuciones = await sql("SELECT 1 FROM integraciones.ejecucion_integracion");
        expect(ejecuciones).toHaveLength(1);
      } finally {
        await otra.contexto.close();
        await alta.detener();
        await jiraFalso.modo("NORMAL");
      }
    });

    test("[E5-F02#1] T10 (negativo): sin configuración, la pestaña Sincronizar muestra el estado vacío con el enlace a Conexión y sin botón «Sincronizar»", async ({ page }) => {
      await estadoSinConfig();
      await page.goto(RUTA);
      await expect(page.getByTestId("estado-vacio-jira")).toContainText("Configura la conexión con Jira antes de sincronizar");
      await expect(page.getByTestId("estado-vacio-jira").getByRole("link")).toBeVisible();
      await expect(page.getByTestId("boton-sincronizar")).toHaveCount(0);
    });
  });

  for (const clave of ["qe1", "ana1", "lid1", "aud1"] as const) {
    test.describe(clave.toUpperCase(), () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F02#1] T11 (negativo): ${clave.toUpperCase()} recibe acceso denegado en /admin/integraciones y no ve «Sincronizar» en su propio portal`, async ({ page }) => {
        await page.goto(`${env.portalUrl}/admin/integraciones/sincronizar`);
        await expect(page.getByTestId("acceso-denegado")).toBeVisible();
        await expect(page.getByTestId("boton-sincronizar")).toHaveCount(0);
        if (clave === "qe1") {
          await page.goto(`${env.portalUrl}/qe/integraciones`);
          await expect(page.getByTestId("pagina-qe-integraciones")).toBeVisible();
        }
        if (clave === "aud1") {
          await page.goto(`${env.portalUrl}/auditor/integraciones`);
          await expect(page.getByTestId("vista-historial")).toBeVisible();
        }
        if (clave === "qe1" || clave === "aud1") {
          await expect(page.getByTestId("boton-sincronizar")).toHaveCount(0);
          await expect(page.getByRole("button", { name: /Sincronizar/ })).toHaveCount(0);
        }
      });
    });
  }
});
