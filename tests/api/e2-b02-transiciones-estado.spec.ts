import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { aprobarEntregable, crearHduAsignadaAAna, marcarConEnlace, ORDEN_ENTREGABLES } from "../support/checklist";
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

  /**
   * Interpretación actualizada por E3 (`docs/arquitectura/decisiones-mvp.md`,
   * «Efectos de E3 sobre E1 y E2»): Certificaciones ya responde el checklist,
   * así que este escenario ya no representa la fuente caída
   * (`CHECKLIST_NO_DISPONIBLE`, cubierto ahora por
   * `tests/api/e2-b02-transiciones-estado.spec.ts` solo si Certificaciones
   * no respondiera, lo que no ocurre en esta corrida con el stack real
   * arriba) sino el checklist incompleto real: se avanza a 2 de los 10
   * entregables (aprobados) y se verifica 409 `CHECKLIST_INCOMPLETO` con el
   * avance real (`completados`/`porcentajeCumplimiento`), no un `0` ni una
   * marca de «indisponible». Se conserva lo que ya verificaba el escenario
   * (código de error, forma del bloque `checklist` y que la HDU no queda en
   * un estado a medias) y se agrega la comprobación del avance real que trae
   * E3.
   */
  test("[E2-B02#3] rechaza el cierre con el checklist incompleto, mostrando el avance real (D11, E3)", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E2B02CIE");
    for (const clave of ORDEN_ENTREGABLES.slice(0, 2)) {
      await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, clave);
      await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, clave);
    }

    await avanzarEstadoHdu(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "DISENO_PRUEBAS");
    await avanzarEstadoHdu(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "EN_EJECUCION");
    await avanzarEstadoHdu(request, equipo.sesionCarla.accessToken, equipo.hdu.id, "PENDIENTE_CIERRE");

    const cierre = await api.post<{
      codigo: string;
      checklist: { fuente: string; estado: string; datos?: { completados: number; totalEntregables: number; porcentajeCumplimiento: number; completo: boolean } };
    }>(request, `/v1/hdu/${equipo.hdu.id}/estado`, { token: equipo.sesionCarla.accessToken, body: { estado: "CERRADA" } });

    expect(cierre.status).toBe(409);
    expect(cierre.body.codigo).toBe("CHECKLIST_INCOMPLETO");
    expect(cierre.body.checklist.fuente).toBe("certificaciones.checklist");
    expect(cierre.body.checklist.estado).toBe("ok");
    expect(cierre.body.checklist.datos).toMatchObject({ completados: 2, totalEntregables: 10, porcentajeCumplimiento: 20, completo: false });

    // La HDU sigue en PENDIENTE_CIERRE: el rechazo no dejó un estado a medias.
    const detalle = await api.get<{ estado: string }>(request, `/v1/hdu/${equipo.hdu.id}`, { token: equipo.sesionCarla.accessToken });
    expect(detalle.body.estado).toBe("PENDIENTE_CIERRE");
  });
});
