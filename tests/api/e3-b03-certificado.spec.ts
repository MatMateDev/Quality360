import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { avanzarChecklist, crearHduAsignadaAAna } from "../support/checklist";

interface CertificadoDescarga {
  hduId: string;
  certificado: { folio: string; emitido: { id: string; nombre: string; fecha: string }; huellaSha256: string };
  descarga: { url: string; expiraEn: string };
}

interface VerificacionCertificado {
  folio: string;
  valido: boolean;
  hdu: { codigo: string; titulo: string };
  emitidoEn: string;
  emitidoPor: string;
  huellaSha256: string;
}

const PATRON_FOLIO = /^Q360-\d{4}-[A-Z2-7]{8}$/;

test.describe("E3-B03 · Certificado en PDF con código verificable", () => {
  test("[E3-B03#1] genera el PDF con folio único y lo deja almacenado", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B03GEN");
    await avanzarChecklist(request, equipo, 8);

    const generado = await api.post<CertificadoDescarga>(request, `/v1/hdu/${equipo.hdu.id}/certificado`, { token: equipo.sesionCarla.accessToken });
    expect(generado.status).toBe(201);
    expect(generado.body.hduId).toBe(equipo.hdu.id);
    expect(generado.body.certificado.folio).toMatch(PATRON_FOLIO);
    expect(generado.body.certificado.huellaSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(generado.body.descarga.url).toContain("certificados");

    // Se queda almacenado: una nueva solicitud de generación es un conflicto, y volver a
    // descargarlo con GET trae el mismo folio (D19, E3-F04#3).
    const reintento = await api.post(request, `/v1/hdu/${equipo.hdu.id}/certificado`, { token: equipo.sesionCarla.accessToken });
    expect(reintento.status).toBe(409);
    expect(reintento.body).toMatchObject({ codigo: "CERTIFICADO_EXISTENTE" });

    const redescarga = await api.get<CertificadoDescarga>(request, `/v1/hdu/${equipo.hdu.id}/certificado`, { token: equipo.sesionCarla.accessToken });
    expect(redescarga.status).toBe(200);
    expect(redescarga.body.certificado.folio).toBe(generado.body.certificado.folio);

    // El entregable 9 (CERTIFICADO) queda automáticamente APROBADO con el folio como evidencia (D19).
    const checklist = await api.get<{ entregables: Array<{ clave: string; estado: string; evidencia: { tipo: string; folio?: string } | null }> }>(
      request,
      `/v1/hdu/${equipo.hdu.id}/entregables`,
      { token: equipo.sesionCarla.accessToken },
    );
    const entregableCertificado = checklist.body.entregables.find((item) => item.clave === "CERTIFICADO");
    expect(entregableCertificado).toMatchObject({ estado: "APROBADO", evidencia: { tipo: "CERTIFICADO", folio: generado.body.certificado.folio } });
  });

  test("[E3-B03#2] la verificación pública confirma HDU, fecha y validez; un folio desconocido da 404", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B03VER");
    await avanzarChecklist(request, equipo, 8);
    const generado = await api.post<CertificadoDescarga>(request, `/v1/hdu/${equipo.hdu.id}/certificado`, { token: equipo.sesionCarla.accessToken });
    const folio = generado.body.certificado.folio;

    // Pública: sin token, y sin pasar por sesión alguna (D21).
    const verificacion = await api.get<VerificacionCertificado>(request, `/v1/certificados/${encodeURIComponent(folio)}/verificacion`);
    expect(verificacion.status).toBe(200);
    expect(verificacion.body).toMatchObject({
      folio,
      valido: true,
      hdu: { codigo: equipo.hdu.codigo },
      huellaSha256: generado.body.certificado.huellaSha256,
    });
    expect(verificacion.body.emitidoEn).toBeTruthy();

    const desconocido = await api.get(request, "/v1/certificados/Q360-2000-AAAAAAAA/verificacion");
    expect(desconocido.status).toBe(404);
  });

  test("[E3-B03#3] rechaza generar el certificado si falta un entregable, indicando el faltante", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B03FAL");
    // 7 de los 8 exigidos (D19): falta exactamente APROBACION_UAT.
    await avanzarChecklist(request, equipo, 7);

    const respuesta = await api.post<{ codigo: string; detalles: Array<{ campo: string }> }>(request, `/v1/hdu/${equipo.hdu.id}/certificado`, {
      token: equipo.sesionCarla.accessToken,
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe("ENTREGABLES_PENDIENTES");
    expect(respuesta.body.detalles).toEqual([{ campo: "APROBACION_UAT", codigo: "REQUERIDO", mensaje: expect.stringContaining("Aprobación UAT") }]);
  });
});
