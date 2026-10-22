import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { env } from "../support/env";
import { tokenE7, type ClaveE7 } from "../support/e7";

const sesion = (c: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${c}.json`);
let pura = false;
test.beforeAll(async ({ request }) => {
  const r = await api.get<any>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
  pura = r.status === 200 && r.body.contadores.usuariosActivos.datos.valor === 10 && r.body.contadores.hduTotal.datos.valor === 8;
});
test.beforeEach(() => test.skip(!pura, "La base no es la del fixture puro: valores absolutos no verificables."));

test.describe("E7 · valores absolutos del fixture en pantalla (base solo con seed:e7)", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: sesion("adm1") });
    test("[E7-F05#1] ABS-T01/T02: usuarios activos 10 (1/2/4/2/1), inactivos 1, analistas sin QE 1, QE sin analistas 0, líderes sin células 1, células sin líder 1, HDU 8 y 3 pendientes", async ({ page }) => {
      await page.goto(`${env.portalUrl}/admin`);
      const t = (id: string) => page.getByTestId(id);
      await expect(t("contador-usuarios-activos")).toHaveText("10");
      for (const [rol, n] of Object.entries({ ADMINISTRADOR: 1, QE: 2, ANALISTA_QA: 4, LIDER_QA: 2, AUDITOR: 1 })) await expect(t(`desglose-rol-${rol}`)).toHaveText(String(n));
      for (const [k, n] of Object.entries({ "usuarios-inactivos": 1, "analistas-sin-qe": 1, "qe-sin-analistas": 0, "lideres-sin-celulas": 1, "celulas-sin-lider": 1, "hdu-total": 8 })) await expect(t(`contador-${k}`)).toHaveText(String(n));
      await expect(t("lista-pendientes").locator("tbody tr")).toHaveCount(3);
    });
  });
  test.describe("LID1", () => {
    test.use({ storageState: sesion("lid1") });
    test("[E7-F04#1] ABS-T01: chips CEL-A y CEL-B; abiertas 5, cerradas 1, sin analista 1, certificados 1 y 6 HDU", async ({ page }) => {
      await page.goto(`${env.portalUrl}/lider`);
      for (const [k, n] of Object.entries({ celulas: 2, "hdu-abiertas": 5, "hdu-cerradas": 1, "sin-analista": 1, certificados: 1 })) await expect(page.getByTestId(`contador-${k}`)).toHaveText(String(n));
      await expect(page.getByTestId("lista-hdu-lider").locator("tbody tr")).toHaveCount(6);
    });
  });
  test.describe("AUD1", () => {
    test.use({ storageState: sesion("aud1") });
    test("[E7-F06#1] ABS-T01: HDU totales 8, certificados 2 y la pestaña HDU lista H1 a H8", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor`);
      await expect(page.getByTestId("contador-hdu-total")).toHaveText("8");
      await expect(page.getByTestId("contador-certificados")).toHaveText("2");
      await expect(page.getByTestId("lista-auditor-hdu").locator("tbody tr")).toHaveCount(8);
    });
  });
});
