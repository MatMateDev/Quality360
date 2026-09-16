import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearHdu, obtenerCatalogos, obtenerUsuarioPorCorreo } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface EventoBase {
  tipo: "ESTADO" | "ASIGNACION";
  fecha: string;
  actor: { id: string; nombre: string };
}
interface EventoEstado extends EventoBase {
  tipo: "ESTADO";
  estadoAnterior: string | null;
  estadoNuevo: string;
}
interface EventoAsignacion extends EventoBase {
  tipo: "ASIGNACION";
  analistaAnterior: { correo: string } | null;
  analistaNuevo: { correo: string };
  motivo: string | null;
}

test.describe("E2-B04 · Historial de HDU", () => {
  test("[E2-B04#1] registra estado anterior, nuevo, actor y fecha al cambiar de estado", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2B04EST"), celulaId: celula.id, sprintId: sprint.id });

    await api.post(request, `/v1/hdu/${hdu.id}/estado`, { token: sesion.accessToken, body: { estado: "DISENO_PRUEBAS" } });

    const historial = await api.get<{ items: Array<EventoEstado | EventoAsignacion> }>(request, `/v1/hdu/${hdu.id}/historial`, { token: sesion.accessToken });
    expect(historial.status).toBe(200);

    const eventoCreacion = historial.body.items.find((e): e is EventoEstado => e.tipo === "ESTADO" && e.estadoNuevo === "PENDIENTE");
    expect(eventoCreacion).toBeTruthy();
    expect(eventoCreacion?.estadoAnterior).toBeNull();

    const eventoCambio = historial.body.items.find((e): e is EventoEstado => e.tipo === "ESTADO" && e.estadoNuevo === "DISENO_PRUEBAS");
    expect(eventoCambio).toBeTruthy();
    expect(eventoCambio?.estadoAnterior).toBe("PENDIENTE");
    expect(eventoCambio?.actor.id).toBe(sesion.userId);
  });

  test("[E2-B04#2] registra analista anterior, nuevo y motivo al reasignar", async ({ request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2B04ASIG"), celulaId: celula.id, sprintId: sprint.id });

    const ana = await obtenerUsuarioPorCorreo(request, sesionAdmin.accessToken, USUARIOS_SEMILLA.ana.correo);
    const beatriz = await obtenerUsuarioPorCorreo(request, sesionAdmin.accessToken, USUARIOS_SEMILLA.beatriz.correo);
    await api.put(request, `/v1/hdu/${hdu.id}/analista`, { token: sesion.accessToken, body: { analistaId: ana.id } });
    const motivo = "Motivo de prueba E2-B04#2.";
    await api.put(request, `/v1/hdu/${hdu.id}/analista`, { token: sesion.accessToken, body: { analistaId: beatriz.id, motivo } });

    const historial = await api.get<{ items: Array<EventoEstado | EventoAsignacion> }>(request, `/v1/hdu/${hdu.id}/historial`, { token: sesion.accessToken });
    const eventoReasignacion = historial.body.items.find(
      (e): e is EventoAsignacion => e.tipo === "ASIGNACION" && e.analistaNuevo.correo === USUARIOS_SEMILLA.beatriz.correo,
    );
    expect(eventoReasignacion).toBeTruthy();
    expect(eventoReasignacion?.analistaAnterior?.correo).toBe(USUARIOS_SEMILLA.ana.correo);
    expect(eventoReasignacion?.motivo).toBe(motivo);
  });

  test("[E2-B04#3] un usuario autorizado consulta el historial en orden cronológico", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2B04ORD"), celulaId: celula.id, sprintId: sprint.id });
    await api.post(request, `/v1/hdu/${hdu.id}/estado`, { token: sesion.accessToken, body: { estado: "DISENO_PRUEBAS" } });
    await api.post(request, `/v1/hdu/${hdu.id}/estado`, { token: sesion.accessToken, body: { estado: "EN_EJECUCION" } });

    const historial = await api.get<{ items: Array<EventoBase> }>(request, `/v1/hdu/${hdu.id}/historial`, { token: sesion.accessToken });
    expect(historial.status).toBe(200);
    expect(historial.body.items.length).toBeGreaterThanOrEqual(3);

    const fechas = historial.body.items.map((item) => new Date(item.fecha).getTime());
    const ordenadas = [...fechas].sort((a, b) => a - b);
    expect(fechas).toEqual(ordenadas);

    // Un usuario sin relación con la HDU no puede consultarla (mismo ámbito que el detalle).
    const sesionFrancisco = await iniciarSesion(USUARIOS_SEMILLA.francisco.correo, env.contrasenaDemo);
    const denegado = await api.get(request, `/v1/hdu/${hdu.id}/historial`, { token: sesionFrancisco.accessToken });
    expect(denegado.status).toBe(403);
  });
});
