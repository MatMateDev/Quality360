import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { atlassianFalso } from "../support/atlassian-falso/cliente";
import { contextoDe, entrarEnPortal } from "../support/e4ui";
import { env } from "../support/env";
import { estadoConfigBase } from "../support/e5";
import { conectarOauth, guardarOauth, iniciarOauth, limpiarOauth, probarOauth, vencerAccesoEnBase } from "../support/e5oauth";
import { pilaSinOauth } from "../support/entornoE5";
import type { ClaveE7 } from "../support/e7";

/**
 * E5-F08#13 · Accesibilidad y responsividad de OAuth: axe a 1280 y 375 px, sin violaciones serious ni critical y sin desborde horizontal a 375 px, sobre
 * (a) la pestaña Conexión en todos sus estados, (b) la página de retorno en sus 11 estados y (c) los 2 diálogos (desconexión y cambio a API token).
 * Dueño: q360-qa. Basada en e5-a11y-responsivo.spec.ts. Contra el stack real y el Atlassian falso.
 *
 * PENDIENTE DE FRONTEND Y BACKEND (FO2 a FO7, JO6/JO7): fallará hasta que lleguen; no certifica nada mientras tanto (etiqueta `@pendiente-frontend`).
 */
test.describe.configure({ mode: "default" });
test.setTimeout(480_000);

const ANCHOS = [1280, 375] as const;
const problemas: string[] = [];
const BASE = `${env.portalUrl}/admin/integraciones`;
const RETORNO = `${BASE}/jira/oauth/retorno`;

async function revisar(page: Page, nombre: string, ancho: number, listo?: string) {
  if (listo) await expect(page.locator(listo).first(), `${nombre} (${ancho}): señal de carga ${listo}`).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
    problemas.push(`[${ancho}] ${nombre}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }
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

test.beforeEach(async () => {
  await limpiarOauth();
});
test.afterEach(() => {
  expect(problemas, problemas.join("\n")).toEqual([]);
});
test.afterAll(async () => {
  await limpiarOauth();
});

test.describe("E5-F08#13 · accesibilidad y responsividad de OAuth", { tag: ["@pendiente-frontend", "@pendiente-backend"] }, () => {
  test("[E5-F08#13] E5-A11Y-OAUTH-T01: pestaña Conexión (sin conectar, conectado OAuth, falta elegir sitio, reconexión necesaria y API token con OAuth disponible) a 1280 y 375 px", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      const { contexto, page } = await con(browser, "adm1", ancho);
      try {
        // Sin conectar.
        await limpiarOauth();
        await page.goto(BASE);
        await revisar(page, "Conexión · Sin conectar", ancho, "[data-testid=tarjeta-estado-conexion]");
        await expect(page.getByTestId("selector-metodo")).toBeVisible();
        // Conectado con OAuth.
        await conectarOauth(request);
        await page.goto(BASE);
        await revisar(page, "Conexión · Conectado con Jira (OAuth)", ancho, "[data-testid=cuenta-oauth]");
        // Falta elegir el sitio.
        await limpiarOauth();
        await atlassianFalso.modo("VARIOS_SITIOS");
        await conectarOauth(request);
        await atlassianFalso.modo("NORMAL");
        await page.goto(BASE);
        await revisar(page, "Conexión · Falta elegir el sitio", ancho, "[data-testid=lista-sitios]");
        // Reconexión necesaria.
        await limpiarOauth();
        await conectarOauth(request);
        await vencerAccesoEnBase();
        await atlassianFalso.modo("RENOVACION_INVALID_GRANT");
        await probarOauth(request);
        await atlassianFalso.modo("NORMAL");
        await page.goto(BASE);
        await revisar(page, "Conexión · Reconexión necesaria", ancho, "[data-testid=aviso-reconexion]");
        // API token activo con OAuth disponible.
        await estadoConfigBase(request);
        await page.goto(BASE);
        await revisar(page, "Conexión · Conectado con API token", ancho, "[data-testid=token-estado]");
        // Aviso de «lista, sin activar» y cambio de método.
        await conectarOauth(request);
        await page.goto(BASE);
        await revisar(page, "Conexión · OAuth lista, sin activar", ancho, "[data-testid=chip-conexion]");
        await page.getByTestId("opcion-oauth").click();
        await revisar(page, "Conexión · método OAuth elegido con API token activo", ancho, "[data-testid=boton-conectar-jira]");
      } finally {
        await contexto.close();
      }
    }
  });

  test("[E5-F08#13] E5-A11Y-OAUTH-T02: pestaña Conexión con OAuth no disponible (sin JIRA_OAUTH_*): botón con aria-disabled y su motivo, a 1280 y 375 px", async ({ browser }) => {
    const pila = await pilaSinOauth();
    try {
      for (const ancho of ANCHOS) {
        const contexto = await browser.newContext({ viewport: { width: ancho, height: ancho > 700 ? 900 : 800 } });
        const page = await contexto.newPage();
        try {
          await entrarEnPortal(page, "adm1", pila.portalUrl);
          await page.goto(`${pila.portalUrl}/admin/integraciones`);
          await revisar(page, "Conexión · OAuth no disponible", ancho, "[data-testid=aviso-oauth-no-disponible]");
          await expect(page.getByTestId("boton-conectar-jira")).toHaveAttribute("aria-disabled", "true");
        } finally {
          await contexto.close();
        }
      }
    } finally {
      await pila.detener();
    }
  });

  test("[E5-F08#13] E5-A11Y-OAUTH-T03: página de retorno en sus 11 estados (procesando, éxito, elegir sitio, consentimiento rechazado, state inválido, permisos insuficientes, sin sitio, sin autorización, canje fallido, error del servidor y sin respuesta) a 1280 y 375 px", async ({ browser, request }) => {
    const estados: string[] = [];
    for (const ancho of ANCHOS) {
      const { contexto, page } = await con(browser, "adm1", ancho);
      /** Recorre el retorno con lo que Atlassian mande según el modo, y revisa el estado final. */
      const retorno = async (nombre: string, dataEstado: string, preparar: () => Promise<string>) => {
        const url = await preparar();
        await page.goto(url);
        await revisar(page, `Retorno · ${nombre}`, ancho, `[data-testid=estado-retorno][data-estado=${dataEstado}]`);
        estados.push(`${ancho}:${dataEstado}`);
      };
      const conCodigo = async (modo: Parameters<typeof atlassianFalso.modo>[0]) => {
        await limpiarOauth();
        await atlassianFalso.modo(modo);
        const ini = await iniciarOauth(request);
        const a = await atlassianFalso.autorizar(ini.body.urlAutorizacion);
        return a.code ? `${RETORNO}?code=${a.code}&state=${a.state}` : `${RETORNO}?error=${a.error}&state=${a.state}`;
      };
      try {
        // 1. procesando: la respuesta del retorno se demora.
        await page.route("**/v1/integraciones/jira/oauth/retorno", async (route) => {
          await new Promise((r) => setTimeout(r, 4000));
          await route.continue();
        });
        await retorno("procesando", "procesando", () => conCodigo("NORMAL"));
        await page.unroute("**/v1/integraciones/jira/oauth/retorno");
        // 2. éxito (la tarjeta se ve ~1,5 s antes de volver a Conexión).
        await retorno("éxito", "exito", () => conCodigo("NORMAL"));
        // 3. elegir sitio: el retorno redirige a Conexión con la lista; el estado «elegir-sitio» no se queda en pantalla.
        await retorno("elegir sitio (redirige a Conexión)", "elegir-sitio", () => conCodigo("VARIOS_SITIOS")).catch(async () => {
          await revisar(page, "Retorno · elegir sitio (llegó a la lista en Conexión)", ancho, "[data-testid=lista-sitios]");
          estados.push(`${ancho}:elegir-sitio`);
        });
        await retorno("consentimiento rechazado", "consentimiento-rechazado", () => conCodigo("CONSENTIMIENTO_RECHAZADO"));
        await retorno("state inválido", "estado-invalido", async () => `${RETORNO}?code=codigo-inventado&state=estado-inventado-123`);
        await retorno("permisos insuficientes", "permisos-insuficientes", () => conCodigo("SCOPES_INSUFICIENTES"));
        await retorno("sin sitio", "sin-sitio", () => conCodigo("SIN_SITIO"));
        await retorno("sin autorización", "sin-autorizacion", async () => RETORNO);
        await retorno("canje fallido", "canje-fallido", () => conCodigo("CANJE_RECHAZADO"));
        // 10. error del servidor y 11. sin respuesta: se simulan en la red del navegador (no hay otra forma de cortar solo ese POST).
        await page.route("**/v1/integraciones/jira/oauth/retorno", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "No disponible", traceId: "0".repeat(32), detalles: [] }) }));
        await retorno("error del servidor", "error-servidor", () => conCodigo("NORMAL"));
        await page.unroute("**/v1/integraciones/jira/oauth/retorno");
        await page.route("**/v1/integraciones/jira/oauth/retorno", (route) => route.abort("connectionreset"));
        await retorno("sin respuesta", "sin-respuesta", () => conCodigo("NORMAL"));
        await page.unroute("**/v1/integraciones/jira/oauth/retorno");
      } finally {
        await contexto.close();
      }
    }
    expect(estados.sort()).toEqual(
      ANCHOS.flatMap((a) => ["procesando", "exito", "elegir-sitio", "consentimiento-rechazado", "estado-invalido", "permisos-insuficientes", "sin-sitio", "sin-autorizacion", "canje-fallido", "error-servidor", "sin-respuesta"].map((e) => `${a}:${e}`)).sort(),
    );
  });

  test("[E5-F08#13] E5-A11Y-OAUTH-T04: los 2 diálogos (confirmar desconexión y confirmar cambio a API token) abiertos, a 1280 y 375 px", async ({ browser, request }) => {
    for (const ancho of ANCHOS) {
      const { contexto, page } = await con(browser, "adm1", ancho);
      try {
        await limpiarOauth();
        await conectarOauth(request);
        expect((await guardarOauth(request)).body.guardado).toBe(true);
        await page.goto(BASE);
        await page.getByTestId("boton-desconectar-jira").click();
        await revisar(page, "Diálogo · confirmar desconexión", ancho, "[data-testid=confirmar-desconexion]");
        await page.getByTestId("boton-cancelar-desconexion").click();
        // Cambio de OAuth a API token: el diálogo aparece al guardar.
        await page.getByTestId("opcion-api-token").click();
        await page.getByTestId("campo-sitio").fill("http://127.0.0.1:4010");
        await page.getByTestId("campo-correo").fill("admin@quality360.local");
        await page.getByTestId("campo-token").fill("q360-token-valido-AB12");
        await page.getByTestId("boton-probar-guardar").click();
        await revisar(page, "Diálogo · confirmar cambio a API token", ancho, "[data-testid=confirmar-cambio-a-api-token]");
      } finally {
        await contexto.close();
      }
    }
  });
});
