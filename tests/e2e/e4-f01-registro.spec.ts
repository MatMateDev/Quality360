import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { tokenE7 } from "../support/e7";
import { hdu, imps, reiniciarFixtureE4, texto, uid } from "../support/e4";
import { estadoSesion, contextoDe, entrarEnPortal } from "../support/e4ui";
import { impedimentosCaido, type PilaE4 } from "../support/entornoE4";
import { env } from "../support/env";

/**
 * E4-F01 · Registro de un impedimento por el Analista QA (3 escenarios, T01..T10; T10 es la regresión de la suite completa).
 * El fixture E4 se recarga antes del archivo; los casos corren en orden y comparten lo que dejan los anteriores.
 */
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await reiniciarFixtureE4();
});

async function abrirFormulario(page: Page, hduId: string) {
  await page.goto(`${env.portalUrl}/hdu/${hduId}`);
  await expect(page.getByTestId("seccion-impedimentos")).toBeVisible();
  await page.getByTestId("boton-registrar-impedimento").click();
  await expect(page.getByTestId("form-impedimento")).toBeVisible();
}

test.describe("E4-F01 · Registro de impedimentos", () => {
  test.describe("ANA3", () => {
    test.use({ storageState: estadoSesion("ana3") });

    test("[E4-F01#1] T01: ANA3 registra «VPN sin permisos» en H4: queda Abierto con autor ANA3 y responsable QE2, aparece «HDU bloqueada» y el formulario se cierra con mensaje de éxito", async ({ page, request }) => {
      const h = await hdu(request);
      const qe2 = await uid(request, "qe2");
      await page.goto(`${env.portalUrl}/hdu/${h.H4.id}`);
      await expect(page.getByTestId("hdu-bloqueada")).toHaveCount(0);
      await expect(page.getByTestId("estado-vacio-impedimentos-hdu")).toContainText("Esta HDU no tiene impedimentos registrados");
      await abrirFormulario(page, h.H4.id);
      await page.getByTestId("campo-tipo-impedimento").selectOption("ACCESO");
      await page.getByTestId("campo-titulo-impedimento").fill("VPN sin permisos");
      await page.getByTestId("campo-descripcion-impedimento").fill(texto(30, "descripcion "));
      await page.getByTestId("campo-responsable-impedimento").selectOption(qe2);
      await page.getByTestId("boton-guardar-impedimento").click();

      await expect(page.getByTestId("form-impedimento")).toHaveCount(0);
      await expect(page.getByTestId("mensaje-exito-impedimento")).toContainText("Impedimento registrado");
      const filas = page.getByTestId("lista-impedimentos-hdu").locator("> li");
      await expect(filas).toHaveCount(1);
      await expect(filas.first()).toContainText("VPN sin permisos");
      await expect(filas.first()).toContainText("Abierto");
      await expect(filas.first()).toContainText("ANA3");
      await expect(filas.first()).toContainText("QE2");
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
      await expect(page.getByTestId("hdu-bloqueada")).toContainText("bloqueada");
    });

    test("[E4-F01#1] T02: en su bandeja el contador de impedimentos abiertos pasa de 1 a 2, la fila de H4 dice «Bloqueada» y «Solo bloqueadas» deja H3 y H4", async ({ page, request }) => {
      const h = await hdu(request);
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveText("2");
      await expect(page.getByTestId(`celda-bloqueo-${h.H4.id}`)).toContainText("Bloqueada");
      await expect(page.getByTestId(`celda-bloqueo-${h.H3.id}`)).toContainText("Bloqueada");
      await page.getByTestId("filtro-solo-bloqueadas").click();
      await expect(page).toHaveURL(/solo-bloq=1/);
      const filas = page.getByTestId("lista-mis-hdu").locator("tbody tr");
      await expect(filas).toHaveCount(2);
      await expect(page.getByTestId(`fila-hdu-${h.H3.id}`)).toBeVisible();
      await expect(page.getByTestId(`fila-hdu-${h.H4.id}`)).toBeVisible();
    });

    test("[E4-F01#2] T03 (negativo): sin descripción aparece «La descripción es obligatoria», el formulario sigue abierto con lo escrito y no se crea nada", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      void i;
      await reiniciarFixtureE4();
      await abrirFormulario(page, h.H4.id);
      await page.getByTestId("campo-tipo-impedimento").selectOption("ACCESO");
      await page.getByTestId("campo-titulo-impedimento").fill("VPN sin permisos");
      await page.getByTestId("campo-responsable-impedimento").selectOption(await uid(request, "qe2"));
      await page.getByTestId("boton-guardar-impedimento").click();
      await expect(page.getByTestId("error-descripcion-impedimento")).toHaveText("La descripción es obligatoria");
      await expect(page.getByTestId("form-impedimento")).toBeVisible();
      await expect(page.getByTestId("campo-titulo-impedimento")).toHaveValue("VPN sin permisos");
      await expect(page.getByTestId("hdu-bloqueada")).toHaveCount(0);
      const lista = await api.get<{ items: unknown[] }>(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token: await tokenE7("qe2") });
      expect(lista.body.items).toHaveLength(0);
    });

    test("[E4-F01#2] T04 (negativo): tipo vacío, título de 4 caracteres, descripción de 1.001 (el contador la limita a 1.000) y «Otro» sin nombre dan un mensaje cada uno y no crean nada", async ({ page, request }) => {
      const h = await hdu(request);
      await abrirFormulario(page, h.H4.id);
      const guardar = () => page.getByTestId("boton-guardar-impedimento").click();
      // Todo vacío salvo lo que se prueba: primero el tipo.
      await page.getByTestId("campo-titulo-impedimento").fill("Título válido");
      await page.getByTestId("campo-descripcion-impedimento").fill(texto(30, "descripcion "));
      await page.getByTestId("campo-responsable-impedimento").selectOption(await uid(request, "qe2"));
      await guardar();
      await expect(page.getByTestId("error-tipo-impedimento")).toHaveText("Selecciona un tipo");
      await page.getByTestId("campo-tipo-impedimento").selectOption("ACCESO");
      // Título de 4 caracteres.
      await page.getByTestId("campo-titulo-impedimento").fill("abcd");
      await guardar();
      await expect(page.getByTestId("error-titulo-impedimento")).toContainText("entre 5 y 200");
      await page.getByTestId("campo-titulo-impedimento").fill("Título válido");
      // Descripción de 1.001: el campo no deja pasar de 1.000.
      await page.getByTestId("campo-descripcion-impedimento").fill(texto(1001));
      await expect(page.getByTestId("contador-descripcion-impedimento")).toHaveText("1000/1000");
      expect((await page.getByTestId("campo-descripcion-impedimento").inputValue()).length).toBe(1000);
      await page.getByTestId("campo-descripcion-impedimento").fill(texto(30, "descripcion "));
      // «Otro» como responsable sin nombre.
      await page.getByTestId("campo-responsable-impedimento").selectOption({ label: "Otro (nombre)…" });
      await guardar();
      await expect(page.getByTestId("error-responsable-otro")).toContainText("entre 3 y 150");
      // Descripción de 15 con tipo «Otro» (mínimo 20).
      await page.getByTestId("campo-responsable-otro").fill("Equipo de Infraestructura");
      await page.getByTestId("campo-tipo-impedimento").selectOption("OTRO");
      await page.getByTestId("campo-descripcion-impedimento").fill(texto(15));
      await guardar();
      await expect(page.getByTestId("error-descripcion-impedimento")).toContainText("al menos 20");
      const lista = await api.get<{ items: unknown[] }>(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token: await tokenE7("qe2") });
      expect(lista.body.items).toHaveLength(0);
    });
  });

  test("[E4-F01#3] T05: QE2 ve el impedimento de H4 con la insignia «Nuevo»; sus contadores abiertos y nuevos suben a 2; «Requiere mi acción» no gana filas", async ({ browser, request }) => {
    await reiniciarFixtureE4();
    const h = await hdu(request);
    const tokenQe2 = await tokenE7("qe2");
    const antes = await api.get<{ acciones: { datos: { items: unknown[] } } }>(request, "/v1/bandeja/qe", { token: tokenQe2 });
    const filasAntes = antes.body.acciones.datos.items.length;

    const ana3 = await contextoDe(browser, "ana3");
    try {
      await abrirFormulario(ana3.page, h.H4.id);
      await ana3.page.getByTestId("campo-tipo-impedimento").selectOption("ACCESO");
      await ana3.page.getByTestId("campo-titulo-impedimento").fill("VPN sin permisos");
      await ana3.page.getByTestId("campo-descripcion-impedimento").fill(texto(30, "descripcion "));
      await ana3.page.getByTestId("campo-responsable-impedimento").selectOption(await uid(request, "qe2"));
      await ana3.page.getByTestId("boton-guardar-impedimento").click();
      await expect(ana3.page.getByTestId("hdu-bloqueada")).toBeVisible();
    } finally {
      await ana3.contexto.close();
    }

    const qe2 = await contextoDe(browser, "qe2");
    try {
      await qe2.page.goto(`${env.portalUrl}/qe`);
      await expect(qe2.page.getByTestId("contador-impedimentos-abiertos")).toHaveText("2");
      await expect(qe2.page.getByTestId("contador-impedimentos-nuevos")).toHaveText("2");
      const lista = qe2.page.getByTestId("lista-impedimentos");
      await expect(lista.locator("tbody tr")).toHaveCount(2);
      const filaH4 = lista.locator("tbody tr", { hasText: "E7-H4" });
      await expect(filaH4.getByTestId("insignia-nuevo")).toBeVisible();
      await expect(lista.locator("tbody tr", { hasText: "E7-H3" }).getByTestId("insignia-nuevo")).toBeVisible();
      // D71: «Requiere mi acción» queda como estaba (para QE2 hoy está vacía: no hay tabla).
      await expect(qe2.page.getByTestId("lista-requiere-accion").locator("tbody tr")).toHaveCount(filasAntes);
      if (filasAntes > 0) await expect(qe2.page.getByTestId("lista-requiere-accion")).not.toContainText("mpedimento");
    } finally {
      await qe2.contexto.close();
    }
  });

  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });

    test("[E4-F01#1] T06: QE1 registra RECURSOS en H5 (sin analista) con él mismo como responsable preseleccionado; H5 queda bloqueada y el autor es QE1", async ({ page, request }) => {
      await reiniciarFixtureE4();
      const h = await hdu(request);
      await abrirFormulario(page, h.H5.id);
      const qe1 = await uid(request, "qe1");
      await expect(page.getByTestId("campo-responsable-impedimento")).toHaveValue(qe1);
      await page.getByTestId("campo-tipo-impedimento").selectOption("RECURSOS");
      await page.getByTestId("campo-titulo-impedimento").fill("Falta personal de pruebas");
      await page.getByTestId("campo-descripcion-impedimento").fill(texto(30, "descripcion "));
      await page.getByTestId("boton-guardar-impedimento").click();
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
      const fila = page.getByTestId("lista-impedimentos-hdu").locator("> li").first();
      await expect(fila).toContainText("Falta personal de pruebas");
      await expect(fila).toContainText("QE1");
      await expect(fila).toContainText("Registrado por");
    });
  });

  test("[E4-F01#1] T07 (negativo): LID1, AUD1 y ADM1 ven I1 en H3 sin botón de registro; QE1 y ANA1 (ajenos a H3) ven acceso denegado", async ({ browser, request }) => {
    await reiniciarFixtureE4();
    const [h, i] = [await hdu(request), await imps(request)];
    for (const clave of ["lid1", "aud1", "adm1"] as const) {
      const { contexto, page } = await contextoDe(browser, clave);
      try {
        await page.goto(`${env.portalUrl}/hdu/${h.H3.id}`);
        await expect(page.getByTestId(`impedimento-${i.I1.id}`), clave).toContainText("Ambiente QA no responde");
        await expect(page.getByTestId("boton-registrar-impedimento"), clave).toHaveCount(0);
        await expect(page.locator("button[type=submit]"), clave).toHaveCount(0);
      } finally {
        await contexto.close();
      }
    }
    for (const clave of ["qe1", "ana1"] as const) {
      const { contexto, page } = await contextoDe(browser, clave);
      try {
        await page.goto(`${env.portalUrl}/hdu/${h.H3.id}`);
        await expect(page.getByTestId("acceso-denegado"), clave).toBeVisible();
        await expect(page.getByTestId("seccion-impedimentos"), clave).toHaveCount(0);
      } finally {
        await contexto.close();
      }
    }
  });

  test.describe("ANA3 sobre una HDU cerrada", () => {
    test.use({ storageState: estadoSesion("ana3") });

    test("[E4-F01#1] T08 (negativo): ANA3 en H7 (Cerrada) ve I5 en el historial y «HDU cerrada: no admite nuevos impedimentos», sin botón de registro", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await page.goto(`${env.portalUrl}/hdu/${h.H7.id}`);
      await expect(page.getByTestId(`impedimento-${i.I5.id}`)).toContainText("Permisos de la herramienta de pruebas");
      await expect(page.getByTestId("nota-impedimentos-cerrada")).toHaveText("HDU cerrada: no admite nuevos impedimentos.");
      await expect(page.getByTestId("boton-registrar-impedimento")).toHaveCount(0);
      await expect(page.getByTestId("hdu-bloqueada")).toHaveCount(0);
    });
  });

  test.describe("con Impedimentos detenido", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await impedimentosCaido(true);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-F01#1] T09: con el servicio Impedimentos detenido, el detalle de H1 muestra la sección «No disponible» con «Reintentar»; el checklist y el resto cargan y no hay botón de registro", async ({ page, request }) => {
      const h = await hdu(request);
      await entrarEnPortal(page, "ana1", pila.portalUrl!);
      await page.goto(`${pila.portalUrl}/hdu/${h.H1.id}`);
      const bloque = page.getByTestId("estado-indisponible-impedimentos-hdu");
      await expect(bloque).toBeVisible();
      await expect(bloque).toContainText("No disponible");
      await expect(bloque.getByRole("button", { name: "Reintentar" })).toBeVisible();
      await expect(page.getByTestId("panel-checklist")).toBeVisible();
      await expect(page.getByTestId("boton-registrar-impedimento")).toHaveCount(0);
      await expect(page.getByTestId("hdu-bloqueada")).toHaveCount(0);
    });
  });
});
