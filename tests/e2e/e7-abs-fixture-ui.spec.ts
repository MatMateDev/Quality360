import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { env } from "../support/env";
import { tokenE7, type ClaveE7 } from "../support/e7";

const sesion = (c: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${c}.json`);
let pura = false;
test.beforeAll(async ({ request }) => {
  const r = await api.get<any>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
  const c = r.body?.contadores;
  // Desde D208 el fixture tiene 8 activos y 1 inactivo; una base migrada conserva a LID1 y LID2 como Auditores inactivos.
  pura = r.status === 200 && c.usuariosActivos.datos.valor === 8 && c.usuariosInactivos.datos.valor === 1 && c.hduTotal.datos.valor === 8;
});
test.beforeEach(() => test.skip(!pura, "La base no es la del fixture puro (8 usuarios activos, 1 inactivo y 8 HDU): valores absolutos no verificables."));

test.describe("E7 · valores absolutos del fixture en pantalla (base solo con seed:e7)", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: sesion("adm1") });
    test("[E7-F05#1] ABS-T01/T02: usuarios activos 8 (1/2/4/1), inactivos 1, analistas sin QE 1, QE sin analistas 0, HDU 8 y 1 pendiente (D208)", async ({ page }) => {
      await page.goto(`${env.portalUrl}/admin`);
      const t = (id: string) => page.getByTestId(id);
      await expect(t("contador-usuarios-activos")).toHaveText("8");
      for (const [rol, n] of Object.entries({ ADMINISTRADOR: 1, QE: 2, ANALISTA_QA: 4, AUDITOR: 1 })) await expect(t(`desglose-rol-${rol}`)).toHaveText(String(n));
      for (const [k, n] of Object.entries({ "usuarios-inactivos": 1, "analistas-sin-qe": 1, "qe-sin-analistas": 0, "hdu-total": 8 })) await expect(t(`contador-${k}`)).toHaveText(String(n));
      await expect(t("lista-pendientes").locator("tbody tr")).toHaveCount(1);
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
