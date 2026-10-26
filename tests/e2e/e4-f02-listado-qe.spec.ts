import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { celulasFixture, tokenE7 } from "../support/e7";
import { hdu, imps, reiniciarFixtureE4 } from "../support/e4";
import { contextoDe, entrarEnPortal, estadoSesion, vigilarPeticionesE4 } from "../support/e4ui";
import { certificacionesCaidaEnImpedimentos, type PilaE4 } from "../support/entornoE4";
import { env } from "../support/env";

/** E4-F02 · Listado priorizado de impedimentos del QE (3 escenarios, T01..T10). El fixture E4 se recarga antes del archivo. */
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await reiniciarFixtureE4();
});

const filas = (page: import("@playwright/test").Page) => page.getByTestId("lista-impedimentos").locator("tbody tr");

test.describe("E4-F02 · Listado de impedimentos del QE", () => {
  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });

    test("[E4-F02#1] T01: QE1 ve abiertos 2 y escalados 1; la primera fila es I2 (H1, ANA1, Alto, 6 d, Abierto), la segunda I3 (H6, ANA1, Medio, 3 d, Escalado, responsable LID1); sin I1 ni I4", async ({ page, request }) => {
      const i = await imps(request);
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await expect(page.getByTestId("pagina-qe-impedimentos")).toBeVisible();
      await expect(page.getByTestId("contador-abiertos")).toHaveText("2");
      await expect(page.getByTestId("contador-escalados")).toHaveText("1");
      await expect(page.getByTestId("contador-nuevos")).toHaveText("0");
      await expect(filas(page)).toHaveCount(2);
      const [primera, segunda] = [filas(page).nth(0), filas(page).nth(1)];
      await expect(primera).toHaveAttribute("data-testid", `fila-impedimento-${i.I2.id}`);
      for (const t of ["E7-H1", "ANA1", "Alto", "6 d", "Abierto"]) await expect(primera).toContainText(t);
      await expect(primera.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
      await expect(segunda).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
      for (const t of ["E7-H6", "ANA1", "Medio", "3 d", "Escalado", "LID1"]) await expect(segunda).toContainText(t);
      await expect(segunda.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId(`fila-impedimento-${i.I1.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`fila-impedimento-${i.I4.id}`)).toHaveCount(0);
    });

    test("[E4-F02#1] T03: con «Incluir resueltos» aparecen 3 filas y I4 (H2, Resuelto) va última", async ({ page, request }) => {
      const i = await imps(request);
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await page.getByTestId("filtro-incluir-resueltos").click();
      await expect(page.getByTestId("filtro-incluir-resueltos")).toBeChecked();
      await expect(filas(page)).toHaveCount(3);
      await expect(filas(page).nth(2)).toHaveAttribute("data-testid", `fila-impedimento-${i.I4.id}`);
      await expect(filas(page).nth(2)).toContainText("Resuelto");
      await expect(filas(page).nth(2)).toContainText("E7-H2");
    });

    test("[E4-F02#1] T04: ordenado por días abiertos ascendente va primero I3 (3 d) y luego I2 (6 d)", async ({ page, request }) => {
      const i = await imps(request);
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await page.getByRole("button", { name: /Días abiertos/ }).click();
      await expect(page).toHaveURL(/orden=diasAbierto/);
      const dir = new URL(page.url()).searchParams.get("orden");
      if (dir?.endsWith(":desc")) await page.getByRole("button", { name: /Días abiertos/ }).click();
      await expect(page).toHaveURL(/orden=diasAbierto%3Aasc|orden=diasAbierto:asc/);
      await expect(filas(page).nth(0)).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
      await expect(filas(page).nth(1)).toHaveAttribute("data-testid", `fila-impedimento-${i.I2.id}`);
    });

    test("[E4-F02#3] T06: filtrar por célula CEL-B deja I3, CEL-A deja I2 y CEL-C dice «No hay impedimentos con esos filtros» (no «Tu equipo no tiene bloqueos»); la URL conserva el filtro", async ({ page, request }) => {
      const i = await imps(request);
      const c = await celulasFixture(request);
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await page.getByTestId("filtro-celula").selectOption({ label: "CEL-B" });
      await expect(page).toHaveURL(new RegExp(`celula=${c["CEL-B"].id}`));
      await expect(filas(page)).toHaveCount(1);
      await expect(filas(page).first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
      await page.getByTestId("filtro-celula").selectOption({ label: "CEL-A" });
      await expect(filas(page)).toHaveCount(1);
      await expect(filas(page).first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I2.id}`);
      await page.getByTestId("filtro-celula").selectOption({ label: "CEL-C" });
      await expect(page.getByTestId("estado-vacio-filtros-impedimentos")).toContainText("No hay impedimentos con esos filtros");
      await expect(page.getByTestId("estado-vacio-impedimentos")).toHaveCount(0);
      // La URL conserva el filtro al recargar.
      await page.reload();
      await expect(page.getByTestId("filtro-celula")).toHaveValue(c["CEL-C"].id);
      await expect(page.getByTestId("estado-vacio-filtros-impedimentos")).toBeVisible();
    });

    test("[E4-F02#3] T07: el tipo «Dependencia de otro equipo» y la búsqueda «sandbox» dejan solo I3", async ({ page, request }) => {
      const i = await imps(request);
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await page.getByTestId("filtro-tipo").selectOption("DEPENDENCIA");
      await expect(filas(page)).toHaveCount(1);
      await expect(filas(page).first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
      await page.getByTestId("filtro-tipo").selectOption("");
      await expect(filas(page)).toHaveCount(2);
      await page.getByTestId("filtro-busqueda").fill("sandbox");
      await expect(filas(page)).toHaveCount(1);
      await expect(filas(page).first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
    });

    test("[E4-F02#1] T10: «Abrir» en la fila de I2 lleva a /hdu/<H1> con I2 visible y el aviso «HDU bloqueada»", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await page.getByTestId(`boton-abrir-impedimento-${i.I2.id}`).click();
      await expect(page).toHaveURL(new RegExp(`/hdu/${h.H1.id}\\?impedimento=${i.I2.id}`));
      await expect(page.getByTestId(`impedimento-${i.I2.id}`)).toBeVisible();
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
    });
  });

  test.describe("QE2", () => {
    test.use({ storageState: estadoSesion("qe2") });

    test("[E4-F02#1] T02: QE2 ve una sola fila, I1 (H3, ANA3, Medio, 0 d, «Nuevo»), y no ve I2 ni I3", async ({ page, request }) => {
      const i = await imps(request);
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      await expect(filas(page)).toHaveCount(1);
      const fila = filas(page).first();
      await expect(fila).toHaveAttribute("data-testid", `fila-impedimento-${i.I1.id}`);
      for (const t of ["E7-H3", "ANA3", "Medio", "0 d"]) await expect(fila).toContainText(t);
      await expect(fila.getByTestId("insignia-nuevo")).toBeVisible();
      await expect(page.getByTestId(`fila-impedimento-${i.I2.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`fila-impedimento-${i.I3.id}`)).toHaveCount(0);
    });

    test("[E4-F02#2] T05: tras resolver I1 la pantalla dice «Tu equipo no tiene bloqueos» con los contadores en 0 y sin error (al terminar se reabre I1)", async ({ page, request }) => {
      const i = await imps(request);
      const token = await tokenE7("qe2");
      expect((await api.post(request, `/v1/impedimentos/${i.I1.id}/resolver`, { token, body: { comentario: "Ambiente restablecido" } })).status).toBe(200);
      try {
        await page.goto(`${env.portalUrl}/qe/impedimentos`);
        await expect(page.getByTestId("estado-vacio-impedimentos")).toContainText("Tu equipo no tiene bloqueos");
        for (const c of ["abiertos", "escalados", "nuevos"]) await expect(page.getByTestId(`contador-${c}`)).toHaveText("0");
        await expect(page.getByTestId("estado-error-impedimentos")).toHaveCount(0);
        await expect(page.getByTestId("lista-impedimentos")).toHaveCount(0);
      } finally {
        const r = await api.post(request, `/v1/impedimentos/${i.I1.id}/reabrir`, { token, body: { motivo: "Se restablece el fixture" } });
        expect(r.status).toBe(200);
      }
    });
  });

  test("[E4-F02#1] T09 (negativo): ANA1, LID1, ADM1 y AUD1 ven acceso denegado en /qe/impedimentos y /qe/impedimentos/riesgo (8 combinaciones) y ninguna petición de datos responde 200", async ({ browser }) => {
    for (const clave of ["ana1", "lid1", "adm1", "aud1"] as const) {
      const { contexto, page } = await contextoDe(browser, clave);
      const v = vigilarPeticionesE4(page);
      try {
        for (const ruta of ["/qe/impedimentos", "/qe/impedimentos/riesgo"]) {
          await page.goto(`${env.portalUrl}${ruta}`);
          await expect(page.getByTestId("acceso-denegado"), `${clave} ${ruta}`).toContainText("No tienes acceso a esta sección");
          await expect(page.getByTestId("pagina-qe-impedimentos")).toHaveCount(0);
          await expect(page.getByTestId("pagina-qe-riesgo")).toHaveCount(0);
        }
        expect(v.exitosas, `${clave}: peticiones de datos de E4 con 200`).toEqual([]);
      } finally {
        await contexto.close();
      }
    }
  });

  test.describe("con Certificaciones detenida", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await certificacionesCaidaEnImpedimentos(true);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-F02#1] T08: sin Certificaciones, QE1 sigue viendo I2 e I3 y los contadores (I2 con cálculo parcial, I3 Medio fijado) y QE2 ve el riesgo de I1 «No disponible» con el aviso de orden por días", async ({ page, request }) => {
      const i = await imps(request);
      await entrarEnPortal(page, "qe1", pila.portalUrl!);
      await page.goto(`${pila.portalUrl}/qe/impedimentos`);
      await expect(filas(page)).toHaveCount(2);
      await expect(page.getByTestId("contador-abiertos")).toHaveText("2");
      await expect(page.getByTestId(`fila-impedimento-${i.I3.id}`)).toContainText("Medio");
      await expect(page.getByTestId(`fila-impedimento-${i.I2.id}`)).toContainText("Alto");
      await expect(page.getByTestId(`fila-impedimento-${i.I2.id}`)).toContainText(/parcial/i);
      // QE2: el riesgo de I1 no se puede calcular y nunca se muestra como Bajo.
      const ctx = await page.context().browser()!.newContext();
      const p2 = await ctx.newPage();
      try {
        await entrarEnPortal(p2, "qe2", pila.portalUrl!);
        await p2.goto(`${pila.portalUrl}/qe/impedimentos`);
        const fila = p2.getByTestId(`fila-impedimento-${i.I1.id}`);
        await expect(fila).toContainText("No disponible");
        await expect(fila).not.toContainText("Bajo");
        await expect(p2.getByTestId("aviso-orden-por-dias")).toBeVisible();
        await expect(p2.getByTestId("contador-abiertos")).toHaveText("1");
      } finally {
        await ctx.close();
      }
    });
  });
});
