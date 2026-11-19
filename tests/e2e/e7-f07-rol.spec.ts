import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { env } from "../support/env";
import { CONTRASENA, crearUsuarioE7, desactivarUsuario, tokenE7, type UsuarioNuevo } from "../support/e7";
import { correoUnico, nombreUnico } from "../support/unique";
import { clicConReintentoPorLimiteTasa, iniciarSesionUI } from "../support/ui";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "e7-adm1.json") });

/** Los 4 roles del catálogo: el Líder QA se retiró con sus células (D208). */
const ROLES_ESPERADOS = ["Analista QA", "QE", "Administrador", "Auditor"];
const URL_ROL = /\/v1\/usuarios\/[^/]+\/rol$/;

async function filaDe(page: Page, usuario: UsuarioNuevo) {
  await page.goto(`${env.portalUrl}/admin/usuarios`);
  await page.getByLabel("Buscar por nombre o correo").fill(usuario.correo);
  const fila = page.getByTestId(`fila-usuario-${usuario.id}`);
  await expect(fila).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  return fila;
}

/**
 * E7-F07 tras D208: el cambio de rol envía solo el rol. Los escenarios de células (E7-F07#2 T04 y E7-F07#3 T06)
 * quedan retirados junto con el rol Líder QA.
 */
test.describe("E7-F07 · Asignar rol", () => {
  test("[E7-F07#1] T01: ADM1 cambia a un analista a Auditor; la llamada lleva solo el rol y al iniciar sesión llega a /auditor", async ({ page, request, browser }) => {
    const adm = await tokenE7("adm1");
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f07-t01", conContrasena: true });
    try {
      const fila = await filaDe(page, usuario);
      await fila.getByRole("button", { name: "Cambiar rol" }).click();
      const dialogo = page.getByTestId("dialogo-cambio-rol");
      await expect(dialogo).toBeVisible();
      await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Auditor" });
      await expect(dialogo.getByTestId("resumen-cambio-rol")).toContainText("Cambiará de Analista QA a Auditor.");
      await expect(dialogo.getByTestId("selector-celulas")).toHaveCount(0);
      const peticion = page.waitForRequest((r) => r.method() === "PUT" && URL_ROL.test(r.url()));
      await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar cambio" }), URL_ROL);
      expect((await peticion).postDataJSON()).toEqual({ rol: "AUDITOR" });
      await expect(dialogo).toHaveCount(0);
      await expect(page.getByTestId("mensaje-exito-usuarios")).toContainText("ahora es Auditor");
      await expect(fila).toContainText("Auditor");

      const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const paginaNueva = await contexto.newPage();
      await iniciarSesionUI(paginaNueva, usuario.correo, CONTRASENA);
      await expect(paginaNueva).toHaveURL(/\/auditor$/, { timeout: 15_000 });
      await expect(paginaNueva.getByTestId("bandeja-auditor")).toBeVisible();
      await contexto.close();
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F07#1] T02: el selector de rol ofrece Analista QA, QE, Administrador y Auditor (cambio de rol, alta y filtro)", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f07-t02" });
    try {
      const fila = await filaDe(page, usuario);
      await fila.getByRole("button", { name: "Cambiar rol" }).click();
      const dialogo = page.getByTestId("dialogo-cambio-rol");
      expect((await dialogo.getByLabel("Nuevo rol").locator("option").allTextContents()).map((t) => t.trim())).toEqual(ROLES_ESPERADOS);
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
      await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
      const alta = page.getByRole("dialog", { name: "Nuevo usuario" });
      expect((await alta.getByLabel("Rol").locator("option").allTextContents()).map((t) => t.trim())).toEqual(ROLES_ESPERADOS);
      await expect(alta.getByTestId("selector-celulas")).toHaveCount(0);
      // El filtro «Rol» del listado también ofrece los 4 y ninguno más.
      await alta.getByRole("button", { name: "Cancelar" }).click();
      const opcionesFiltro = (await page.locator("#filtro-rol-usuarios option").allTextContents()).map((t) => t.trim());
      for (const rol of ROLES_ESPERADOS) expect(opcionesFiltro).toContain(rol);
      expect(opcionesFiltro).not.toContain("Líder QA");
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F07#1] T03: el listado de usuarios ya no tiene columna «Células» ni botón de células [D208]", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f07-t03" });
    try {
      await filaDe(page, usuario);
      await expect(page.getByRole("columnheader", { name: "Células" })).toHaveCount(0);
      await expect(page.getByTestId(`celulas-usuario-${usuario.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`boton-celulas-${usuario.id}`)).toHaveCount(0);
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F07#2] T05: registrar un Auditor desde «Nuevo usuario» envía nombre, correo y rol (sin células)", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const nombre = nombreUnico("QA E7 f07-t05");
    const correo = correoUnico("f07-t05");
    await page.goto(`${env.portalUrl}/admin/usuarios`);
    await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
    const alta = page.getByRole("dialog", { name: "Nuevo usuario" });
    await alta.getByLabel("Nombre").fill(nombre);
    await alta.getByLabel("Correo").fill(correo);
    await alta.getByLabel("Rol").selectOption({ label: "Auditor" });
    const peticion = page.waitForRequest((r) => r.method() === "POST" && /\/v1\/usuarios$/.test(r.url()));
    await clicConReintentoPorLimiteTasa(page, alta.getByRole("button", { name: "Crear" }), /\/v1\/usuarios$/);
    const cuerpo = (await peticion).postDataJSON() as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual(["correo", "nombre", "rol"]);
    expect(cuerpo).toMatchObject({ nombre, correo, rol: "AUDITOR" });
    await expect(alta).toHaveCount(0);
    await page.getByLabel("Buscar por nombre o correo").fill(correo);
    const filas = page.locator("tbody tr");
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText("Auditor");
    const lista = await api.get<{ items: Array<{ id: string; correo: string; rol: string }> }>(request, `/v1/usuarios?q=${encodeURIComponent(correo)}`, { token: adm });
    expect(lista.body.items[0]).toMatchObject({ rol: "AUDITOR" });
    expect(lista.body.items[0]).not.toHaveProperty("celulasVigentes");
    await desactivarUsuario(request, adm, lista.body.items[0].id);
  });
});
