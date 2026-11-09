import { expect, test, type Page } from "@playwright/test";
import { env } from "../support/env";
import { contextoDe, estadoSesion } from "../support/e4ui";
import { actual, asignarYMarcar, consultaACompletaConfirmada, consultarOk, prepararCambiosB, solicitudesJira } from "../support/e5c";
import { contarHdu, estadoConfigBase, estadoSinConfig, guardarConfigBase, limpiarE5, sql, TOKEN_FALSO } from "../support/e5";
import { levantarIntegraciones } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-F02 · Consultar Jira (reescrita: 5 escenarios, T01..T13). La pestaña conserva el nombre «Sincronizar»; el botón principal dice «Consultar Jira». */
test.describe.configure({ mode: "default" });
test.afterAll(async () => {
  await limpiarE5();
});

const RUTA = `${env.portalUrl}/admin/integraciones/sincronizar`;
const contador = async (page: Page, clave: string) => Number(await page.getByTestId(`res-${clave}`).locator("dd").first().innerText());

async function consultarEnPantalla(page: Page) {
  await page.goto(RUTA);
  await page.getByTestId("boton-consultar-jira").click();
  await expect(page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
}

test.describe("E5-F02 · Consultar Jira", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F02#1] T01: «Consultar Jira» lee 11 (10 nuevas, 0 cambiaron, 0 sin cambios, 1 con error, 4 advertencias), «Con errores», consulta abierta con vencimiento a 24 h y acceso «Revisar y asignar (10 nuevas)»", async ({ page, request }) => {
      await estadoConfigBase(request);
      await page.goto(RUTA);
      await expect(page.getByTestId("boton-consultar-jira")).toHaveText("Consultar Jira");
      await expect(page.getByTestId("pestana-sincronizar")).toContainText("Sincronizar");
      await expect(page.getByTestId("pestana-sincronizar-contenido")).toContainText("Sincronizar con Jira");
      await consultarEnPantalla(page);
      expect(await contador(page, "leidas")).toBe(11);
      expect(await contador(page, "nuevas")).toBe(10);
      expect(await contador(page, "cambiaron")).toBe(0);
      expect(await contador(page, "sin-cambios")).toBe(0);
      expect(await contador(page, "con-error")).toBe(1);
      expect(await contador(page, "advertencias")).toBe(4);
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
      await expect(page.getByTestId("resultado-ejecucion")).toContainText("Con errores");
      await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "ABIERTA");
      const vence = (await actual(request)).body.consulta;
      expect(Date.parse(vence.venceEn) - Date.now()).toBeGreaterThan(23.5 * 3600_000);
      await expect(page.getByTestId("consulta-vence")).toContainText(/Vence/i);
      await expect(page.getByTestId("enlace-revisar-consulta")).toContainText("Revisar y asignar (10 nuevas)");
    });

    test("[E5-F02#1] T02: consultar no crea HDU: el total de ADM1 no cambia, QE2 no gana filas en «Asignar analista» y Jira recibió solo lecturas de project = QTY", async ({ page, request, browser }) => {
      await estadoConfigBase(request);
      const total0 = await contarHdu(request);
      const qe = await contextoDe(browser, "qe2");
      try {
        await qe.page.goto(`${env.portalUrl}/qe`);
        await expect(qe.page.getByTestId("contador-sin-analista")).toBeVisible();
        const sin0 = Number(await qe.page.getByTestId("contador-sin-analista").innerText());
        await consultarEnPantalla(page);
        expect(await contarHdu(request)).toBe(total0);
        await page.goto(`${env.portalUrl}/admin`);
        await expect(page.getByTestId("contador-hdu-total")).toHaveText(String(total0));
        await qe.page.goto(`${env.portalUrl}/qe`);
        await expect(qe.page.getByTestId("contador-sin-analista")).toHaveText(String(sin0));
        const reqs = await solicitudesJira();
        const busquedas = reqs.filter((s) => s.ruta === "/rest/api/3/search/jql");
        expect(busquedas.length).toBeGreaterThan(0);
        for (const b of busquedas) expect(b.consulta.jql).toContain("project = QTY");
        expect(reqs.filter((s) => s.metodo !== "GET" && s.metodo !== "POST")).toEqual([]);
        expect((await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE origen = 'JIRA'"))[0].n).toBe(0);
      } finally {
        await qe.contexto.close();
      }
    });

    test("[E5-F02#1] T03: con la consulta A confirmada y el falso cambiado, «Consultar Jira» muestra 1 nueva, 2 cambiaron, 8 sin cambios y 1 con error", async ({ page, request }) => {
      await estadoConfigBase(request);
      await prepararCambiosB(request);
      await consultarEnPantalla(page);
      expect(await contador(page, "nuevas")).toBe(1);
      expect(await contador(page, "cambiaron")).toBe(2);
      expect(await contador(page, "sin-cambios")).toBe(8);
      expect(await contador(page, "con-error")).toBe(1);
    });

    test("[E5-F02#2] T04: sin novedades se informa «Sin novedades» (10 sin cambios, «Exitosa») y no existe «Confirmar»", async ({ page, request }) => {
      await estadoConfigBase(request);
      await consultaACompletaConfirmada(request);
      await jiraFalso.borrarIssue("QTY-11");
      await consultarEnPantalla(page);
      await expect(page.getByTestId("mensaje-sin-novedades")).toBeVisible();
      await expect(page.getByTestId("mensaje-sin-novedades")).toContainText("Sin novedades");
      expect(await contador(page, "nuevas")).toBe(0);
      expect(await contador(page, "cambiaron")).toBe(0);
      expect(await contador(page, "sin-cambios")).toBe(10);
      await expect(page.getByTestId("resultado-ejecucion")).toContainText("Exitosa");
      await expect(page.getByTestId("boton-confirmar")).toHaveCount(0);
    });

    test("[E5-F02#3] T05 (negativo): con Jira CAIDO y la consulta A abierta, reemplazar muestra JIRA_NO_DISPONIBLE con «Importar un archivo», el Historial una ejecución «Fallida» de fase Consulta y A sigue abierta", async ({ page, request }) => {
      await estadoConfigBase(request);
      const a = (await consultarOk(request)).consulta;
      await jiraFalso.modo("CAIDO");
      await page.goto(RUTA);
      await page.getByTestId("boton-consultar-jira").click();
      await expect(page.getByTestId("dialogo-reemplazar")).toBeVisible();
      await page.getByTestId("boton-reemplazar-consulta").click();
      const err = page.getByTestId("error-consulta");
      await expect(err).toBeVisible({ timeout: 60_000 });
      await expect(err).toHaveAttribute("data-codigo", "JIRA_NO_DISPONIBLE");
      await expect(err).toContainText("Jira no está disponible por ahora.");
      await expect(err.getByTestId("enlace-importar-archivo")).toBeVisible();
      expect((await actual(request)).body.consulta).toMatchObject({ id: a.id, estado: "ABIERTA", nuevas: 10 });
      await page.goto(`${env.portalUrl}/admin/integraciones/historial`);
      const fila = page.locator("tr, li").filter({ hasText: "Fallida" }).first();
      await expect(fila).toBeVisible();
      await expect(fila).toContainText(/Consulta/);
    });

    test("[E5-F02#3] T06 (negativo): con el token revocado se ofrece ir a Conexión y el texto del token no aparece en la página", async ({ page, request }) => {
      await estadoConfigBase(request);
      await jiraFalso.modo("TOKEN_REVOCADO");
      await page.goto(RUTA);
      await page.getByTestId("boton-consultar-jira").click();
      const err = page.getByTestId("error-consulta");
      await expect(err).toBeVisible({ timeout: 60_000 });
      await expect(err).toHaveAttribute("data-codigo", "JIRA_CREDENCIAL_INVALIDA");
      await expect(err.getByTestId("enlace-ir-conexion")).toBeVisible();
      expect(await page.content()).not.toContain(TOKEN_FALSO);
      expect(await page.locator("body").innerText()).not.toContain(TOKEN_FALSO);
    });

    test("[E5-F02#5] T07: BIG (230): consulta de 100, «Continuar consulta» a 200 y a 230 «Exitosa» sin botón; la consulta abierta acumula 230 filas y no se crea ninguna HDU BIG", async ({ page, request }) => {
      test.setTimeout(180_000);
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      await consultarEnPantalla(page);
      expect(await contador(page, "leidas")).toBe(100);
      await expect(page.getByTestId("aviso-incompleta")).toContainText("Se leyeron 100 historias; quedan más en Jira");
      await page.getByTestId("boton-continuar-consulta").click();
      await expect(page.getByTestId("res-leidas")).toContainText("200", { timeout: 60_000 });
      await page.getByTestId("boton-continuar-consulta").click();
      await expect(page.getByTestId("res-leidas")).toContainText("230", { timeout: 60_000 });
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
      await expect(page.getByTestId("boton-continuar-consulta")).toHaveCount(0);
      expect((await actual(request)).body.consulta).toMatchObject({ leidas: 230, nuevas: 230 });
      expect(await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'")).toEqual([{ n: 0 }]);
    });

    test("[E5-F02#1] T08: con el falso en LIMITE la consulta termina «Con errores» con 10 nuevas y el aviso «Jira pidió esperar 2 veces; se reintentó»", async ({ page, request }) => {
      await estadoConfigBase(request);
      await jiraFalso.modo("LIMITE");
      await consultarEnPantalla(page);
      await expect(page.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
      expect(await contador(page, "nuevas")).toBe(10);
      await expect(page.getByTestId("aviso-limite-tasa")).toContainText("Jira pidió esperar 2 veces; se reintentó");
    });

    test("[E5-F02#1] T09 (negativo): con dos pestañas el botón queda «Consultando…» y la segunda recibe «Ya hay una consulta o confirmación en curso»; una sola ejecución en el historial", async ({ page, request, browser }) => {
      test.setTimeout(180_000);
      await estadoConfigBase(request);
      // El perfil de la instancia principal corta a 1,5 s por petición; como pide el backlog («LENTO con límite alto») las dos pestañas
      // envían la consulta a una instancia con límite alto (:3109) y el resto de las lecturas sigue en la principal.
      const alta = await levantarIntegraciones(3109, { JIRA_TIEMPO_LIMITE_MS: "20000", INTEGRACIONES_PRESUPUESTO_MS: "9500" });
      const redirigir = async (p: Page) =>
        p.route("**/v1/integraciones/jira/consultas", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          const r = await route.fetch({ url: `${alta.url}/v1/integraciones/jira/consultas` });
          await route.fulfill({ response: r });
        });
      await jiraFalso.modo("LENTO");
      const otra = await contextoDe(browser, "adm1");
      await redirigir(page);
      await redirigir(otra.page);
      try {
        await page.goto(RUTA);
        await otra.page.goto(RUTA);
        await page.getByTestId("boton-consultar-jira").click();
        await expect(page.getByTestId("boton-consultar-jira")).toBeDisabled();
        await expect(page.getByTestId("boton-consultar-jira")).toContainText("Consultando…");
        await otra.page.waitForTimeout(400);
        await otra.page.getByTestId("boton-consultar-jira").click();
        await expect(otra.page.getByTestId("aviso-en-curso")).toContainText("Ya hay una consulta o confirmación en curso", { timeout: 20_000 });
        await expect(page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
        expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(1);
      } finally {
        await otra.contexto.close();
        await alta.detener();
        await jiraFalso.modo("NORMAL");
      }
    });

    test("[E5-F02#4] T10: con la consulta A y 3 filas asignadas, «Consultar Jira» pide confirmar el reemplazo (nombre, fecha, «3 filas asignadas»); cancelar no llama a Jira y reemplazar deja la anterior «Reemplazada»", async ({ page, request }) => {
      await estadoConfigBase(request);
      const a = (await consultarOk(request)).consulta;
      expect((await asignarYMarcar(request, a.id, ["QTY-1", "QTY-2", "QTY-3"])).status).toBe(200);
      await jiraFalso.limpiarSolicitudes();
      await page.goto(RUTA);
      await page.getByTestId("boton-consultar-jira").click();
      const dlg = page.getByTestId("dialogo-reemplazar");
      await expect(dlg).toBeVisible();
      await expect(page.getByTestId("texto-reemplazo")).toContainText("3 filas asignadas");
      await expect(page.getByTestId("texto-reemplazo")).toContainText(/ADM1/i);
      await page.getByTestId("boton-cancelar-dialogo").click();
      await expect(dlg).toHaveCount(0);
      expect(await solicitudesJira()).toHaveLength(0);
      expect((await actual(request)).body.consulta.id).toBe(a.id);
      await page.getByTestId("boton-consultar-jira").click();
      await page.getByTestId("boton-reemplazar-consulta").click();
      await expect(page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
      const nueva = (await actual(request)).body.consulta;
      expect(nueva.id).not.toBe(a.id);
      expect(nueva).toMatchObject({ asignadas: 0, marcadasNuevas: 0 });
      expect(await sql("SELECT estado FROM integraciones.consulta_jira WHERE id_consulta = $1", [a.id])).toEqual([{ estado: "REEMPLAZADA" }]);
    });

    test("[E5-F02#1] T11 (negativo): sin configuración la pestaña muestra el estado vacío con el enlace a Conexión y sin botón «Consultar Jira»", async ({ page }) => {
      await estadoSinConfig();
      await page.goto(RUTA);
      await expect(page.getByTestId("estado-vacio-jira")).toContainText("Configura la conexión con Jira antes de");
      await expect(page.getByTestId("estado-vacio-jira").getByRole("link")).toBeVisible();
      await expect(page.getByTestId("boton-consultar-jira")).toHaveCount(0);
    });
  });

  for (const clave of ["qe1", "ana1", "lid1", "aud1"] as const) {
    test.describe(clave.toUpperCase(), () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F02#1] T12 (negativo): ${clave.toUpperCase()} recibe acceso denegado en /admin/integraciones y no ve «Consultar Jira» en su propio portal`, async ({ page }) => {
        await page.goto(RUTA);
        await expect(page.getByTestId("acceso-denegado")).toBeVisible();
        await expect(page.getByTestId("boton-consultar-jira")).toHaveCount(0);
        if (clave === "qe1") {
          await page.goto(`${env.portalUrl}/qe/integraciones`);
          await expect(page.getByTestId("pagina-qe-integraciones")).toBeVisible();
        }
        if (clave === "aud1") {
          await page.goto(`${env.portalUrl}/auditor/integraciones`);
          await expect(page.getByTestId("vista-historial")).toBeVisible();
        }
        if (clave === "qe1" || clave === "aud1") {
          await expect(page.getByTestId("boton-consultar-jira")).toHaveCount(0);
          await expect(page.getByRole("button", { name: /Consultar Jira|Sincronizar con Jira/ })).toHaveCount(0);
        }
      });
    });
  }
});
