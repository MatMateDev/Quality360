import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { crearHduAsignadaAAna, marcarConEnlace } from "../support/checklist";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface EntregableVista {
  clave: string;
  orden: number;
  estado: "PENDIENTE" | "POR_APROBAR" | "APROBADO";
  evidencia: { tipo: string; url?: string } | null;
  completado: { id: string; nombre: string; fecha: string } | null;
  aprobado: { id: string; nombre: string; fecha: string } | null;
}

test.describe("E3-B01 · Registro de entregables con responsable y fecha", () => {
  test("[E3-B01#1] guarda completadoPor, completadoEn y evidencia al marcar", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B01REG");
    const url = "https://evidencia.quality360.local/e3-b01-1";

    const marcado = await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS", url);
    expect(marcado).toMatchObject({
      clave: "PLAN_PRUEBAS",
      estado: "POR_APROBAR",
      evidencia: { tipo: "ENLACE", url },
    });
    expect((marcado as EntregableVista).completado).toMatchObject({ id: equipo.sesionAna.userId, nombre: USUARIOS_SEMILLA.ana.nombre });
    expect((marcado as EntregableVista).completado?.fecha).toBeTruthy();

    const checklist = await api.get<{ entregables: EntregableVista[] }>(request, `/v1/hdu/${equipo.hdu.id}/entregables`, {
      token: equipo.sesionCarla.accessToken,
    });
    const registro = checklist.body.entregables.find((item) => item.clave === "PLAN_PRUEBAS");
    expect(registro?.completado?.id).toBe(equipo.sesionAna.userId);
    expect(registro?.evidencia).toEqual({ tipo: "ENLACE", url });
  });

  test("[E3-B01#2] rechaza duplicar el registro: un registro por clave y HDU", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B01DUP");
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");

    // El entregable ya quedó POR_APROBAR: un segundo intento de marcarlo es un duplicado.
    const duplicado = await api.post(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      token: equipo.sesionAna.accessToken,
      body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/duplicado" } },
    });

    expect(duplicado.status).toBe(409);
    expect(duplicado.body).toMatchObject({ codigo: "ENTREGABLE_YA_REGISTRADO" });
  });

  test("[E3-B01#3] rechaza marcar a un usuario sin rol autorizado", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "E3B01ROL");

    // Solo ANALISTA_QA puede marcar (D18): el QE responsable de la propia HDU no puede.
    const comoQe = await api.post(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      token: equipo.sesionCarla.accessToken,
      body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/no-deberia" } },
    });
    expect(comoQe.status).toBe(403);
    expect(comoQe.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });

    // Tampoco un Administrador.
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const comoAdmin = await api.post(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
      token: sesionAdmin.accessToken,
      body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/no-deberia" } },
    });
    expect(comoAdmin.status).toBe(403);
    expect(comoAdmin.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });
});
