import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { organizacionCaidaEnRutas, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { CONTRASENA, USUARIOS_E7, contarOrganizacion, crearUsuarioE7, desactivarUsuario, tokenE7, type ClaveE7 } from "../support/e7";
import { clicConReintentoPorLimiteTasa, iniciarSesionUI } from "../support/ui";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

/** Los 4 roles del catálogo: el Líder QA se retiró con sus células (D208). */
const ETIQUETA_ROL = { ADMINISTRADOR: "Administrador", QE: "QE", ANALISTA_QA: "Analista QA", AUDITOR: "Auditor" } as const;
const URL_ROL = /\/v1\/usuarios\/[^/]+\/rol$/;

async function idDe(request: Parameters<typeof api.get>[0], correo: string): Promise<string> {
  const r = await api.get<{ items: Array<{ id: string; correo: string }> }>(request, `/v1/usuarios?q=${encodeURIComponent(correo)}`, { token: await tokenE7("adm1") });
  const u = r.body.items.find((x) => x.correo === correo);
  if (!u) throw new Error(`No existe ${correo}`);
  return u.id;
}

/**
 * E7-F05 tras D208: la bandeja ya no cuenta líderes sin células ni células sin líder, y los pendientes son solo de
 * analistas sin QE y de QE sin analistas. Los escenarios «Asignar células» y «Asignar líder» quedan retirados; T06
 * comprueba «Últimos cambios» con un cambio de rol.
 */
test.describe("E7-F05 · Bandeja del Administrador", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E7-F05#1] T01: ADM1 ve usuarios activos (con desglose por los 4 roles), inactivos, analistas sin QE, QE sin analistas y HDU totales; sin contadores del Líder QA [D208]", async ({ page, request }) => {
      const bd = await contarOrganizacion();
      const api1 = await api.get<{ contadores: Record<string, { datos: { valor: number } }> }>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
      const c = api1.body.contadores;
      await page.goto(`${env.portalUrl}/admin`);
      await expect(page.getByTestId("bandeja-admin")).toBeVisible();
      await expect(page.getByTestId("contador-usuarios-activos")).toHaveText(String(bd.usuariosActivos));
      for (const [rol, etiqueta] of Object.entries(ETIQUETA_ROL)) {
        const valor = page.getByTestId(`desglose-rol-${rol}`);
        await expect(valor).toHaveText(String(bd.porRol[rol] ?? 0));
        await expect(valor.locator("xpath=preceding-sibling::dt[1]")).toContainText(etiqueta);
      }
      await expect(page.getByTestId("desglose-rol-LIDER_QA")).toHaveCount(0);
      await expect(page.getByTestId("contador-usuarios-inactivos")).toHaveText(String(bd.usuariosInactivos));
      await expect(page.getByTestId("contador-analistas-sin-qe")).toHaveText(String(bd.analistasSinQe));
      await expect(page.getByTestId("contador-hdu-total")).toHaveText(String(bd.hduTotal));
      await expect(page.getByTestId("contador-qe-sin-analistas")).toHaveText(String(c.qeSinAnalistas.datos.valor));
      await expect(page.getByTestId("contador-lideres-sin-celulas")).toHaveCount(0);
      await expect(page.getByTestId("contador-celulas-sin-lider")).toHaveCount(0);
      // Se conservan los accesos y tarjetas certificados de E1-F08.
      await expect(page.getByTestId("tarjeta-usuarios-total")).toBeVisible();
      await expect(page.getByTestId("tarjeta-supervision-vigentes")).toBeVisible();
      await expect(page.getByTestId("tarjeta-supervision-sin-supervisor")).toBeVisible();
      for (const nombre of ["Gestionar usuarios", "Gestionar supervisión", "Registrar usuario"]) {
        await expect(page.getByRole("link", { name: nombre })).toBeVisible();
      }
      // D36 (E7) quedó superado por D87 (E4): la bandeja del Administrador suma contadores de impedimentos. Se conserva la intención
      // (los bloques certificados no cambian) exigiendo que los pendientes de configuración sigan sin mencionarlos.
      await expect(page.getByTestId("lista-pendientes")).not.toContainText(/impedimento/i);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toBeVisible();
    });

    test("[E7-F05#1] T02: la lista de pendientes trae a ANA4 «Analista sin QE» con «Asignar QE»; no hay pendientes de líderes ni de células [D208]", async ({ page, request }) => {
      const ana4 = await idDe(request, USUARIOS_E7.ana4.correo);
      await page.goto(`${env.portalUrl}/admin`);
      const lista = page.getByTestId("lista-pendientes");
      await expect(lista).toBeVisible();
      await expect(page.getByTestId(`fila-pendiente-analista-sin-qe-${ana4}`)).toContainText("Analista sin QE");
      // Una fila, un botón, con el destino de D51.
      await expect(page.getByTestId(`boton-asignar-qe-${ana4}`)).toHaveAttribute("href", `/admin/supervision?analista=${ana4}`);
      await expect(lista).not.toContainText(/líder|célula/i);
      await expect(page.locator('[data-testid^="fila-pendiente-lider-"], [data-testid^="fila-pendiente-celula-"]')).toHaveCount(0);
      await expect(page.getByTestId("lista-ultimos-cambios").locator("tbody tr")).toHaveCount(10);
    });

    test("[E7-F05#3] T05c: al abrir /admin/usuarios?usuario=<id> la fila del usuario queda resaltada y a la vista (aria-current), sin abrir diálogos", async ({ page, request }) => {
      const ana4 = await idDe(request, USUARIOS_E7.ana4.correo);
      await page.goto(`${env.portalUrl}/admin/usuarios?usuario=${ana4}`);
      await expect(page.getByTestId(`fila-usuario-${ana4}`)).toHaveAttribute("aria-current", "true");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("[E7-F05#3] T05b: «Asignar QE» abre /admin/supervision con el analista indicado", async ({ page, request }) => {
      const ana4 = await idDe(request, USUARIOS_E7.ana4.correo);
      await page.goto(`${env.portalUrl}/admin`);
      await page.getByTestId(`boton-asignar-qe-${ana4}`).click();
      await expect(page).toHaveURL(new RegExp(`/admin/supervision\\?analista=${ana4}$`));
    });

    test("[E7-F05#3] T06: ADM1 cambia el rol de un usuario y, al volver a /admin, el primer ítem de «Últimos cambios» es ese cambio con ADM1 como actor", async ({ page, request }) => {
      const adm = await tokenE7("adm1");
      // Usuario propio de la prueba (no se muta el fixture).
      const usuario = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f05-t06" });
      try {
        await page.goto(`${env.portalUrl}/admin/usuarios`);
        await page.getByLabel("Buscar por nombre o correo").fill(usuario.correo);
        const fila = page.getByTestId(`fila-usuario-${usuario.id}`);
        await expect(fila).toBeVisible();
        await fila.getByRole("button", { name: "Cambiar rol" }).click();
        const dialogo = page.getByTestId("dialogo-cambio-rol");
        await expect(dialogo).toBeVisible();
        await dialogo.getByLabel("Nuevo rol").selectOption({ label: "Auditor" });
        await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar cambio" }), URL_ROL);
        await expect(page.getByTestId("mensaje-exito-usuarios")).toContainText(`${usuario.nombre} ahora es Auditor`);
        await page.goto(`${env.portalUrl}/admin`);
        const primera = page.getByTestId("fila-cambio-0");
        await expect(primera).toContainText("Cambio de rol");
        await expect(primera).toContainText("ADM1");
        await expect(primera).toContainText(usuario.nombre);
        // Ya no es Analista QA: deja de figurar como «Analista sin QE».
        await expect(page.getByTestId(`fila-pendiente-analista-sin-qe-${usuario.id}`)).toHaveCount(0);
      } finally {
        await desactivarUsuario(request, adm, usuario.id);
      }
    });
  });

  test("[E7-F05#2] T03: sin pendientes de configuración se muestra «No hay pendientes de configuración» y los contadores de pendientes en 0", async ({ browser, request }) => {
    // Se resuelven los pendientes de forma REVERSIBLE (sin tocar supervisiones): los usuarios con pendiente se desactivan
    // y se reactivan en `finally`.
    test.setTimeout(300_000);
    const adm = await tokenE7("adm1");
    const desactivados: string[] = [];
    try {
      for (let vuelta = 0; vuelta < 4; vuelta += 1) {
        const b = await api.get<{ pendientes: { datos: { items: Array<{ tipo: string; usuario: { id: string } }> } } }>(request, "/v1/bandeja/admin?tamanoPagina=100", { token: adm });
        const items = b.body.pendientes.datos.items;
        if (items.length === 0) break;
        for (const i of items) {
          await api.patch(request, `/v1/usuarios/${i.usuario.id}`, { token: adm, body: { activo: false } });
          desactivados.push(i.usuario.id);
        }
      }
      const final = await api.get<{ pendientes: { datos: { total: number } } }>(request, "/v1/bandeja/admin", { token: adm });
      expect(final.body.pendientes.datos.total, "no se pudieron resolver todos los pendientes").toBe(0);

      const ctx = await browser.newContext({ storageState: estadoSesion("adm1") });
      const page = await ctx.newPage();
      await page.goto(`${env.portalUrl}/admin`);
      await expect(page.getByTestId("estado-vacio-pendientes")).toContainText("No hay pendientes de configuración");
      for (const clave of ["analistas-sin-qe", "qe-sin-analistas"]) {
        await expect(page.getByTestId(`contador-${clave}`)).toHaveText("0");
      }
      await ctx.close();
    } finally {
      for (const id of desactivados) await api.patch(request, `/v1/usuarios/${id}`, { token: adm, body: { activo: true } });
    }
  });

  test.describe("con el servicio de Organización sin responder en las bandejas", () => {
    let pila: PilaCaida;
    test.beforeAll(async () => {
      pila = await organizacionCaidaEnRutas(["/v1/bandeja/admin", "/v1/inicio/admin", "/v1/resumenes"]);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E7-F05#2] T04: ADM1 ve un error con «Reintentar», ninguna cifra ficticia y los enlaces de acceso siguen visibles", async ({ page }) => {
      await iniciarSesionUI(page, USUARIOS_E7.adm1.correo, CONTRASENA, pila.portalUrl);
      await expect(page.getByTestId("bandeja-admin")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("bloque-bandeja-admin-error")).toContainText("Ocurrió un error", { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
      // Sin cifras: ningún contador, ni 0.
      await expect(page.locator('[data-testid^="contador-"]')).toHaveCount(0);
      await expect(page.getByTestId("estado-vacio-pendientes")).toHaveCount(0);
      for (const nombre of ["Gestionar usuarios", "Gestionar supervisión", "Registrar usuario"]) {
        await expect(page.getByRole("link", { name: nombre })).toBeVisible();
      }
    });
  });
});
