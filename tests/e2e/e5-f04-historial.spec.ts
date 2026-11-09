import { expect, test, type Page } from "@playwright/test";
import { env } from "../support/env";
import { estadoSesion, entrarEnPortal } from "../support/e4ui";
import { estadoSinConfig, limpiarE5, contieneSecreto, leerFixture } from "../support/e5";
import { prepararR1aR4 } from "../support/e5c";
import { integracionesCaida } from "../support/entornoE5";

/** E5-F04 · Estado e historial de ejecuciones, de solo lectura para QE y Auditor (3 escenarios, T01..T10; T11 es la regresión de la suite completa). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const HIST = `${env.portalUrl}/admin/integraciones/historial`;
const filasLista = (page: Page) => page.getByTestId("lista-ejecuciones").locator("tbody tr");
const detalleUrl = (id: string) => `${HIST}?ejecucion=${id}`;

test.describe("E5-F04 · Historial", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F04#1] T01: «Última ejecución» es R4 (Jira, Fallida, ADM1, 0 leídas) y «Última completada» es R3 (CSV, Con errores, 2 creadas, 7 con error)", async ({ page, request }) => {
      await prepararR1aR4(request);
      await page.goto(HIST);
      const ultima = page.getByTestId("tarjeta-ultima-ejecucion");
      await expect(ultima).toContainText("Jira");
      await expect(ultima).toContainText("Fallida");
      await expect(ultima).toContainText("ADM1");
      const completada = page.getByTestId("tarjeta-ultima-completada");
      await expect(completada).toContainText("CSV");
      await expect(completada).toContainText("Con errores");
      await expect(completada).toContainText("ADM1");
      await expect(completada).toContainText(/Creadas\s*2/);
      await expect(completada).toContainText(/Con error\s*7/);
    });

    test("[E5-F04#2] T02: la lista trae R4, R3, R2, R1 (confirmación) y C1 (consulta); filtra por origen CSV y por resultado Fallida, ordena ascendente y conserva los filtros en la URL", async ({ page, request }) => {
      const { c1, r1, r2, r3, r4 } = await prepararR1aR4(request);
      await page.goto(HIST);
      await expect(filasLista(page)).toHaveCount(5);
      const orden = async () => (await filasLista(page).evaluateAll((trs) => trs.map((t) => t.getAttribute("data-testid"))));
      expect(await orden()).toEqual([r4, r3, r2, r1, c1].map((e) => `fila-ejecucion-${e.id}`));
      for (const fila of await filasLista(page).all()) await expect(fila).toContainText(/\d/);
      await page.getByTestId("filtro-origen").or(page.locator("#filtro-origen")).first().selectOption("CSV");
      await expect(page).toHaveURL(/origen=CSV/);
      await expect(filasLista(page)).toHaveCount(2);
      expect(await orden()).toEqual([r3, r2].map((e) => `fila-ejecucion-${e.id}`));
      await page.locator("#filtro-origen").selectOption("");
      await page.locator("#filtro-resultado").selectOption("FALLIDA");
      await expect(page).toHaveURL(/resultado=FALLIDA/);
      await expect(filasLista(page)).toHaveCount(1);
      await expect(filasLista(page).first()).toHaveAttribute("data-testid", `fila-ejecucion-${r4.id}`);
      await page.goto(`${HIST}?orden=fecha:asc`);
      await expect(filasLista(page)).toHaveCount(5);
      expect((await orden())[0]).toBe(`fila-ejecucion-${c1.id}`);
      await page.goto(`${HIST}?origen=CSV&resultado=CON_ERRORES`);
      await expect(filasLista(page)).toHaveCount(1);
      await expect(page.locator("#filtro-origen")).toHaveValue("CSV");
      await expect(page.locator("#filtro-resultado")).toHaveValue("CON_ERRORES");
    });

    test("[E5-F04#3] T03: el detalle de R3 trae 9 filas (2 creadas y 7 con error); con «Solo filas con error» quedan 7 con sus motivos y sin tokens ni contenido de archivo", async ({ page, request }) => {
      const { r3 } = await prepararR1aR4(request);
      await page.goto(detalleUrl(r3.id));
      await expect(page.getByTestId("detalle-ejecucion")).toBeVisible();
      await expect(page.getByTestId("total-detalle-ejecucion")).toContainText("9 filas");
      await page.getByTestId("filtro-solo-errores").click();
      await expect(page.getByTestId("filtro-solo-errores")).toBeChecked();
      await expect(page.getByTestId("total-detalle-ejecucion")).toContainText("7 filas");
      await expect(page.getByTestId("detalle-ejecucion")).toContainText("La prioridad no es válida");
      const texto = await page.getByTestId("detalle-ejecucion").innerText();
      for (const m of ["La prioridad no es válida", "El código no es válido", "El código está repetido en el archivo", "La célula no existe", "El sprint no existe", "El QE responsable no es válido"]) {
        expect(texto, m).toContain(m);
      }
      expect(contieneSecreto(texto)).toBeUndefined();
      expect(texto).not.toContain(leerFixture("historias-con-errores.csv").slice(0, 60));
    });

    test("[E5-F04#3] T04: el detalle de R1 (confirmación) trae 10 filas creadas con su asignación visible y la referencia de Jira como texto; la consulta C1 no tiene filas de detalle", async ({ page, request }) => {
      const { r1 } = await prepararR1aR4(request);
      await page.goto(detalleUrl(r1.id));
      await expect(page.getByTestId("total-detalle-ejecucion")).toContainText("10 filas");
      const texto = await page.getByTestId("detalle-ejecucion").innerText();
      expect(texto).toContain("QTY-1");
      expect(texto).not.toContain("QTY-11");
      expect(texto).toContain("CEL-C");
      expect(texto).toContain("Estado: En progreso");
    });

    test("[E5-F04#2] T09: sin ejecuciones el Historial muestra «Aún no se ha sincronizado ni importado nada» y ningún error", async ({ page }) => {
      await estadoSinConfig();
      await page.goto(HIST);
      await expect(page.getByTestId("estado-vacio-historial")).toContainText("Aún no se ha sincronizado ni importado nada");
      await expect(page.locator("[data-testid^=estado-error-]")).toHaveCount(0);
    });
  });

  test.describe("ADM1 · fases", () => {
    test.use({ storageState: estadoSesion("adm1") });
    test("[E5-F04#4] T12: el Historial indica la fase de cada ejecución; Fase = Consulta trae leídas 11, nuevas 10, cambiaron 0, sin cambios 0 y con error 1 y Fase = Confirmación trae creadas 10 con el detalle por HDU y la asignación «CEL-C · QE2 · ANA3 · E5 Sprint…»", async ({ page, request }) => {
      const { c1, r1 } = await prepararR1aR4(request);
      await page.goto(HIST);
      await expect(filasLista(page).first()).toBeVisible();
      await page.locator("#filtro-fase").selectOption("CONSULTA");
      await expect(page).toHaveURL(/fase=CONSULTA/);
      const ids = async () => await filasLista(page).evaluateAll((trs) => trs.map((t) => t.getAttribute("data-testid")));
      await expect.poll(ids, { timeout: 15_000 }).toContain(`fila-ejecucion-${c1.id}`);
      const fc = page.getByTestId(`fila-ejecucion-${c1.id}`);
      await expect(fc).toContainText("Consulta");
      await expect(fc).toContainText("11");
      await page.locator("#filtro-fase").selectOption("CONFIRMACION");
      await expect(page).toHaveURL(/fase=CONFIRMACION/);
      await expect.poll(ids, { timeout: 15_000 }).toEqual([`fila-ejecucion-${r1.id}`]);
      await expect(page.getByTestId(`fila-ejecucion-${r1.id}`)).toContainText("Confirmación");
      await page.goto(detalleUrl(r1.id));
      await expect(page.getByTestId("total-detalle-ejecucion")).toContainText("10 filas");
      const t = await page.getByTestId("detalle-ejecucion").innerText();
      for (const k of ["QTY-1", "QTY-4", "CEL-C"]) expect(t, k).toContain(k);
      expect(t).toMatch(/E5 Sprint [12]/);
      await page.goto(detalleUrl(c1.id));
      await expect(page.getByTestId("detalle-ejecucion")).not.toContainText("QTY-1 ");
    });
  });

  test.describe("QE2", () => {
    test.use({ storageState: estadoSesion("qe2") });
    test("[E5-F04#2] T05: QE2 ve las 5 ejecuciones con sus contadores y el detalle de R2 y R1 con las filas de sus HDU, sin ningún botón de escritura", async ({ page, request }) => {
      const { r1, r2 } = await prepararR1aR4(request);
      await page.goto(`${env.portalUrl}/qe/integraciones`);
      await expect(filasLista(page)).toHaveCount(5);
      await page.goto(`${env.portalUrl}/qe/integraciones?ejecucion=${r2.id}`);
      for (const k of ["ARC-1", "ARC-2", "ARC-3", "ARC-4"]) await expect(page.getByTestId("detalle-ejecucion"), k).toContainText(k);
      await page.goto(`${env.portalUrl}/qe/integraciones?ejecucion=${r1.id}`);
      await expect(page.getByTestId("detalle-ejecucion")).toContainText("QTY-1");
      await expect(page.getByTestId("filas-ocultas")).toHaveCount(0);
      for (const id of ["boton-consultar-jira", "boton-confirmar", "boton-importar", "selector-archivo", "boton-probar-guardar"]) await expect(page.getByTestId(id)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Consultar Jira|Sincronizar|Confirmar|Importar|Configurar|Guardar/ })).toHaveCount(0);
    });
  });

  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });
    test("[E5-F04#3] T06: QE1 ve las 5 ejecuciones; en R1 0 filas de HDU y «10 filas de HDU fuera de tu ámbito»; en R3 solo las 7 filas con error", async ({ page, request }) => {
      const { r1, r3 } = await prepararR1aR4(request);
      await page.goto(`${env.portalUrl}/qe/integraciones`);
      await expect(filasLista(page)).toHaveCount(5);
      await page.goto(`${env.portalUrl}/qe/integraciones?ejecucion=${r1.id}`);
      await expect(page.getByTestId("filas-ocultas")).toContainText("10 filas de HDU fuera de tu ámbito");
      const t1 = await page.getByTestId("detalle-ejecucion").innerText();
      expect(t1).not.toContain("QTY-1 ");
      expect(t1).not.toContain("Login con doble factor");
      await page.goto(`${env.portalUrl}/qe/integraciones?ejecucion=${r3.id}`);
      await expect(page.getByTestId("filas-ocultas")).toContainText("2 filas de HDU fuera de tu ámbito");
      await expect(page.getByTestId("total-detalle-ejecucion")).toContainText("7 filas");
      await expect(page.getByTestId("detalle-ejecucion")).toContainText("La prioridad no es válida");
      const t3 = await page.getByTestId("detalle-ejecucion").innerText();
      expect(t3).not.toContain("Historia válida diez");
      expect(t3).not.toContain("Historia válida dieciséis");
    });

    test("[E5-F04#1] T10 (negativo): con Integraciones detenida /qe/integraciones dice «No disponible» con «Reintentar» y el resto del portal del QE carga", async ({ page }) => {
      test.setTimeout(240_000);
      const pila = await integracionesCaida();
      try {
        await entrarEnPortal(page, "qe1", pila.portalUrl);
        await expect(page.getByTestId("bandeja-qe")).toBeVisible();
        await page.goto(`${pila.portalUrl}/qe/integraciones`);
        const indisponible = page.locator("[data-testid^=estado-indisponible-]").first();
        await expect(indisponible).toBeVisible({ timeout: 30_000 });
        await expect(indisponible).toContainText("No disponible");
        await expect(page.getByRole("button", { name: /Reintentar/ }).first()).toBeVisible();
        await page.goto(`${pila.portalUrl}/qe`);
        await expect(page.getByTestId("bandeja-qe")).toBeVisible();
      } finally {
        await pila.detener();
      }
    });
  });

  test.describe("AUD1", () => {
    test.use({ storageState: estadoSesion("aud1") });
    test("[E5-F04#1] T07: AUD1 ve en la pestaña «Integraciones» lo mismo que ADM1 (5 ejecuciones y los detalles completos) y ninguna pestaña tiene acciones de escritura", async ({ page, request }) => {
      const { r1 } = await prepararR1aR4(request);
      await page.goto(`${env.portalUrl}/auditor`);
      await expect(page.getByTestId("pestana-integraciones")).toBeVisible();
      await page.getByTestId("pestana-integraciones").click();
      await expect(page).toHaveURL(/\/auditor\/integraciones/);
      await expect(filasLista(page)).toHaveCount(5);
      await page.goto(`${env.portalUrl}/auditor/integraciones?ejecucion=${r1.id}`);
      await expect(page.getByTestId("total-detalle-ejecucion")).toContainText("10 filas");
      await expect(page.getByTestId("filas-ocultas")).toHaveCount(0);
      for (const ruta of ["/auditor", "/auditor/certificados", "/auditor/bitacora", "/auditor/auditoria-usuarios", "/auditor/impedimentos", "/auditor/integraciones"]) {
        await page.goto(`${env.portalUrl}${ruta}`);
        await expect(page.locator("button[type=submit]"), ruta).toHaveCount(0);
        await expect(page.getByTestId("boton-consultar-jira"), ruta).toHaveCount(0);
        await expect(page.getByTestId("boton-confirmar"), ruta).toHaveCount(0);
        await expect(page.getByTestId("grupo-nuevas"), ruta).toHaveCount(0);
        await expect(page.getByTestId("selector-archivo"), ruta).toHaveCount(0);
      }
    });
  });

  for (const clave of ["lid1", "ana1"] as const) {
    test.describe(clave.toUpperCase(), () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F04#1] T08 (negativo): ${clave.toUpperCase()} recibe acceso denegado en /qe/integraciones y /admin/integraciones y el listado responde 403`, async ({ page }) => {
        const respuestas: number[] = [];
        page.on("response", (r) => {
          if (r.url().includes("/v1/integraciones/ejecuciones")) respuestas.push(r.status());
        });
        for (const ruta of ["/qe/integraciones", "/admin/integraciones/historial"]) {
          await page.goto(`${env.portalUrl}${ruta}`);
          await expect(page.getByTestId("acceso-denegado"), ruta).toBeVisible();
        }
        expect(respuestas.filter((s) => s === 200)).toEqual([]);
      });
    });
  }

  for (const [clave, ruta] of [["qe2", "/qe/integraciones"], ["aud1", "/auditor/integraciones"]] as const) {
    test.describe(`${clave.toUpperCase()} · fases`, () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F04#4] T13: ${clave.toUpperCase()} ve las ejecuciones de consulta y de confirmación con su fase, en solo lectura, sin filas de la consulta, sin «grupo-nuevas» y sin botones de escritura`, async ({ page, request }) => {
        const { c1, r1 } = await prepararR1aR4(request);
        await page.goto(`${env.portalUrl}${ruta}`);
        await expect(page.getByTestId(`fila-ejecucion-${c1.id}`)).toContainText("Consulta");
        await expect(page.getByTestId(`fila-ejecucion-${r1.id}`)).toContainText("Confirmación");
        await page.goto(`${env.portalUrl}${ruta}?ejecucion=${r1.id}`);
        await expect(page.getByTestId("detalle-ejecucion")).toContainText("QTY-1");
        if (clave === "qe2") await expect(page.getByTestId("filas-ocultas")).toHaveCount(0);
        await page.goto(`${env.portalUrl}${ruta}?ejecucion=${c1.id}`);
        for (const id of ["grupo-nuevas", "boton-confirmar", "boton-consultar-jira", "consulta-abierta", "casilla-marcar"]) await expect(page.getByTestId(id)).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Consultar Jira|Confirmar|Importar|Guardar/ })).toHaveCount(0);
      });
    });
  }
});
