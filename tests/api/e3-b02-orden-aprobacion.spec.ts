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
  test("[E3-B02#1] orden libre (D130): acepta marcar con los anteriores pendientes, desmarca sin orden y el certificado sigue exigiendo 1 a 8", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B02ORD");
    const tokenAna = equipo.sesionAna.accessToken;
    const tokenQe = equipo.sesionCarla.accessToken;
    const leer = async () =>
      (await api.get<{ entregables: Array<{ clave: string; estado: string }> }>(request, `/v1/hdu/${equipo.hdu.id}/entregables`, { token: tokenQe })).body.entregables;

    // PLAN_PRUEBAS (el anterior) sigue PENDIENTE y aun así se puede marcar DASHBOARD y CASOS_PRUEBA.
    const marcado = await api.post<{ clave: string; estado: string }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/DASHBOARD/marcar`, {
      token: tokenAna,
      body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/orden" } },
    });
    expect(marcado.status).toBe(200);
    expect(marcado.body).toMatchObject({ clave: "DASHBOARD", estado: "POR_APROBAR" });
    await marcarConEnlace(request, tokenAna, equipo.hdu.id, "CASOS_PRUEBA");
    let estados = Object.fromEntries((await leer()).map((i) => [i.clave, i.estado]));
    expect(estados).toMatchObject({ PLAN_PRUEBAS: "PENDIENTE", DASHBOARD: "POR_APROBAR", CASOS_PRUEBA: "POR_APROBAR" });

    // Se marca PLAN_PRUEBAS y se desmarca el primero con siguientes marcados: 200.
    await marcarConEnlace(request, tokenAna, equipo.hdu.id, "PLAN_PRUEBAS");
    const desmarcado = await api.post(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/desmarcar`, {
      token: tokenAna,
      body: { motivo: "Prueba E3-B02#1: desmarcar sin seguir el orden." },
    });
    expect(desmarcado.status).toBe(200);
    estados = Object.fromEntries((await leer()).map((i) => [i.clave, i.estado]));
    expect(estados).toMatchObject({ PLAN_PRUEBAS: "PENDIENTE", DASHBOARD: "POR_APROBAR", CASOS_PRUEBA: "POR_APROBAR" });

    // El certificado sigue exigiendo 1 a 8 aprobados (D19).
    await aprobarEntregable(request, tokenQe, equipo.hdu.id, "DASHBOARD");
    const certificado = await api.post<{ codigo: string; detalles: Array<{ campo: string }> }>(request, `/v1/hdu/${equipo.hdu.id}/certificado`, { token: tokenQe });
    expect(certificado.status).toBe(409);
    expect(certificado.body.codigo).toBe("ENTREGABLES_PENDIENTES");
    expect(certificado.body.detalles.map((d) => d.campo)).toContain("PLAN_PRUEBAS");
    expect(certificado.body.detalles.map((d) => d.campo)).not.toContain("DASHBOARD");

    // Ya no hay error de orden: repetir el marcado es ENTREGABLE_YA_REGISTRADO (E3-B01#2).
    const repetido = await api.post<{ codigo: string }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/CASOS_PRUEBA/marcar`, {
      token: tokenAna,
      body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/orden" } },
    });
    expect(repetido.status).toBe(409);
    expect(repetido.body.codigo).toBe("ENTREGABLE_YA_REGISTRADO");
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
