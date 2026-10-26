import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { tokenE7 } from "../support/e7";
import { hdu, imps, reiniciarFixtureE4, texto, uid, type ImpedimentoApi } from "../support/e4";
import { estadoSesion, entrarEnPortal } from "../support/e4ui";
import { impedimentosCaidoEnOrganizacion, type PilaE4 } from "../support/entornoE4";
import { env } from "../support/env";

/**
 * E4 en las 5 bandejas (D87), la pestaña del Auditor (E4-B04-T12) y el cierre bloqueado en pantalla (D60, D77, D81).
 * El fixture E4 se recarga antes del archivo y entre los casos que escriben.
 */
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await reiniciarFixtureE4();
});

test.describe("E4 · bandejas por rol", () => {
  test.describe("ANA1", () => {
    test.use({ storageState: estadoSesion("ana1") });
    test("[E4-F01#1] Analista: ANA1 ve 2 impedimentos abiertos, la columna Bloqueo marca H1 y H6, «Solo bloqueadas» deja esas dos y no hay nada de riesgo", async ({ page, request }) => {
      const h = await hdu(request);
      await page.goto(`${env.portalUrl}/qa`);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveText("2");
      await expect(page.getByTestId(`celda-bloqueo-${h.H1.id}`)).toContainText("Bloqueada");
      await expect(page.getByTestId(`celda-bloqueo-${h.H6.id}`)).toContainText("Bloqueada");
      await page.getByTestId("filtro-solo-bloqueadas").click();
      await expect(page.getByTestId("lista-mis-hdu").locator("tbody tr")).toHaveCount(2);
      await expect(page.getByTestId("semaforo-riesgo")).toHaveCount(0);
      await expect(page.getByTestId("contador-hdu-riesgo-alto")).toHaveCount(0);
      await expect(page.locator("[data-testid^='celda-riesgo-']")).toHaveCount(0);
    });
  });

  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });
    test("[E4-F02#1] QE: QE1 ve abiertos 2, nuevos 0 y riesgo alto 2; el bloque «Impedimentos de mi equipo» lista I2 e I3 con «Ver todos»; «Requiere mi acción» sigue con 4 filas", async ({ page, request }) => {
      const i = await imps(request);
      await page.goto(`${env.portalUrl}/qe`);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveText("2");
      await expect(page.getByTestId("contador-impedimentos-nuevos")).toHaveText("0");
      await expect(page.getByTestId("contador-hdu-riesgo-alto")).toHaveText("2");
      const lista = page.getByTestId("lista-impedimentos");
      await expect(lista.locator("tbody tr")).toHaveCount(2);
      await expect(lista.locator("tbody tr").first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I2.id}`);
      await expect(page.getByTestId("enlace-ver-todos-impedimentos")).toHaveAttribute("href", "/qe/impedimentos");
      await expect(page.getByTestId("lista-requiere-accion").locator("tbody tr")).toHaveCount(4);
    });
  });

  test.describe("LID1", () => {
    test.use({ storageState: estadoSesion("lid1") });
    test("[E4-F03#2] Líder: LID1 ve abiertos 3, HDU bloqueadas 3 y escalados a mí 1; la lista trae los 3 con I3 primero y «escalado a mí», las columnas Bloqueo y Riesgo y «Solo bloqueadas»", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await page.goto(`${env.portalUrl}/lider`);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveText("3");
      await expect(page.getByTestId("contador-hdu-bloqueadas")).toHaveText("3");
      await expect(page.getByTestId("contador-escalados-a-mi")).toHaveText("1");
      const lista = page.getByTestId("lista-impedimentos").locator("tbody tr");
      await expect(lista).toHaveCount(3);
      await expect(lista.first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
      await expect(lista.first().getByTestId("insignia-escalado-a-mi")).toBeVisible();
      await expect(page.getByTestId(`celda-bloqueo-${h.H1.id}`)).toContainText("Bloqueada");
      await expect(page.getByTestId(`celda-riesgo-${h.H1.id}`)).toContainText("Alto");
      await expect(page.getByTestId(`celda-riesgo-${h.H6.id}`)).toContainText("Medio");
      await expect(page.getByTestId(`celda-riesgo-${h.H7.id}`)).toContainText("Sin evaluar");
      await page.getByTestId("filtro-solo-bloqueadas").click();
      await expect(page.getByTestId("lista-hdu-lider").locator("tbody tr")).toHaveCount(3);
      await expect(page.locator("button[type=submit]")).toHaveCount(0);
    });
  });

  test.describe("LID2", () => {
    test.use({ storageState: estadoSesion("lid2") });
    test("[E4-F03#2] Líder sin células: LID2 recibe el aviso de E7 «Aún no tienes células asignadas» (sin bloques de impedimentos ni «No disponible»); sus contadores en 0 se verifican por API", async ({ page }) => {
      await page.goto(`${env.portalUrl}/lider`);
      await expect(page.getByRole("status").filter({ hasText: "Aún no tienes células asignadas" })).toBeVisible();
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveCount(0);
      await expect(page.getByTestId("estado-indisponible-impedimentos")).toHaveCount(0);
      await expect(page.getByText("No disponible")).toHaveCount(0);
    });
  });

  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });
    test("[E4-F03#2] Administrador: ADM1 ve abiertos 3, HDU bloqueadas 3 y riesgo alto 2, y «escalados a mí» vacío (aún no le escalan nada)", async ({ page }) => {
      await page.goto(`${env.portalUrl}/admin`);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveText("3");
      await expect(page.getByTestId("contador-hdu-bloqueadas")).toHaveText("3");
      await expect(page.getByTestId("contador-hdu-riesgo-alto")).toHaveText("2");
      await expect(page.getByTestId("estado-vacio-impedimentos-escalados")).toBeVisible();
      await expect(page.getByTestId("pendientes-configuracion").or(page.getByTestId("lista-pendientes"))).toBeVisible();
    });
  });

  test.describe("AUD1", () => {
    test.use({ storageState: estadoSesion("aud1") });
    test("[E4-B04#2] T12: AUD1 ve los contadores 3 y 3, la pestaña «Impedimentos» con 5 filas, «Gestión» con 9, «Exportar CSV» y ninguna acción de escritura", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor`);
      await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveText("3");
      await expect(page.getByTestId("contador-hdu-bloqueadas")).toHaveText("3");
      await page.getByTestId("pestana-impedimentos").click();
      await expect(page).toHaveURL(/\/auditor\/impedimentos/);
      await expect(page.getByTestId("lista-auditor-impedimentos").locator("tbody tr")).toHaveCount(5);
      await expect(page.getByTestId("boton-exportar-csv")).toBeVisible();
      await page.getByTestId("vista-gestion").click();
      await expect(page.getByTestId("lista-auditor-gestion").locator("tbody tr")).toHaveCount(9);
      await expect(page.getByTestId("boton-exportar-csv")).toBeVisible();
      await expect(page.locator("button[type=submit]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Resolver|Escalar|Reabrir|Registrar|Fijar/ })).toHaveCount(0);
    });

    test("[E4-B04#2] la exportación CSV de la vista Impedimentos baja un archivo con BOM y 5 filas y queda registrada en la auditoría", async ({ page }) => {
      await page.goto(`${env.portalUrl}/auditor/impedimentos`);
      await expect(page.getByTestId("lista-auditor-impedimentos").locator("tbody tr")).toHaveCount(5);
      const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByTestId("boton-exportar-csv").click()]);
      expect(descarga.suggestedFilename()).toMatch(/quality360-impedimentos-\d{4}-\d{2}-\d{2}\.csv/);
      const ruta = await descarga.path();
      const { readFileSync } = await import("node:fs");
      const bytes = readFileSync(ruta);
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
      expect(bytes.toString("utf8").split(/\r?\n/).filter(Boolean)).toHaveLength(6);
    });
  });
});

test.describe("E4 · cierre bloqueado por impedimentos (D60, D77, D81)", () => {
  test.use({ storageState: estadoSesion("qe1") });

  test("[E4-B02#2] QE1 registra un impedimento en H8 y al «Pasar a Cerrada» ve el error de HDU bloqueada con la lista; la HDU sigue en Pendiente de cierre y la fila de su bandeja muestra «Con impedimento abierto» sin cambiar «Cerrar HDU»", async ({ page, request }) => {
    await reiniciarFixtureE4();
    const h = await hdu(request);
    const token = await tokenE7("qe1");
    const reg = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H8.id}/impedimentos`, {
      token,
      body: { tipo: "DEPENDENCIA", titulo: "Entrega pendiente del equipo de Pagos", descripcion: texto(30, "descripcion "), responsableId: await uid(request, "qe1") },
    });
    expect(reg.status).toBe(201);
    try {
      await page.goto(`${env.portalUrl}/hdu/${h.H8.id}`);
      await expect(page.getByTestId("pista-cierre-bloqueado")).toContainText("1 impedimento abierto");
      await page.getByRole("button", { name: "Pasar a Cerrada" }).click();
      const error = page.getByTestId("error-hdu-bloqueada");
      await expect(error).toBeVisible();
      await expect(error).toContainText("No se puede cerrar la HDU");
      await expect(page.getByTestId("lista-error-bloqueantes")).toContainText("Entrega pendiente del equipo de Pagos");
      await expect(page.getByTestId("lista-error-bloqueantes")).toContainText("Abierto");
      await expect(page.getByRole("button", { name: "Pasar a Cerrada" })).toBeEnabled();
      const detalle = await api.get<{ estado: string }>(request, `/v1/hdu/${h.H8.id}`, { token });
      expect(detalle.body.estado).toBe("PENDIENTE_CIERRE");

      // D81: la insignia vive dentro de la celda de acción, fuera del botón, y el texto/nombre del botón no cambian.
      await page.goto(`${env.portalUrl}/qe`);
      const celda = page.getByTestId(`celda-accion-${h.H8.id}`);
      await expect(celda).toContainText("Cerrar HDU");
      await expect(celda.getByTestId(`insignia-con-impedimento-${h.H8.id}`)).toContainText("Con impedimento abierto");
      const boton = page.getByTestId(`boton-accion-${h.H8.id}-cerrar`);
      await expect(boton).toBeVisible();
      await expect(boton.getByTestId(`insignia-con-impedimento-${h.H8.id}`)).toHaveCount(0);
      expect((await boton.innerText()).trim()).not.toContain("impedimento");
    } finally {
      await api.post(request, `/v1/impedimentos/${reg.body.id}/resolver`, { token, body: { comentario: "Se restablece el fixture de E4" } });
    }
  });

  test.describe("con Impedimentos detenido", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await impedimentosCaidoEnOrganizacion(true);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-B02#2] sin el servicio Impedimentos, «Pasar a Cerrada» muestra «No pudimos verificar los impedimentos de la HDU» y H8 no se cierra", async ({ page, request }) => {
      const h = await hdu(request);
      await entrarEnPortal(page, "qe1", pila.portalUrl!);
      await page.goto(`${pila.portalUrl}/hdu/${h.H8.id}`);
      await page.getByRole("button", { name: "Pasar a Cerrada" }).click();
      await expect(page.getByTestId("error-impedimentos-no-disponible")).toContainText("No pudimos verificar los impedimentos de la HDU");
      await expect(page.getByTestId("error-hdu-bloqueada")).toHaveCount(0);
      const d = await api.get<{ estado: string }>(request, `/v1/hdu/${h.H8.id}`, { token: await tokenE7("qe1") });
      expect(d.body.estado).toBe("PENDIENTE_CIERRE");
    });
  });
});

test.describe("E4 · bandejas con Impedimentos detenido (D46, D87)", () => {
  let pila: PilaE4;
  test.beforeAll(async () => {
    pila = await impedimentosCaidoEnOrganizacion(true);
  });
  test.afterAll(async () => {
    await pila?.detener();
  });

  test("[E4-F01#3] la bandeja del QE muestra «No disponible» en los bloques de impedimentos (nunca 0) y el resto de la bandeja carga", async ({ page }) => {
    await entrarEnPortal(page, "qe1", pila.portalUrl!);
    await page.goto(`${pila.portalUrl}/qe`);
    await expect(page.getByTestId("estado-indisponible-impedimentos-abiertos")).toBeVisible();
    await expect(page.getByTestId("estado-indisponible-impedimentos-abiertos")).toContainText("No disponible");
    await expect(page.getByTestId("contador-impedimentos-abiertos")).toHaveCount(0);
    await expect(page.getByTestId("estado-indisponible-impedimentos")).toBeVisible();
    await expect(page.getByTestId("lista-requiere-accion")).toBeVisible();
    await expect(page.getByTestId("contador-por-aprobar")).toBeVisible();
  });
});
