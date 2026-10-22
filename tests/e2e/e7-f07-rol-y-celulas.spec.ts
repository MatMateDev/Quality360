import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { env } from "../support/env";
import {
  CONTRASENA,
  celulasFixture,
  crearUsuarioE7,
  desactivarUsuario,
  tokenE7,
  type UsuarioNuevo,
} from "../support/e7";
import { correoUnico, nombreUnico } from "../support/unique";
import { clicConReintentoPorLimiteTasa, iniciarSesionUI } from "../support/ui";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "e7-adm1.json") });

const ROLES_ESPERADOS = ["Analista QA", "QE", "Líder QA", "Administrador", "Auditor"];
const URL_ROL = /\/v1\/usuarios\/[^/]+\/rol$/;
const URL_CELULAS = /\/v1\/usuarios\/[^/]+\/celulas-lider$/;

async function filaDe(page: Page, usuario: UsuarioNuevo) {
  await page.goto(`${env.portalUrl}/admin/usuarios`);
  await page.getByLabel("Buscar por nombre o correo").fill(usuario.correo);
  const fila = page.getByTestId(`fila-usuario-${usuario.id}`);
  await expect(fila).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  return fila;
}

test.describe("E7-F07 · Asignar rol y células del Líder QA", () => {
  test("[E7-F07#1] T01: ADM1 cambia a un analista a Líder QA con CEL-C; al iniciar sesión llega a /lider con CEL-C", async ({ page, request, browser }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f07-t01", conContrasena: true });
    try {
      const fila = await filaDe(page, usuario);
      await fila.getByRole("button", { name: "Cambiar rol" }).click();
      const dialogo = page.getByTestId("dialogo-cambio-rol");
      await expect(dialogo).toBeVisible();
      await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Líder QA" });
      await dialogo.getByTestId(`celula-opcion-${celulas["CEL-C"].id}`).check();
      await expect(dialogo.getByTestId("resumen-cambio-rol")).toContainText("Cambiará de Analista QA a Líder QA");
      await expect(dialogo.getByTestId("resumen-cambio-rol")).toContainText("CEL-C");
      await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar cambio" }), URL_ROL);
      await expect(dialogo).toHaveCount(0);
      await expect(page.getByTestId("mensaje-exito-usuarios")).toBeVisible();
      await expect(page.getByTestId(`celulas-usuario-${usuario.id}`)).toContainText("CEL-C");

      const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const paginaNueva = await contexto.newPage();
      await iniciarSesionUI(paginaNueva, usuario.correo, CONTRASENA);
      await expect(paginaNueva).toHaveURL(/\/lider$/, { timeout: 15_000 });
      await expect(paginaNueva.getByTestId("chips-celulas")).toContainText("CEL-C");
      await contexto.close();
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F07#1] T02: el selector de rol ofrece Analista QA, QE, Líder QA, Administrador y Auditor (cambio de rol y alta)", async ({ page, request }) => {
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
      // El filtro «Rol» del listado también ofrece los 5.
      await alta.getByRole("button", { name: "Cancelar" }).click();
      const opcionesFiltro = (await page.locator("#filtro-rol-usuarios option").allTextContents()).map((t) => t.trim());
      for (const rol of ROLES_ESPERADOS) expect(opcionesFiltro).toContain(rol);
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F07#1] T03: al elegir Auditor no se muestra la lista de células; al elegir Líder QA sí", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f07-t03" });
    try {
      const fila = await filaDe(page, usuario);
      await fila.getByRole("button", { name: "Cambiar rol" }).click();
      const dialogo = page.getByTestId("dialogo-cambio-rol");
      await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Auditor" });
      await expect(dialogo.getByTestId("selector-celulas")).toHaveCount(0);
      await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Líder QA" });
      await expect(dialogo.getByTestId("selector-celulas")).toBeVisible();
      await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Administrador" });
      await expect(dialogo.getByTestId("selector-celulas")).toHaveCount(0);
      // Alta: el mismo selector aparece solo con Líder QA.
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
      await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
      const alta = page.getByRole("dialog", { name: "Nuevo usuario" });
      await alta.getByLabel("Rol").selectOption({ label: "Auditor" });
      await expect(alta.getByTestId("selector-celulas")).toHaveCount(0);
      await alta.getByLabel("Rol").selectOption({ label: "Líder QA" });
      await expect(alta.getByTestId("selector-celulas")).toBeVisible();
    } finally {
      await desactivarUsuario(request, adm, usuario.id);
    }
  });

  test("[E7-F07#2] T04: cambiar a un Líder con células a Analista QA se rechaza indicando que primero debe quitárselas y no se aplica ningún cambio", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "f07-t04", celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] });
    try {
      const fila = await filaDe(page, lider);
      await fila.getByRole("button", { name: "Cambiar rol" }).click();
      const dialogo = page.getByTestId("dialogo-cambio-rol");
      await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Analista QA" });
      await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar cambio" }), URL_ROL);
      const error = dialogo.getByTestId("error-cambio-rol");
      await expect(error).toBeVisible();
      await expect(error).toContainText("debes quitarle sus células");
      await expect(error).toContainText("CEL-A");
      await expect(error).toContainText("CEL-B");
      await expect(error).toContainText("No se aplicó ningún cambio");
      await expect(dialogo.getByTestId("boton-quitar-celulas")).toBeVisible();
      const actual = await api.get<{ rol: string }>(request, `/v1/usuarios/${lider.id}`, { token: adm });
      expect(actual.body.rol).toBe("LIDER_QA");
      const celulasLider = await api.get<{ vigentes: unknown[] }>(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm });
      expect(celulasLider.body.vigentes).toHaveLength(2);
      // «Quitar células» abre el diálogo de células con todo desmarcado.
      await dialogo.getByTestId("boton-quitar-celulas").click();
      const dialogoCelulas = page.getByTestId("dialogo-celulas");
      await expect(dialogoCelulas).toBeVisible();
      await expect(dialogoCelulas.getByTestId("contador-celulas-seleccionadas")).toContainText("0 seleccionadas");
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });

  test("[E7-F07#2] T05: registrar un Líder sin marcar células se guarda con el aviso de que no verá ninguna HDU", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const nombre = nombreUnico("QA E7 f07-t05");
    const correo = correoUnico("f07-t05");
    await page.goto(`${env.portalUrl}/admin/usuarios`);
    await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
    const alta = page.getByRole("dialog", { name: "Nuevo usuario" });
    await alta.getByLabel("Nombre").fill(nombre);
    await alta.getByLabel("Correo").fill(correo);
    await alta.getByLabel("Rol").selectOption({ label: "Líder QA" });
    await expect(alta.getByTestId("aviso-lider-sin-celulas")).toContainText("Este líder no verá ninguna HDU hasta que le asignes células");
    await clicConReintentoPorLimiteTasa(page, alta.getByRole("button", { name: "Crear" }), /\/v1\/usuarios$/);
    await expect(alta).toHaveCount(0);
    await page.getByLabel("Buscar por nombre o correo").fill(correo);
    const filas = page.locator("tbody tr");
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText("Líder QA");
    await expect(filas.first()).toContainText("Sin células");
    const lista = await api.get<{ items: Array<{ id: string; correo: string; rol: string; celulasVigentes: unknown[] }> }>(request, `/v1/usuarios?q=${encodeURIComponent(correo)}`, { token: adm });
    expect(lista.body.items[0]).toMatchObject({ rol: "LIDER_QA", celulasVigentes: [] });
    await desactivarUsuario(request, adm, lista.body.items[0].id);
  });

  test("[E7-F07#3] T06: ADM1 quita CEL-B y el historial deja CEL-B con fecha de término y solo CEL-A vigente", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "f07-t06", celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] });
    try {
      const fila = await filaDe(page, lider);
      await expect(page.getByTestId(`celulas-usuario-${lider.id}`)).toContainText("CEL-A");
      await expect(page.getByTestId(`celulas-usuario-${lider.id}`)).toContainText("CEL-B");
      await fila.getByTestId(`boton-celulas-${lider.id}`).click();
      const dialogo = page.getByTestId("dialogo-celulas");
      await expect(dialogo.getByTestId("celulas-vigentes")).toContainText("CEL-A, CEL-B");
      await expect(dialogo.getByRole("button", { name: "Guardar células" })).toBeDisabled();
      await dialogo.getByTestId(`celula-opcion-${celulas["CEL-B"].id}`).uncheck();
      await expect(dialogo.getByTestId("resumen-cambio-celulas")).toContainText("dejará de ver las HDU de CEL-B");
      await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Quitar y guardar" }), URL_CELULAS);
      await expect(dialogo).toHaveCount(0);
      await expect(page.getByTestId("mensaje-exito-usuarios")).toContainText("CEL-A");
      await expect(page.getByTestId(`celulas-usuario-${lider.id}`)).toContainText("CEL-A");
      await expect(page.getByTestId(`celulas-usuario-${lider.id}`)).not.toContainText("CEL-B");

      await page.getByTestId(`boton-celulas-${lider.id}`).click();
      const reabierto = page.getByTestId("dialogo-celulas");
      await expect(reabierto.getByTestId("celulas-vigentes")).toHaveText(/Vigentes: CEL-A$/);
      await reabierto.getByTestId("historial-celulas-lider").locator("summary").click();
      const itemB = reabierto.getByTestId(`historial-celula-${celulas["CEL-B"].id}`);
      await expect(itemB).toContainText("CEL-B");
      await expect(itemB).toContainText("hasta");
      await expect(itemB).toContainText("asignó ADM1");
      await expect(reabierto.getByTestId(`historial-celula-${celulas["CEL-A"].id}`)).toContainText("vigente");
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });

  test("[E7-F07#3] T06b: el cambio de células queda en la auditoría del Auditor con actor ADM1", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "f07-t06b", celulaIds: [celulas["CEL-A"].id] });
    try {
      expect((await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-B"].id] } })).status).toBe(200);
      const aud = await api.get<{ items: Array<{ operacion: string; actor: { nombre: string }; usuarioAfectado: { id: string } | null }> }>(
        request, `/v1/auditor/auditoria-usuarios?operacion=ASIGNAR_CELULAS_LIDER&usuarioAfectadoId=${lider.id}`, { token: await tokenE7("aud1") });
      expect(aud.body.items.length).toBeGreaterThanOrEqual(2);
      expect(aud.body.items.every((e) => e.actor.nombre.includes("ADM1") && e.usuarioAfectado?.id === lider.id)).toBe(true);
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });
});
