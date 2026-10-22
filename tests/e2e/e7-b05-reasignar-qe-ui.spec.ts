import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { crearHdu, obtenerCatalogos } from "../support/fixtures";
import { env } from "../support/env";
import { crearUsuarioE7, desactivarUsuario, hduFixture, sesionDe, tokenE7 } from "../support/e7";
import { codigoHduUnico } from "../support/unique";
import { clicConReintentoPorLimiteTasa } from "../support/ui";

/**
 * E7-B05 en el portal: el Administrador reasigna el QE responsable desde el detalle de la HDU (D54). El backlog fija
 * esta HDU como backend; esta prueba comprueba que la pantalla que la usa también cumple (alimentada por
 * `GET /v1/catalogos/personas`) y que el resto de los roles no la ven.
 */
test.describe("E7-B05 · Reasignar el QE responsable desde el detalle de la HDU", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "e7-adm1.json") });

  test("[E7-B05#1] ADM1 reasigna el QE responsable con motivo y el detalle muestra al nuevo QE", async ({ page, request }) => {
    const adm = await tokenE7("adm1");
    const qeA = await crearUsuarioE7(request, adm, "QE", { prefijo: "b05-ui-a", conContrasena: true });
    const qeB = await crearUsuarioE7(request, adm, "QE", { prefijo: "b05-ui-b" });
    try {
      const tokenA = (await sesionDe(qeA.correo)).accessToken;
      const { celula, sprint } = await obtenerCatalogos(request, tokenA);
      const hdu = await crearHdu(request, tokenA, { codigo: codigoHduUnico("b05-ui"), celulaId: celula.id, sprintId: sprint.id });

      await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
      await page.getByTestId("boton-reasignar-qe").click();
      const dialogo = page.getByTestId("dialogo-reasignar-qe");
      await expect(dialogo).toBeVisible();
      await dialogo.getByTestId("selector-qe-destino").selectOption({ label: qeB.nombre });
      await dialogo.getByTestId("campo-motivo-reasignacion").fill("Rotación de cartera (prueba E7)");
      await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar" }), /\/v1\/hdu\/[^/]+\/qe-responsable$/);
      await expect(dialogo).toHaveCount(0);
      await expect(page.getByTestId("aviso-qe-reasignado")).toBeVisible();
      await expect(page.locator("main")).toContainText(qeB.nombre);
      const detalle = await api.get<{ qeResponsable: { id: string } }>(request, `/v1/hdu/${hdu.id}`, { token: adm });
      expect(detalle.body.qeResponsable.id).toBe(qeB.id);
    } finally {
      await desactivarUsuario(request, adm, qeA.id);
      await desactivarUsuario(request, adm, qeB.id);
    }
  });

  test("[E7-B05#2] el botón «Reasignar QE responsable» no existe para el QE responsable, el Líder ni el Auditor", async ({ browser, request }) => {
    const h = await hduFixture(request);
    for (const clave of ["qe1", "lid1", "aud1"] as const) {
      const ctx = await browser.newContext({ storageState: path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`) });
      const page = await ctx.newPage();
      await page.goto(`${env.portalUrl}/hdu/${h["E7-H1"].id}`);
      await expect(page.getByTestId("valor-analista-hdu")).toBeVisible();
      await expect(page.getByTestId("boton-reasignar-qe"), clave).toHaveCount(0);
      await ctx.close();
    }
  });
});
