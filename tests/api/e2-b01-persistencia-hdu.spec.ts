import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { obtenerCatalogos } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E2-B01 · Persistencia de HDU", () => {
  test("[E2-B01#1] almacena célula, sprint, prioridad, QE creador y fecha", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const codigo = codigoHduUnico("E2B01");

    const respuesta = await api.post<{
      id: string;
      codigo: string;
      estado: string;
      celula: { id: string };
      sprint: { id: string };
      prioridad: string;
      qeResponsable: { correo: string };
      creadoPor: { id: string };
      creadoEn: string;
    }>(request, "/v1/hdu", {
      token: sesion.accessToken,
      body: { codigo, titulo: "Historia E2-B01#1", celulaId: celula.id, sprintId: sprint.id, prioridad: "ALTA" },
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.estado).toBe("PENDIENTE");
    expect(respuesta.body.celula.id).toBe(celula.id);
    expect(respuesta.body.sprint.id).toBe(sprint.id);
    expect(respuesta.body.prioridad).toBe("ALTA");
    expect(respuesta.body.qeResponsable.correo).toBe(USUARIOS_SEMILLA.carla.correo);
    expect(respuesta.body.creadoPor.id).toBe(sesion.userId);
    expect(new Date(respuesta.body.creadoEn).toString()).not.toBe("Invalid Date");
  });

  test("[E2-B01#2] rechaza datos inválidos indicando los errores de validación", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);

    const respuesta = await api.post<{ codigo: string; detalles: Array<{ campo: string }> }>(request, "/v1/hdu", {
      token: sesion.accessToken,
      body: { titulo: "", celulaId: "no-es-un-uuid" },
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe("VALIDACION");
    expect(respuesta.body.detalles.length).toBeGreaterThan(0);
  });

  test("[E2-B01#3] rechaza un código de HDU duplicado", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const codigo = codigoHduUnico("E2B01DUP");

    const primero = await api.post(request, "/v1/hdu", {
      token: sesion.accessToken,
      body: { codigo, titulo: "Original", celulaId: celula.id, sprintId: sprint.id, prioridad: "MEDIA" },
    });
    expect(primero.status).toBe(201);

    const segundo = await api.post(request, "/v1/hdu", {
      token: sesion.accessToken,
      body: { codigo, titulo: "Duplicada", celulaId: celula.id, sprintId: sprint.id, prioridad: "MEDIA" },
    });
    expect(segundo.status).toBe(409);
    expect(segundo.body).toMatchObject({ codigo: "CODIGO_HDU_DUPLICADO" });
  });
});
