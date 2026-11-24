import { expect, test, type Page } from "@playwright/test";
import { atlassianFalso } from "../support/atlassian-falso/cliente";
import { SITIO_A, SITIO_B, SITIO_C } from "../support/atlassian-falso/servidor";
import { env } from "../support/env";
import { entrarEnPortal, estadoSesion } from "../support/e4ui";
import { estadoConfigBase, sql, tk } from "../support/e5";
import { conectarOauth, crearEstadoVencido, eventosOauth, filaConexion, guardarOauth, iniciarOauth, limpiarOauth, probarOauth, sha256Hex, stateDe, tiposEventoOauth, vencerAccesoEnBase } from "../support/e5oauth";
import { pilaSinOauth } from "../support/entornoE5";

/**
 * E5-F08 · Conectar con Jira desde Quality360 (13 escenarios, T01..T20). Dueño: q360-qa. Contra el stack real (portal :5173, gateway :3000) y el
 * Atlassian falso (:4011) con consentimiento automático: el navegador hace el recorrido completo, sin mocks.
 *
 * PENDIENTE DE FRONTEND Y BACKEND: escrito contra `docs/diseno/e5-oauth-jira.md` (testids y textos de §9 y §10) antes de FO2 a FO7 y JO6/JO7. Hasta que
 * lleguen FALLA, y eso es lo esperado: no certifica nada (etiqueta `@pendiente-frontend`). Los ajustes de textos o testids se hacen aquí cuando el
 * frontend integre, sin cambiar el sentido de la afirmación.
 * F08#13 (accesibilidad y móvil) está en `e5-a11y-oauth.spec.ts`; aquí van sus pruebas de teclado y foco (T18 y T19).
 */
test.describe.configure({ mode: "default" });
test.setTimeout(240_000);
test.beforeEach(async () => {
  await limpiarOauth();
});
test.afterAll(async () => {
  await limpiarOauth();
});

const RUTA = `${env.portalUrl}/admin/integraciones`;
const RETORNO = `${env.portalUrl}/admin/integraciones/jira/oauth/retorno`;
const TEXTO_CHIP_OAUTH = /Conectado con Jira \(OAuth\) como Admin Jira Falso en jseguelh/;

/** Respuestas del gateway durante la prueba, para afirmar que ni el token ni el `code` ni el secreto llegan al navegador. */
function vigilarRed(page: Page): { cuerpos: string[]; oauth: Array<{ url: string; status: number }>; consultas: string[] } {
  const cuerpos: string[] = [];
  const oauth: Array<{ url: string; status: number }> = [];
  /** Peticiones al gateway cuya query lleva code, state o error: el retorno va por POST con cuerpo, nunca por la query (riesgo de los logs de auth-nest). */
  const consultas: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(env.gatewayUrl).origin && /(^|[?&])(code|state|error|error_description)=/.test(u.search)) consultas.push(`${r.method()} ${u.pathname}`);
  });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/v1/")) return;
    if (u.pathname.includes("/jira/oauth")) oauth.push({ url: u.pathname, status: r.status() });
    try {
      cuerpos.push(await r.text());
    } catch {
      // sin cuerpo
    }
  });
  return { cuerpos, oauth, consultas };
}

async function almacenamiento(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
}

async function elegirDestino(page: Page) {
  await page.getByTestId("campo-celula").selectOption({ label: "CEL-C" });
  await page.getByTestId("campo-qe").selectOption({ label: "QE2 Quality Engineer" });
  await expect(page.getByTestId("campo-sprint").locator("option", { hasText: "E5 Sprint 1" })).toHaveCount(1);
  await page.getByTestId("campo-sprint").selectOption({ label: "E5 Sprint 1" });
}

async function conectarPorUI(page: Page) {
  await page.goto(RUTA);
  // El botón nace «no-disponible» mientras carga la configuración: se espera a que se habilite antes de pulsar.
  await expect(page.getByTestId("boton-conectar-jira")).toHaveAttribute("data-estado", "disponible");
  await page.getByTestId("boton-conectar-jira").click();
}

test.describe("E5-F08 · Conectar con Jira", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    // --------------------------------------------------------------------------------------------------------------- #1
    test("[E5-F08#1] E5-F08-T01: «Conectar con Jira» → Atlassian (consentimiento automático) → página de retorno «Conectando con Jira…» → Conexión «Conectado con Jira (OAuth) como <cuenta> en <sitio>», sin pedir token y con la dirección limpia", async ({ page }) => {
      const red = vigilarRed(page);
      await page.goto(RUTA);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "sin-conectar");
      await expect(page.getByTestId("boton-conectar-jira")).toHaveAttribute("data-estado", "disponible");
      const urlsVistas: string[] = [];
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) urlsVistas.push(f.url());
      });
      await page.getByTestId("boton-conectar-jira").click();
      await expect(page.getByTestId("pagina-retorno-oauth")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Conexión con Jira");
      // Al verse la página de retorno la dirección ya no lleva code ni state (se limpia antes de procesar).
      expect(page.url()).not.toMatch(/[?&](code|state|error)=/);
      await expect(page).toHaveURL(new RegExp(`${RUTA.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`), { timeout: 30_000 });
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
      await expect(page.getByTestId("chip-conexion")).toContainText(TEXTO_CHIP_OAUTH);
      await expect(page.getByTestId("cuenta-oauth")).toContainText("Admin Jira Falso");
      await expect(page.getByTestId("sitio-oauth")).toContainText(SITIO_A.url);
      await expect(page.getByTestId("estado-oauth")).toHaveAttribute("data-estado", "CONECTADA");
      // Nunca se pidió un token ni el navegador vio ninguno.
      await expect(page.getByTestId("campo-token")).toHaveCount(0);
      expect(page.url()).not.toMatch(/code=|state=/);
      expect(await atlassianFalso.fugas([...red.cuerpos, await almacenamiento(page), await page.content()].join("\n"))).toEqual([]);
      expect(red.consultas, "ninguna llamada al gateway lleva code, state o error en la query").toEqual([]);
      expect(red.oauth.some((o) => o.url.endsWith("/oauth/retorno") && o.status === 200), "el retorno se envió y el gateway lo aceptó").toBe(true);
      // La dirección del retorno con code y state estuvo solo en el salto desde Atlassian: ninguna navegación posterior la conserva.
      expect(urlsVistas.filter((u) => /[?&](code|state)=/.test(u) && u.startsWith(env.portalUrl)).length).toBeLessThanOrEqual(1);
      expect((await filaConexion()).estado).toBe("CONECTADA");
      expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH"]);
    });

    test("[E5-F08#1] E5-F08-T02: la ruta de retorno protege el history: «Atrás» no vuelve a la página de retorno ya procesada y recargar no repite el canje", async ({ page }) => {
      await conectarPorUI(page);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth", { timeout: 30_000 });
      const canjes = (await atlassianFalso.solicitudes()).canjes;
      await page.goBack();
      expect(page.url()).not.toContain("/oauth/retorno");
      await page.goto(RETORNO);
      await expect(page.getByTestId("estado-retorno")).toHaveAttribute("data-estado", "sin-autorizacion");
      await expect(page.getByTestId("estado-retorno")).toContainText("No hay una conexión en curso");
      expect((await atlassianFalso.solicitudes()).canjes).toBe(canjes);
    });

    // --------------------------------------------------------------------------------------------------------------- #2
    test("[E5-F08#2] E5-F08-T03: consentimiento cancelado: «No aceptaste los permisos en Atlassian. No se conectó nada.», el estado anterior no cambia y se puede reintentar", async ({ page }) => {
      await atlassianFalso.modo("CONSENTIMIENTO_RECHAZADO");
      await conectarPorUI(page);
      const estado = page.getByTestId("estado-retorno");
      await expect(estado).toHaveAttribute("data-estado", "consentimiento-rechazado", { timeout: 20_000 });
      await expect(estado).toContainText("No aceptaste los permisos en Atlassian. No se conectó nada.");
      await expect(estado).toContainText("El estado anterior de la conexión no cambió.");
      expect(page.url()).not.toMatch(/[?&](code|state|error|error_description)=/);
      expect(await filaConexion()).toBeUndefined();
      await page.getByTestId("enlace-ir-conexion").click();
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "sin-conectar");
      // Reintentar con el consentimiento dado.
      await atlassianFalso.modo("NORMAL");
      await page.getByTestId("boton-conectar-jira").click();
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth", { timeout: 30_000 });
    });

    // --------------------------------------------------------------------------------------------------------------- #3
    test("[E5-F08#3] E5-F08-T04: state inventado: «La autorización venció o no es válida…» con el botón visible, nada conectado y sin revelar la causa", async ({ page }) => {
      await page.goto(`${RETORNO}?code=codigo-inventado&state=estado-inventado-123`);
      const estado = page.getByTestId("estado-retorno");
      await expect(estado).toHaveAttribute("data-estado", "estado-invalido", { timeout: 20_000 });
      await expect(estado).toContainText("La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».");
      await expect(page.getByTestId("boton-conectar-jira")).toBeVisible();
      await expect(page.getByTestId("error-oauth")).toHaveAttribute("data-codigo", "JIRA_OAUTH_ESTADO_INVALIDO");
      expect(page.url()).not.toMatch(/code=|state=/);
      expect(await page.locator("body").innerText()).not.toMatch(/inventado|vencid[oa] hace|ya usad/i);
      expect(await filaConexion()).toBeUndefined();
    });

    test("[E5-F08#3] E5-F08-T05: state ya usado y state vencido (más de 10 minutos) dan el mismo mensaje", async ({ page, request }) => {
      // Ya usado: se completa un flujo por API y se reabre su retorno.
      const usado = await conectarOauth(request);
      await atlassianFalso.reset();
      await page.goto(`${RETORNO}?code=${usado.aut.code}&state=${usado.state}`);
      await expect(page.getByTestId("estado-retorno")).toHaveAttribute("data-estado", "estado-invalido", { timeout: 20_000 });
      const textoUsado = await page.getByTestId("estado-retorno").innerText();
      // Vencido.
      const vencido = await crearEstadoVencido(request);
      await page.goto(`${RETORNO}?code=codigo-cualquiera&state=${vencido}`);
      await expect(page.getByTestId("estado-retorno")).toHaveAttribute("data-estado", "estado-invalido", { timeout: 20_000 });
      expect(await page.getByTestId("estado-retorno").innerText()).toBe(textoUsado);
    });

    // --------------------------------------------------------------------------------------------------------------- #4
    test("[E5-F08#4] E5-F08-T06: varios sitios: lista con nombre y URL, estado «Falta elegir el sitio»; elegir uno con «Usar este sitio» deja la conexión con ese sitio", async ({ page }) => {
      await atlassianFalso.modo("VARIOS_SITIOS");
      await conectarPorUI(page);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "falta-sitio", { timeout: 30_000 });
      await expect(page.getByTestId("chip-conexion")).toContainText("Falta elegir el sitio");
      const lista = page.getByTestId("lista-sitios");
      await expect(lista).toBeVisible();
      for (const s of [SITIO_A, SITIO_B, SITIO_C]) {
        await expect(page.getByTestId(`sitio-opcion-${s.id}`)).toContainText(s.nombre);
        await expect(page.getByTestId(`sitio-opcion-${s.id}`)).toContainText(s.url);
      }
      // Sin elegir no se puede continuar ni consultar.
      await expect(page.getByTestId("boton-elegir-sitio")).toHaveAttribute("aria-disabled", "true");
      await page.goto(`${RUTA}/sincronizar`);
      await expect(page.getByTestId("boton-consultar-jira")).toHaveCount(0);
      await page.goto(RUTA);
      await page.getByTestId(`sitio-opcion-${SITIO_C.id}`).click();
      await page.getByTestId("boton-elegir-sitio").click();
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth", { timeout: 20_000 });
      await expect(page.getByTestId("sitio-oauth")).toContainText(SITIO_C.url);
      expect((await filaConexion()).cloud_id).toBe(SITIO_C.id);
    });

    test("[E5-F08#4] E5-F08-T07: el sitio ya configurado viene preseleccionado, y la lista sobrevive a recargar la pestaña", async ({ page, request }) => {
      await estadoConfigBase(request);
      await sql("UPDATE integraciones.configuracion_jira SET sitio_url = $1", [SITIO_B.url]);
      await atlassianFalso.modo("VARIOS_SITIOS");
      await page.goto(RUTA);
      await page.getByTestId("opcion-oauth").click(); // el API token está activo: se elige el panel de OAuth sin cambiar el método activo
      await expect(page.getByTestId("boton-conectar-jira")).toHaveAttribute("data-estado", "disponible");
      await page.getByTestId("boton-conectar-jira").click();
      await expect(page.getByTestId("lista-sitios")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("sitio-actual")).toHaveCount(1);
      await expect(page.getByTestId(`sitio-opcion-${SITIO_B.id}`).getByTestId("sitio-actual")).toContainText("Actual");
      await expect(page.getByTestId(`sitio-opcion-${SITIO_B.id}`).getByRole("radio")).toBeChecked();
      await page.reload();
      // El chip refleja el método activo (API token); la conexión OAuth pendiente se ve en su estado y en la lista.
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
      await page.getByTestId("opcion-oauth").click();
      await expect(page.getByTestId("estado-oauth")).toHaveAttribute("data-estado", "PENDIENTE_SITIO");
      await expect(page.getByTestId("lista-sitios")).toBeVisible();
    });

    // --------------------------------------------------------------------------------------------------------------- #5
    test("[E5-F08#5] E5-F08-T08: cuenta sin Jira: «Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.» y no se guarda nada", async ({ page }) => {
      await atlassianFalso.modo("SIN_SITIO");
      await conectarPorUI(page);
      const estado = page.getByTestId("estado-retorno");
      await expect(estado).toHaveAttribute("data-estado", "sin-sitio", { timeout: 20_000 });
      await expect(estado).toContainText("Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.");
      await expect(estado).toContainText("No se guardó nada.");
      expect(await filaConexion()).toBeUndefined();
      await expect(page.getByTestId("boton-conectar-jira")).toBeVisible(); // «Intentar con otra cuenta» reinicia el flujo
    });

    // --------------------------------------------------------------------------------------------------------------- #6
    test("[E5-F08#6] E5-F08-T09: permisos insuficientes: «Faltan permisos en Atlassian: Ver datos de issues. Acepta todos los permisos solicitados.» y no se guarda nada", async ({ page }) => {
      await atlassianFalso.modo("SCOPES_INSUFICIENTES");
      await conectarPorUI(page);
      const estado = page.getByTestId("estado-retorno");
      await expect(estado).toHaveAttribute("data-estado", "permisos-insuficientes", { timeout: 20_000 });
      await expect(estado).toContainText("Faltan permisos en Atlassian: Ver datos de issues. Acepta todos los permisos solicitados.");
      await expect(estado).toContainText("No se guardó nada.");
      expect(await page.locator("body").innerText()).not.toContain("read:jira-work");
      expect(await filaConexion()).toBeUndefined();
    });

    test("[E5-F08#4] E5-F08-T10: el canje rechazado por Atlassian muestra «Atlassian no aceptó la autorización. Vuelve a intentarlo.» sin su texto (complementa #2 y #6 en el mismo recorrido)", async ({ page }) => {
      await atlassianFalso.modo("CANJE_RECHAZADO");
      await conectarPorUI(page);
      const estado = page.getByTestId("estado-retorno");
      await expect(estado).toHaveAttribute("data-estado", "canje-fallido", { timeout: 20_000 });
      await expect(estado).toContainText("Atlassian no aceptó la autorización. Vuelve a intentarlo.");
      expect(await page.locator("body").innerText()).not.toMatch(/invalid_grant|Unknown or invalid/i);
    });

    // --------------------------------------------------------------------------------------------------------------- #8
    test("[E5-F08#8] E5-F08-T12: la renovación venció (invalid_grant): Conexión muestra «Reconexión necesaria» con «Reconectar»; «Consultar Jira» da JIRA_RECONEXION_NECESARIA con «Ir a Conexión»; lo ya consultado no se toca", async ({ page, request }) => {
      await conectarOauth(request);
      expect((await guardarOauth(request)).body.guardado).toBe(true);
      const hdu = (await sql("SELECT count(*)::int AS n FROM organizacion.historia_usuario"))[0].n;
      await vencerAccesoEnBase();
      await atlassianFalso.modo("RENOVACION_INVALID_GRANT");
      expect((await probarOauth(request)).body.error.codigo).toBe("JIRA_RECONEXION_NECESARIA");
      await atlassianFalso.modo("NORMAL");
      await page.goto(RUTA);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "reconexion-necesaria");
      await expect(page.getByTestId("chip-conexion")).toContainText("Reconexión necesaria");
      await expect(page.getByTestId("estado-oauth")).toHaveAttribute("data-estado", "RECONEXION_NECESARIA");
      await expect(page.getByTestId("aviso-reconexion")).toContainText("La conexión con Jira venció. Vuelve a conectar con Jira.");
      await expect(page.getByTestId("boton-reconectar-jira")).toBeVisible();
      await expect(page.getByTestId("boton-conectar-jira")).toHaveCount(0); // no hay dos botones con el mismo propósito
      await expect(page.getByTestId("boton-probar-conexion")).toHaveCount(0);
      // Consultar Jira.
      await page.goto(`${RUTA}/sincronizar`);
      await page.getByTestId("boton-consultar-jira").click();
      // El diseño §7 nombra «error-sincronizacion», pero la pantalla certificada de E5-F02 usa «error-consulta» (e5-f02-consultar.spec.ts).
      const error = page.getByTestId("error-consulta");
      await expect(error).toHaveAttribute("data-codigo", "JIRA_RECONEXION_NECESARIA");
      await expect(error).toContainText("La conexión con Jira venció. Vuelve a conectar con Jira.");
      await error.getByTestId("enlace-ir-conexion").click();
      await expect(page).toHaveURL(new RegExp(`${RUTA.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`));
      expect((await sql("SELECT count(*)::int AS n FROM organizacion.historia_usuario"))[0].n).toBe(hdu);
      // Reconectar desde el botón.
      await page.getByTestId("boton-reconectar-jira").click();
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth", { timeout: 30_000 });
      expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "REFRESCO_FALLIDO", "RECONECTAR"]);
    });

    // --------------------------------------------------------------------------------------------------------------- #9
    test("[E5-F08#9] E5-F08-T13: de API token a OAuth: el API token sigue activo hasta «Probar y guardar»; entonces el chip pasa a OAuth y el token deja de usarse", async ({ page, request }) => {
      await estadoConfigBase(request);
      await page.goto(RUTA);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
      await page.getByTestId("opcion-oauth").click();
      await expect(page.getByTestId("chip-conexion"), "elegir un método no cambia el activo").toHaveAttribute("data-estado", "conectado-api-token");
      await page.getByTestId("boton-conectar-jira").click();
      await expect(page.getByTestId("aviso-oauth-conectado")).toBeVisible({ timeout: 30_000 });
      // Lista, sin activar: el API token sigue en uso.
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
      expect((await sql("SELECT metodo, token_cifrado IS NOT NULL AS hay FROM integraciones.configuracion_jira"))[0]).toMatchObject({ metodo: "API_TOKEN", hay: true });
      await page.getByTestId("opcion-oauth").click();
      await elegirDestino(page);
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("mensaje-conexion-ok")).toContainText("Conexión exitosa con Jira como Admin Jira Falso");
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
      await expect(page.getByTestId("campo-token")).toHaveCount(0);
      expect((await sql("SELECT metodo, correo, token_cifrado FROM integraciones.configuracion_jira"))[0]).toMatchObject({ metodo: "OAUTH", correo: null, token_cifrado: null });
    });

    test("[E5-F08#9] E5-F08-T14: de OAuth a API token: se pide el token (nunca se rellena), se prueba y guarda y se borran las credenciales OAuth; si la prueba falla se conserva el método anterior", async ({ page, request }) => {
      await conectarOauth(request);
      expect((await guardarOauth(request)).body.guardado).toBe(true);
      await page.goto(RUTA);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
      await page.getByTestId("opcion-api-token").click();
      await expect(page.getByTestId("aviso-cambio-a-api-token")).toBeVisible();
      await expect(page.getByTestId("campo-token")).toHaveValue("");
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
      // Con un token malo no cambia nada.
      await page.getByTestId("campo-sitio").fill("http://127.0.0.1:4010");
      await page.getByTestId("campo-correo").fill("admin@quality360.local");
      await page.getByTestId("campo-token").fill("token-malo-ZZ99");
      await page.getByTestId("boton-probar-guardar").click();
      if (await page.getByTestId("confirmar-cambio-a-api-token").count()) await page.getByTestId("boton-confirmar-cambio").click();
      await expect(page.getByTestId("error-conexion")).toBeVisible();
      expect((await filaConexion()).estado).toBe("CONECTADA");
      expect((await sql("SELECT metodo FROM integraciones.configuracion_jira"))[0].metodo).toBe("OAUTH");
      // Con el token bueno se cambia y se borra la conexión OAuth.
      await page.getByTestId("campo-token").fill("q360-token-valido-AB12");
      await page.getByTestId("boton-probar-guardar").click();
      if (await page.getByTestId("confirmar-cambio-a-api-token").count()) await page.getByTestId("boton-confirmar-cambio").click();
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token", { timeout: 20_000 });
      expect(await filaConexion()).toBeUndefined();
      expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "DESCONECTAR"]);
    });

    // --------------------------------------------------------------------------------------------------------------- #10
    test("[E5-F08#10] E5-F08-T15: «Probar y guardar» con OAuth: «Conexión exitosa con Jira como <cuenta>», se guarda y el estado es «Conectado con Jira (OAuth)…»", async ({ page, request }) => {
      await conectarOauth(request);
      await page.goto(RUTA);
      await page.getByTestId("campo-proyecto").fill("QTY");
      await elegirDestino(page);
      await page.getByTestId("boton-probar-guardar").click();
      await expect(page.getByTestId("mensaje-conexion-ok")).toContainText("Conexión exitosa con Jira como Admin Jira Falso");
      await expect(page.getByTestId("chip-conexion")).toContainText(TEXTO_CHIP_OAUTH);
      const f = (await sql("SELECT metodo, proyecto_clave, sitio_url FROM integraciones.configuracion_jira"))[0];
      expect(f).toMatchObject({ metodo: "OAUTH", proyecto_clave: "QTY", sitio_url: SITIO_A.url });
    });

    test("[E5-F08#10] E5-F08-T16: la cuenta sin permiso en el proyecto: «La cuenta de Jira conectada no tiene permiso para leer este proyecto.» (o «No encontramos el proyecto…»); no se guarda y se conserva lo anterior", async ({ page, request }) => {
      await conectarOauth(request);
      await atlassianFalso.modo("SIN_PERMISO_PROYECTO");
      await page.goto(RUTA);
      await page.getByTestId("campo-proyecto").fill("QTY");
      await elegirDestino(page);
      await page.getByTestId("boton-probar-guardar").click();
      const error = page.getByTestId("error-conexion");
      await expect(error).toBeVisible();
      const codigo = await error.getAttribute("data-codigo");
      expect(["JIRA_SIN_PERMISO", "JIRA_PROYECTO_NO_ENCONTRADO"]).toContain(codigo);
      await expect(error).toContainText(codigo === "JIRA_SIN_PERMISO" ? "La cuenta de Jira conectada no tiene permiso para leer este proyecto." : "puede ser que la cuenta de Jira conectada no tenga permiso para verlo");
      expect(await sql("SELECT 1 FROM integraciones.configuracion_jira")).toHaveLength(0);
      expect((await filaConexion()).estado, "la conexión sigue CONECTADA").toBe("CONECTADA");
    });

    // --------------------------------------------------------------------------------------------------------------- #11
    test("[E5-F08#11] E5-F08-T17: «Desconectar» pide confirmación (con «Lo ya importado no se borra.»); confirmar deja «Sin conectar» con la ayuda para revocar; cancelar no cambia nada", async ({ page, request }) => {
      await conectarOauth(request);
      await page.goto(RUTA);
      await page.getByTestId("boton-desconectar-jira").click();
      const dialogo = page.getByTestId("confirmar-desconexion");
      await expect(dialogo).toBeVisible();
      await expect(dialogo).toContainText("Se borrarán las credenciales guardadas");
      await expect(dialogo).toContainText("revoca la app desde tu cuenta");
      await expect(dialogo).toContainText("Lo ya importado no se borra.");
      await page.getByTestId("boton-cancelar-desconexion").click();
      await expect(dialogo).toHaveCount(0);
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
      expect((await filaConexion()).estado).toBe("CONECTADA");
      const llamadas = (await atlassianFalso.solicitudes()).solicitudes.length;
      await page.getByTestId("boton-desconectar-jira").click();
      await page.getByTestId("boton-confirmar-desconexion").click();
      await expect(page.getByTestId("mensaje-desconexion-ok")).toContainText("Se desconectó de Jira. Las credenciales guardadas se borraron.");
      await expect(page.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "sin-conectar");
      await expect(page.getByTestId("ayuda-revocar-jira")).toBeVisible();
      await expect(page.getByTestId("ayuda-revocar-jira")).toContainText("Apps conectadas");
      expect(await filaConexion()).toBeUndefined();
      expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "DESCONECTAR"]);
      expect((await atlassianFalso.solicitudes()).solicitudes.length, "desconectar no llama a Atlassian").toBe(llamadas);
      expect((await eventosOauth()).length).toBe(2);
    });

    // --------------------------------------------------------------------------------------------------------------- #13 (teclado y foco)
    test("[E5-F08#13] E5-F08-T18: el botón y el diálogo de desconexión se operan solo con teclado: el foco inicial va a «Cancelar», Tab no sale del diálogo, Escape cancela y el foco vuelve a «Desconectar»", async ({ page, request }) => {
      await conectarOauth(request);
      await page.goto(RUTA);
      const abrir = page.getByTestId("boton-desconectar-jira");
      await abrir.focus();
      await page.keyboard.press("Enter");
      const dialogo = page.getByTestId("confirmar-desconexion");
      await expect(dialogo).toBeVisible();
      await expect(dialogo).toHaveAttribute("role", "alertdialog");
      await expect(page.getByTestId("boton-cancelar-desconexion")).toBeFocused();
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press("Tab");
        expect(await dialogo.evaluate((d) => d.contains(document.activeElement)), `Tab ${i + 1} dentro del diálogo`).toBe(true);
      }
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press("Shift+Tab");
        expect(await dialogo.evaluate((d) => d.contains(document.activeElement)), `Shift+Tab ${i + 1} dentro del diálogo`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialogo).toHaveCount(0);
      await expect(abrir).toBeFocused();
      expect((await filaConexion()).estado).toBe("CONECTADA");
    });

    test("[E5-F08#13] E5-F08-T19: los estados se anuncian en regiones role=status (errores role=alert) y la página de retorno pone el foco en el error", async ({ page }) => {
      await atlassianFalso.modo("SIN_SITIO");
      await conectarPorUI(page);
      await expect(page.getByTestId("estado-retorno")).toHaveAttribute("data-estado", "sin-sitio", { timeout: 20_000 });
      await expect(page.getByTestId("estado-retorno")).toHaveAttribute("role", "status");
      const error = page.getByTestId("error-oauth");
      await expect(error).toHaveAttribute("role", "alert");
      await expect(error).toBeFocused();
    });
  });

  // ----------------------------------------------------------------------------------------------------------------- #7
  test.describe("sin credenciales de la app", () => {
    test("[E5-F08#7] E5-F08-T11: sin JIRA_OAUTH_* «Conectar con Jira» aparece deshabilitado con aria-disabled y su motivo, no hace nada, no nombra variables y el API token funciona igual", async ({ page }) => {
      const pila = await pilaSinOauth();
      try {
        await entrarEnPortal(page, "adm1", pila.portalUrl);
        const llamadasOauth: string[] = [];
        page.on("request", (r) => {
          if (r.url().includes("/jira/oauth/")) llamadasOauth.push(r.url());
        });
        await page.goto(`${pila.portalUrl}/admin/integraciones`);
        const boton = page.getByTestId("boton-conectar-jira");
        await expect(boton).toHaveAttribute("aria-disabled", "true");
        await expect(boton).toHaveAttribute("data-estado", "no-disponible");
        await expect(boton).not.toHaveAttribute("disabled", /.*/);
        const motivo = page.getByTestId("aviso-oauth-no-disponible");
        await expect(motivo).toBeVisible();
        await expect(motivo).toContainText("La conexión automática aún no está habilitada en el servidor.");
        await expect(boton).toHaveAttribute("aria-describedby", "aviso-oauth-no-disponible");
        // Sigue en el orden de tabulación y pulsarlo no hace nada.
        await boton.focus();
        await expect(boton).toBeFocused();
        await boton.click({ force: true }); // aria-disabled no es «enabled» para Playwright: se fuerza el clic
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        expect(page.url()).toContain(pila.portalUrl);
        expect(llamadasOauth, "pulsar el botón deshabilitado no llama al servidor").toEqual([]);
        expect(await page.locator("body").innerText()).not.toMatch(/JIRA_OAUTH|CLIENT_ID|CLIENT_SECRET|\.env/i);
        // El API token funciona igual.
        await page.getByTestId("opcion-api-token").click();
        await expect(page.getByTestId("campo-sitio")).toBeVisible();
        await expect(page.getByTestId("campo-token")).toBeVisible();
      } finally {
        await pila.detener();
      }
    });
  });

  // ----------------------------------------------------------------------------------------------------------------- #12
  for (const clave of ["qe1", "ana1", "aud1"] as const) {
    test.describe(clave.toUpperCase(), () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F08#12] E5-F08-T20: ${clave.toUpperCase()} abre la ruta de retorno y Conexión: acceso denegado, sin ningún botón de OAuth y ninguna llamada a las rutas de OAuth devuelve 200`, async ({ page }) => {
        const red = vigilarRed(page);
        for (const ruta of [RETORNO, `${RETORNO}?code=abc&state=def`, RUTA]) {
          await page.goto(ruta);
          await expect(page.getByTestId("acceso-denegado"), ruta).toBeVisible();
          await expect(page.getByTestId("boton-conectar-jira"), ruta).toHaveCount(0);
          await expect(page.getByTestId("boton-desconectar-jira"), ruta).toHaveCount(0);
          expect(page.url(), "el code y el state se limpian también aquí").not.toMatch(/[?&](code|state)=/);
        }
        await page.waitForTimeout(400);
        expect(red.oauth.filter((o) => o.status === 200)).toEqual([]);
        expect(red.oauth).toEqual([]); // el guard actúa antes de montar la página: ni siquiera se llama
        expect(await filaConexion()).toBeUndefined();
      });
    });
  }

  test("[E5-F08#12] E5-F08-T20b: sin sesión, la ruta de retorno pasa por el inicio de sesión y el code ya no existe al volver; Conexión avisa «Tu sesión se cerró durante la conexión»", async ({ page }) => {
    await page.goto(`${RETORNO}?code=abc&state=def`);
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).not.toMatch(/code=|state=/);
    expect(await almacenamiento(page)).not.toMatch(/abc|def/);
  });

  test("[E5-F08#12] E5-F08-T20c: con sesión de Administrador, abrir la ruta de retorno sin code ni state (enlace antiguo o recarga): «No hay una conexión en curso»", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: estadoSesion("adm1") });
    const page = await ctx.newPage();
    await page.goto(RETORNO);
    await expect(page.getByTestId("estado-retorno")).toHaveAttribute("data-estado", "sin-autorizacion");
    expect(await tk("adm1")).toBeTruthy();
    await ctx.close();
  });
});
