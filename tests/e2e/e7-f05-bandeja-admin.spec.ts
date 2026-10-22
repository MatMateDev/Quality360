import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { organizacionCaidaEnRutas, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { CONTRASENA, USUARIOS_E7, celulasFixture, contarOrganizacion, crearUsuarioE7, desactivarUsuario, tokenE7, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

const ETIQUETA_ROL = { ADMINISTRADOR: "Administrador", QE: "QE", ANALISTA_QA: "Analista QA", LIDER_QA: "Líder QA", AUDITOR: "Auditor" } as const;

async function idDe(request: Parameters<typeof api.get>[0], correo: string): Promise<string> {
  const r = await api.get<{ items: Array<{ id: string; correo: string }> }>(request, `/v1/usuarios?q=${encodeURIComponent(correo)}`, { token: await tokenE7("adm1") });
  const u = r.body.items.find((x) => x.correo === correo);
  if (!u) throw new Error(`No existe ${correo}`);
  return u.id;
}

test.describe("E7-F05 · Bandeja del Administrador", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E7-F05#1] T01: ADM1 ve usuarios activos (con desglose por los 5 roles), inactivos, analistas sin QE, QE sin analistas, líderes sin células, células sin líder y HDU totales", async ({ page, request }) => {
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
      await expect(page.getByTestId("contador-usuarios-inactivos")).toHaveText(String(bd.usuariosInactivos));
      await expect(page.getByTestId("contador-analistas-sin-qe")).toHaveText(String(bd.analistasSinQe));
      await expect(page.getByTestId("contador-lideres-sin-celulas")).toHaveText(String(bd.lideresSinCelulas));
      await expect(page.getByTestId("contador-hdu-total")).toHaveText(String(bd.hduTotal));
      await expect(page.getByTestId("contador-qe-sin-analistas")).toHaveText(String(c.qeSinAnalistas.datos.valor));
      await expect(page.getByTestId("contador-celulas-sin-lider")).toHaveText(String(c.celulasSinLider.datos.valor));
      // Se conservan los accesos y tarjetas certificados de E1-F08.
      await expect(page.getByTestId("tarjeta-usuarios-total")).toBeVisible();
      await expect(page.getByTestId("tarjeta-supervision-vigentes")).toBeVisible();
      await expect(page.getByTestId("tarjeta-supervision-sin-supervisor")).toBeVisible();
      for (const nombre of ["Gestionar usuarios", "Gestionar supervisión", "Registrar usuario"]) {
        await expect(page.getByRole("link", { name: nombre })).toBeVisible();
      }
      // D36: ni siquiera un contador en cero de impedimentos.
      await expect(page.locator("body")).not.toContainText(/impedimento/i);
    });

    test("[E7-F05#1] T02: la lista de pendientes trae a ANA4 «Analista sin QE», a LID2 «Líder sin células» y a la célula CEL-C «Célula sin líder»", async ({ page, request }) => {
      const ana4 = await idDe(request, USUARIOS_E7.ana4.correo);
      const lid2 = await idDe(request, USUARIOS_E7.lid2.correo);
      const celulas = await celulasFixture(request);
      await page.goto(`${env.portalUrl}/admin`);
      const lista = page.getByTestId("lista-pendientes");
      await expect(lista).toBeVisible();
      await expect(page.getByTestId(`fila-pendiente-analista-sin-qe-${ana4}`)).toContainText("Analista sin QE");
      await expect(page.getByTestId(`fila-pendiente-lider-sin-celulas-${lid2}`)).toContainText("Líder sin células");
      await expect(page.getByTestId(`fila-pendiente-celula-sin-lider-${celulas["CEL-C"].id}`)).toContainText("CEL-C");
      await expect(page.getByTestId(`fila-pendiente-celula-sin-lider-${celulas["CEL-C"].id}`)).toContainText("Célula sin líder");
      // Una fila, un botón, con el destino de D51.
      await expect(page.getByTestId(`boton-asignar-qe-${ana4}`)).toHaveAttribute("href", `/admin/supervision?analista=${ana4}`);
      await expect(page.getByTestId(`boton-asignar-celulas-${lid2}`)).toHaveAttribute("href", `/admin/usuarios?usuario=${lid2}`);
      await expect(page.getByTestId(`boton-asignar-lider-${celulas["CEL-C"].id}`)).toHaveAttribute("href", "/admin/usuarios?rol=LIDER_QA");
      await expect(page.getByTestId("lista-ultimos-cambios").locator("tbody tr")).toHaveCount(10);
    });

    test("[E7-F05#3] T05: «Asignar células» en la fila de LID2 abre /admin/usuarios con LID2 seleccionado y el diálogo de células", async ({ page, request }) => {
      const lid2 = await idDe(request, USUARIOS_E7.lid2.correo);
      await page.goto(`${env.portalUrl}/admin`);
      await page.getByTestId(`boton-asignar-celulas-${lid2}`).click();
      await expect(page).toHaveURL(new RegExp(`/admin/usuarios\\?usuario=${lid2}$`));
      await expect(page.getByTestId("dialogo-celulas")).toBeVisible();
      await expect(page.getByTestId("dialogo-celulas")).toContainText("LID2");
      await expect(page.getByTestId("celulas-vigentes")).toContainText("ninguna");
    });

    test("[E7-F05#3] T05c: al abrir /admin/usuarios?usuario=<id> la fila del usuario queda resaltada y a la vista (aria-current)", async ({ page, request }) => {
      const lid2 = await idDe(request, USUARIOS_E7.lid2.correo);
      await page.goto(`${env.portalUrl}/admin/usuarios?usuario=${lid2}`);
      await expect(page.getByTestId("dialogo-celulas")).toBeVisible();
      await expect(page.getByTestId(`fila-usuario-${lid2}`)).toHaveAttribute("aria-current", "true");
    });

    test("[E7-F05#3] T05b: «Asignar QE» abre /admin/supervision con el analista indicado y «Asignar líder» abre /admin/usuarios?rol=LIDER_QA", async ({ page, request }) => {
      const ana4 = await idDe(request, USUARIOS_E7.ana4.correo);
      const celulas = await celulasFixture(request);
      await page.goto(`${env.portalUrl}/admin`);
      await page.getByTestId(`boton-asignar-qe-${ana4}`).click();
      await expect(page).toHaveURL(new RegExp(`/admin/supervision\\?analista=${ana4}$`));
      await page.goto(`${env.portalUrl}/admin`);
      await page.getByTestId(`boton-asignar-lider-${celulas["CEL-C"].id}`).click();
      await expect(page).toHaveURL(/\/admin\/usuarios\?rol=LIDER_QA$/);
    });
  });

  test("[E7-F05#3] T06: ADM1 asigna una célula a un Líder sin células y, al volver a /admin, el primer ítem de «Últimos cambios» es esa asignación con ADM1 como actor", async ({ browser, request }) => {
    const ctx = await browser.newContext({ storageState: estadoSesion("adm1") });
    const page = await ctx.newPage();
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    // Líder propio de la prueba, sin células (no se muta a LID2).
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "f05-t06" });
    try {
      await page.goto(`${env.portalUrl}/admin`);
      await page.getByTestId(`boton-asignar-celulas-${lider.id}`).click();
      const dialogo = page.getByTestId("dialogo-celulas");
      await expect(dialogo).toBeVisible();
      await dialogo.getByTestId(`celula-opcion-${celulas["CEL-C"].id}`).check();
      await dialogo.getByRole("button", { name: "Guardar células" }).click();
      await expect(page.getByTestId("mensaje-exito-usuarios")).toContainText(lider.nombre);
      await page.goto(`${env.portalUrl}/admin`);
      const primera = page.getByTestId("fila-cambio-0");
      await expect(primera).toContainText("Asignación de células");
      await expect(primera).toContainText("ADM1");
      await expect(primera).toContainText(lider.nombre);
      await expect(page.getByTestId(`fila-pendiente-lider-sin-celulas-${lider.id}`)).toHaveCount(0);
    } finally {
      await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [] } });
      await desactivarUsuario(request, adm, lider.id);
      await ctx.close();
    }
  });

  test("[E7-F05#2] T03: sin pendientes de configuración se muestra «No hay pendientes de configuración» y los contadores de pendientes en 0", async ({ browser, request }) => {
    // Se resuelven los pendientes de forma REVERSIBLE (sin tocar supervisiones): los usuarios con pendiente se desactivan
    // y las células sin líder se suman temporalmente a LID1; todo se restaura en `finally`.
    test.setTimeout(300_000);
    const adm = await tokenE7("adm1");
    const desactivados: string[] = [];
    const lid1 = (await api.get<{ items: Array<{ id: string }> }>(request, `/v1/usuarios?q=${encodeURIComponent(USUARIOS_E7.lid1.correo)}`, { token: adm })).body.items[0];
    const celulasLid1 = (await api.get<{ vigentes: Array<{ celula: { id: string } }> }>(request, `/v1/usuarios/${lid1.id}/celulas-lider`, { token: adm })).body.vigentes.map((v) => v.celula.id);
    let celulasExtra = false;
    try {
      for (let vuelta = 0; vuelta < 4; vuelta += 1) {
        const b = await api.get<{ pendientes: { datos: { items: Array<{ tipo: string; usuario: { id: string } | null; celula: { id: string } | null }> } } }>(request, "/v1/bandeja/admin?tamanoPagina=100", { token: adm });
        const items = b.body.pendientes.datos.items;
        if (items.length === 0) break;
        const celulasSinLider = items.filter((i) => i.tipo === "CELULA_SIN_LIDER" && i.celula).map((i) => i.celula!.id);
        if (celulasSinLider.length > 0) {
          celulasExtra = true;
          await api.put(request, `/v1/usuarios/${lid1.id}/celulas-lider`, { token: adm, body: { celulaIds: [...new Set([...celulasLid1, ...celulasSinLider])] } });
        }
        for (const i of items.filter((x) => x.usuario)) {
          await api.patch(request, `/v1/usuarios/${i.usuario!.id}`, { token: adm, body: { activo: false } });
          desactivados.push(i.usuario!.id);
        }
      }
      const final = await api.get<{ pendientes: { datos: { total: number } } }>(request, "/v1/bandeja/admin", { token: adm });
      expect(final.body.pendientes.datos.total, "no se pudieron resolver todos los pendientes").toBe(0);

      const ctx = await browser.newContext({ storageState: estadoSesion("adm1") });
      const page = await ctx.newPage();
      await page.goto(`${env.portalUrl}/admin`);
      await expect(page.getByTestId("estado-vacio-pendientes")).toContainText("No hay pendientes de configuración");
      for (const clave of ["analistas-sin-qe", "qe-sin-analistas", "lideres-sin-celulas", "celulas-sin-lider"]) {
        await expect(page.getByTestId(`contador-${clave}`)).toHaveText("0");
      }
      await ctx.close();
    } finally {
      for (const id of desactivados) await api.patch(request, `/v1/usuarios/${id}`, { token: adm, body: { activo: true } });
      if (celulasExtra) await api.put(request, `/v1/usuarios/${lid1.id}/celulas-lider`, { token: adm, body: { celulaIds: celulasLid1 } });
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
