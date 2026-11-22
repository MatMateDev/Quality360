import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { hdu } from "../support/e4";
import { MENU } from "../support/e6";
import { abrir, cifraUi, elegirFiltro, leerCifras, paginaDe, vigilarIndicadores } from "../support/e6ui";
import { celulas, consultaDb, fotoE6, JUSTIFICACION_40, llevarAPendienteCierre, restaurarE6, sprint, tkLocal, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnIndicadores, type PilaE6 } from "../support/entornoE6";

/** E6-F01 · Cumplimiento y filtros (12 casos), contra el portal real y la base compartida. */
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const num = (t: string) => Number(t.replace(/[^\d.]/g, ""));

test.describe("E6-F01 · Cumplimiento y filtros", () => {
  test("[E6-F01#1] E6-F01-T01: QE1 ve 5 totales, 1 certificada, 0 cerradas con excepción, 3 en curso, 1 sin iniciar, 2 bloqueadas y 44 %", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores");
    const c = await leerCifras(page);
    expect(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, num(v)]))).toEqual({ totales: 5, certificadas: 1, "cerradas-excepcion": 0, "en-curso": 3, "sin-iniciar": 1, bloqueadas: 2, cumplimiento: 44 });
    expect(c.cumplimiento).toMatch(/44\s*%/);
    expect(num(c.certificadas) + num(c["cerradas-excepcion"]) + num(c["en-curso"]) + num(c["sin-iniciar"])).toBe(num(c.totales));
    await expect(page.getByTestId("nota-cuadre")).toContainText("= 5");
    await contexto.close();
  });

  test("[E6-F01#1] E6-F01-T02: QE2 ve 3 totales, 1 certificada, 1 en curso, 1 sin iniciar, 1 bloqueada y 33 %, sin cifras de QE1", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe2");
    await abrir(page, "/qe/indicadores");
    const c = await leerCifras(page);
    expect([c.totales, c.certificadas, c["en-curso"], c["sin-iniciar"], c.bloqueadas].map(num)).toEqual([3, 1, 1, 1, 1]);
    expect(c.cumplimiento).toMatch(/33\s*%/);
    expect(num(c.totales)).not.toBe(5);
    await contexto.close();
  });

  test("[E6-F01#1] E6-F01-T03: LID1 ve 6 totales, 1 certificada, 3 en curso, 2 sin iniciar, 3 bloqueadas y 37 %", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "lid1");
    await abrir(page, "/lider/indicadores");
    const c = await leerCifras(page);
    expect([c.totales, c.certificadas, c["en-curso"], c["sin-iniciar"], c.bloqueadas].map(num)).toEqual([6, 1, 3, 2, 3]);
    expect(c.cumplimiento).toMatch(/37\s*%/);
    await contexto.close();
  });

  test("[E6-F01#1] E6-F01-T04: AUD1 ve el total de la base y por célula CEL-A 4 HDU 35 %, CEL-B 2 HDU 40 %, CEL-C 2 HDU 50 %; la pantalla no tiene controles de edición", async ({ browser, request }) => {
    const { contexto, page } = await paginaDe(browser, "aud1");
    await abrir(page, "/auditor/indicadores");
    const total = Number((await consultaDb("SELECT count(*) n FROM organizacion.historia_usuario"))[0].n);
    const c = await leerCifras(page);
    expect(num(c.totales)).toBe(total);
    expect(num(c.certificadas) + num(c["cerradas-excepcion"]) + num(c["en-curso"]) + num(c["sin-iniciar"])).toBe(total);
    const cel = await celulas(request);
    let suma = 0;
    for (const [n, hdus, pct] of [["CEL-A", 4, 35], ["CEL-B", 2, 40], ["CEL-C", 2, 50]] as const) {
      await abrir(page, `/auditor/indicadores?celula=${cel[n]}`);
      const x = await leerCifras(page);
      expect(num(x.totales), n).toBe(hdus);
      expect(x.cumplimiento, n).toMatch(new RegExp(`${pct}\\s*%`));
      suma += num(x.totales);
    }
    expect(suma).toBe(8);
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /guardar|editar|eliminar|crear/i })).toHaveCount(0);
    await expect(page.getByTestId("campo-umbral")).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F01#2] E6-F01-T05: QE1 filtra Célula = CEL-A: 3 totales, 2 en curso, 1 sin iniciar, 1 bloqueada, 13 % y la URL conserva ?celula=", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores");
    await elegirFiltro(page, "filtro-celula", "CEL-A");
    await expect(cifraUi(page, "totales")).toHaveText("3");
    const c = await leerCifras(page);
    expect([c.certificadas, c["en-curso"], c["sin-iniciar"], c.bloqueadas].map(num)).toEqual([0, 2, 1, 1]);
    expect(c.cumplimiento).toMatch(/13\s*%/);
    expect(page.url()).toContain("celula=");
    await contexto.close();
  });

  test("[E6-F01#2] E6-F01-T06: sprint SP-PROX de CEL-A (1 HDU, 30 %), de CEL-B (1 HDU, 80 %) y CEL-A con SP-PROX de CEL-A (1 HDU, 30 %)", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores");
    await elegirFiltro(page, "filtro-sprint", "SP-PROX CEL-A");
    await expect(cifraUi(page, "totales")).toHaveText("1");
    let c = await leerCifras(page);
    expect([c["en-curso"], c.bloqueadas].map(num)).toEqual([1, 1]);
    expect(c.cumplimiento).toMatch(/30\s*%/);
    await elegirFiltro(page, "filtro-sprint", "SP-PROX CEL-B");
    await expect(cifraUi(page, "cumplimiento")).toHaveText(/80\s*%/);
    c = await leerCifras(page);
    expect([c.totales, c["en-curso"], c.bloqueadas].map(num)).toEqual([1, 1, 1]);
    await elegirFiltro(page, "filtro-sprint", "SP-PROX CEL-A");
    await elegirFiltro(page, "filtro-celula", "CEL-A");
    await expect(cifraUi(page, "cumplimiento")).toHaveText(/30\s*%/);
    expect(num(await cifraUi(page, "totales").innerText())).toBe(1);
    expect(page.url()).toMatch(/celula=.*sprint=|sprint=.*celula=/);
    await contexto.close();
  });

  test("[E6-F01#3] E6-F01-T07: CEL-C con SP-PROX de CEL-A muestra «No hay HDU con esos filtros» sin cifras ni 0 %", async ({ browser, request }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    const cel = await celulas(request);
    await abrir(page, `/qe/indicadores?celula=${cel["CEL-C"]}&sprint=${await sprint(request, "SP-PROX", "CEL-A")}`);
    await expect(page.getByTestId("estado-sin-datos")).toContainText("No hay HDU con esos filtros");
    await expect(page.locator('[data-testid^="indicador-"]')).toHaveCount(0);
    await expect(page.getByTestId("pestana-cumplimiento")).not.toContainText(/0\s*%/);
    await contexto.close();
  });

  test("[E6-F01#3] E6-F01-T08: QE3 sin HDU ve «Aún no tienes HDU en tu ámbito» sin cifras", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe3");
    await abrir(page, "/qe/indicadores");
    await expect(page.getByTestId("estado-sin-datos")).toContainText("Aún no tienes HDU en tu ámbito");
    await expect(page.locator('[data-testid^="indicador-"]')).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F01#1] E6-F01-T09: con Certificaciones detenido QE1 ve totales 5, cerradas 0 y bloqueadas 2; el resto dice «No disponible» sin ceros", async ({ browser }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnIndicadores(true);
      const { contexto, page } = await paginaDe(browser, "qe1", pila.portalUrl);
      await abrir(page, "/qe/indicadores", pila.portalUrl);
      await expect(cifraUi(page, "totales")).toHaveText("5");
      await expect(cifraUi(page, "cerradas-excepcion")).toHaveText("0");
      await expect(cifraUi(page, "bloqueadas")).toHaveText("2");
      for (const k of ["certificadas", "en-curso", "sin-iniciar", "cumplimiento"]) {
        await expect(page.getByTestId(`estado-indisponible-${k}`), k).toContainText("No disponible");
        await expect(cifraUi(page, k), k).toHaveCount(0);
      }
      await expect(page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Bandeja" })).toBeVisible();
      await contexto.close();
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-F01#1] E6-F01-T10: ANA1, ADM1 y QE1 en rutas de indicadores ajenas ven acceso denegado con «Ir a mi bandeja» y ninguna petición devuelve 200", async ({ browser }) => {
    const casos: Array<[string, string[]]> = [
      ["ana1", ["/qe/indicadores", "/lider/indicadores", "/auditor/indicadores", "/admin/indicadores/snapshots"]],
      ["adm1", ["/qe/indicadores", "/lider/indicadores", "/auditor/indicadores"]],
      ["qe1", ["/lider/indicadores"]],
    ];
    for (const [local, rutas] of casos) {
      const { contexto, page } = await paginaDe(browser, local);
      const peticiones = vigilarIndicadores(page);
      for (const ruta of rutas) {
        await page.goto(ruta);
        const d = page.getByTestId("acceso-denegado");
        await expect(d, `${local} ${ruta}`).toBeVisible();
        await expect(d.getByRole("link", { name: "Ir a mi bandeja" })).toBeVisible();
      }
      await page.waitForTimeout(300);
      expect(peticiones.filter((p) => p.status === 200), local).toEqual([]);
      await contexto.close();
    }
  });

  test("[E6-F01#regresion] E6-F01-T11: menús de QE1, LID1, AUD1 y ADM1 con la opción de indicadores (el detalle de E1-F02, E7-F01 y E7-F03 va en la regresión completa)", async ({ browser }) => {
    for (const [local, portal, menu] of [["qe1", "/qe", MENU.QE], ["lid1", "/lider", MENU.LIDER_QA], ["aud1", "/auditor", MENU.AUDITOR], ["adm1", "/admin", MENU.ADMINISTRADOR]] as const) {
      const { contexto, page } = await paginaDe(browser, local);
      await page.goto(portal);
      await expect(page.getByRole("navigation", { name: "Portal" }).getByRole("link"), local).toHaveText([...menu]);
      await contexto.close();
    }
  });

  test("[E6-F01#1] E6-F01-T12: tras cerrar H2 con excepción QE1 ve 1 cerrada con excepción, 2 en curso y 44 % (H2 cuenta 10 %); la categoría dice «sin certificado»", async ({ browser, request }) => {
    const h = await hdu(request);
    try {
      await llevarAPendienteCierre(request, "H2");
      const c = await api.post(request, `/v1/hdu/${h.H2.id}/estado`, { token: await tkLocal("qe1"), body: { estado: "CERRADA", justificacion: JUSTIFICACION_40 } });
      expect(c.status).toBe(200);
      const { contexto, page } = await paginaDe(browser, "qe1");
      await abrir(page, "/qe/indicadores");
      const x = await leerCifras(page);
      expect([x.totales, x.certificadas, x["cerradas-excepcion"], x["en-curso"], x["sin-iniciar"], x.bloqueadas].map(num)).toEqual([5, 1, 1, 2, 1, 2]);
      expect(x.cumplimiento).toMatch(/44\s*%/);
      await expect(page.getByTestId("tarjeta-cerradas-excepcion")).toContainText("Cerradas con excepción (sin certificado)");
      await contexto.close();
    } finally {
      await restaurarE6(foto);
    }
  });
});
