import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearHdu, listarTodasHdu, obtenerCatalogos, obtenerUsuarioPorCorreo } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E2-B03 · Ámbito de HDU por rol", () => {
  test("[E2-B03#1] un Analista QA solo recibe HDU con analistaId igual a él", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo);
    const items = await listarTodasHdu(request, sesion.accessToken);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.analista?.correo).toBe(USUARIOS_SEMILLA.ana.correo);
    }
  });

  test("[E2-B03#2] un QE recibe HDU donde es responsable o cuyo analista supervisa hoy", async ({ request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const sesionMarcos = await iniciarSesion(USUARIOS_SEMILLA.marcos.correo, env.contrasenaDemo);

    // HDU propia de la prueba, responsable Carla, asignada a Diego (analista
    // de Marcos hoy): debe aparecer en el ámbito de Marcos aunque el
    // responsable sea otro QE.
    const sesionCarla = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesionCarla.accessToken);
    const hdu = await crearHdu(request, sesionCarla.accessToken, { codigo: codigoHduUnico("E2B03QE"), celulaId: celula.id, sprintId: sprint.id });
    const diego = await obtenerUsuarioPorCorreo(request, sesionAdmin.accessToken, USUARIOS_SEMILLA.diego.correo);
    // Diego no es del equipo de Carla: un QE no puede asignarlo fuera de su
    // equipo (422 ANALISTA_FUERA_DE_EQUIPO), así que lo hace el Administrador.
    const asignacion = await api.put(request, `/v1/hdu/${hdu.id}/analista`, { token: sesionAdmin.accessToken, body: { analistaId: diego.id } });
    expect(asignacion.status).toBe(200);

    const items = await listarTodasHdu(request, sesionMarcos.accessToken);

    const codigos = items.map((item) => item.codigo);
    expect(codigos).toContain(hdu.codigo); // por el analista (Diego) que Marcos supervisa hoy
    expect(codigos).toContain("HDU-CLI-001"); // por ser Marcos el QE responsable
    for (const item of items) {
      const esResponsable = item.qeResponsable.correo === USUARIOS_SEMILLA.marcos.correo;
      const analistaDeMarcos = item.analista?.correo && [USUARIOS_SEMILLA.diego.correo, USUARIOS_SEMILLA.elena.correo].includes(item.analista.correo);
      expect(esResponsable || Boolean(analistaDeMarcos)).toBe(true);
    }
  });

  test("[E2-B03#3] un Administrador recibe todas las HDU", async ({ request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const items = await listarTodasHdu(request, sesionAdmin.accessToken);

    const codigos = items.map((item) => item.codigo);
    // De varios QE y analistas distintos a la vez: prueba de que no hay filtro de ámbito.
    expect(codigos).toContain("HDU-PAG-001"); // Carla / Ana
    expect(codigos).toContain("HDU-CLI-001"); // Marcos / Diego
    expect(codigos).toContain("HDU-SOF-001"); // Sofía, sin analista
  });
});
