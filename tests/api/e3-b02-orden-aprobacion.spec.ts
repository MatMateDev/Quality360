import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { aprobarEntregable, crearHduAsignadaAAna, marcarConEnlace } from "../support/checklist";

interface ResumenChecklist {
  totalEntregables: number;
  completados: number;
  porcentajeCumplimiento: number;
  completo: boolean;
}

test.describe("E3-B02 · Orden y aprobaciones del checklist", () => {
  test("[E3-B02#1] rechaza marcar fuera de orden, indicando la dependencia", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B02ORD");

    // PLAN_PRUEBAS (el anterior) sigue PENDIENTE: no se puede marcar DASHBOARD.
    const respuesta = await api.post<{ codigo: string; detalles: Array<{ campo: string }> }>(
      request,
      `/v1/hdu/${equipo.hdu.id}/entregables/DASHBOARD/marcar`,
      { token: equipo.sesionAna.accessToken, body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/orden" } } },
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe("ORDEN_ENTREGABLES");
    expect(respuesta.body.detalles.some((detalle) => detalle.campo === "PLAN_PRUEBAS")).toBe(true);
  });

  test("[E3-B02#2] solo el QE responsable aprueba: el analista es rechazado", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B02APR");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");

    const intentoAnalista = await api.post(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/aprobar`, {
      token: equipo.sesionAna.accessToken,
    });
    expect(intentoAnalista.status).toBe(403);
    expect(intentoAnalista.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });

    // El QE responsable sí puede: confirma que el rechazo anterior fue por rol/relación, no por otra razón.
    const aprobado = await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    expect(aprobado).toMatchObject({ clave: "PLAN_PRUEBAS", estado: "APROBADO" });
  });

  test("[E3-B02#3] el porcentaje se recalcula sobre los 10 entregables al cambiar un estado", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B02PCT");

    const inicial = await api.get<{ resumen: ResumenChecklist }>(request, `/v1/hdu/${equipo.hdu.id}/entregables`, {
      token: equipo.sesionCarla.accessToken,
    });
    expect(inicial.body.resumen).toMatchObject({ totalEntregables: 10, completados: 0, porcentajeCumplimiento: 0, completo: false });

    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    const conUnoPorAprobar = await api.get<{ resumen: ResumenChecklist }>(request, `/v1/hdu/${equipo.hdu.id}/entregables`, {
      token: equipo.sesionCarla.accessToken,
    });
    // "Completo" = aprobado (D16): marcar por sí solo no mueve el porcentaje.
    expect(conUnoPorAprobar.body.resumen).toMatchObject({ completados: 0, porcentajeCumplimiento: 0 });

    await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    const conUnoAprobado = await api.get<{ resumen: ResumenChecklist }>(request, `/v1/hdu/${equipo.hdu.id}/entregables`, {
      token: equipo.sesionCarla.accessToken,
    });
    expect(conUnoAprobado.body.resumen).toMatchObject({ completados: 1, porcentajeCumplimiento: 10, completo: false });

    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "DASHBOARD");
    await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "DASHBOARD");
    const conDosAprobados = await api.get<{ resumen: ResumenChecklist }>(request, `/v1/hdu/${equipo.hdu.id}/entregables`, {
      token: equipo.sesionCarla.accessToken,
    });
    expect(conDosAprobados.body.resumen).toMatchObject({ completados: 2, porcentajeCumplimiento: 20, completo: false });
  });
});
