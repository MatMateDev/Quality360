import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { api } from "../support/api";
import { crearHduAsignadaAAna } from "../support/checklist";
import { certificacionesCaida, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { CONTRASENA, USUARIOS_E7, contarOrganizacion, hduFixture, marcarConArchivo, tokenE7, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";

const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

async function leerCsv(descarga: Download) {
  const bytes = readFileSync(await descarga.path());
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const lineas = bytes.subarray(bom ? 3 : 0).toString("utf8").split(/\r?\n/).filter(Boolean);
  return { bom, encabezado: lineas[0].split(";"), filas: lineas.slice(1).map((l) => l.split(";")), nombre: descarga.suggestedFilename() };
}

/** Todos los botones y controles de escritura que el Auditor nunca debe ver (D32, D39). */
async function verificarSoloLectura(page: Page, contexto: string) {
  await expect(page.locator("form"), `${contexto}: form`).toHaveCount(0);
  await expect(page.locator("button[type=submit]"), `${contexto}: submit`).toHaveCount(0);
  for (const nombre of [/^Marcar/, /Desmarcar/, /^Aprobar/, /^Rechazar/, /Asignar/, /Reasignar/, /Cambiar estado/, /Generar certificado/, /Nuevo usuario/, /Nueva HDU/, /^Editar/, /^Crear/, /^Guardar/]) {
    await expect(page.getByRole("button", { name: nombre }), `${contexto}: ${nombre}`).toHaveCount(0);
    await expect(page.getByRole("link", { name: nombre }), `${contexto}: enlace ${nombre}`).toHaveCount(0);
  }
  await expect(page.locator("[data-testid^=boton-marcar-], [data-testid^=boton-aprobar-], [data-testid^=boton-rechazar-], [data-testid^=boton-desmarcar-], [data-testid=boton-generar-certificado]")).toHaveCount(0);
}

test.describe("E7-F06 · Bandeja del Auditor", () => {
  test.describe("AUD1", () => {
    test.use({ storageState: estadoSesion("aud1") });

    test("[E7-F06#1] T01: AUD1 ve los contadores globales y la pestaña HDU lista E7-H1 a E7-H8", async ({ page, request }) => {
      const bd = await contarOrganizacion();
      const api1 = await api.get<{ contadores: Record<string, { datos: { valor: number } }> }>(request, "/v1/bandeja/auditor", { token: await tokenE7("aud1") });
      const c = api1.body.contadores;
      await page.goto(`${env.portalUrl}/auditor`);
      await expect(page.getByTestId("bandeja-auditor")).toBeVisible();
      await expect(page.getByTestId("contador-hdu-total")).toHaveText(String(bd.hduTotal));
      await expect(page.getByTestId("contador-certificados")).toHaveText(String(c.certificados.datos.valor));
      await expect(page.getByTestId("contador-eventos-7d")).toHaveText(String(c.eventos7d.datos.valor));
      await expect(page.getByTestId("contador-cambios-usuarios-7d")).toHaveText(String(c.cambiosUsuarios7d.datos.valor));
      await expect(page.getByTestId("aviso-solo-lectura")).toContainText("consultar y exportar");
      for (const pestana of ["pestana-hdu", "pestana-certificados", "pestana-bitacora", "pestana-auditoria-usuarios"]) await expect(page.getByTestId(pestana)).toBeVisible();

      await page.locator("#filtro-busqueda").fill("E7-H");
      const filas = page.getByTestId("lista-auditor-hdu").locator("tbody tr");
      await expect(filas).toHaveCount(8);
      const codigos = (await filas.evaluateAll((trs) => trs.map((tr) => (tr.querySelector("td")?.textContent ?? "").trim()))).sort();
      expect(codigos).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H4", "E7-H5", "E7-H6", "E7-H7", "E7-H8"]);
    });

    test("[E7-F06#1] T02: la pestaña Certificados lista F7 y F8 con huella SHA-256 y validez; «Descargar PDF» entrega el PDF de F7", async ({ page, request }) => {
      const h = await hduFixture(request);
      const token = await tokenE7("aud1");
      const folios: Record<string, string> = {};
      for (const codigo of ["E7-H7", "E7-H8"] as const) {
        folios[codigo] = (await api.get<{ certificado: { folio: string; huellaSha256: string } }>(request, `/v1/hdu/${h[codigo].id}/certificado`, { token })).body.certificado.folio;
      }
      await page.goto(`${env.portalUrl}/auditor/certificados`);
      await expect(page.getByTestId("lista-certificados")).toBeVisible();
      const filaF7 = page.getByTestId("lista-certificados").locator("tbody tr").filter({ hasText: folios["E7-H7"] });
      const filaF8 = page.getByTestId("lista-certificados").locator("tbody tr").filter({ hasText: folios["E7-H8"] });
      for (const fila of [filaF7, filaF8]) {
        await expect(fila).toHaveCount(1);
        await expect(fila.getByTestId("texto-huella")).toHaveText(/^[0-9a-f]{64}$/);
        await expect(fila).toContainText("Válido");
      }
      await expect(filaF7).toContainText("E7-H7");
      await expect(page.getByTestId(`enlace-verificar-${folios["E7-H7"]}`)).toHaveAttribute("target", "_blank");
      await expect(page.getByTestId(`enlace-verificar-${folios["E7-H7"]}`)).toHaveAttribute("href", new RegExp(`/verificar/${folios["E7-H7"]}$`));
      await expect(page.getByTestId(`enlace-verificar-${folios["E7-H7"]}`)).toHaveAttribute("rel", /noopener/);
      const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`boton-descargar-pdf-${folios["E7-H7"]}`).click()]);
      expect(descarga.suggestedFilename()).toBe(`${folios["E7-H7"]}.pdf`);
      expect(readFileSync(await descarga.path()).subarray(0, 5).toString()).toBe("%PDF-");
    });

    test("[E7-F06#1] T03: el detalle de E7-H7 muestra los 10 entregables, el historial de estado y asignación, la bitácora y el certificado", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H7"].id}`);
      await expect(page.getByTestId("panel-checklist")).toBeVisible();
      await expect(page.locator("[data-testid^=entregable-]")).toHaveCount(10);
      await expect(page.getByTestId("checklist-completados")).toContainText("10");
      await expect(page.getByTestId("certificado-folio")).toContainText("Q360-");
      await expect(page.getByTestId("bitacora-checklist")).toBeVisible();
      await expect(page.getByTestId("historial-item-0")).toBeVisible();
      await expect(page.getByTestId("aviso-solo-lectura")).toBeVisible();
    });

    test("[E7-F06#1] T03b: el Auditor descarga una evidencia en archivo con URL firmada desde el detalle", async ({ page, request }) => {
      // El fixture de E7-H7 no trae una evidencia en archivo: se crea una HDU propia con un PDF como evidencia.
      const equipo = await crearHduAsignadaAAna(request, "E7-F06-EVID");
      const marca = await marcarConArchivo(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
      expect(marca.status).toBe(200);
      await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
      const boton = page.getByTestId("evidencia-PLAN_PRUEBAS");
      await expect(boton).toContainText("Descargar");
      const [descarga] = await Promise.all([page.waitForEvent("download"), boton.click()]);
      expect(readFileSync(await descarga.path()).subarray(0, 4).toString()).toBe("%PDF");
    });

    test("[E7-F06#1] T04: la pestaña Auditoría de usuarios lista cambios con actor, operación y antes/después, y ninguna fila contiene password ni token", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor/auditoria-usuarios`);
      const lista = page.getByTestId("lista-auditoria-usuarios");
      await expect(lista).toBeVisible();
      await expect(lista.locator("tbody tr").first()).toBeVisible();
      expect(await lista.locator("tbody tr").count()).toBeGreaterThan(5);
      await expect(lista).toContainText("ADM1 Administrador");
      const texto = (await lista.innerText()).toLowerCase();
      for (const prohibido of ["password", "contraseña", "secret"]) expect(texto, prohibido).not.toContain(prohibido);
      expect(texto).not.toMatch(/\btoken\b/);
      expect(texto).toMatch(/(rol|células): .* → .*/);
      // También a lo largo de la paginación (siguiente página).
      await page.getByTestId("pagina-siguiente-auditoria-usuarios").click();
      const texto2 = (await page.getByTestId("lista-auditoria-usuarios").innerText()).toLowerCase();
      for (const prohibido of ["password", "secret"]) expect(texto2).not.toContain(prohibido);
    });

    test("[E7-F06#1] T04b: un cambio de células se muestra con las células (no con «…»)", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor/auditoria-usuarios?operacion=ASIGNAR_CELULAS_LIDER`);
      const lista = page.getByTestId("lista-auditoria-usuarios");
      await expect(lista.locator("tbody tr").first()).toBeVisible();
      const texto = await lista.locator("tbody tr").first().innerText();
      expect(texto, "celda de cambios").not.toMatch(/Células: … →/);
      expect(texto).toMatch(/CEL-|sin células/);
    });

    test("[E7-F06#2] T05: en HDU filtra célula = CEL-A y «Exportar CSV» descarga el CSV con encabezado y las filas filtradas (E7-H1, H2, H5, H7)", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor/hdu`);
      await page.locator("#filtro-celula").selectOption({ label: "CEL-A" });
      await expect(page).toHaveURL(/celula=/);
      await expect(page.getByTestId("ayuda-exportar")).toContainText("Se exportarán");
      const total = Number((await page.getByTestId("ayuda-exportar").innerText()).match(/(\d+) filas/)?.[1]);
      const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId("boton-exportar-csv").click()]);
      const csv = await leerCsv(descarga);
      expect(csv.bom).toBe(true);
      expect(csv.nombre).toMatch(/^quality360-hdu-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(csv.encabezado).toEqual(["Código", "Título", "Célula", "Sprint", "Estado", "QE", "Analista", "Avance", "Certificado", "Actualizada"]);
      expect(csv.filas).toHaveLength(total);
      expect(csv.filas.every((f) => f[2] === "CEL-A")).toBe(true);
      expect(csv.filas.map((f) => f[0]).filter((c) => c.startsWith("E7-H")).sort()).toEqual(["E7-H1", "E7-H2", "E7-H5", "E7-H7"]);
      await expect(page.getByTestId("estado-exportacion-ok")).toContainText(`${total} filas`);
    });

    test("[E7-F06#2] T06: en Bitácora filtrada por una HDU sin eventos se informa «No hay registros con esos filtros» y «Exportar CSV» queda deshabilitado", async ({ page, request }) => {
      const h = await hduFixture(request);
      await page.goto(`${env.portalUrl}/auditor/bitacora?hdu=${h["E7-H3"].id}`);
      await expect(page.getByText("No hay registros con esos filtros").first()).toBeVisible();
      await expect(page.getByTestId("boton-exportar-csv")).toBeDisabled();
      await expect(page.getByTestId("lista-bitacora")).toHaveCount(0);
      // Con una HDU que sí tiene eventos el botón se habilita.
      await page.goto(`${env.portalUrl}/auditor/bitacora?hdu=${h["E7-H2"].id}`);
      await expect(page.getByTestId("lista-bitacora")).toBeVisible();
      await expect(page.getByTestId("boton-exportar-csv")).toBeEnabled();
    });

    test("[E7-F06#2] T06b: el filtro HDU de la Bitácora permite elegir cualquier HDU con eventos (E7-H2), no solo las de la página cargada", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor/bitacora`);
      await expect(page.getByTestId("lista-bitacora")).toBeVisible();
      const opciones = await page.locator("#filtro-hdu option").allTextContents();
      expect(opciones.map((o) => o.trim()), "opciones del filtro HDU").toContain("E7-H2");
    });

    test("[E7-F06#1] T06c: la Bitácora se puede recorrer completa (cada página responde y muestra filas)", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor/bitacora`);
      await expect(page.getByTestId("lista-bitacora")).toBeVisible();
      const total = Number((await page.getByTestId("total-bitacora").innerText()).match(/(\d+)/)?.[1]);
      const paginas = Math.ceil(total / 25);
      for (let pagina = 2; pagina <= Math.min(paginas, 20); pagina += 1) {
        await page.getByTestId("pagina-siguiente-bitacora").click({ timeout: 8_000 });
        await expect(page).toHaveURL(new RegExp(`pagina=${pagina}`));
        await expect(page.getByTestId("lista-bitacora"), `página ${pagina}`).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId("lista-bitacora").locator("tbody tr").first(), `filas de la página ${pagina}`).toBeVisible({ timeout: 10_000 });
      }
    });

    test("[E7-F06#3] T07: las 4 pestañas y el detalle de E7-H1 no tienen botones ni formularios de escritura", async ({ page, request }) => {
      const h = await hduFixture(request);
      for (const ruta of ["/auditor", "/auditor/certificados", "/auditor/bitacora", "/auditor/auditoria-usuarios"]) {
        await page.goto(`${env.portalUrl}${ruta}`);
        await expect(page.getByTestId("bandeja-auditor")).toBeVisible();
        await expect(page.getByTestId("boton-exportar-csv")).toBeVisible();
        await verificarSoloLectura(page, ruta);
      }
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H1"].id}`);
      await expect(page.getByTestId("panel-checklist")).toBeVisible();
      await verificarSoloLectura(page, "detalle E7-H1");
      await expect(page.locator("main select, main input:not([type=search]):not([type=date])")).toHaveCount(0);
    });

    test("[E7-F06#3] T09: AUD1 recibe acceso denegado en /qe/aprobaciones, /qa/hdu, /admin/usuarios y /lider", async ({ page }) => {
      for (const ruta of ["/qe/aprobaciones", "/qa/hdu", "/admin/usuarios", "/lider"]) {
        await page.goto(`${env.portalUrl}${ruta}`);
        await expect(page.getByTestId("acceso-denegado"), ruta).toContainText("No tienes acceso a esta sección");
        expect(new URL(page.url()).pathname).toBe(ruta);
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

    test("[E7-F06#3] T08: Certificados y Bitácora dicen «No disponible» con «Reintentar»; HDU y Auditoría de usuarios cargan", async ({ page }) => {
      await iniciarSesionUI(page, USUARIOS_E7.aud1.correo, CONTRASENA, pila.portalUrl);
      await expect(page.getByTestId("bandeja-auditor")).toBeVisible({ timeout: 20_000 });
      // Contadores: los de Certificaciones indisponibles, los demás no.
      await expect(page.getByTestId("estado-indisponible-certificados")).toContainText("No disponible");
      await expect(page.getByTestId("estado-indisponible-eventos-7d")).toContainText("No disponible");
      await expect(page.getByTestId("contador-hdu-total")).toBeVisible();
      await expect(page.getByTestId("contador-cambios-usuarios-7d")).toBeVisible();
      // La pestaña HDU (índice) carga: avance y certificado vienen de Certificaciones, pero la lista se mantiene.
      await expect(page.getByTestId("lista-auditor-hdu").locator("tbody tr").first()).toBeVisible();

      const base = pila.portalUrl!;
      await page.getByTestId("pestana-certificados").click();
      await expect(page).toHaveURL(/\/auditor\/certificados/);
      await expect(page.getByTestId("estado-indisponible-certificados-lista").or(page.getByText("No disponible").first())).toBeVisible();
      await expect(page.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
      await expect(page.getByTestId("boton-exportar-csv")).toBeDisabled();

      await page.goto(`${base}/auditor/bitacora`);
      await expect(page.getByText("No disponible").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
      await expect(page.getByTestId("lista-bitacora")).toHaveCount(0);

      await page.goto(`${base}/auditor/auditoria-usuarios`);
      await expect(page.getByTestId("lista-auditoria-usuarios").locator("tbody tr").first()).toBeVisible();
      await expect(page.getByTestId("boton-exportar-csv")).toBeEnabled();
    });
  });
});
