import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

// DEFECTO (q360-frontend, severidad media): `AdminSupervisionPage` puebla
// sus dos <select> con `useUsuarios({ rol })` sin `tamanoPagina`, así que el
// gateway devuelve como máximo 20 (por defecto) ordenados por nombre, sin
// buscador ni paginación en la pantalla. Con más de 20 QE o analistas
// activos, los últimos por orden alfabético no aparecen en el desplegable y
// no se pueden seleccionar. Aquí se evita con un prefijo "0-" que ordena
// antes que cualquier nombre real; documentado también en el dictamen.
async function crearAnalistaConSupervisorVigente(request: APIRequestContext) {
  const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
  const qeInicial = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("0-QE Inicial F10"), correo: correoUnico("qe-inicial-f10"), rol: "QE" });
  const qeNuevo = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("0-QE Nuevo F10"), correo: correoUnico("qe-nuevo-f10"), rol: "QE" });
  const analista = await crearUsuario(request, sesion.accessToken, { nombre: nombreUnico("0-Analista F10"), correo: correoUnico("analista-f10"), rol: "ANALISTA_QA" });

  const asignacion = await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: sesion.accessToken, body: { qeId: qeInicial.id } });
  if (asignacion.status !== 200) throw new Error(`No fue posible preparar el fixture: ${asignacion.status}`);

  return { qeInicial, qeNuevo, analista };
}

test.describe("E1-F10 · Supervisión desde Administración", () => {
  test("[E1-F10#1] muestra la relación vigente del analista antes de confirmar", async ({ page, request }) => {
    const { qeInicial, qeNuevo, analista } = await crearAnalistaConSupervisorVigente(request);

    await page.goto(`${env.portalUrl}/admin/supervision`);
    await page.getByLabel("Analista QA").selectOption({ label: analista.nombre });
    await page.getByLabel("QE supervisor").selectOption({ label: qeNuevo.nombre });

    await expect(page.getByTestId("relacion-vigente-supervision")).toContainText(qeInicial.nombre);
  });

  test("[E1-F10#2] exige el motivo del cambio cuando el analista ya tiene un QE vigente", async ({ page, request }) => {
    const { qeNuevo, analista } = await crearAnalistaConSupervisorVigente(request);

    await page.goto(`${env.portalUrl}/admin/supervision`);
    await page.getByLabel("Analista QA").selectOption({ label: analista.nombre });
    await page.getByLabel("QE supervisor").selectOption({ label: qeNuevo.nombre });
    await page.getByRole("button", { name: "Asignar / cambiar" }).click();

    const dialogo = page.getByRole("dialog", { name: "Confirmar supervisión" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByLabel("Motivo del cambio")).toBeVisible();

    // Confirmar sin motivo: el backend lo exige (E1-B09#2) y el error se muestra.
    await dialogo.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByTestId("error-supervision")).toBeVisible();

    await dialogo.getByLabel("Motivo del cambio").fill("Motivo de prueba E1-F10#2 desde la interfaz.");
    await dialogo.getByRole("button", { name: "Confirmar" }).click();
    await expect(dialogo).toHaveCount(0);
  });

  test("[E1-F10#3] el historial muestra las relaciones anteriores con fechas y motivos", async ({ page, request }) => {
    const { qeInicial, qeNuevo, analista } = await crearAnalistaConSupervisorVigente(request);
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const motivo = "Motivo de prueba E1-F10#3: reorganización desde API.";
    await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: sesion.accessToken, body: { qeId: qeNuevo.id, motivo } });

    await page.goto(`${env.portalUrl}/admin/supervision`);
    await page.getByLabel("Analista QA").selectOption({ label: analista.nombre });

    const historial = page.locator(".historial-lista");
    await expect(historial).toContainText(qeInicial.nombre);
    await expect(historial).toContainText(qeNuevo.nombre);
    await expect(historial).toContainText(motivo);
  });
});
