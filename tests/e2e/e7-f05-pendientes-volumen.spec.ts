import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { crearUsuarioE7, desactivarUsuario, tokenE7, type UsuarioNuevo } from "../support/e7";
import { env } from "../support/env";

/**
 * E7-F05#1: «la lista de pendientes con un botón por fila». Con más pendientes que el tamaño de página (25) la lista
 * no puede perder filas en silencio: hay que poder ver cuántos son y llegar a los demás.
 */
test.describe("E7-F05 · Pendientes de configuración con volumen", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "e7-adm1.json") });

  test("[E7-F05#1] T02b: con más de 25 pendientes la bandeja informa el total o permite paginar, y no oculta filas en silencio", async ({ page, request }) => {
    test.setTimeout(420_000);
    const adm = await tokenE7("adm1");
    const antes = await api.get<{ pendientes: { datos: { total: number } } }>(request, "/v1/bandeja/admin", { token: adm });
    const faltan = Math.max(0, 27 - antes.body.pendientes.datos.total);
    const creados: UsuarioNuevo[] = [];
    try {
      for (let i = 0; i < faltan; i += 1) creados.push(await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "f05-volumen" }));
      const api1 = await api.get<{ pendientes: { datos: { total: number } } }>(request, "/v1/bandeja/admin", { token: adm });
      const total = api1.body.pendientes.datos.total;
      expect(total).toBeGreaterThan(25);

      await page.goto(`${env.portalUrl}/admin`);
      const lista = page.getByTestId("lista-pendientes");
      await expect(lista).toBeVisible();
      const filas = await lista.locator("tbody tr").count();
      expect(filas).toBeLessThanOrEqual(25);
      const panel = page.locator("section", { has: lista });
      const informaTotal = (await panel.innerText()).includes(String(total));
      const hayPaginacion = (await page.getByTestId("paginacion-pendientes").count()) > 0;
      expect(
        informaTotal || hayPaginacion,
        `La bandeja tiene ${total} pendientes, muestra ${filas} y no informa el total ni ofrece paginación: ` +
          `los últimos (p. ej. «Líder sin células» y «Célula sin líder») quedan ocultos en silencio.`,
      ).toBe(true);
    } finally {
      for (const u of creados) await desactivarUsuario(request, adm, u.id);
    }
  });
});
