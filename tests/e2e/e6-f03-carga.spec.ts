import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { hdu } from "../support/e4";
import { abrir, paginaDe, vigilarIndicadores } from "../support/e6ui";
import { fotoE6, idLocal, restaurarE6, tkLocal, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnIndicadores, type PilaE6 } from "../support/entornoE6";

/** E6-F03 · Carga por analista y umbral (12 casos). */
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
});
test.beforeEach(async () => {
  await restaurarE6(foto);
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const fila = (page: Page, id: string) => page.getByTestId(`fila-analista-${id}`);
const celdaNum = async (page: Page, id: string, etiqueta: string) => Number((await fila(page, id).locator(`td[data-label="${etiqueta}"]`).innerText()).replace(/\D/g, ""));
const fijarApi = async (request: any, local: string, valor: number) => api.put(request, "/v1/indicadores/umbral-carga", { token: await tkLocal(local), body: { valor } });
const guardarUmbral = async (page: Page, texto: string) => {
  await page.getByTestId("campo-umbral").fill(texto);
  await page.getByTestId("boton-guardar-umbral").click();
};

test.describe("E6-F03 · Carga", () => {
  test("[E6-F03#1] E6-F03-T01: QE1 ve ANA1 con 2 activas (2 en ejecución, 55 %), ANA2 con 2 activas (1 en ejecución, 1 pendiente de cierre, 55 %), sin asignar 1 y umbral 5 por defecto, sin sobrecarga", async ({ browser, request }) => {
    const [a1, a2] = [await idLocal(request, "ana1"), await idLocal(request, "ana2")];
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/carga");
    await expect(fila(page, a1)).toBeVisible();
    expect(await celdaNum(page, a1, "Activas")).toBe(2);
    expect(await celdaNum(page, a1, "En ejecución")).toBe(2);
    await expect(fila(page, a1).locator('td[data-label="Cumplimiento"]')).toContainText(/55\s*%/);
    expect(await celdaNum(page, a2, "Activas")).toBe(2);
    expect(await celdaNum(page, a2, "En ejecución")).toBe(1);
    expect(await celdaNum(page, a2, "Pendiente de cierre")).toBe(1);
    await expect(fila(page, a2).locator('td[data-label="Cumplimiento"]')).toContainText(/55\s*%/);
    const sin = page.getByTestId("fila-analista-sin-asignar");
    await expect(sin).toContainText("Sin analista asignado");
    expect(Number((await sin.locator('td[data-label="Activas"]').innerText()).replace(/\D/g, ""))).toBe(1);
    await expect(page.getByTestId("campo-umbral")).toHaveValue("5");
    await expect(page.getByTestId("insignia-umbral-defecto")).toContainText("Valor por defecto");
    await expect(page.getByTestId("insignia-sobrecarga")).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F03#1] E6-F03-T02: QE2 ve ANA3 con 2 activas (1 pendiente, 1 en diseño), 1 cerrada y 33 %; no ve a ANA1 ni a ANA2", async ({ browser, request }) => {
    const [a1, a2, a3] = [await idLocal(request, "ana1"), await idLocal(request, "ana2"), await idLocal(request, "ana3")];
    const { contexto, page } = await paginaDe(browser, "qe2");
    await abrir(page, "/qe/indicadores/carga");
    await expect(fila(page, a3)).toBeVisible();
    expect([await celdaNum(page, a3, "Activas"), await celdaNum(page, a3, "Pendiente"), await celdaNum(page, a3, "Diseño de pruebas"), await celdaNum(page, a3, "Cerrada")]).toEqual([2, 1, 1, 1]);
    await expect(fila(page, a3).locator('td[data-label="Cumplimiento"]')).toContainText(/33\s*%/);
    await expect(fila(page, a1)).toHaveCount(0);
    await expect(fila(page, a2)).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F03#2] E6-F03-T03: QE1 fija el umbral en 1: ANA1 y ANA2 quedan «Sobrecargado» con data-sobrecarga=true; «Sin analista asignado» no se marca", async ({ browser, request }) => {
    const [a1, a2] = [await idLocal(request, "ana1"), await idLocal(request, "ana2")];
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/carga");
    await guardarUmbral(page, "1");
    await expect(page.getByTestId("mensaje-exito-umbral")).toContainText("Umbral guardado");
    for (const id of [a1, a2]) {
      await expect(fila(page, id)).toHaveAttribute("data-sobrecarga", "true");
      await expect(fila(page, id)).toContainText("Sobrecargado");
    }
    await expect(page.getByTestId("fila-analista-sin-asignar")).not.toContainText("Sobrecargado");
    await expect(page.getByTestId("fila-analista-sin-asignar")).not.toHaveAttribute("data-sobrecarga", "true");
    await contexto.close();
  });

  test("[E6-F03#2] E6-F03-T04: con umbral 2 ninguna fila queda sobrecargada; con 1 de nuevo se marcan", async ({ browser, request }) => {
    const a1 = await idLocal(request, "ana1");
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/carga");
    await guardarUmbral(page, "2");
    await expect(page.getByTestId("mensaje-exito-umbral")).toContainText("2");
    await expect(fila(page, a1)).toHaveAttribute("data-sobrecarga", "false");
    await expect(page.getByTestId("insignia-sobrecarga")).toHaveCount(0);
    await guardarUmbral(page, "1");
    await expect(fila(page, a1)).toHaveAttribute("data-sobrecarga", "true");
    await contexto.close();
  });

  test("[E6-F03#3] E6-F03-T05: QE2 con ANA4 supervisada ve su fila con ceros, «Sin HDU asignadas» y cumplimiento «—», sin estilo de error; ANA3 no cambia", async ({ browser, request }) => {
    const [a3, a4, qe2] = [await idLocal(request, "ana3"), await idLocal(request, "ana4"), await idLocal(request, "qe2")];
    const s = await api.put(request, `/v1/analistas/${a4}/supervisor`, { token: await tkLocal("adm1"), body: { qeId: qe2, motivo: "Prueba E6-F03-T05" } });
    expect(s.status).toBe(200);
    const { contexto, page } = await paginaDe(browser, "qe2");
    await abrir(page, "/qe/indicadores/carga");
    await expect(fila(page, a4)).toBeVisible();
    await expect(fila(page, a4)).toContainText("Sin HDU asignadas");
    expect(await celdaNum(page, a4, "Activas")).toBe(0);
    await expect(fila(page, a4).locator('td[data-label="Cumplimiento"]')).toHaveText("—");
    await expect(fila(page, a4)).toHaveAttribute("data-sobrecarga", "false");
    await expect(fila(page, a4).locator('[role="alert"]')).toHaveCount(0);
    expect(await celdaNum(page, a3, "Activas")).toBe(2);
    await contexto.close();
  });

  test("[E6-F03#2] E6-F03-T06: valores 0, 51, 2.5, «abc» y vacío muestran su mensaje y no se guardan; 50 se guarda", async ({ browser, request }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/carga");
    const casos: Array<[string, string]> = [
      ["0", "El umbral debe estar entre 1 y 50"],
      ["51", "El umbral debe estar entre 1 y 50"],
      ["2.5", "Ingresa un número entero"],
      ["abc", "Ingresa un número entero"],
      ["", "Ingresa un número entero"],
    ];
    for (const [v, mensaje] of casos) {
      await guardarUmbral(page, v);
      await expect(page.getByTestId("error-umbral"), `«${v}»`).toHaveText(mensaje);
    }
    const intacto = await api.get<any>(request, "/v1/indicadores/umbral-carga", { token: await tkLocal("qe1") });
    expect(intacto.body).toMatchObject({ valor: 5, porDefecto: true });
    await guardarUmbral(page, "50");
    await expect(page.getByTestId("mensaje-exito-umbral")).toContainText("50");
    await expect(page.getByTestId("campo-umbral")).toHaveValue("50");
    await expect(page.getByTestId("error-umbral")).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F03#2] E6-F03-T07: LID1 con el umbral de QE1 en 1 ve el grupo de QE1 con ANA1 sobrecargada y ANA2 con 1 de 1; no hay campo ni botón de umbral", async ({ browser, request }) => {
    expect((await fijarApi(request, "qe1", 1)).status).toBe(200);
    const [a1, a2, qe1] = [await idLocal(request, "ana1"), await idLocal(request, "ana2"), await idLocal(request, "qe1")];
    const { contexto, page } = await paginaDe(browser, "lid1");
    await abrir(page, "/lider/indicadores/carga");
    const grupo = page.getByTestId(`grupo-qe-${qe1}`);
    await expect(grupo).toBeVisible();
    await expect(grupo).toContainText("Umbral: 1 HDU activa");
    await expect(grupo.getByTestId(`fila-analista-${a1}`)).toContainText("Sobrecargado");
    expect(await grupo.getByTestId(`fila-analista-${a1}`).locator('td[data-label="Activas"]').innerText()).toBe("2");
    await expect(grupo.getByTestId(`fila-analista-${a2}`)).toContainText("1 de 1");
    await expect(grupo.getByTestId(`fila-analista-${a2}`)).toHaveAttribute("data-sobrecarga", "false");
    await expect(page.getByTestId("campo-umbral")).toHaveCount(0);
    await expect(page.getByTestId("boton-guardar-umbral")).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F03#2] E6-F03-T08: AUD1 ve los grupos de QE1 y QE2, el historial de umbral de QE1 y a ANA4 con «Sin QE supervisor», umbral 5 y sin HDU", async ({ browser, request }) => {
    await fijarApi(request, "qe1", 1);
    const [qe1, qe2, a4] = [await idLocal(request, "qe1"), await idLocal(request, "qe2"), await idLocal(request, "ana4")];
    const { contexto, page } = await paginaDe(browser, "aud1");
    await abrir(page, "/auditor/indicadores/carga");
    await expect(page.getByTestId(`grupo-qe-${qe1}`)).toBeVisible();
    await expect(page.getByTestId(`grupo-qe-${qe2}`)).toBeVisible();
    await expect(page.getByTestId(`grupo-qe-${qe1}`).getByTestId("historial-umbral")).toContainText("5 → 1");
    const sinQe = page.getByTestId("grupo-qe-sin-qe");
    await expect(sinQe).toContainText("Umbral: 5");
    await expect(sinQe.getByTestId(`fila-analista-${a4}`)).toContainText("Sin HDU asignadas");
    await expect(sinQe.getByTestId(`fila-analista-${a4}`).getByTestId("etiqueta-sin-qe")).toContainText("Sin QE supervisor");
    await contexto.close();
  });

  test("[E6-F03#2] E6-F03-T09: QE1 cambia el umbral de 5 a 1 y su historial muestra actor y valores; QE2 sigue en 5 y no ve nada de QE1", async ({ browser, request }) => {
    const qe1 = await idLocal(request, "qe1");
    const a = await paginaDe(browser, "qe1");
    await abrir(a.page, "/qe/indicadores/carga");
    await guardarUmbral(a.page, "1");
    await expect(a.page.getByTestId("mensaje-exito-umbral")).toBeVisible();
    await a.page.reload();
    const h = a.page.getByTestId("historial-umbral");
    await expect(h).toContainText("QE1 Quality Engineer");
    await expect(h).toContainText("5 → 1");
    await expect(h.locator("time").first()).toBeVisible();
    await a.contexto.close();
    const b = await paginaDe(browser, "qe2");
    await abrir(b.page, "/qe/indicadores/carga");
    await expect(b.page.getByTestId("campo-umbral")).toHaveValue("5");
    await expect(b.page.getByTestId("insignia-umbral-defecto")).toBeVisible();
    await expect(b.page.getByTestId("historial-umbral")).not.toContainText("QE1");
    await expect(b.page.getByTestId(`grupo-qe-${qe1}`)).toHaveCount(0);
    await b.contexto.close();
  });

  test("[E6-F03#2] E6-F03-T10: H4 reasignada a ANA1 (supervisada por QE1, umbral 1): QE1 la ve con 3 activas sobrecargada; QE2 la ve con 1 activa, «No supervisado por ti» y sin sobrecarga", async ({ browser, request }) => {
    const h = await hdu(request);
    const a1 = await idLocal(request, "ana1");
    await fijarApi(request, "qe1", 1);
    const r = await api.put(request, `/v1/hdu/${h.H4.id}/analista`, { token: await tkLocal("adm1"), body: { analistaId: a1, motivo: "Prueba E6-F03-T10" } });
    expect(r.status).toBe(200);
    const q1 = await paginaDe(browser, "qe1");
    await abrir(q1.page, "/qe/indicadores/carga");
    await expect(fila(q1.page, a1)).toHaveAttribute("data-sobrecarga", "true");
    expect(await celdaNum(q1.page, a1, "Activas")).toBe(3);
    await q1.contexto.close();
    const q2 = await paginaDe(browser, "qe2");
    await abrir(q2.page, "/qe/indicadores/carga");
    await expect(fila(q2.page, a1)).toBeVisible();
    expect(await celdaNum(q2.page, a1, "Activas")).toBe(1);
    await expect(fila(q2.page, a1).getByTestId("etiqueta-no-supervisado")).toContainText("No supervisado por ti");
    await expect(fila(q2.page, a1)).toHaveAttribute("data-sobrecarga", "false");
    await q2.contexto.close();
  });

  test("[E6-F03#1] E6-F03-T11: con Certificaciones detenido las cantidades y la sobrecarga son correctas y el cumplimiento dice «No disponible»", async ({ browser, request }) => {
    await fijarApi(request, "qe1", 1);
    const a1 = await idLocal(request, "ana1");
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnIndicadores(true);
      const { contexto, page } = await paginaDe(browser, "qe1", pila.portalUrl);
      await abrir(page, "/qe/indicadores/carga", pila.portalUrl);
      await expect(fila(page, a1)).toBeVisible();
      expect(await celdaNum(page, a1, "Activas")).toBe(2);
      expect(await celdaNum(page, a1, "En ejecución")).toBe(2);
      await expect(fila(page, a1)).toHaveAttribute("data-sobrecarga", "true");
      await expect(fila(page, a1).getByTestId("estado-indisponible-cumplimiento")).toContainText("No disponible");
      await contexto.close();
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-F03#1] E6-F03-T12: ANA1 y ADM1 ven acceso denegado en la pestaña Carga y las peticiones devuelven 403", async ({ browser, request }) => {
    for (const local of ["ana1", "adm1"]) {
      const { contexto, page } = await paginaDe(browser, local);
      const peticiones = vigilarIndicadores(page);
      await page.goto("/qe/indicadores/carga");
      await expect(page.getByTestId("acceso-denegado"), local).toBeVisible();
      expect(peticiones.filter((p) => p.status === 200), local).toEqual([]);
      await contexto.close();
      const t = await tkLocal(local);
      expect((await api.get(request, "/v1/indicadores/carga", { token: t })).status, local).toBe(403);
      expect((await api.get(request, "/v1/indicadores/umbral-carga", { token: t })).status, local).toBe(403);
    }
  });
});
