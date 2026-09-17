import path from "node:path";
import { expect, test } from "@playwright/test";
import { crearHduAsignadaAAna, marcarConEnlace, NOMBRES_ENTREGABLE, pdfDePrueba } from "../support/checklist";
import { env } from "../support/env";
import { confirmarDialogoChecklistConReintento } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E3-F02 · Marcar entregables con evidencia", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

  test("[E3-F02#1] marca un entregable adjuntando un archivo y queda con mi nombre y fecha", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F02ARC");

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await page.getByTestId("boton-marcar-PLAN_PRUEBAS").click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole("radio", { name: "Archivo" }).check();
    await dialogo.getByLabel(/Archivo \(PDF, PNG o JPEG/).setInputFiles(pdfDePrueba());
    await confirmarDialogoChecklistConReintento(page, dialogo);

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Por aprobar");
    await expect(page.getByTestId("completado-PLAN_PRUEBAS")).toContainText(`Completado por ${USUARIOS_SEMILLA.ana.nombre}`);
    await expect(page.getByTestId("evidencia-PLAN_PRUEBAS")).toContainText("Descargar evidencia-prueba.pdf");
  });

  test("[E3-F02#2] informa que debe completar el entregable anterior antes de marcar el siguiente", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F02ORD");

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    // PLAN_PRUEBAS (el anterior obligatorio) sigue pendiente: no se puede marcar DASHBOARD.
    await page.getByTestId("boton-marcar-DASHBOARD").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("aviso-DASHBOARD")).toContainText(`Completa «${NOMBRES_ENTREGABLE.PLAN_PRUEBAS}»`);
    await expect(page.getByTestId("estado-DASHBOARD")).toHaveText("Pendiente");
  });

  test("[E3-F02#3] desmarca un entregable indicando el motivo y registra el retroceso", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F02DES");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    const motivo = "Prueba E3-F02#3: se desmarca desde la interfaz.";

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Por aprobar");
    await page.getByTestId("boton-desmarcar-PLAN_PRUEBAS").click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel("Motivo del retroceso").fill(motivo);
    await confirmarDialogoChecklistConReintento(page, dialogo);

    await expect(dialogo).toHaveCount(0);
    await expect(page.getByTestId("estado-PLAN_PRUEBAS")).toHaveText("Pendiente");
    await expect(page.getByTestId("completado-PLAN_PRUEBAS")).toHaveText("Sin completar");

    await page.getByTestId("bitacora-checklist").locator("summary").click();
    await expect(page.getByTestId("bitacora-item-0")).toContainText("desmarcó");
    await expect(page.getByTestId("bitacora-item-0")).toContainText(motivo);
  });
});
