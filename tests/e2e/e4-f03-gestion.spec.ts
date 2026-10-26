import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { tokenE7 } from "../support/e7";
import { hdu, imps, reiniciarFixtureE4, uid } from "../support/e4";
import { contextoDe, estadoSesion } from "../support/e4ui";
import { env } from "../support/env";

/** E4-F03 · Resolver, escalar y reabrir (3 escenarios, T01..T11). El fixture E4 se recarga antes de cada caso. */
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await reiniciarFixtureE4();
});

const abrirDetalle = async (page: Page, hduId: string, impedimentoId?: string) => {
  await page.goto(`${env.portalUrl}/hdu/${hduId}${impedimentoId ? `?impedimento=${impedimentoId}` : ""}`);
  await expect(page.getByTestId("seccion-impedimentos")).toBeVisible();
};

test.describe("E4-F03 · Gestión del QE responsable", () => {
  test.describe("QE1", () => {
    test.use({ storageState: estadoSesion("qe1") });

    test("[E4-F03#1] T01: QE1 resuelve I2 con un comentario: queda Resuelto con fecha de hoy, el comentario está en el historial, desaparece «HDU bloqueada» y en /qe/impedimentos solo queda I3", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
      await page.getByTestId(`boton-resolver-${i.I2.id}`).click();
      const dialogo = page.getByTestId("dialogo-resolver");
      await expect(dialogo).toBeVisible();
      await page.getByTestId("campo-comentario-impedimento").fill("Se entregaron las cuentas de prueba");
      await dialogo.getByRole("button", { name: "Confirmar resolución" }).click();
      await expect(page.getByTestId("mensaje-exito-impedimento")).toContainText("Impedimento resuelto");
      await expect(page.getByTestId(`estado-impedimento-${i.I2.id}`)).toHaveAttribute("data-estado", "RESUELTO");
      await expect(page.getByTestId(`impedimento-${i.I2.id}`)).toContainText("Resuelto el");
      await expect(page.getByTestId("hdu-bloqueada")).toHaveCount(0);
      await page.getByTestId(`boton-ver-historial-${i.I2.id}`).click();
      await expect(page.getByTestId(`historial-impedimento-${i.I2.id}`)).toContainText("Se entregaron las cuentas de prueba");
      await page.goto(`${env.portalUrl}/qe/impedimentos`);
      const filas = page.getByTestId("lista-impedimentos").locator("tbody tr");
      await expect(filas).toHaveCount(1);
      await expect(filas.first()).toHaveAttribute("data-testid", `fila-impedimento-${i.I3.id}`);
    });

    test("[E4-F03#1] T02 (negativo): «Confirmar» con el comentario vacío o de 2 caracteres muestra «Indica la acción tomada» y el estado no cambia", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await page.getByTestId(`boton-resolver-${i.I2.id}`).click();
      const dialogo = page.getByTestId("dialogo-resolver");
      await dialogo.getByRole("button", { name: "Confirmar resolución" }).click();
      await expect(page.getByTestId("error-comentario-impedimento")).toHaveText("Indica la acción tomada");
      await page.getByTestId("campo-comentario-impedimento").fill("ab");
      await dialogo.getByRole("button", { name: "Confirmar resolución" }).click();
      await expect(page.getByTestId("error-comentario-impedimento")).toHaveText("Indica la acción tomada");
      await expect(dialogo).toBeVisible();
      const d = await api.get<{ estado: string }>(request, `/v1/impedimentos/${i.I2.id}`, { token: await tokenE7("qe1") });
      expect(d.body.estado).toBe("ABIERTO");
    });

    test("[E4-F03#2] T03: QE1 escala I2 a LID1 con comentario: queda Escalado con responsable LID1, H1 sigue bloqueada y el historial muestra la acción de escalamiento", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await page.getByTestId(`boton-escalar-${i.I2.id}`).click();
      const dialogo = page.getByTestId("dialogo-escalar");
      await page.getByTestId("campo-destino-escalamiento").selectOption(await uid(request, "lid1"));
      await page.getByTestId("campo-comentario-impedimento").fill("Requiere gestión con TI");
      await dialogo.getByRole("button", { name: "Confirmar escalamiento" }).click();
      await expect(page.getByTestId("mensaje-exito-impedimento")).toContainText("escalado a LID1");
      const tarjeta = page.getByTestId(`impedimento-${i.I2.id}`);
      await expect(page.getByTestId(`estado-impedimento-${i.I2.id}`)).toHaveAttribute("data-estado", "ESCALADO");
      await expect(tarjeta).toContainText("LID1");
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
      await page.getByTestId(`boton-ver-historial-${i.I2.id}`).click();
      const historial = page.getByTestId(`historial-impedimento-${i.I2.id}`);
      await expect(historial).toContainText("Requiere gestión con TI");
      await expect(historial).toContainText(/Escaló/);
    });

    test("[E4-F03#2] T05 (negativo): el selector de «Escalar» ofrece LID1, ADM1 y «Otro (nombre)»; no ofrece QE1, QE2, ANA1–ANA4 ni LID2", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await page.getByTestId(`boton-escalar-${i.I2.id}`).click();
      await expect(page.getByTestId("dialogo-escalar")).toBeVisible();
      await expect(page.getByTestId("campo-destino-escalamiento").locator("option")).toHaveCount(4); // «Selecciona…», LID1, ADM1, «Otro»
      const opciones = (await page.getByTestId("campo-destino-escalamiento").locator("option").allTextContents()).map((t) => t.trim());
      expect(opciones.some((t) => t.startsWith("LID1"))).toBe(true);
      expect(opciones.some((t) => t.startsWith("ADM1"))).toBe(true);
      expect(opciones.some((t) => t.startsWith("Otro"))).toBe(true);
      for (const prohibido of ["QE1", "QE2", "ANA1", "ANA2", "ANA3", "ANA4", "LID2"]) {
        expect(opciones.some((t) => t.startsWith(prohibido)), `no debe ofrecer ${prohibido}`).toBe(false);
      }
      // Sin destino elegido, «Confirmar» pide uno y no cambia nada.
      await page.getByTestId("campo-comentario-impedimento").fill("Sin destino");
      await page.getByTestId("dialogo-escalar").getByRole("button", { name: "Confirmar escalamiento" }).click();
      await expect(page.getByTestId("error-destino-escalamiento")).toBeVisible();
    });

    test("[E4-F03#3] T06: QE1 reabre I4 (Resuelto, H2) con un motivo: vuelve a Abierto con 0 días, H2 queda bloqueada y el historial lista REGISTRAR, RESOLVER y REABRIR en ese orden", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H2.id);
      await expect(page.getByTestId("hdu-bloqueada")).toHaveCount(0);
      await page.getByTestId(`boton-reabrir-${i.I4.id}`).click();
      await page.getByTestId("campo-motivo-reabrir").fill("Volvió a cambiar el criterio");
      await page.getByTestId("dialogo-reabrir").getByRole("button", { name: "Confirmar reapertura" }).click();
      await expect(page.getByTestId("mensaje-exito-impedimento")).toContainText("reabierto");
      await expect(page.getByTestId(`estado-impedimento-${i.I4.id}`)).toHaveAttribute("data-estado", "ABIERTO");
      await expect(page.getByTestId(`impedimento-${i.I4.id}`)).toContainText("0 d");
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
      await page.getByTestId(`boton-ver-historial-${i.I4.id}`).click();
      const historial = page.getByTestId(`historial-impedimento-${i.I4.id}`);
      const items = historial.locator("li");
      await expect(items).toHaveCount(3);
      const textos = (await items.allTextContents()).map((t) => t.toLowerCase());
      expect(textos[0]).toMatch(/registr/);
      expect(textos[1]).toMatch(/resolv/);
      expect(textos[2]).toMatch(/reabri/);
    });

    test("[E4-F03#1] T09: QE1 agrega un seguimiento a I2: el historial suma SEGUIMIENTO, el estado sigue Abierto y la HDU sigue bloqueada", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await page.getByTestId(`boton-seguimiento-${i.I2.id}`).click();
      await page.getByTestId("campo-comentario-impedimento").fill("Llamé a TI, respuesta mañana");
      await page.getByTestId("dialogo-seguimiento").getByRole("button", { name: "Guardar seguimiento" }).click();
      await expect(page.getByTestId("mensaje-exito-impedimento")).toContainText("Seguimiento guardado");
      await expect(page.getByTestId(`estado-impedimento-${i.I2.id}`)).toHaveAttribute("data-estado", "ABIERTO");
      await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
      await page.getByTestId(`boton-ver-historial-${i.I2.id}`).click();
      const historial = page.getByTestId(`historial-impedimento-${i.I2.id}`);
      await expect(historial).toContainText("Llamé a TI, respuesta mañana");
      await expect(historial.locator("li")).toHaveCount(2);
    });

    test("[E4-F03#1] T09b: si el estado cambió mientras el cuadro estaba abierto, la acción recibe 409 y el portal avisa «El impedimento ya cambió de estado» y recarga", async ({ page, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await page.getByTestId(`boton-resolver-${i.I2.id}`).click();
      await page.getByTestId("campo-comentario-impedimento").fill("Resuelto desde la pantalla");
      // Otra persona (la misma API) lo resuelve primero.
      expect((await api.post(request, `/v1/impedimentos/${i.I2.id}/resolver`, { token: await tokenE7("qe1"), body: { comentario: "Resuelto por otra pestaña" } })).status).toBe(200);
      await page.getByTestId("dialogo-resolver").getByRole("button", { name: "Confirmar resolución" }).click();
      await expect(page.getByTestId("aviso-impedimento")).toContainText("El impedimento ya cambió de estado");
      await expect(page.getByTestId("dialogo-resolver")).toHaveCount(0);
      await expect(page.getByTestId(`estado-impedimento-${i.I2.id}`)).toHaveAttribute("data-estado", "RESUELTO");
    });

    test("[E4-F03#2] T11: QE1 escala I2 a ADM1 y la bandeja de ADM1 lista I2 en «escalados a mí», sin botones de gestión", async ({ page, browser, request }) => {
      const [h, i] = [await hdu(request), await imps(request)];
      await abrirDetalle(page, h.H1.id);
      await page.getByTestId(`boton-escalar-${i.I2.id}`).click();
      await page.getByTestId("campo-destino-escalamiento").selectOption(await uid(request, "adm1"));
      await page.getByTestId("campo-comentario-impedimento").fill("Requiere decisión de Administración");
      await page.getByTestId("dialogo-escalar").getByRole("button", { name: "Confirmar escalamiento" }).click();
      await expect(page.getByTestId(`estado-impedimento-${i.I2.id}`)).toHaveAttribute("data-estado", "ESCALADO");

      const adm = await contextoDe(browser, "adm1");
      try {
        await adm.page.goto(`${env.portalUrl}/admin`);
        const lista = adm.page.getByTestId("lista-impedimentos-escalados");
        await expect(lista).toContainText("Faltan cuentas de prueba con saldo");
        await expect(lista.locator("tbody tr")).toHaveCount(1);
        await expect(adm.page.locator("[data-testid^='boton-resolver-'], [data-testid^='boton-escalar-'], [data-testid^='boton-reabrir-']")).toHaveCount(0);
      } finally {
        await adm.contexto.close();
      }
    });
  });

  test("[E4-F03#2] T04: tras escalar I2 a LID1, su bandeja muestra escalados a mí 2 (I2 e I3), el bloque lista ambos y no hay botones de gestión", async ({ browser, request }) => {
    const i = await imps(request);
    const esc = await api.post(request, `/v1/impedimentos/${i.I2.id}/escalar`, { token: await tokenE7("qe1"), body: { responsableId: await uid(request, "lid1"), comentario: "Requiere gestión con TI" } });
    expect(esc.status).toBe(200);
    const lid = await contextoDe(browser, "lid1");
    try {
      await lid.page.goto(`${env.portalUrl}/lider`);
      await expect(lid.page.getByTestId("contador-escalados-a-mi")).toHaveText("2");
      const lista = lid.page.getByTestId("lista-impedimentos");
      await expect(lista.locator("tbody tr")).toHaveCount(3);
      await expect(lista).toContainText("Faltan cuentas de prueba con saldo");
      await expect(lista).toContainText("API de Pagos sin sandbox");
      await expect(lid.page.getByTestId("insignia-escalado-a-mi")).toHaveCount(2);
      await expect(lid.page.locator("[data-testid^='boton-resolver-'], [data-testid^='boton-escalar-'], [data-testid^='boton-reabrir-']")).toHaveCount(0);
      await expect(lid.page.locator("button[type=submit]")).toHaveCount(0);
    } finally {
      await lid.contexto.close();
    }
  });

  test("[E4-F03#1] T07 (negativo): ANA1 ve I2 y su historial sin botones de gestión; QE2 ve acceso denegado", async ({ browser, request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const ana = await contextoDe(browser, "ana1");
    try {
      await abrirDetalle(ana.page, h.H1.id);
      await expect(ana.page.getByTestId(`impedimento-${i.I2.id}`)).toContainText("Faltan cuentas de prueba con saldo");
      await ana.page.getByTestId(`boton-ver-historial-${i.I2.id}`).click();
      await expect(ana.page.getByTestId(`historial-impedimento-${i.I2.id}`)).toContainText("Registró el impedimento");
      for (const b of ["resolver", "escalar", "seguimiento", "reabrir"]) await expect(ana.page.locator(`[data-testid^='boton-${b}-']`)).toHaveCount(0);
      await expect(ana.page.getByTestId("nota-impedimentos-solo-lectura")).toContainText("Tu QE responsable gestiona los impedimentos");
      await expect(ana.page.getByTestId("panel-riesgo")).toHaveCount(0);
    } finally {
      await ana.contexto.close();
    }
    const qe2 = await contextoDe(browser, "qe2");
    try {
      await qe2.page.goto(`${env.portalUrl}/hdu/${h.H1.id}`);
      await expect(qe2.page.getByTestId("acceso-denegado")).toBeVisible();
    } finally {
      await qe2.contexto.close();
    }
  });

  test("[E4-F03#1] T08 (negativo): LID1, AUD1 y ADM1 ven I3 con su historial pero ningún botón de gestión ni formulario", async ({ browser, request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    for (const clave of ["lid1", "aud1", "adm1"] as const) {
      const { contexto, page } = await contextoDe(browser, clave);
      try {
        await abrirDetalle(page, h.H6.id);
        await expect(page.getByTestId(`impedimento-${i.I3.id}`), clave).toContainText("API de Pagos sin sandbox");
        await page.getByTestId(`boton-ver-historial-${i.I3.id}`).click();
        await expect(page.getByTestId(`historial-impedimento-${i.I3.id}`), clave).toContainText("Escaló");
        for (const b of ["resolver", "escalar", "seguimiento", "reabrir"]) await expect(page.locator(`[data-testid^='boton-${b}-']`), `${clave} ${b}`).toHaveCount(0);
        await expect(page.getByTestId("boton-registrar-impedimento"), clave).toHaveCount(0);
        await expect(page.getByTestId("form-impedimento"), clave).toHaveCount(0);
        await expect(page.locator("button[type=submit]"), clave).toHaveCount(0);
      } finally {
        await contexto.close();
      }
    }
  });

  test("[E4-F03#3] T10 (negativo): tras reasignar H2 a QE2 (D54), QE1 (que sigue supervisando a ANA2) ve I4 con «Solo lectura» y sin botones, y QE2 ahora ve «Reabrir»", async ({ browser, request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const adm = await tokenE7("adm1");
    const [qe1, qe2] = [await uid(request, "qe1"), await uid(request, "qe2")];
    const mover = (a: string, motivo: string) => api.put(request, `/v1/hdu/${h.H2.id}/qe-responsable`, { token: adm, body: { qeResponsableId: a, motivo } });
    expect((await mover(qe2, "Prueba de E4-F03 T10")).status).toBe(200);
    try {
      const q1 = await contextoDe(browser, "qe1");
      try {
        await q1.page.goto(`${env.portalUrl}/qe/impedimentos?resueltos=1`);
        const fila = q1.page.getByTestId(`fila-impedimento-${i.I4.id}`);
        await expect(fila).toContainText("Solo lectura");
        await abrirDetalle(q1.page, h.H2.id);
        await expect(q1.page.getByTestId(`impedimento-${i.I4.id}`)).toBeVisible();
        for (const b of ["resolver", "escalar", "seguimiento", "reabrir"]) await expect(q1.page.locator(`[data-testid^='boton-${b}-']`)).toHaveCount(0);
        await expect(q1.page.getByTestId("nota-impedimentos-solo-lectura")).toContainText("Solo el QE responsable de la HDU gestiona");
      } finally {
        await q1.contexto.close();
      }
      const q2 = await contextoDe(browser, "qe2");
      try {
        await abrirDetalle(q2.page, h.H2.id);
        await expect(q2.page.getByTestId(`boton-reabrir-${i.I4.id}`)).toBeVisible();
      } finally {
        await q2.contexto.close();
      }
    } finally {
      expect((await mover(qe1, "Se restablece el fixture de E4-F03 T10")).status).toBe(200);
    }
  });
});
