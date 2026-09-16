import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

interface RegistroAuditoria {
  id: string;
  fecha: string;
  actor: { tipo: string; id: string; nombre: string };
  entidad: string;
  entidadId: string;
  accion: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
}

test.describe("E1-B12 · Auditoría de usuarios, roles y supervisión", () => {
  test("[E1-B12#1] registra actor, fecha, operación, recurso y cambios al modificar un usuario", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const creado = await crearUsuario(request, sesion.accessToken, {
      nombre: nombreUnico("Auditado"),
      correo: correoUnico("auditado"),
      rol: "ANALISTA_QA",
    });

    const cambioRol = await api.put(request, `/v1/usuarios/${creado.id}/rol`, { token: sesion.accessToken, body: { rol: "QE" } });
    expect(cambioRol.status).toBe(200);

    const auditoria = await api.get<{ items: RegistroAuditoria[] }>(
      request,
      `/v1/auditoria?entidad=USUARIO&entidadId=${creado.id}`,
      { token: sesion.accessToken },
    );
    expect(auditoria.status).toBe(200);
    expect(auditoria.body.items.length).toBeGreaterThanOrEqual(2); // CREAR_USUARIO + CAMBIAR_ROL

    const registroCreacion = auditoria.body.items.find((item) => item.accion === "CREAR_USUARIO");
    expect(registroCreacion).toBeTruthy();
    expect(registroCreacion?.actor.id).toBe(sesion.userId);
    expect(registroCreacion?.entidadId).toBe(creado.id);

    const registroRol = auditoria.body.items.find((item) => item.accion === "CAMBIAR_ROL");
    expect(registroRol).toBeTruthy();
    expect(registroRol?.despues).toMatchObject({ rol: "QE" });
  });

  test("[E1-B12#2] conserva el motivo del cambio de supervisor", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const qe1 = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("QE Auditado 1"), correo: correoUnico("qe-auditado-1"), rol: "QE" });
    const qe2 = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("QE Auditado 2"), correo: correoUnico("qe-auditado-2"), rol: "QE" });
    const analista = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("Analista Auditado"), correo: correoUnico("analista-auditado"), rol: "ANALISTA_QA" });

    await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: sesion.accessToken, body: { qeId: qe1.id } });
    const motivo = "Motivo de prueba E1-B12#2: reorganización.";
    const cambio = await api.put<{ vigente: { id: string } }>(request, `/v1/analistas/${analista.id}/supervisor`, {
      token: sesion.accessToken,
      body: { qeId: qe2.id, motivo },
    });

    // La auditoría de SUPERVISION queda indexada por el id de la relación
    // vigente creada (no por el id del analista): ver
    // services/organizacion/src/infraestructura/repositorios/supervision.prisma.repositorio.ts.
    const auditoria = await api.get<{ items: RegistroAuditoria[] }>(
      request,
      `/v1/auditoria?entidad=SUPERVISION&entidadId=${cambio.body.vigente.id}`,
      { token: sesion.accessToken },
    );
    expect(auditoria.status).toBe(200);
    const registroCambio = auditoria.body.items.find((item) => item.accion === "CAMBIAR_SUPERVISOR");
    expect(registroCambio?.motivo).toBe(motivo);
  });

  test("[E1-B12#3] nunca incluye contraseñas ni tokens en los registros", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const creado = await crearUsuario(request, sesion.accessToken, {
      nombre: nombreUnico("Datos Neutros"),
      correo: correoUnico("datos-neutros"),
      rol: "ANALISTA_QA",
    });
    await api.patch(request, `/v1/usuarios/${creado.id}`, { token: sesion.accessToken, body: { nombre: nombreUnico("Datos Neutros Editado") } });

    const auditoria = await api.get<{ items: RegistroAuditoria[] }>(
      request,
      `/v1/auditoria?entidad=USUARIO&entidadId=${creado.id}`,
      { token: sesion.accessToken },
    );
    expect(auditoria.status).toBe(200);
    const crudo = JSON.stringify(auditoria.body).toLowerCase();
    for (const palabra of ["password", "contrasena", "contraseña", "secret", "access_token", "refresh_token"]) {
      expect(crudo).not.toContain(palabra);
    }
  });
});
