import { expect, test, type Page } from "@playwright/test";
import { api } from "../support/api";
import { hdu, hoySantiago, imps, reiniciarFixtureE4 } from "../support/e4";
import { paginaDe } from "../support/e6ui";
import { estadoHdu, fotoE6, JUSTIFICACION_40, llevarAPendienteCierre, restaurarE6, tkLocal, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnOrganizacion, type PilaE6 } from "../support/entornoE6";
import { env } from "../support/env";

/** E6-F05 · Cierre con excepción en el detalle de la HDU (10 casos). */
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
});
test.beforeEach(async () => {
  await restaurarE6(foto);
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const abrirHdu = async (page: Page, id: string, base = env.portalUrl) => {
  await page.goto(`${base}/hdu/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
};
const ddmmaaaa = () => hoySantiago().split("-").reverse().join("-");
const cerrarApi = async (request: any, id: string) =>
  expect((await api.post(request, `/v1/hdu/${id}/estado`, { token: await tkLocal("qe1"), body: { estado: "CERRADA", justificacion: JUSTIFICACION_40 } })).status).toBe(200);

test.describe("E6-F05 · Cierre con excepción", () => {
  test("[E6-F05#1] E6-F05-T01: QE1 abre H2 en PENDIENTE_CIERRE y pulsa «Cerrar con excepción»: el cuadro dice «Quedan 9 entregables sin aprobar», los lista y trae contador", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrirHdu(page, h.H2.id);
    await page.getByTestId("boton-cerrar-excepcion").click();
    const d = page.getByTestId("dialogo-cierre-excepcion");
    await expect(d).toBeVisible();
    await expect(d.getByTestId("resumen-pendientes-cierre")).toContainText("Quedan 9 entregables sin aprobar");
    await expect(d.getByTestId("lista-pendientes-cierre").locator("li")).toHaveCount(9);
    await expect(d.getByTestId("contador-justificacion-cierre")).toBeVisible();
    await expect(d).toContainText("No se emitirá certificado y la HDU no podrá reabrirse");
    await contexto.close();
  });

  test("[E6-F05#2] E6-F05-T02: confirmar vacío, con 19 caracteres o intentar 501 muestra su mensaje, el contador limita a 500 y la HDU sigue en PENDIENTE_CIERRE", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrirHdu(page, h.H2.id);
    await page.getByTestId("boton-cerrar-excepcion").click();
    const d = page.getByTestId("dialogo-cierre-excepcion");
    await d.getByTestId("boton-confirmar-cierre-excepcion").click();
    await expect(d.getByTestId("error-justificacion-cierre")).toHaveText("La justificación es obligatoria");
    await d.getByTestId("campo-justificacion-cierre").fill("x".repeat(19));
    await d.getByTestId("boton-confirmar-cierre-excepcion").click();
    await expect(d.getByTestId("error-justificacion-cierre")).toHaveText("La justificación debe tener entre 20 y 500 caracteres");
    await expect(d).toBeVisible();
    await d.getByTestId("campo-justificacion-cierre").fill("y".repeat(501));
    expect((await d.getByTestId("campo-justificacion-cierre").inputValue()).length).toBeLessThanOrEqual(500);
    await expect(d.getByTestId("contador-justificacion-cierre")).toContainText("500");
    expect(await estadoHdu(request, h.H2.id)).toBe("PENDIENTE_CIERRE");
    await contexto.close();
  });

  test("[E6-F05#1] E6-F05-T03: con 40 caracteres y confirmar la HDU queda Cerrada y el bloque dice «Cerrada con excepción: 1 de 10 entregables aprobados» con justificación, «QE1» y la fecha de hoy", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrirHdu(page, h.H2.id);
    await page.getByTestId("boton-cerrar-excepcion").click();
    const j = "Se descarta el alcance restante del sprint.".slice(0, 40);
    await page.getByTestId("campo-justificacion-cierre").fill(j);
    await page.getByTestId("boton-confirmar-cierre-excepcion").click();
    const b = page.getByTestId("cierre-excepcion");
    await expect(b).toBeVisible();
    await expect(b).toContainText("Cerrada con excepción: 1 de 10 entregables aprobados");
    await expect(b.getByTestId("cierre-justificacion")).toHaveText(j);
    await expect(b).toContainText("QE1");
    await expect(b).toContainText(ddmmaaaa());
    expect(await estadoHdu(request, h.H2.id)).toBe("CERRADA");
    await contexto.close();
  });

  test("[E6-F05#3] E6-F05-T04: QE1 ve «Sin certificado», no hay botón de generar certificado, el checklist trae los 9 pendientes y no hay botón de reabrir", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    await cerrarApi(request, h.H2.id);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrirHdu(page, h.H2.id);
    await expect(page.getByTestId("sin-certificado")).toContainText("Sin certificado");
    await expect(page.getByRole("button", { name: /generar certificado/i })).toHaveCount(0);
    await expect(page.getByTestId("cierre-pendientes").locator("li")).toHaveCount(9);
    await expect(page.getByRole("button", { name: /reabrir|pasar a/i })).toHaveCount(0);
    await expect(page.getByTestId("boton-cerrar-excepcion")).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F05#3] E6-F05-T05: LID1 y AUD1 ven el bloque de cierre y el evento «Cierre con excepción» con la justificación, sin botones de acción", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    await cerrarApi(request, h.H2.id);
    for (const local of ["lid1", "aud1"]) {
      const { contexto, page } = await paginaDe(browser, local);
      await abrirHdu(page, h.H2.id);
      await expect(page.getByTestId("cierre-excepcion"), local).toBeVisible();
      await expect(page.getByTestId("historial-cierre-excepcion"), local).toContainText("Cierre con excepción");
      await expect(page.getByTestId("historial-justificacion"), local).toContainText(JUSTIFICACION_40);
      await expect(page.getByTestId("boton-cerrar-excepcion")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /pasar a/i })).toHaveCount(0);
      await contexto.close();
    }
  });

  test("[E6-F05#1] E6-F05-T06: con H5 en PENDIENTE_CIERRE (menos de 10 aprobados) ningún otro rol tiene el botón; QE2 y ANA2 además no acceden", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H5");
    for (const local of ["qe2", "ana2", "lid1", "aud1", "adm1"]) {
      const { contexto, page } = await paginaDe(browser, local);
      await page.goto(`${env.portalUrl}/hdu/${h.H5.id}`);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("boton-cerrar-excepcion"), local).toHaveCount(0);
      if (local === "qe2" || local === "ana2") {
        const r = await api.get(request, `/v1/hdu/${h.H5.id}`, { token: await tkLocal(local) });
        expect([403, 404], local).toContain(r.status);
        await expect(page.getByRole("heading", { level: 1, name: "Historia E7 H5" }), local).toHaveCount(0);
        await expect(page.getByText(/acceso|permiso|no encontr|no existe/i).first(), local).toBeVisible();
      }
      await contexto.close();
    }
  });

  test("[E6-F05#2] E6-F05-T07: H1 con I2 abierto: confirmar muestra el rechazo de E4 con enlace a I2, la HDU sigue en PENDIENTE_CIERRE y al resolver I2 y repetir se cierra", async ({ browser, request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    try {
      await llevarAPendienteCierre(request, "H1");
      const { contexto, page } = await paginaDe(browser, "qe1");
      await abrirHdu(page, h.H1.id);
      await page.getByTestId("boton-cerrar-excepcion").click();
      await page.getByTestId("campo-justificacion-cierre").fill(JUSTIFICACION_40);
      await page.getByTestId("boton-confirmar-cierre-excepcion").click();
      const e = page.getByTestId("error-hdu-bloqueada");
      await expect(e).toContainText("No se puede cerrar la HDU: tiene 1 impedimento abierto o escalado. Resuélvelos y vuelve a intentar.");
      await expect(page.getByTestId("lista-error-bloqueantes").locator(`a[href*="${i.I2.id}"]`)).toBeVisible();
      expect(await estadoHdu(request, h.H1.id)).toBe("PENDIENTE_CIERRE");
      await page.getByTestId("dialogo-cierre-excepcion").getByRole("button", { name: "Cancelar" }).click();
      await page.getByTestId(`boton-resolver-${i.I2.id}`).click();
      await page.getByTestId("campo-comentario-impedimento").fill("Se entregaron las cuentas");
      await page.getByTestId("dialogo-resolver").getByRole("button", { name: "Confirmar resolución" }).click();
      await expect(page.getByTestId(`estado-impedimento-${i.I2.id}`)).toHaveAttribute("data-estado", "RESUELTO");
      await page.getByTestId("boton-cerrar-excepcion").click();
      await page.getByTestId("campo-justificacion-cierre").fill(JUSTIFICACION_40);
      await page.getByTestId("boton-confirmar-cierre-excepcion").click();
      await expect(page.getByTestId("cierre-excepcion")).toContainText("Cerrada con excepción: 3 de 10");
      expect(await estadoHdu(request, h.H1.id)).toBe("CERRADA");
      await contexto.close();
    } finally {
      await reiniciarFixtureE4();
    }
  });

  test("[E6-F05#1] E6-F05-T08: con H8 (10 aprobados) el botón es «Pasar a Cerrada», no pide justificación y queda Cerrada sin bloque de excepción", async ({ browser, request }) => {
    const h = await hdu(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrirHdu(page, h.H8.id);
    await expect(page.getByTestId("boton-cerrar-excepcion")).toHaveCount(0);
    await page.getByRole("button", { name: "Pasar a Cerrada" }).click();
    await expect.poll(() => estadoHdu(request, h.H8.id)).toBe("CERRADA");
    await expect(page.getByTestId("campo-justificacion-cierre")).toHaveCount(0);
    await expect(page.getByTestId("cierre-excepcion")).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-F05#2] E6-F05-T09: con Certificaciones detenido cerrar muestra «No pudimos verificar el checklist de la HDU», no abre el cuadro y la HDU no cambia", async ({ browser, request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnOrganizacion(true);
      const { contexto, page } = await paginaDe(browser, "qe1", pila.portalUrl);
      await abrirHdu(page, h.H2.id, pila.portalUrl);
      const excepcion = page.getByTestId("boton-cerrar-excepcion");
      if (await excepcion.count()) await excepcion.click();
      else await page.getByRole("button", { name: "Pasar a Cerrada" }).click();
      await expect(page.getByText("No pudimos verificar el checklist de la HDU").first()).toBeVisible();
      await expect(page.getByTestId("dialogo-cierre-excepcion")).toHaveCount(0);
      expect(await estadoHdu(request, h.H2.id)).toBe("PENDIENTE_CIERRE");
      await contexto.close();
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-F05#regresion] E6-F05-T10: el detalle de la HDU sigue mostrando checklist y acciones a QE1, ANA1 y AUD1 (el detalle de E2-F04, E3-F01 y E7-F03 va en la regresión completa)", async ({ browser, request }) => {
    const h = await hdu(request);
    for (const [local, id, cambiarEstado] of [["qe1", h.H2.id, true], ["ana1", h.H1.id, false], ["aud1", h.H2.id, false]] as const) {
      const { contexto, page } = await paginaDe(browser, local);
      await abrirHdu(page, id);
      await expect(page.getByText("Checklist", { exact: false }).first(), local).toBeVisible();
      await expect(page.getByTestId("boton-cerrar-excepcion"), local).toHaveCount(0);
      if (cambiarEstado) await expect(page.getByRole("heading", { name: "Cambiar estado" })).toBeVisible();
      await contexto.close();
    }
  });
});
