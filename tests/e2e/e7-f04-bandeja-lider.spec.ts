import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { certificacionesCaida, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { CONTRASENA, USUARIOS_E7, celulasFixture, crearUsuarioE7, desactivarUsuario, hduFixture, tokenE7, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

/** Acota la lista a las HDU del fixture (la base compartida tiene otras HDU en CEL-A y CEL-B). */
async function soloFixture(page: Page) {
  await page.locator("#filtro-busqueda").fill("E7-H");
  await expect(page).toHaveURL(/q=E7-H/);
}

async function codigosEnLista(page: Page): Promise<string[]> {
  const filas = page.getByTestId("lista-hdu-lider").locator("tbody tr");
  await expect(filas.first()).toBeVisible();
  return (await filas.evaluateAll((trs) => trs.map((tr) => (tr.querySelector("td")?.textContent ?? "").trim()))).sort();
}

const BOTONES_ESCRITURA = [
  /^Marcar/, /Desmarcar/, /^Aprobar/, /^Rechazar/, /Asignar analista/, /Reasignar/, /Cambiar estado/, /Generar certificado/, /Avanzar/, /Subir evidencia/, /Adjuntar/,
];

test.describe("E7-F04 · Bandeja del Líder QA", () => {
  test.describe("LID1", () => {
    test.use({ storageState: estadoSesion("lid1") });

    test("[E7-F04#1] T01: LID1 ve los chips CEL-A y CEL-B, sus contadores y las HDU E7-H1, H2, H3, H5, H6 y H7 (ni H4 ni H8)", async ({ page, request }) => {
      const api1 = await api.get<{ contadores: Record<string, { datos: { valor: number } }> }>(request, "/v1/bandeja/lider", { token: await tokenE7("lid1") });
      const c = api1.body.contadores;
      await page.goto(`${env.portalUrl}/lider`);
      await expect(page.getByTestId("bandeja-lider")).toBeVisible();
      await expect(page.getByTestId("chips-celulas")).toContainText("CEL-A");
      await expect(page.getByTestId("chips-celulas")).toContainText("CEL-B");
      await expect(page.getByTestId("chips-celulas")).not.toContainText("CEL-C");
      await expect(page.getByTestId("contador-celulas")).toHaveText("2");
      await expect(page.getByTestId("contador-hdu-abiertas")).toHaveText(String(c.hduAbiertas.datos.valor));
      await expect(page.getByTestId("contador-hdu-cerradas")).toHaveText(String(c.hduCerradas.datos.valor));
      await expect(page.getByTestId("contador-sin-analista")).toHaveText(String(c.sinAnalista.datos.valor));
      await expect(page.getByTestId("contador-certificados")).toHaveText(String(c.certificados.datos.valor));
      await expect(page.getByTestId("aviso-solo-lectura")).toBeVisible();
      await expect(page.getByTestId("lista-resumen-celulas").locator("tbody tr")).toHaveCount(2);

      await soloFixture(page);
      expect(await codigosEnLista(page)).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
      // El subconjunto del fixture coincide con los valores del backlog: 5 abiertas, 1 cerrada, 1 sin analista, 1 certificado.
      const filas = page.getByTestId("lista-hdu-lider").locator("tbody tr");
      await expect(filas.filter({ hasText: "Cerrada" })).toHaveCount(1);
      await expect(filas.filter({ hasText: "Sin asignar" })).toHaveCount(1);
      await expect(page.getByTestId("lista-hdu-lider").locator("[data-testid^=celda-certificado-]").filter({ hasText: "Q360-" })).toHaveCount(1);
    });

    test("[E7-F04#1] T02: LID1 filtra por QE = QE1 y quedan E7-H1, H2, H5 y H6", async ({ page }) => {
      await page.goto(`${env.portalUrl}/lider`);
      await soloFixture(page);
      await page.locator("#filtro-qe").selectOption({ label: "QE1 Quality Engineer" });
      await expect(page).toHaveURL(/qe=/);
      await expect(page.getByTestId("lista-hdu-lider").locator("tbody tr")).toHaveCount(4);
      expect(await codigosEnLista(page)).toEqual(["E7-H1", "E7-H2", "E7-H5", "E7-H6"]);
    });

    test("[E7-F04#1] T03: LID1 filtra «Sin analista» y queda solo E7-H5 con «Sin asignar»", async ({ page }) => {
      await page.goto(`${env.portalUrl}/lider`);
      await soloFixture(page);
      await page.locator("#filtro-sin-analista").click();
      await expect(page.locator("#filtro-sin-analista")).toBeChecked();
      await expect(page.getByTestId("lista-hdu-lider").locator("tbody tr")).toHaveCount(1);
      const fila = page.getByTestId("lista-hdu-lider").locator("tbody tr").first();
      await expect(fila).toContainText("E7-H5");
      await expect(fila).toContainText("Sin asignar");
    });

    test("[E7-F04#1] T03b: el filtro de célula solo ofrece las células vigentes del Líder", async ({ page }) => {
      await page.goto(`${env.portalUrl}/lider`);
      await expect(page.locator("#filtro-celula option", { hasText: "CEL-A" })).toHaveCount(1);
      const opciones = (await page.locator("#filtro-celula option").allTextContents()).map((t) => t.trim());
      expect(opciones).toContain("CEL-A");
      expect(opciones).toContain("CEL-B");
      expect(opciones).not.toContain("CEL-C");
    });

    test("[E7-F04#3] T06: el detalle de E7-H2 es solo lectura: checklist con la observación y ningún botón de marcar, aprobar, asignar, cambiar estado ni certificar", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H2"].id}`);
      await expect(page.getByTestId("panel-checklist")).toBeVisible();
      await expect(page.getByTestId("observacion-DASHBOARD")).toContainText("Falta evidencia de datos");
      await expect(page.getByTestId("aviso-solo-lectura")).toBeVisible();
      for (const nombre of BOTONES_ESCRITURA) await expect(page.getByRole("button", { name: nombre }), String(nombre)).toHaveCount(0);
      await expect(page.locator("[data-testid^=boton-marcar-], [data-testid^=boton-aprobar-], [data-testid^=boton-rechazar-], [data-testid^=boton-desmarcar-]")).toHaveCount(0);
      await expect(page.getByTestId("boton-generar-certificado")).toHaveCount(0);
      await expect(page.locator("main select, main input[type=file]")).toHaveCount(0);
    });

    test("[E7-F04#3] T07: en el detalle de E7-H7 LID1 descarga el certificado en PDF con el folio", async ({ page, request }) => {
      const h = await hduFixture(request);
      const cert = await api.get<{ certificado: { folio: string } }>(request, `/v1/hdu/${h["E7-H7"].id}/certificado`, { token: await tokenE7("lid1") });
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H7"].id}`);
      await expect(page.getByTestId("certificado-folio")).toContainText(cert.body.certificado.folio);
      const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId("boton-descargar-certificado").click()]);
      expect(descarga.suggestedFilename()).toBe(`${cert.body.certificado.folio}.pdf`);
      const ruta = await descarga.path();
      expect(readFileSync(ruta).subarray(0, 5).toString()).toBe("%PDF-");
      await expect(page.getByTestId("boton-generar-certificado")).toHaveCount(0);
    });

    test("[E7-F04#3] T07b: desde la bandeja, el PDF del certificado de E7-H7 también se descarga", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/lider`);
      await soloFixture(page);
      const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`boton-descargar-certificado-${h["E7-H7"].id}`).click()]);
      expect(descarga.suggestedFilename()).toMatch(/^Q360-.*\.pdf$/);
    });

    test("[E7-F04#3] T08: LID1 abre por URL el detalle de E7-H4 (CEL-C) y ve acceso denegado sin datos de la HDU", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H4"].id}`);
      await expect(page.getByTestId("acceso-denegado")).toContainText("No tienes acceso");
      await expect(page.locator("body")).not.toContainText("Historia E7 H4");
      await expect(page.getByTestId("valor-analista-hdu")).toHaveCount(0);
    });
  });

  test.describe("LID2 (sin células)", () => {
    test.use({ storageState: estadoSesion("lid2") });

    test("[E7-F04#2] T04: LID2 ve el mensaje de sin células, ninguna tabla ni cifra y ningún error", async ({ page }) => {
      await page.goto(`${env.portalUrl}/lider`);
      await expect(page.getByTestId("estado-vacio-celulas")).toContainText("Aún no tienes células asignadas. Pide al Administrador que te las asigne");
      await expect(page.locator("table")).toHaveCount(0);
      await expect(page.locator('[data-testid^="contador-"]')).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByText("Ocurrió un error")).toHaveCount(0);
    });
  });

  test.describe("cambio de células con sesión abierta", () => {
    test("[E7-F04#1] T09: ADM1 quita CEL-B al Líder y, al recargar, la lista queda con E7-H1, H2, H5 y H7 y CEL-B desaparece de los chips", async ({ page, request }) => {
      const adm = await tokenE7("adm1");
      const celulas = await celulasFixture(request);
      // Líder propio de la prueba con CEL-A y CEL-B (no se muta a LID1).
      const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "f04-t09", celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id], conContrasena: true });
      try {
        await iniciarSesionUI(page, lider.correo, CONTRASENA);
        await expect(page.getByTestId("bandeja-lider")).toBeVisible({ timeout: 15_000 });
        await soloFixture(page);
        expect(await codigosEnLista(page)).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);

        const quita = await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-A"].id] } });
        expect(quita.status).toBe(200);

        await page.reload();
        await expect(page.getByTestId("chips-celulas")).toContainText("CEL-A");
        await expect(page.getByTestId("chips-celulas")).not.toContainText("CEL-B");
        expect(await codigosEnLista(page)).toEqual(["E7-H1", "E7-H2", "E7-H5", "E7-H7"]);
        await expect(page.locator("#filtro-celula option", { hasText: "CEL-A" })).toHaveCount(1);
        expect((await page.locator("#filtro-celula option").allTextContents()).map((t) => t.trim())).not.toContain("CEL-B");
        // Y el detalle de una HDU de la célula retirada da acceso denegado.
        const h = await hduFixture(request);
        await page.goto(`${env.portalUrl}/hdu/${h["E7-H3"].id}`);
        await expect(page.getByTestId("acceso-denegado")).toBeVisible();
      } finally {
        await desactivarUsuario(request, adm, lider.id);
      }
    });
  });

  test.describe("con Certificaciones detenida", () => {
    let pila: PilaCaida;
    test.beforeAll(async () => {
      pila = await certificacionesCaida(true);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E7-F04#2] T05: LID1 ve avance y certificado en «No disponible»; las HDU siguen listadas y «HDU abiertas» conserva su valor", async ({ page, request }) => {
      const esperado = await api.get<{ contadores: { hduAbiertas: { datos: { valor: number } } } }>(request, "/v1/bandeja/lider", { token: await tokenE7("lid1") });
      await iniciarSesionUI(page, USUARIOS_E7.lid1.correo, CONTRASENA, pila.portalUrl);
      await expect(page.getByTestId("bandeja-lider")).toBeVisible({ timeout: 20_000 });
      await soloFixture(page);
      expect(await codigosEnLista(page)).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
      await expect(page.getByTestId("contador-hdu-abiertas")).toHaveText(String(esperado.body.contadores.hduAbiertas.datos.valor));
      await expect(page.getByTestId("estado-indisponible-certificados")).toContainText("No disponible");
      await expect(page.getByTestId("estado-indisponible-avance").first()).toContainText("No disponible");
      await expect(page.getByTestId("estado-indisponible-certificado").first()).toContainText("No disponible");
      await expect(page.getByTestId("lista-hdu-lider").locator("[data-testid^=celda-certificado-]")).toHaveCount(0);
      // Nunca se muestra 0/10 ni «—» (reservado para «no tiene certificado») por una fuente caída.
      await expect(page.getByTestId("lista-hdu-lider")).not.toContainText("0/10");
      // E4 (sección 6 del backlog E4): la columna aditiva «Bloqueo» usa «—» para una HDU sin bloqueo, así que ya no se busca «—» en toda la tabla:
      // se exige que cada una de las 6 filas diga «No disponible» en Avance y en Certificado.
      await expect(page.getByTestId("lista-hdu-lider").locator("[data-testid=estado-indisponible-avance]")).toHaveCount(6);
      await expect(page.getByTestId("lista-hdu-lider").locator("[data-testid=estado-indisponible-certificado]")).toHaveCount(6);
    });
  });
});
