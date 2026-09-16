import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface RelacionSupervision {
  id: string;
  qe: { id: string; correo: string };
  analista: { id: string; correo: string };
  desde: string;
  hasta: string | null;
  motivo: string | null;
}

test.describe("E1-B09 · Relación de supervisión QE–analista", () => {
  test("[E1-B09#1] rechaza si el supervisor no es QE o el supervisado no es Analista QA", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    const falsoQe = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("No Es QE"), correo: correoUnico("no-es-qe"), rol: "ANALISTA_QA" });
    const analista = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("Supervisado"), correo: correoUnico("supervisado"), rol: "ANALISTA_QA" });

    const respuesta = await api.put(request, `/v1/analistas/${analista.id}/supervisor`, {
      token: sesion.accessToken,
      body: { qeId: falsoQe.id },
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ codigo: "SUPERVISION_INVALIDA" });
  });

  test("[E1-B09#2] nunca hay dos QE vigentes: la relación anterior se cierra en la misma transacción", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    const qe1 = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("QE Uno"), correo: correoUnico("qe-uno"), rol: "QE" });
    const qe2 = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("QE Dos"), correo: correoUnico("qe-dos"), rol: "QE" });
    const analista = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("Analista Cambia"), correo: correoUnico("analista-cambia"), rol: "ANALISTA_QA" });

    const primera = await api.put<{ cambio: boolean; vigente: RelacionSupervision; anterior: RelacionSupervision | null }>(
      request,
      `/v1/analistas/${analista.id}/supervisor`,
      { token: sesion.accessToken, body: { qeId: qe1.id } },
    );
    expect(primera.status).toBe(200);
    expect(primera.body.cambio).toBe(true);
    expect(primera.body.anterior).toBeNull();

    // Sin motivo, ya teniendo QE vigente: se rechaza (E1-F10#2 a nivel de API).
    const sinMotivo = await api.put(request, `/v1/analistas/${analista.id}/supervisor`, {
      token: sesion.accessToken,
      body: { qeId: qe2.id },
    });
    expect(sinMotivo.status).toBe(422);
    expect(sinMotivo.body).toMatchObject({ codigo: "MOTIVO_REQUERIDO" });

    const segunda = await api.put<{ cambio: boolean; vigente: RelacionSupervision; anterior: RelacionSupervision | null }>(
      request,
      `/v1/analistas/${analista.id}/supervisor`,
      { token: sesion.accessToken, body: { qeId: qe2.id, motivo: "Reasignación de prueba E1-B09#2." } },
    );
    expect(segunda.status).toBe(200);
    expect(segunda.body.cambio).toBe(true);
    expect(segunda.body.vigente.qe.id).toBe(qe2.id);
    expect(segunda.body.anterior).not.toBeNull();
    expect(segunda.body.anterior?.qe.id).toBe(qe1.id);
    expect(segunda.body.anterior?.hasta).not.toBeNull();

    const historial = await api.get<{ items: RelacionSupervision[] }>(request, `/v1/analistas/${analista.id}/supervision/historial`, {
      token: sesion.accessToken,
    });
    expect(historial.status).toBe(200);
    expect(historial.body.items).toHaveLength(2);
    const vigentes = historial.body.items.filter((item) => item.hasta === null);
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].qe.id).toBe(qe2.id);
  });

  test("[E1-B09#3] un QE puede supervisar a varios analistas a la vez", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    const qe = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("QE Varios"), correo: correoUnico("qe-varios"), rol: "QE" });
    const analista1 = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("Analista A"), correo: correoUnico("analista-a"), rol: "ANALISTA_QA" });
    const analista2 = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("Analista B"), correo: correoUnico("analista-b"), rol: "ANALISTA_QA" });

    const r1 = await api.put(request, `/v1/analistas/${analista1.id}/supervisor`, { token: sesion.accessToken, body: { qeId: qe.id } });
    const r2 = await api.put(request, `/v1/analistas/${analista2.id}/supervisor`, { token: sesion.accessToken, body: { qeId: qe.id } });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const equipo = await api.get<{ items: Array<{ id: string }> }>(request, `/v1/qe/analistas?qeId=${qe.id}`, { token: sesion.accessToken });
    expect(equipo.status).toBe(200);
    const idsEquipo = equipo.body.items.map((item) => item.id);
    expect(idsEquipo).toContain(analista1.id);
    expect(idsEquipo).toContain(analista2.id);
  });
});
