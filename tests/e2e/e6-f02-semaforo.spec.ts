import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { hdu, imps, reiniciarFixtureE4 } from "../support/e4";
import { abrir, paginaDe, vigilarIndicadores } from "../support/e6ui";
import { celulas, fotoE6, restaurarE6, tkLocal, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnIndicadores, impedimentosCaidoEnIndicadores, type PilaE6 } from "../support/entornoE6";
import { env } from "../support/env";

/** E6-F02 · Semáforo por célula y drill-down (12 casos). */
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const tarjeta = (page: Page, id: string) => page.getByTestId(`tarjeta-celula-${id}`);
const colores = async (page: Page, ids: string[]) => {
  const salida: string[] = [];
  for (const id of ids) salida.push((await tarjeta(page, id).getAttribute("data-color")) ?? "");
  return salida;
};

async function resolverUi(page: Page, hduId: string, impId: string) {
  await page.goto(`${env.portalUrl}/hdu/${hduId}`);
  await page.getByTestId(`boton-resolver-${impId}`).click();
  await page.getByTestId("campo-comentario-impedimento").fill("Resuelto desde la prueba E6");
  await page.getByTestId("dialogo-resolver").getByRole("button", { name: "Confirmar resolución" }).click();
  await expect(page.getByTestId(`estado-impedimento-${impId}`)).toHaveAttribute("data-estado", "RESUELTO");
}

async function reabrirUi(page: Page, hduId: string, impId: string) {
  await page.goto(`${env.portalUrl}/hdu/${hduId}`);
  await page.getByTestId(`boton-reabrir-${impId}`).click();
  await page.getByTestId("campo-motivo-reabrir").fill("Volvió a ocurrir en la prueba E6");
  await page.getByTestId("dialogo-reabrir").getByRole("button", { name: "Confirmar reapertura" }).click();
  await expect(page.getByTestId(`estado-impedimento-${impId}`)).toHaveAttribute("data-estado", "ABIERTO");
}

test.describe("E6-F02 · Semáforo", () => {
  test("[E6-F02#1] E6-F02-T01: QE1 ve CEL-A rojo, CEL-B rojo y CEL-C verde, cada tarjeta con su texto y data-color", async ({ browser, request }) => {
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/semaforo");
    await expect(tarjeta(page, c["CEL-A"])).toBeVisible();
    expect(await colores(page, [c["CEL-A"], c["CEL-B"], c["CEL-C"]])).toEqual(["ROJO", "ROJO", "VERDE"]);
    await expect(tarjeta(page, c["CEL-A"])).toContainText("Rojo");
    await expect(tarjeta(page, c["CEL-B"])).toContainText("Rojo");
    await expect(tarjeta(page, c["CEL-C"])).toContainText("Verde");
    await contexto.close();
  });

  test("[E6-F02#1] E6-F02-T02: QE2 ve CEL-A verde (solo H7 cerrada), CEL-B amarillo y CEL-C verde", async ({ browser, request }) => {
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "qe2");
    await abrir(page, "/qe/indicadores/semaforo");
    await expect(tarjeta(page, c["CEL-A"])).toBeVisible();
    expect(await colores(page, [c["CEL-A"], c["CEL-B"], c["CEL-C"]])).toEqual(["VERDE", "AMARILLO", "VERDE"]);
    await expect(tarjeta(page, c["CEL-B"])).toContainText("Amarillo");
    await contexto.close();
  });

  test("[E6-F02#1] E6-F02-T03: LID1 ve CEL-A y CEL-B en rojo sin CEL-C; AUD1 ve rojo, rojo y verde", async ({ browser, request }) => {
    const c = await celulas(request);
    const l = await paginaDe(browser, "lid1");
    await abrir(l.page, "/lider/indicadores/semaforo");
    await expect(tarjeta(l.page, c["CEL-A"])).toBeVisible();
    expect(await colores(l.page, [c["CEL-A"], c["CEL-B"]])).toEqual(["ROJO", "ROJO"]);
    await expect(tarjeta(l.page, c["CEL-C"])).toHaveCount(0);
    await l.contexto.close();
    const a = await paginaDe(browser, "aud1");
    await abrir(a.page, "/auditor/indicadores/semaforo");
    await expect(tarjeta(a.page, c["CEL-A"])).toBeVisible();
    expect(await colores(a.page, [c["CEL-A"], c["CEL-B"], c["CEL-C"]])).toEqual(["ROJO", "ROJO", "VERDE"]);
    await a.contexto.close();
  });

  test("[E6-F02#2] E6-F02-T04: QE1 selecciona CEL-A y ve H1 y H5 con RIESGO_ALTO, sin H2 ni otras células", async ({ browser, request }) => {
    const [c, h] = [await celulas(request), await hdu(request)];
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/semaforo");
    await page.getByTestId(`boton-ver-detalle-${c["CEL-A"]}`).click();
    const lista = page.getByTestId("lista-drilldown");
    await expect(lista).toBeVisible();
    await expect(lista.locator("tbody tr")).toHaveCount(2);
    for (const id of [h.H1.id, h.H5.id]) {
      await expect(page.getByTestId(`fila-drilldown-${id}`)).toBeVisible();
      await expect(page.getByTestId(`fila-drilldown-${id}`).getByTestId("chip-motivo-RIESGO_ALTO")).toBeVisible();
    }
    for (const id of [h.H2.id, h.H6.id, h.H8.id]) await expect(page.getByTestId(`fila-drilldown-${id}`)).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F02#2] E6-F02-T05: QE1 selecciona CEL-B: una fila, H6 con IMPEDIMENTO_ESCALADO y riesgo MEDIO; no aparece H3", async ({ browser, request }) => {
    const [c, h] = [await celulas(request), await hdu(request)];
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/semaforo");
    await page.getByTestId(`boton-ver-detalle-${c["CEL-B"]}`).click();
    const lista = page.getByTestId("lista-drilldown");
    await expect(lista.locator("tbody tr")).toHaveCount(1);
    const fila = page.getByTestId(`fila-drilldown-${h.H6.id}`);
    await expect(fila.getByTestId("chip-motivo-IMPEDIMENTO_ESCALADO")).toBeVisible();
    await expect(fila).toContainText(/Medio/);
    await expect(page.getByTestId(`fila-drilldown-${h.H3.id}`)).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F02#2] E6-F02-T06: QE2 en CEL-B ve H3 con RIESGO_MEDIO e IMPEDIMENTO_ABIERTO; en CEL-C «Sin HDU con riesgo ni impedimentos»", async ({ browser, request }) => {
    const [c, h] = [await celulas(request), await hdu(request)];
    const { contexto, page } = await paginaDe(browser, "qe2");
    await abrir(page, "/qe/indicadores/semaforo");
    await page.getByTestId(`boton-ver-detalle-${c["CEL-B"]}`).click();
    const fila = page.getByTestId(`fila-drilldown-${h.H3.id}`);
    await expect(fila.getByTestId("chip-motivo-RIESGO_MEDIO")).toBeVisible();
    await expect(fila.getByTestId("chip-motivo-IMPEDIMENTO_ABIERTO")).toBeVisible();
    await page.getByTestId(`boton-ver-detalle-${c["CEL-C"]}`).click();
    await expect(page.getByTestId("estado-vacio-drilldown")).toContainText("Sin HDU con riesgo ni impedimentos");
    await contexto.close();
  });

  test("[E6-F02#3] E6-F02-T07: QE2 resuelve I1 en el detalle de H3 y CEL-B pasa a verde; al reabrirlo vuelve a amarillo", async ({ browser, request }) => {
    const [c, h, i] = [await celulas(request), await hdu(request), await imps(request)];
    try {
      const { contexto, page } = await paginaDe(browser, "qe2");
      await abrir(page, "/qe/indicadores/semaforo");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "AMARILLO");
      await resolverUi(page, h.H3.id, i.I1.id);
      await abrir(page, "/qe/indicadores/semaforo");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "VERDE");
      await reabrirUi(page, h.H3.id, i.I1.id);
      await abrir(page, "/qe/indicadores/semaforo");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "AMARILLO");
      await contexto.close();
    } finally {
      await reiniciarFixtureE4();
    }
  });

  test("[E6-F02#3] E6-F02-T08: QE1 resuelve I3: CEL-B queda amarillo; al reabrirlo sigue amarillo (no rojo) con motivo IMPEDIMENTO_ABIERTO", async ({ browser, request }) => {
    const [c, h, i] = [await celulas(request), await hdu(request), await imps(request)];
    try {
      const { contexto, page } = await paginaDe(browser, "qe1");
      await abrir(page, "/qe/indicadores/semaforo");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "ROJO");
      await resolverUi(page, h.H6.id, i.I3.id);
      await abrir(page, "/qe/indicadores/semaforo");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "AMARILLO");
      await reabrirUi(page, h.H6.id, i.I3.id);
      await abrir(page, "/qe/indicadores/semaforo");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "AMARILLO");
      await page.getByTestId(`boton-ver-detalle-${c["CEL-B"]}`).click();
      await expect(page.getByTestId(`fila-drilldown-${h.H6.id}`).getByTestId("chip-motivo-IMPEDIMENTO_ABIERTO")).toBeVisible();
      await contexto.close();
    } finally {
      await reiniciarFixtureE4();
    }
  });

  test("[E6-F02#1] E6-F02-T09: con Impedimentos detenido las 3 tarjetas dicen «No disponible» y ninguna es verde; el resto del portal carga", async ({ browser, request }) => {
    const c = await celulas(request);
    let pila: PilaE6 | undefined;
    try {
      pila = await impedimentosCaidoEnIndicadores(true);
      const { contexto, page } = await paginaDe(browser, "qe1", pila.portalUrl);
      await abrir(page, "/qe/indicadores/semaforo", pila.portalUrl);
      await expect(tarjeta(page, c["CEL-A"])).toBeVisible();
      for (const n of ["CEL-A", "CEL-B", "CEL-C"]) {
        await expect(tarjeta(page, c[n]), n).toContainText("No disponible");
        await expect(tarjeta(page, c[n]), n).not.toHaveAttribute("data-color", "VERDE");
      }
      await expect(page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Bandeja" })).toBeVisible();
      await contexto.close();
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-F02#1] E6-F02-T10: con Certificaciones detenido CEL-A rojo con «cálculo parcial», CEL-B rojo y CEL-C «No disponible» no verde", async ({ browser, request }) => {
    const c = await celulas(request);
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnIndicadores(true);
      const { contexto, page } = await paginaDe(browser, "qe1", pila.portalUrl);
      await abrir(page, "/qe/indicadores/semaforo", pila.portalUrl);
      await expect(tarjeta(page, c["CEL-A"])).toBeVisible();
      await expect(tarjeta(page, c["CEL-A"])).toHaveAttribute("data-color", "ROJO");
      await expect(tarjeta(page, c["CEL-A"]).getByTestId("aviso-calculo-parcial")).toContainText("Cálculo parcial");
      await expect(tarjeta(page, c["CEL-B"])).toHaveAttribute("data-color", "ROJO");
      await expect(tarjeta(page, c["CEL-C"])).toHaveAttribute("data-color", "NO_DISPONIBLE");
      await expect(tarjeta(page, c["CEL-C"])).toContainText("No disponible");
      await contexto.close();
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-F02#1] E6-F02-T11: LID3 con CEL-D (sin HDU) ve la tarjeta gris «Sin HDU», no verde", async ({ browser, request }) => {
    const c = await celulas(request);
    const { contexto, page } = await paginaDe(browser, "lid3");
    await abrir(page, "/lider/indicadores/semaforo");
    await expect(tarjeta(page, c["CEL-D"])).toBeVisible();
    await expect(tarjeta(page, c["CEL-D"])).toHaveAttribute("data-color", "SIN_HDU");
    await expect(tarjeta(page, c["CEL-D"])).toContainText("Sin HDU");
    await expect(tarjeta(page, c["CEL-D"])).not.toHaveAttribute("data-color", "VERDE");
    await contexto.close();
  });

  test("[E6-F02#1] E6-F02-T12: ANA1 y ADM1 ven acceso denegado y la petición de semáforo devuelve 403", async ({ browser, request }) => {
    for (const local of ["ana1", "adm1"]) {
      const { contexto, page } = await paginaDe(browser, local);
      const peticiones = vigilarIndicadores(page);
      await page.goto("/qe/indicadores/semaforo");
      await expect(page.getByTestId("acceso-denegado"), local).toBeVisible();
      await expect(page.getByTestId("acceso-denegado").getByRole("link", { name: "Ir a mi bandeja" })).toBeVisible();
      expect(peticiones.filter((p) => p.status === 200), local).toEqual([]);
      await contexto.close();
      const r = await api.get(request, "/v1/indicadores/semaforo", { token: await tkLocal(local) });
      expect(r.status, local).toBe(403);
    }
  });
});
