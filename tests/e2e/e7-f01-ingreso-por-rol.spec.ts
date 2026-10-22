import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { env } from "../support/env";
import { CONTRASENA, ROLES_MATRIZ, USUARIOS_E7, crearUsuarioE7, desactivarUsuario, tokenE7, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";
import { TEXTO } from "../support/login";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

const ETIQUETA_ROL = { ANALISTA_QA: "Analista QA", QE: "QE", LIDER_QA: "Líder QA", ADMINISTRADOR: "Administrador", AUDITOR: "Auditor" } as const;
const SOLO_PORTAL = ["/qa", "/qe", "/lider", "/admin", "/auditor"] as const;

/** Peticiones que traen datos de un portal (todo lo del gateway salvo `/v1/me`). */
function registrarDatos(page: Page) {
  const respuestas: Array<{ url: string; status: number }> = [];
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.port === "3000" && url.pathname.startsWith("/v1/") && url.pathname !== "/v1/me") respuestas.push({ url: url.pathname, status: r.status() });
  });
  return respuestas;
}

test.describe("E7-F01 · Ingreso a la bandeja de cada rol", () => {
  for (const rol of ROLES_MATRIZ) {
    test(`[E7-F01#1] T01: ${rol.clave.toUpperCase()} inicia sesión y llega a ${rol.portal} con su bandeja, nombre y rol`, async ({ page }) => {
      await iniciarSesionUI(page, USUARIOS_E7[rol.clave].correo, CONTRASENA);
      await expect(page).toHaveURL(new RegExp(`${rol.portal}$`), { timeout: 15_000 });
      await expect(page.getByTestId(`bandeja-${rol.bandeja}`)).toBeVisible();
      const sesion = page.locator(".sesion-usuario");
      await expect(sesion).toContainText(rol.clave.toUpperCase());
      await expect(sesion).toContainText(ETIQUETA_ROL[rol.rol]);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bandeja");
    });
  }

  for (const clave of ["lid1", "aud1"] as const) {
    test(`[E7-F01#2] T02: ${clave.toUpperCase()} ve «Bandeja» primero y ninguna opción de creación o edición`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: estadoSesion(clave) });
      const page = await ctx.newPage();
      await page.goto(`${env.portalUrl}${USUARIOS_E7[clave].portal}`);
      const nav = page.getByRole("navigation", { name: "Portal" });
      await expect(nav.getByRole("link")).toHaveText(["Bandeja", "Perfil"]);
      for (const prohibido of ["Nueva HDU", "Usuarios", "Aprobaciones", "Supervisión", "Equipo"]) {
        await expect(nav.getByRole("link", { name: prohibido })).toHaveCount(0);
      }
      await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
      await ctx.close();
    });
  }

  test("[E7-F01#2] T03: ANA1 ve Bandeja, Mis HDU, Perfil y Cerrar sesión; ninguna opción de QE o Administrador", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: estadoSesion("ana1") });
    const page = await ctx.newPage();
    await page.goto(`${env.portalUrl}/qa`);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link")).toHaveText(["Bandeja", "Mis HDU", "Perfil"]);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    for (const prohibido of ["Equipo", "Historias supervisadas", "Usuarios", "Supervisión", "Aprobaciones", "Nueva HDU"]) {
      await expect(nav.getByRole("link", { name: prohibido })).toHaveCount(0);
    }
    await ctx.close();
  });

  test("[E7-F01#3] T04: las 20 combinaciones rol x portal ajeno muestran «No tienes acceso a esta sección» en la URL pedida, sin datos", async ({ browser }) => {
    let combinaciones = 0;
    for (const rol of ROLES_MATRIZ) {
      const ctx = await browser.newContext({ storageState: estadoSesion(rol.clave) });
      for (const portal of SOLO_PORTAL.filter((p) => p !== rol.portal)) {
        const page = await ctx.newPage();
        const datos = registrarDatos(page);
        await page.goto(`${env.portalUrl}${portal}`);
        const denegado = page.getByTestId("acceso-denegado");
        await expect(denegado, `${rol.clave} -> ${portal}`).toBeVisible();
        await expect(denegado).toContainText("No tienes acceso a esta sección");
        await expect(denegado.getByRole("link", { name: "Ir a mi bandeja" })).toHaveAttribute("href", rol.portal);
        // Sin redirección: la URL sigue siendo la pedida (D41), dentro del Layout (el menú propio sigue visible).
        expect(new URL(page.url()).pathname, `${rol.clave} -> ${portal}`).toBe(portal);
        await expect(page.getByRole("navigation", { name: "Portal" })).toBeVisible();
        // Ninguna petición de datos del portal ajeno (el guard actúa antes de montar la página).
        await page.waitForTimeout(400);
        expect(datos.filter((d) => d.status === 200), `${rol.clave} -> ${portal}: ${JSON.stringify(datos)}`).toEqual([]);
        expect(datos, `${rol.clave} -> ${portal}`).toEqual([]);
        await page.close();
        combinaciones += 1;
      }
      await ctx.close();
    }
    expect(combinaciones).toBe(20);
  });

  test("[E7-F01#3] T04b: las subrutas ajenas (Admin -> /auditor/bitacora, Auditor -> /admin/supervision, QE -> /lider) también dan acceso denegado", async ({ browser }) => {
    const casos: Array<[ClaveE7, string]> = [
      ["adm1", "/auditor/bitacora"],
      ["adm1", "/auditor/auditoria-usuarios"],
      ["aud1", "/admin/supervision"],
      ["qe1", "/admin/usuarios"],
      ["ana1", "/qe/aprobaciones"],
      ["lid1", "/qa/hdu"],
    ];
    for (const [clave, ruta] of casos) {
      const ctx = await browser.newContext({ storageState: estadoSesion(clave) });
      const page = await ctx.newPage();
      await page.goto(`${env.portalUrl}${ruta}`);
      await expect(page.getByTestId("acceso-denegado"), `${clave} -> ${ruta}`).toContainText("No tienes acceso a esta sección");
      expect(new URL(page.url()).pathname).toBe(ruta);
      await ctx.close();
    }
  });

  test("[E7-F01#3] T05: AUD1 abre /admin/usuarios, ve acceso denegado y la pantalla no muestra correos de usuarios", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: estadoSesion("aud1") });
    const page = await ctx.newPage();
    const datos = registrarDatos(page);
    await page.goto(`${env.portalUrl}/admin/usuarios`);
    await expect(page.getByTestId("acceso-denegado")).toContainText("No tienes acceso a esta sección");
    await expect(page.locator("body")).not.toContainText("@quality360.local");
    await expect(page.locator("table")).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(datos.filter((d) => d.url.startsWith("/v1/usuarios"))).toEqual([]);
    await ctx.close();
  });

  test("[E7-F01#3] T06: sin sesión, /lider pasa por el inicio de sesión y QE1 termina en /qe, no en /lider", async ({ page }) => {
    await page.goto(`${env.portalUrl}/lider`);
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Correo electrónico").fill(USUARIOS_E7.qe1.correo);
    await page.getByLabel("Contraseña", { exact: true }).fill(CONTRASENA);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/qe$/, { timeout: 15_000 });
    await expect(page.getByTestId("bandeja-qe")).toBeVisible();
  });

  test("[E7-F01#1] T07: si el Administrador cambia el rol con la sesión abierta, al recargar el usuario queda en su nueva bandeja y ya no abre la anterior", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f01-t07", conContrasena: true });
    try {
      await iniciarSesionUI(page, usuario.correo, CONTRASENA);
      await expect(page).toHaveURL(/\/qa$/, { timeout: 15_000 });
      await expect(page.getByTestId("bandeja-analista")).toBeVisible();

      const cambio = await api.put(request, `/v1/usuarios/${usuario.id}/rol`, { token: adm, body: { rol: "QE" } });
      expect(cambio.status).toBe(200);

      await page.reload();
      await expect(page).toHaveURL(/\/qe$/, { timeout: 15_000 });
      await expect(page.getByTestId("bandeja-qe")).toBeVisible();
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("acceso-denegado")).toContainText("No tienes acceso a esta sección");
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F01#1] T07b: con la sesión abierta, la siguiente consulta que responde 403 reconsulta /v1/me y lleva al usuario a su nueva bandeja con aviso", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f01-t07b", conContrasena: true });
    try {
      await iniciarSesionUI(page, usuario.correo, CONTRASENA);
      await expect(page).toHaveURL(/\/qa$/, { timeout: 15_000 });
      await expect(page.getByTestId("bandeja-analista")).toBeVisible();
      expect((await api.put(request, `/v1/usuarios/${usuario.id}/rol`, { token: adm, body: { rol: "QE" } })).status).toBe(200);
      // Sin recargar: un filtro nuevo dispara otra consulta de bandeja, que responde 403; el portal reconsulta /v1/me.
      await page.locator("#filtro-estado").selectOption("PENDIENTE");
      await expect(page).toHaveURL(/\/qe$/, { timeout: 15_000 });
      await expect(page.getByTestId("bandeja-qe")).toBeVisible();
      await expect(page.getByTestId("aviso-rol-cambio")).toContainText("Tu rol cambió");
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F01#1] T08: INACT1 (QE desactivado) recibe el mensaje genérico de credenciales y no entra a ninguna bandeja", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_E7.inact1.correo, CONTRASENA);
    await expect(page.getByText(TEXTO.credenciales)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    for (const portal of SOLO_PORTAL) {
      await page.goto(`${env.portalUrl}${portal}`);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
