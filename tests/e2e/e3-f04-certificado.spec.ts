import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { avanzarChecklist, crearHduAsignadaAAna } from "../support/checklist";
import { env } from "../support/env";
import { descargaChecklistConReintento } from "../support/ui";

const PATRON_FOLIO = /Q360-\d{4}-[A-Z2-7]{8}/;

interface CertificadoDescarga {
  certificado: { folio: string };
}

test.describe("E3-F04 · Certificado de cierre", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

  test("[E3-F04#1] genera y descarga el certificado con los 10 entregables completos", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F04GEN");
    await avanzarChecklist(request, equipo, 8);

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("boton-generar-certificado")).toBeEnabled();

    const descarga = await descargaChecklistConReintento(
      page,
      page.getByTestId("boton-generar-certificado"),
      page.getByTestId("aviso-certificado"),
    );
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/i);

    await expect(page.getByTestId("certificado-folio")).toContainText(PATRON_FOLIO);
    await expect(page.getByTestId("certificado-folio")).toContainText("emitido por");
    // El entregable 9 (CERTIFICADO) queda automáticamente aprobado (D19).
    await expect(page.getByTestId("estado-CERTIFICADO")).toHaveText("Aprobado");

    // D21: la verificación pública del folio, desde el portal, sin sesión.
    const textoFolio = await page.getByTestId("certificado-folio").innerText();
    const folio = textoFolio.match(PATRON_FOLIO)?.[0];
    expect(folio).toBeTruthy();
    await page.goto(`${env.portalUrl}/verificar/${folio}`);
    await expect(page.getByTestId("verificacion-valida")).toBeVisible();
    await expect(page.getByTestId("verificacion-valida")).toContainText(equipo.hdu.codigo);
  });

  test("[E3-F04#2] con un entregable pendiente, el botón está deshabilitado y muestra el motivo", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F04INC");
    // 3 de los 8 exigidos: faltan APROBACION_CASOS, EJECUCION, EVIDENCIAS, DEFECTOS y APROBACION_UAT.
    await avanzarChecklist(request, equipo, 3);

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("boton-generar-certificado")).toBeDisabled();
    await expect(page.getByTestId("motivo-certificado-deshabilitado")).toContainText("Faltan entregables por aprobar");
    await expect(page.getByTestId("motivo-certificado-deshabilitado")).toContainText("Aprobación de casos de prueba");
  });

  test("[E3-F04#3] con la HDU ya certificada, se puede volver a descargar el mismo certificado", async ({ page, request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3F04RED");
    await avanzarChecklist(request, equipo, 8);
    const generado = await api.post<CertificadoDescarga>(request, `/v1/hdu/${equipo.hdu.id}/certificado`, {
      token: equipo.sesionCarla.accessToken,
    });
    expect(generado.status).toBe(201);

    await page.goto(`${env.portalUrl}/hdu/${equipo.hdu.id}`);
    await expect(page.getByTestId("boton-generar-certificado")).toHaveCount(0);
    await expect(page.getByTestId("certificado-folio")).toContainText(generado.body.certificado.folio);

    const descarga = await descargaChecklistConReintento(
      page,
      page.getByTestId("boton-descargar-certificado"),
      page.getByTestId("aviso-certificado"),
    );
    expect(descarga.suggestedFilename()).toBe(`${generado.body.certificado.folio}.pdf`);
  });
});
