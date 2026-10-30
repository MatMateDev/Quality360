import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { env } from "../support/env";
import { estadoSesion, entrarEnPortal } from "../support/e4ui";
import {
  CORREO_FALSO, SITIO_CERRADO, SITIO_FALSO, TOKEN_FALSO, contieneSecreto, destino, estadoConfigBase, estadoSinConfig, limpiarE5, sql, tk,
} from "../support/e5";
import { integracionesCaida } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";
import { TOKEN_NUEVO } from "../support/jira-falso/servidor";

/** E5-F01 · Configurar la conexión con Jira (3 escenarios, T01..T10; T11 es la regresión de la suite completa). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const RUTA = `${env.portalUrl}/admin/integraciones`;

/** Texto de todas las respuestas de red mientras dura la prueba (para afirmar que el token jamás viaja de vuelta). */
function vigilarRespuestas(page: Page): { cuerpos: string[] } {
  const cuerpos: string[] = [];
  page.on("response", async (r) => {
    if (!r.url().includes("/v1/")) return;
    try {
      cuerpos.push(`${r.url()} ${await r.text()}`);
    } catch {
      // respuestas sin cuerpo
    }
  });
  return { cuerpos };
}

async function llenarFormulario(page: Page, sobre: { sitio?: string; correo?: string; token?: string; proyecto?: string; tipos?: string } = {}) {
  await page.getByTestId("campo-sitio").fill(sobre.sitio ?? SITIO_FALSO);
  await page.getByTestId("campo-correo").fill(sobre.correo ?? CORREO_FALSO);
  if (sobre.token !== "") await page.getByTestId("campo-token").fill(sobre.token ?? TOKEN_FALSO);
  await page.getByTestId("campo-proyecto").fill(sobre.proyecto ?? "QTY");
  if (sobre.tipos) await page.getByTestId("campo-tipos").fill(sobre.tipos);
}

async function elegirDestino(page: Page) {
  await page.getByTestId("campo-celula").selectOption({ label: "CEL-C" });
  await page.getByTestId("campo-qe").selectOption({ label: "QE2 Quality Engineer" });
  await expect(page.getByTestId("campo-sprint").locator("option", { hasText: "E5 Sprint 1" })).toHaveCount(1);
  await page.getByTestId("campo-sprint").selectOption({ label: "E5 Sprint 1" });
}

test.describe("E5-F01 · Conexión con Jira", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F01#1] T01: ADM1 completa la conexión y «Probar y guardar»: conexión exitosa, estado Conectado, token «termina en AB12» y el campo vuelve vacío", async ({ page }) => {
      await estadoSinConfig();
      await page.goto(RUTA);
      await expect(page.getByTestId("form-jira")).toBeVisible();
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "SIN_PROBAR");
      await llenarFormulario(page);
      await elegirDestino(page);
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("mensaje-conexion-ok")).toContainText("Conexión exitosa con Jira como Admin Jira Falso");
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "OK");
      await expect(page.getByTestId("token-estado")).toContainText("Configurado · termina en AB12");
      await expect(page.getByTestId("campo-token")).toHaveValue("");
      const fila = (await sql("SELECT * FROM integraciones.configuracion_jira"))[0];
      expect(fila.token_ultimos4).toBe("AB12");
    });

    test("[E5-F01#1] T02: tras guardar, el Jira falso recibió una petición a myself y una al proyecto QTY, todas con autenticación válida", async ({ page }) => {
      await estadoSinConfig();
      await jiraFalso.limpiarSolicitudes();
      await page.goto(RUTA);
      await llenarFormulario(page);
      await elegirDestino(page);
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("mensaje-conexion-ok")).toBeVisible();
      const llamadas = await jiraFalso.solicitudes();
      expect(llamadas.filter((s) => s.ruta === "/rest/api/3/myself")).toHaveLength(1);
      expect(llamadas.filter((s) => s.ruta === "/rest/api/3/project/QTY")).toHaveLength(1);
      // Además, el servicio detecta el campo Sprint (GET field) al guardar; nada más.
      expect(llamadas.every((s) => ["/rest/api/3/myself", "/rest/api/3/project/QTY", "/rest/api/3/field"].includes(s.ruta))).toBe(true);
      expect(llamadas.every((s) => s.autenticacionValida)).toBe(true);
    });

    test("[E5-F01#2] T03 (negativo): con un token incorrecto aparece JIRA_CREDENCIAL_INVALIDA sin el token en la página ni en la red, y la configuración anterior se conserva", async ({ page }) => {
      await estadoConfigBase(await page.request);
      const red = vigilarRespuestas(page);
      await page.goto(RUTA);
      await expect(page.getByTestId("token-estado")).toContainText("termina en AB12");
      await page.getByTestId("campo-token").fill("token-malo-ZZ99");
      await page.getByTestId("boton-probar-guardar").click();
      const error = page.getByTestId("error-conexion");
      await expect(error).toHaveAttribute("data-codigo", "JIRA_CREDENCIAL_INVALIDA");
      await expect(error).toContainText("Jira rechazó el correo o el API token. Revisa la conexión.");
      expect(await page.content()).not.toContain("token-malo-ZZ99");
      expect(await page.locator("body").innerText()).not.toContain("token-malo-ZZ99");
      expect(red.cuerpos.join("\n")).not.toContain("token-malo-ZZ99");
      await expect(page.getByTestId("campo-token")).toHaveValue("");
      await expect(page.getByTestId("token-estado")).toContainText("termina en AB12");
      expect((await sql("SELECT token_ultimos4 FROM integraciones.configuracion_jira"))[0].token_ultimos4).toBe("AB12");
    });

    test("[E5-F01#2] T04 (negativo): sitio inexistente, proyecto inexistente y SIN_PERMISO muestran sus códigos y mensajes y no guardan nada", async ({ page, request }) => {
      await estadoConfigBase(request);
      const antes = (await sql("SELECT sitio_url, proyecto_clave, token_ultimos4 FROM integraciones.configuracion_jira"))[0];
      await page.goto(RUTA);
      const error = page.getByTestId("error-conexion");

      await page.getByTestId("campo-sitio").fill(SITIO_CERRADO);
      await page.getByTestId("boton-probar-guardar").click();
      await expect(error).toHaveAttribute("data-codigo", "JIRA_SITIO_NO_ENCONTRADO");
      await expect(error).toContainText("No pudimos conectar con ese sitio de Jira. Revisa la dirección.");

      await page.getByTestId("campo-sitio").fill(SITIO_FALSO);
      await page.getByTestId("campo-proyecto").fill("NOEXISTE");
      await page.getByTestId("boton-probar-guardar").click();
      await expect(error).toHaveAttribute("data-codigo", "JIRA_PROYECTO_NO_ENCONTRADO");
      await expect(error).toContainText("No encontramos el proyecto en Jira.");

      await page.getByTestId("campo-proyecto").fill("QTY");
      await jiraFalso.modo("SIN_PERMISO");
      await page.getByTestId("boton-probar-guardar").click();
      await expect(error).toHaveAttribute("data-codigo", "JIRA_SIN_PERMISO");
      await expect(error).toContainText("La cuenta de Jira no tiene permiso para leer este proyecto.");
      await jiraFalso.modo("NORMAL");
      expect((await sql("SELECT sitio_url, proyecto_clave, token_ultimos4 FROM integraciones.configuracion_jira"))[0]).toEqual(antes);
    });

    test("[E5-F01#2] T05 (negativo): los campos inválidos muestran un mensaje bajo cada uno y no llega ninguna petición a Jira", async ({ page }) => {
      await estadoSinConfig();
      await jiraFalso.limpiarSolicitudes();
      await page.goto(RUTA);
      await page.getByTestId("campo-sitio").fill(SITIO_FALSO);
      await page.getByTestId("campo-correo").fill("");
      await page.getByTestId("campo-token").fill(TOKEN_FALSO);
      await page.getByTestId("campo-proyecto").fill("qty-1");
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("error-campo-correo")).toBeVisible();
      await expect(page.getByTestId("error-campo-proyecto")).toBeVisible();
      await expect(page.getByTestId("error-campo-qe")).toBeVisible();
      await page.getByTestId("campo-correo").fill("correo-sin-arroba");
      await page.getByTestId("campo-proyecto").fill("QTY");
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("error-campo-correo")).toBeVisible();
      expect(await jiraFalso.solicitudes()).toHaveLength(0);
      expect(await sql("SELECT 1 FROM integraciones.configuracion_jira")).toHaveLength(0);
    });

    test("[E5-F01#3] T06: al reabrir la pantalla el token nunca aparece: campo vacío de tipo contraseña, estado «termina en AB12», sin token en la respuesta ni en el almacenamiento del navegador", async ({ page, request }) => {
      await estadoConfigBase(request);
      const red = vigilarRespuestas(page);
      await page.goto(RUTA);
      await expect(page.getByTestId("token-estado")).toContainText("Configurado · termina en AB12");
      await page.reload();
      await expect(page.getByTestId("token-estado")).toContainText("Configurado · termina en AB12");
      await expect(page.getByTestId("campo-token")).toHaveValue("");
      await expect(page.getByTestId("campo-token")).toHaveAttribute("type", "password");
      await expect(page.getByTestId("campo-token")).toHaveAttribute("autocomplete", "new-password");
      const cfg = red.cuerpos.filter((c) => c.includes("/v1/integraciones/jira/configuracion"));
      expect(cfg.length).toBeGreaterThan(0);
      expect(contieneSecreto(cfg.join("\n"))).toBeUndefined();
      const almacenado = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
      expect(almacenado).not.toContain(TOKEN_FALSO);
      expect(await page.content()).not.toContain(TOKEN_FALSO);
    });

    test("[E5-F01#3] T07: cambiar solo el sprint de respaldo con el token vacío conserva el token: el falso recibe la prueba con el mismo token", async ({ page, request }) => {
      await estadoConfigBase(request);
      const d = await destino(request);
      await page.goto(RUTA);
      await expect(page.getByTestId("token-estado")).toContainText("termina en AB12");
      await expect(page.getByTestId("campo-sprint").locator("option", { hasText: "E5 Sprint 2" })).toHaveCount(1);
      await jiraFalso.limpiarSolicitudes();
      await page.getByTestId("campo-sprint").selectOption({ label: "E5 Sprint 2" });
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("mensaje-conexion-ok")).toBeVisible();
      const llamadas = await jiraFalso.solicitudes();
      expect(llamadas.length).toBeGreaterThanOrEqual(2);
      expect(llamadas.every((s) => s.autenticacionValida)).toBe(true);
      await expect(page.getByTestId("token-estado")).toContainText("termina en AB12");
      expect((await sql("SELECT sprint_respaldo_id FROM integraciones.configuracion_jira"))[0].sprint_respaldo_id).toBe(d.sprint2Id);
    });

    test("[E5-F01#1] T08: cambiar el token por q360-token-nuevo-CD34 muestra «termina en CD34» y un evento «token cambiado» sin su valor", async ({ page, request }) => {
      await estadoConfigBase(request);
      const red = vigilarRespuestas(page);
      await page.goto(RUTA);
      await page.getByTestId("campo-token").fill(TOKEN_NUEVO);
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("token-estado")).toContainText("termina en CD34");
      const lista = page.getByTestId("lista-eventos-configuracion");
      await expect(lista).toContainText("API token (cambiado)");
      expect(await lista.innerText()).not.toContain(TOKEN_NUEVO);
      expect(await page.content()).not.toContain(TOKEN_NUEVO);
      expect(red.cuerpos.join("\n")).not.toContain(TOKEN_NUEVO);
    });

    test("[E5-F01#1] T10 (negativo): con Integraciones detenida la pestaña Conexión dice «No disponible» con «Reintentar» y la bandeja del Administrador carga normal", async ({ page }) => {
      test.setTimeout(240_000);
      const pila = await integracionesCaida();
      try {
        await entrarEnPortal(page, "adm1", pila.portalUrl);
        await expect(page.getByTestId("bandeja-admin")).toBeVisible();
        await page.goto(`${pila.portalUrl}/admin/integraciones`);
        const indisponible = page.getByTestId("estado-indisponible-configuracion");
        await expect(indisponible).toBeVisible({ timeout: 30_000 });
        await expect(indisponible).toContainText("No disponible");
        await expect(page.getByRole("button", { name: /Reintentar/ }).first()).toBeVisible();
        await page.goto(`${pila.portalUrl}/admin`);
        await expect(page.getByTestId("bandeja-admin")).toBeVisible();
      } finally {
        await pila.detener();
      }
    });
  });

  for (const clave of ["qe1", "ana1", "lid1", "aud1"] as const) {
    test.describe(clave.toUpperCase(), () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F01#1] T09 (negativo): ${clave.toUpperCase()} abre /admin/integraciones y recibe acceso denegado con «Ir a mi bandeja»; ninguna petición de configuración devuelve 200`, async ({ page }) => {
        const exitosas: string[] = [];
        page.on("response", (r) => {
          if (r.status() === 200 && r.url().includes("/v1/integraciones/jira/configuracion")) exitosas.push(r.url());
        });
        await page.goto(RUTA);
        await expect(page.getByTestId("acceso-denegado")).toBeVisible();
        await expect(page.getByRole("link", { name: /Ir a mi bandeja/ })).toBeVisible();
        expect(exitosas).toEqual([]);
        if (clave === "qe1") {
          await page.goto(`${env.portalUrl}/qe`);
          const nav = page.getByRole("navigation", { name: "Portal" });
          await expect(nav.getByRole("link", { name: /Conexión|Configur/ })).toHaveCount(0);
        }
      });
    });
  }

  test("[E5-F01#3] T09 (API): los cuatro roles reciben 403 en GET configuracion (refuerza el negativo de interfaz)", async ({ request }) => {
    for (const clave of ["qe1", "ana1", "lid1", "aud1"] as const) {
      const r = await api.get<any>(request, "/v1/integraciones/jira/configuracion", { token: await tk(clave) });
      expect(r.status, clave).toBe(403);
    }
  });
});
