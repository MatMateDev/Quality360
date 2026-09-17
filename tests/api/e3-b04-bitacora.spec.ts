import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { aprobarEntregable, crearHduAsignadaAAna, marcarConEnlace } from "../support/checklist";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface EventoChecklist {
  id: string;
  accion: "MARCAR" | "DESMARCAR" | "APROBAR" | "RECHAZAR" | "GENERAR_CERTIFICADO";
  clave: string;
  actor: { id: string; nombre: string; rol: string };
  fecha: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  motivo: string | null;
}

test.describe("E3-B04 · Bitácora de entregables y certificados", () => {
  test("[E3-B04#1] registra actor, fecha, valor anterior y nuevo al marcar y aprobar", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B04REG");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");

    const bitacora = await api.get<{ eventos: EventoChecklist[] }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/bitacora`, {
      token: equipo.sesionCarla.accessToken,
    });
    expect(bitacora.status).toBe(200);

    const marcar = bitacora.body.eventos.find((evento) => evento.accion === "MARCAR" && evento.clave === "PLAN_PRUEBAS");
    expect(marcar?.actor).toMatchObject({ id: equipo.sesionAna.userId, nombre: USUARIOS_SEMILLA.ana.nombre, rol: "ANALISTA_QA" });
    expect(marcar?.fecha).toBeTruthy();
    // Antes del primer marcado no existe registro del entregable (implícitamente
    // PENDIENTE): el valor anterior es null, tal como permite el contrato
    // (`EventoChecklist.valorAnterior: [object, 'null']`).
    expect(marcar?.valorAnterior).toBeNull();
    expect(marcar?.valorNuevo).toMatchObject({ estado: "POR_APROBAR" });

    const aprobar = bitacora.body.eventos.find((evento) => evento.accion === "APROBAR" && evento.clave === "PLAN_PRUEBAS");
    expect(aprobar?.actor).toMatchObject({ id: equipo.sesionCarla.userId, nombre: USUARIOS_SEMILLA.carla.nombre, rol: "QE" });
    expect(aprobar?.valorAnterior).toMatchObject({ estado: "POR_APROBAR" });
    expect(aprobar?.valorNuevo).toMatchObject({ estado: "APROBADO" });
  });

  test("[E3-B04#2] conserva el motivo al desmarcar", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B04MOT");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    const motivo = "Evidencia incorrecta, se vuelve a preparar (prueba E3-B04#2).";
    const desmarcado = await api.post(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/desmarcar`, {
      token: equipo.sesionAna.accessToken,
      body: { motivo },
    });
    expect(desmarcado.status).toBe(200);

    const bitacora = await api.get<{ eventos: EventoChecklist[] }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/bitacora`, {
      token: equipo.sesionAna.accessToken,
    });
    const desmarcar = bitacora.body.eventos.find((evento) => evento.accion === "DESMARCAR" && evento.clave === "PLAN_PRUEBAS");
    expect(desmarcar?.motivo).toBe(motivo);
    expect(desmarcar?.valorNuevo).toMatchObject({ estado: "PENDIENTE" });
  });

  test("[E3-B04#3] un usuario autorizado consulta la bitácora completa; uno sin relación es rechazado", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B04CON");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "DASHBOARD");

    const bitacora = await api.get<{ hduId: string; eventos: EventoChecklist[] }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/bitacora`, {
      token: equipo.sesionCarla.accessToken,
    });
    expect(bitacora.status).toBe(200);
    expect(bitacora.body.hduId).toBe(equipo.hdu.id);
    expect(bitacora.body.eventos.length).toBeGreaterThanOrEqual(3);
    const acciones = bitacora.body.eventos.map((evento) => evento.accion);
    expect(acciones).toEqual(expect.arrayContaining(["MARCAR", "APROBAR"]));

    // Un analista sin ninguna relación con esta HDU (ni asignado, ni su QE es el responsable) queda fuera (D12).
    const sesionFrancisco = await iniciarSesion(USUARIOS_SEMILLA.francisco.correo, env.contrasenaDemo);
    const denegado = await api.get(request, `/v1/hdu/${equipo.hdu.id}/entregables/bitacora`, { token: sesionFrancisco.accessToken });
    expect(denegado.status).toBe(403);
  });
});
