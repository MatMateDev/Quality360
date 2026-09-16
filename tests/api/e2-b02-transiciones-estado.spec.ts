import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { avanzarEstadoHdu, crearHdu, obtenerCatalogos } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E2-B02 · Transiciones de estado de HDU", () => {
  test("[E2-B02#1] acepta y registra una transición válida", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2B02OK"), celulaId: celula.id, sprintId: sprint.id });

    const respuesta = await api.post<{ estadoAnterior: string; estadoNuevo: string; transicionesPermitidas: string[] }>(
      request,
      `/v1/hdu/${hdu.id}/estado`,
      { token: sesion.accessToken, body: { estado: "DISENO_PRUEBAS" } },
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estadoAnterior).toBe("PENDIENTE");
    expect(respuesta.body.estadoNuevo).toBe("DISENO_PRUEBAS");
    expect(respuesta.body.transicionesPermitidas).toEqual(["EN_EJECUCION"]);
  });

  test("[E2-B02#2] rechaza una transición inválida indicando las permitidas", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2B02INV"), celulaId: celula.id, sprintId: sprint.id });

    const respuesta = await api.post<{ codigo: string; estadoActual: string; estadoSolicitado: string; transicionesPermitidas: string[] }>(
      request,
      `/v1/hdu/${hdu.id}/estado`,
      { token: sesion.accessToken, body: { estado: "CERRADA" } },
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe("TRANSICION_INVALIDA");
    expect(respuesta.body.estadoActual).toBe("PENDIENTE");
    expect(respuesta.body.transicionesPermitidas).toEqual(["DISENO_PRUEBAS"]);
  });

  test("[E2-B02#3] rechaza el cierre porque el checklist no está disponible para verificarse (D11)", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2B02CIE"), celulaId: celula.id, sprintId: sprint.id });

    await avanzarEstadoHdu(request, sesion.accessToken, hdu.id, "DISENO_PRUEBAS");
    await avanzarEstadoHdu(request, sesion.accessToken, hdu.id, "EN_EJECUCION");
    await avanzarEstadoHdu(request, sesion.accessToken, hdu.id, "PENDIENTE_CIERRE");

    const cierre = await api.post<{ codigo: string; checklist: { fuente: string; estado: string } }>(
      request,
      `/v1/hdu/${hdu.id}/estado`,
      { token: sesion.accessToken, body: { estado: "CERRADA" } },
    );

    expect(cierre.status).toBe(409);
    expect(cierre.body.codigo).toBe("CHECKLIST_NO_DISPONIBLE");
    expect(cierre.body.checklist).toMatchObject({ fuente: "certificaciones.checklist", estado: "indisponible" });

    // La HDU sigue en PENDIENTE_CIERRE: el rechazo no dejó un estado a medias.
    const detalle = await api.get<{ estado: string }>(request, `/v1/hdu/${hdu.id}`, { token: sesion.accessToken });
    expect(detalle.body.estado).toBe("PENDIENTE_CIERRE");
  });
});
