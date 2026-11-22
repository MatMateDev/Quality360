import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { hoySantiago } from "../support/e4";
import { abrir, paginaDe, vigilarIndicadores } from "../support/e6ui";
import { celulas, csvDeIndicadores, fotoE6, instanteDe, restaurarE6, serieTresDias, snapshotEn, sprint, tkLocal, type FotoE6 } from "../support/e6run";
import { impedimentosCaidoEnIndicadores, type PilaE6 } from "../support/entornoE6";

/** E6-F04 · Tendencia y exportación (9 casos). */
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
});
test.beforeEach(async () => {
  await restaurarE6(foto);
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const yyyymmdd = () => hoySantiago().replace(/-/g, "");

async function descargar(page: Page, formato: "csv" | "pdf") {
  const evento = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("boton-exportar").click();
  await page.getByTestId(`boton-exportar-${formato}`).click();
  const d = await evento;
  const ruta = await d.path();
  return { nombre: d.suggestedFilename(), contenido: readFileSync(ruta) };
}

test.describe("E6-F04 · Tendencia y exportación", () => {
  test("[E6-F04#1] E6-F04-T01: QE1 abre Tendencia con CEL-A y SP-PROX: una serie de 3 puntos en orden de fecha (30, 30 y 40 %) y la tabla accesible lo repite", async ({ browser, request }) => {
    await serieTresDias(request);
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, `/qe/indicadores/tendencia?celula=${c["CEL-A"]}&sprint=${await sprint(request, "SP-PROX", "CEL-A")}`);
    await expect(page.getByTestId("grafica-tendencia")).toBeVisible();
    await expect(page.getByTestId("punto-tendencia")).toHaveCount(3);
    const filas = page.getByTestId("tabla-tendencia").locator("tbody tr");
    await expect(filas).toHaveCount(3);
    const textos = await filas.allInnerTexts();
    expect(textos[0]).toMatch(/30\s*%/);
    expect(textos[1]).toMatch(/30\s*%/);
    expect(textos[2]).toMatch(/40\s*%/);
    await expect(page.getByTestId("leyenda-tendencia").locator("li")).toHaveCount(1);
    await contexto.close();
  });

  test("[E6-F04#1] E6-F04-T02: sin filtros QE1 ve una serie por cada (célula, sprint) con snapshot, máximo 6, rotuladas «Célula · Sprint»", async ({ browser, request }) => {
    await serieTresDias(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/tendencia");
    await expect(page.getByTestId("grafica-tendencia")).toBeVisible();
    const g = await api.get<any>(request, "/v1/indicadores/tendencia", { token: await tkLocal("qe1") });
    const esperadas = g.body.series.length;
    expect(esperadas).toBeGreaterThanOrEqual(1);
    expect(esperadas).toBeLessThanOrEqual(6);
    const items = page.getByTestId("leyenda-tendencia").locator("li");
    await expect(items).toHaveCount(esperadas);
    for (const s of g.body.series) await expect(page.getByTestId("leyenda-tendencia")).toContainText(`${s.celula.nombre} · ${s.sprint.nombre}`);
    await contexto.close();
  });

  test("[E6-F04#2] E6-F04-T03: QE1 exporta el PDF de Cumplimiento: se descarga quality360-indicadores-cumplimiento-AAAAMMDD.pdf con contenido PDF", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores");
    await expect(page.getByTestId("indicador-totales")).toBeVisible();
    const d = await descargar(page, "pdf");
    expect(d.nombre).toBe(`quality360-indicadores-cumplimiento-${yyyymmdd()}.pdf`);
    expect(d.contenido.subarray(0, 4).toString()).toBe("%PDF");
    await contexto.close();
  });

  test("[E6-F04#2] E6-F04-T04: QE1 con el filtro CEL-A en Semáforo exporta CSV con el encabezado, el filtro «Célula CEL-A» y solo filas de CEL-A", async ({ browser, request }) => {
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, `/qe/indicadores/semaforo?celula=${c["CEL-A"]}`);
    await expect(page.getByTestId(`tarjeta-celula-${c["CEL-A"]}`)).toBeVisible();
    const d = await descargar(page, "csv");
    expect(d.nombre).toBe(`quality360-indicadores-semaforo-${yyyymmdd()}.csv`);
    const t = csvDeIndicadores(d.contenido.toString("utf8"));
    expect(t.encabezado.Filtros).toContain("Célula CEL-A");
    expect(t.encabezado.Reporte).toBe("Quality360 · Indicadores");
    expect(t.filas.length).toBeGreaterThan(0);
    for (const f of t.filas) expect(f[0]).toBe("CEL-A");
    await contexto.close();
  });

  test("[E6-F04#3] E6-F04-T05: sin snapshots la pestaña Tendencia dice «Aún no hay historial» sin gráfica ni valores", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/tendencia");
    await expect(page.getByTestId("aviso-sin-historial")).toContainText("Aún no hay historial");
    await expect(page.getByTestId("grafica-tendencia")).toHaveCount(0);
    await expect(page.getByTestId("tabla-tendencia")).toHaveCount(0);
    await expect(page.getByTestId("pestana-tendencia")).not.toContainText(/\d+\s*%/);
    await contexto.close();
  });

  test("[E6-F04#1] E6-F04-T06: con snapshots de los días 1 y 3 y sin el 2 la línea tiene un hueco y no pasa por un valor inventado", async ({ browser, request }) => {
    for (const d of [hoySantiago(-3), hoySantiago(-1)]) expect((await snapshotEn(instanteDe(d))).body.resultado).toBe("EXITOSA");
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, `/qe/indicadores/tendencia?celula=${c["CEL-A"]}&sprint=${await sprint(request, "SP-PROX", "CEL-A")}`);
    await expect(page.getByTestId("grafica-tendencia")).toBeVisible();
    await expect(page.getByTestId("punto-tendencia")).toHaveCount(2);
    await expect(page.getByTestId("grafica-tendencia").locator("polyline")).toHaveCount(0);
    await expect(page.getByTestId("tabla-tendencia").locator("tbody tr")).toHaveCount(2);
    await expect(page.getByTestId("resumen-tendencia")).toContainText(/sin snapshot/);
    await contexto.close();
  });

  test("[E6-F04#1] E6-F04-T07: con un solo snapshot se muestra un punto y «Aún hay un solo día de historial»", async ({ browser, request }) => {
    expect((await snapshotEn(instanteDe(hoySantiago(-1)))).body.resultado).toBe("EXITOSA");
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, `/qe/indicadores/tendencia?celula=${c["CEL-A"]}&sprint=${await sprint(request, "SP-PROX", "CEL-A")}`);
    await expect(page.getByTestId("punto-tendencia")).toHaveCount(1);
    await expect(page.getByTestId("aviso-un-solo-dia")).toContainText("Aún hay un solo día de historial");
    await contexto.close();
  });

  test("[E6-F04#2] E6-F04-T08: con Impedimentos detenido exportar el Semáforo muestra «No se pudo generar el reporte: hay datos no disponibles» y no descarga archivo", async ({ browser }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await impedimentosCaidoEnIndicadores(true);
      const { contexto, page } = await paginaDe(browser, "qe1", pila.portalUrl);
      let descargas = 0;
      page.on("download", () => (descargas += 1));
      await abrir(page, "/qe/indicadores/semaforo", pila.portalUrl);
      await page.getByTestId("boton-exportar").click();
      await page.getByTestId("boton-exportar-csv").click();
      await expect(page.getByTestId("estado-exportacion-error")).toContainText("No se pudo generar el reporte: hay datos no disponibles");
      expect(descargas).toBe(0);
      await contexto.close();
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-F04#2] E6-F04-T09: ANA1 y ADM1 ven acceso denegado, no existe boton-exportar y la exportación devuelve 403", async ({ browser, request }) => {
    for (const local of ["ana1", "adm1"]) {
      const { contexto, page } = await paginaDe(browser, local);
      const peticiones = vigilarIndicadores(page);
      await page.goto("/qe/indicadores");
      await expect(page.getByTestId("acceso-denegado"), local).toBeVisible();
      await expect(page.getByTestId("boton-exportar")).toHaveCount(0);
      expect(peticiones.filter((p) => p.status === 200), local).toEqual([]);
      await contexto.close();
      const r = await api.get(request, "/v1/indicadores/exportacion?vista=cumplimiento&formato=csv", { token: await tkLocal(local) });
      expect(r.status, local).toBe(403);
    }
  });
});
