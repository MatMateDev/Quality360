import path from "node:path";
import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { obtenerOCrearUsuario } from "../support/fixtures";
import { asegurarUsuarioVisibleEnSelector, clicConReintentoPorLimiteTasa } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

const PATRON_URL_SUPERVISOR = /\/v1\/analistas\/.*\/supervisor$/;

// DEFECTO (q360-frontend, severidad media): `AdminSupervisionPage` puebla
// sus dos <select> con `useUsuarios({ rol })` sin `tamanoPagina`, así que el
// gateway devuelve como máximo 20 (por defecto) ordenados por nombre, sin
// buscador ni paginación en la pantalla. Con más de 20 QE o analistas
// activos, los últimos por orden alfabético no aparecen en el desplegable y
// no se pueden seleccionar (documentado también en el dictamen).
//
// Por eso estos fixtures usan correos FIJOS (no `correoUnico`) y se
// reutilizan entre corridas (`obtenerOCrearUsuario`), en vez de crear
// usuarios nuevos cada vez: crear uno nuevo por corrida haría crecer sin
// límite el catálogo de QE/analistas hasta sacar al de esta prueba de la
// primera página, incluso con un prefijo "! " que ordena primero. El
// prefijo "! " (0x21) sigue usándose para que estos pocos fixtores fijos
// queden antes que cualquier nombre real de todos modos.
const QE_INICIAL = { nombre: "! QE Inicial F10 Fijo", correo: "qa.f10-qe-inicial-fijo@quality360.local", rol: "QE" as const };
const QE_NUEVO = { nombre: "! QE Nuevo F10 Fijo", correo: "qa.f10-qe-nuevo-fijo@quality360.local", rol: "QE" as const };

async function prepararEscenario(request: import("@playwright/test").APIRequestContext, correoAnalista: string, nombreAnalista: string) {
  const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
  const qeInicial = await obtenerOCrearUsuario(request, sesion.accessToken, QE_INICIAL);
  const qeNuevo = await obtenerOCrearUsuario(request, sesion.accessToken, QE_NUEVO);
  const analista = await obtenerOCrearUsuario(request, sesion.accessToken, { nombre: nombreAnalista, correo: correoAnalista, rol: "ANALISTA_QA" });

  // Reestablece el punto de partida (QE inicial vigente) sin importar en qué
  // estado haya quedado una corrida anterior de esta misma prueba.
  const reinicio = await api.put(request, `/v1/analistas/${analista.id}/supervisor`, {
    token: sesion.accessToken,
    body: { qeId: qeInicial.id, motivo: "Reinicio del fixture de prueba E1-F10." },
  });
  if (reinicio.status !== 200) throw new Error(`No fue posible preparar el fixture: ${reinicio.status}`);

  return { qeInicial, qeNuevo, analista };
}

test.describe("E1-F10 · Supervisión desde Administración", () => {
  // `asegurarUsuarioVisibleEnSelector` deja una ruta interceptada activa; si
  // React Query repite la solicitud (p.ej. al revalidar) después de que las
  // aserciones ya pasaron, Playwright puede reportar la solicitud en vuelo
  // como fallo al cerrar la página. Se limpia siempre, pase o falle la prueba.
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("[E1-F10#1] muestra la relación vigente del analista antes de confirmar", async ({ page, request }) => {
    const { qeInicial, qeNuevo, analista } = await prepararEscenario(request, "qa.f10-analista-1-fijo@quality360.local", "! Analista F10 Uno");
    await asegurarUsuarioVisibleEnSelector(page, /\/v1\/usuarios\?rol=QE$/, qeNuevo);
    await asegurarUsuarioVisibleEnSelector(page, /\/v1\/usuarios\?rol=ANALISTA_QA$/, analista);

    await page.goto(`${env.portalUrl}/admin/supervision`);
    await page.getByLabel("Analista QA").selectOption({ label: analista.nombre });
    await page.getByLabel("QE supervisor").selectOption({ label: qeNuevo.nombre });

    await expect(page.getByTestId("relacion-vigente-supervision")).toContainText(qeInicial.nombre);
  });

  test("[E1-F10#2] exige el motivo del cambio cuando el analista ya tiene un QE vigente", async ({ page, request }) => {
    const { qeNuevo, analista } = await prepararEscenario(request, "qa.f10-analista-2-fijo@quality360.local", "! Analista F10 Dos");
    await asegurarUsuarioVisibleEnSelector(page, /\/v1\/usuarios\?rol=QE$/, qeNuevo);
    await asegurarUsuarioVisibleEnSelector(page, /\/v1\/usuarios\?rol=ANALISTA_QA$/, analista);

    await page.goto(`${env.portalUrl}/admin/supervision`);
    await page.getByLabel("Analista QA").selectOption({ label: analista.nombre });
    await page.getByLabel("QE supervisor").selectOption({ label: qeNuevo.nombre });
    await page.getByRole("button", { name: "Asignar / cambiar" }).click();

    const dialogo = page.getByRole("dialog", { name: "Confirmar supervisión" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByLabel("Motivo del cambio")).toBeVisible();

    // Confirmar sin motivo: el backend lo exige (E1-B09#2) y el error se muestra.
    await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar" }), PATRON_URL_SUPERVISOR);
    await expect(page.getByTestId("error-supervision")).toBeVisible();

    await dialogo.getByLabel("Motivo del cambio").fill("Motivo de prueba E1-F10#2 desde la interfaz.");
    await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Confirmar" }), PATRON_URL_SUPERVISOR);
    await expect(dialogo).toHaveCount(0);
  });

  test("[E1-F10#3] el historial muestra las relaciones anteriores con fechas y motivos", async ({ page, request }) => {
    const { qeInicial, qeNuevo, analista } = await prepararEscenario(request, "qa.f10-analista-3-fijo@quality360.local", "! Analista F10 Tres");
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const motivo = "Motivo de prueba E1-F10#3: reorganización desde API.";
    await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: sesion.accessToken, body: { qeId: qeNuevo.id, motivo } });
    await asegurarUsuarioVisibleEnSelector(page, /\/v1\/usuarios\?rol=ANALISTA_QA$/, analista);

    await page.goto(`${env.portalUrl}/admin/supervision`);
    await page.getByLabel("Analista QA").selectOption({ label: analista.nombre });

    const historial = page.locator(".historial-lista");
    await expect(historial).toContainText(qeInicial.nombre);
    await expect(historial).toContainText(qeNuevo.nombre);
    await expect(historial).toContainText(motivo);
  });
});
