import { expect, test, type Page } from "@playwright/test";
import { hdu, reiniciarFixtureE4, texto } from "../support/e4";
import { contextoDe, entrarEnPortal, estadoSesion, vigilarPeticionesE4 } from "../support/e4ui";
import { certificacionesCaidaEnImpedimentos, type PilaE4 } from "../support/entornoE4";
import { env } from "../support/env";

/** E4-F04 · Nivel de riesgo de la HDU (3 escenarios, T01..T10). El fixture E4 se recarga antes de cada caso. */
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await reiniciarFixtureE4();
});

const abrir = async (page: Page, hduId: string) => {
  await page.goto(`${env.portalUrl}/hdu/${hduId}`);
  await expect(page.getByTestId("panel-riesgo")).toBeVisible();
  await expect(page.getByTestId("semaforo-riesgo").or(page.getByTestId("estado-indisponible-riesgo"))).toBeVisible();
};
const filasRiesgo = (page: Page) => page.getByTestId("lista-riesgo").locator("tbody tr");
const codigosFilas = async (page: Page) => (await filasRiesgo(page).locator("a.codigo").allTextContents()).map((t) => t.trim().replace("E7-", ""));

test.describe("E4-F04 · Riesgo", () => {
  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });

    test("[E4-F04#1] T01: QE1 fija Alto en H2 con una justificación: el semáforo queda en Alto, el origen dice «Fijado por QE1» y la sugerencia sigue mostrando Medio", async ({ page, request }) => {
      const h = await hdu(request);
      await abrir(page, h.H2.id);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId("riesgo-origen")).toContainText("Sugerido por el sistema");
      await page.getByTestId("boton-fijar-riesgo").click();
      await expect(page.getByTestId("form-riesgo")).toBeVisible();
      await page.getByTestId("riesgo-opcion-ALTO").check();
      await page.getByTestId("campo-justificacion-riesgo").fill("El cliente exige la entrega");
      await page.getByTestId("form-riesgo").getByRole("button", { name: "Guardar nivel" }).click();
      await expect(page.getByTestId("form-riesgo")).toHaveCount(0);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
      await expect(page.getByTestId("semaforo-riesgo")).toContainText("Alto");
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-origen", "MANUAL");
      await expect(page.getByTestId("riesgo-origen")).toContainText("Fijado por QE1");
      await expect(page.getByTestId("riesgo-justificacion")).toContainText("El cliente exige la entrega");
      await expect(page.getByTestId("riesgo-sugerido")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId("aviso-sugerencia-distinta")).toContainText("La sugerencia actual es Medio");
      await page.getByTestId("historial-riesgo").locator("summary").click();
      await expect(page.getByTestId("historial-riesgo")).toContainText("El cliente exige la entrega");
    });

    test("[E4-F04#1] T02 (negativo): confirmar sin justificación da «La justificación es obligatoria»; con 501 caracteres, «Máximo 500 caracteres»; sin nivel, «Elige un nivel»; no se guarda", async ({ page, request }) => {
      const h = await hdu(request);
      await abrir(page, h.H2.id);
      await page.getByTestId("boton-fijar-riesgo").click();
      const confirmar = () => page.getByTestId("form-riesgo").getByRole("button", { name: "Guardar nivel" }).click();
      await confirmar();
      await expect(page.getByTestId("error-nivel-riesgo")).toHaveText("Elige un nivel");
      await page.getByTestId("riesgo-opcion-ALTO").check();
      await confirmar();
      await expect(page.getByTestId("error-justificacion-riesgo")).toHaveText("La justificación es obligatoria");
      await page.getByTestId("campo-justificacion-riesgo").fill(texto(501));
      await confirmar();
      await expect(page.getByTestId("error-justificacion-riesgo")).toHaveText("Máximo 500 caracteres");
      await expect(page.getByTestId("form-riesgo")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("form-riesgo")).toHaveCount(0);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-origen", "SUGERIDO");
    });

    test("[E4-F04#2] T03: H1 muestra la sugerencia Alto con tres factores (impedimento abierto, impedimento de 6 días y atraso del sprint con avance 30 %) y origen «Sugerido»", async ({ page, request }) => {
      const h = await hdu(request);
      await abrir(page, h.H1.id);
      await expect(page.getByTestId("riesgo-sugerido")).toHaveAttribute("data-nivel", "ALTO");
      await expect(page.getByTestId("riesgo-sugerido")).toContainText("Alto");
      await expect(page.getByTestId("lista-factores-riesgo").locator("li")).toHaveCount(3);
      await expect(page.getByTestId("factor-IMPEDIMENTO_ABIERTO")).toContainText("Hay 1 impedimento abierto o escalado");
      await expect(page.getByTestId("factor-IMPEDIMENTO_ANTIGUO")).toContainText("6 días");
      await expect(page.getByTestId("factor-ATRASO_SPRINT_ALTO")).toContainText("Faltan 2 días");
      await expect(page.getByTestId("factor-ATRASO_SPRINT_ALTO")).toContainText("avance es 30 %");
      await expect(page.getByTestId("riesgo-origen")).toContainText("Sugerido");
      await expect(page.getByTestId("aviso-sugerencia-distinta")).toHaveCount(0);
    });

    test("[E4-F04#2] T05: «Usar el sugerido» en H1 precarga Alto; sin justificación no deja confirmar; con ella el nivel queda Alto «Fijado por QE1»", async ({ page, request }) => {
      const h = await hdu(request);
      await abrir(page, h.H1.id);
      await page.getByTestId("boton-usar-sugerido").click();
      await expect(page.getByTestId("riesgo-opcion-ALTO")).toBeChecked();
      await page.getByTestId("form-riesgo").getByRole("button", { name: "Guardar nivel" }).click();
      await expect(page.getByTestId("error-justificacion-riesgo")).toHaveText("La justificación es obligatoria");
      await page.getByTestId("campo-justificacion-riesgo").fill("Confirmo la sugerencia del sistema");
      await page.getByTestId("form-riesgo").getByRole("button", { name: "Guardar nivel" }).click();
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-origen", "MANUAL");
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
      await expect(page.getByTestId("riesgo-origen")).toContainText("Fijado por QE1");
    });

    test("[E4-F04#3] T06: «Riesgo por HDU» de QE1 lista H1, H5, H6, H2, H8; Alto deja H1 y H5; Medio, H6 y H2; Bajo, H8; no aparecen H3, H4 ni H7", async ({ page }) => {
      await page.goto(`${env.portalUrl}/qe/impedimentos/riesgo`);
      await expect(page.getByTestId("pagina-qe-riesgo")).toBeVisible();
      await expect(filasRiesgo(page)).toHaveCount(5);
      await expect.poll(() => codigosFilas(page)).toEqual(["H1", "H5", "H6", "H2", "H8"]);
      await page.getByTestId("filtro-nivel").selectOption("ALTO");
      await expect(filasRiesgo(page)).toHaveCount(2);
      await expect.poll(() => codigosFilas(page)).toEqual(["H1", "H5"]);
      await page.getByTestId("filtro-nivel").selectOption("MEDIO");
      await expect(filasRiesgo(page)).toHaveCount(2);
      await expect.poll(() => codigosFilas(page)).toEqual(["H6", "H2"]);
      await page.getByTestId("filtro-nivel").selectOption("BAJO");
      await expect(filasRiesgo(page)).toHaveCount(1);
      await expect.poll(() => codigosFilas(page)).toEqual(["H8"]);
      for (const ausente of ["E7-H3", "E7-H4", "E7-H7"]) await expect(page.getByTestId("lista-riesgo")).not.toContainText(ausente);
    });

    test("[E4-F04#2] T08: H6 muestra el nivel vigente Medio «Fijado por QE1» con su justificación y el aviso «La sugerencia actual es Alto»", async ({ page, request }) => {
      const h = await hdu(request);
      await abrir(page, h.H6.id);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId("riesgo-origen")).toContainText("Fijado por QE1");
      await expect(page.getByTestId("riesgo-justificacion")).toContainText("Dependencia en gestión con el equipo de Pagos");
      await expect(page.getByTestId("aviso-sugerencia-distinta")).toContainText("La sugerencia actual es Alto");
    });
  });

  test.describe("QE2", () => {
    test.use({ storageState: estadoSesion("qe2") });

    test("[E4-F04#2] T04: H3 sugiere Medio con el factor de impedimento abierto y H4 sugiere Bajo con «Sin factores de riesgo»", async ({ page, request }) => {
      const h = await hdu(request);
      await abrir(page, h.H3.id);
      await expect(page.getByTestId("riesgo-sugerido")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId("lista-factores-riesgo").locator("li")).toHaveCount(1);
      await expect(page.getByTestId("factor-IMPEDIMENTO_ABIERTO")).toBeVisible();
      await abrir(page, h.H4.id);
      await expect(page.getByTestId("riesgo-sugerido")).toHaveAttribute("data-nivel", "BAJO");
      await expect(page.getByTestId("factor-sin-factores")).toContainText("Sin factores de riesgo");
    });

    test("[E4-F04#3] T07: la pestaña de QE2 lista H3 (Medio) y H4 (Bajo); con Alto dice «No hay HDU con ese nivel de riesgo»", async ({ page }) => {
      await page.goto(`${env.portalUrl}/qe/impedimentos/riesgo`);
      await expect.poll(() => codigosFilas(page)).toEqual(["H3", "H4"]);
      await expect(filasRiesgo(page).nth(0)).toContainText("Medio");
      await expect(filasRiesgo(page).nth(1)).toContainText("Bajo");
      await page.getByTestId("filtro-nivel").selectOption("ALTO");
      await expect(page.getByTestId("estado-vacio-filtros-riesgo")).toContainText("No hay HDU con ese nivel de riesgo");
    });
  });

  test("[E4-F04#1] T09 (negativo): ANA1 no tiene panel de riesgo (ni llamada a la API); QE2 ve acceso denegado; LID1, AUD1 y ADM1 ven el panel sin «Fijar riesgo» ni «Usar el sugerido»", async ({ browser, request }) => {
    const h = await hdu(request);
    const ana = await contextoDe(browser, "ana1");
    const v = vigilarPeticionesE4(ana.page);
    const intentos: string[] = [];
    ana.page.on("request", (r) => {
      if (/\/riesgo/.test(r.url()) && r.url().includes("/v1/")) intentos.push(r.url());
    });
    try {
      await ana.page.goto(`${env.portalUrl}/hdu/${h.H1.id}`);
      await expect(ana.page.getByTestId("seccion-impedimentos")).toBeVisible();
      await expect(ana.page.getByTestId("lista-impedimentos-hdu")).toBeVisible();
      await expect(ana.page.getByTestId("panel-riesgo")).toHaveCount(0);
      await expect(ana.page.getByTestId("semaforo-riesgo")).toHaveCount(0);
      expect(intentos, "el Analista no debe llamar a /riesgo").toEqual([]);
      expect(v.exitosas.some((u) => /riesgo/.test(u))).toBe(false);
    } finally {
      await ana.contexto.close();
    }
    const qe2 = await contextoDe(browser, "qe2");
    try {
      await qe2.page.goto(`${env.portalUrl}/hdu/${h.H1.id}`);
      await expect(qe2.page.getByTestId("acceso-denegado")).toBeVisible();
      await expect(qe2.page.getByTestId("panel-riesgo")).toHaveCount(0);
    } finally {
      await qe2.contexto.close();
    }
    for (const clave of ["lid1", "aud1", "adm1"] as const) {
      const { contexto, page } = await contextoDe(browser, clave);
      try {
        await page.goto(`${env.portalUrl}/hdu/${h.H1.id}`);
        await expect(page.getByTestId("panel-riesgo"), clave).toBeVisible();
        await expect(page.getByTestId("semaforo-riesgo"), clave).toHaveAttribute("data-nivel", "ALTO");
        await expect(page.getByTestId("boton-fijar-riesgo"), clave).toHaveCount(0);
        await expect(page.getByTestId("boton-usar-sugerido"), clave).toHaveCount(0);
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

    test("[E4-F04#2] T10: sin Certificaciones, H1 muestra Alto con «Cálculo parcial», H8 «No disponible» (no Bajo) y H6 su Medio fijado", async ({ page, request }) => {
      const h = await hdu(request);
      await entrarEnPortal(page, "qe1", pila.portalUrl!);
      await page.goto(`${pila.portalUrl}/hdu/${h.H1.id}`);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
      await expect(page.getByTestId("semaforo-riesgo")).toContainText("Cálculo parcial");
      await expect(page.getByTestId("aviso-calculo-parcial")).toContainText("Cálculo parcial");
      await page.goto(`${pila.portalUrl}/hdu/${h.H8.id}`);
      const nd = page.getByTestId("estado-indisponible-riesgo");
      await expect(nd).toBeVisible();
      await expect(nd).toContainText("No disponible");
      await expect(page.getByTestId("panel-riesgo")).not.toContainText("Bajo");
      await page.goto(`${pila.portalUrl}/hdu/${h.H6.id}`);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
      await expect(page.getByTestId("riesgo-origen")).toContainText("Fijado por QE1");
    });
  });
});
