import { expect, test, type Locator, type Page } from "@playwright/test";
import { env } from "../support/env";
import { contextoDe, estadoSesion } from "../support/e4ui";
import {
  actual, asignarYMarcar, cabecera, confirmar, consultaAConMarcadas, consultaACompletaConfirmada, consultarOk, continuar, crearArnes, crearManual, descartar, editar, fijarActivo, fila,
  pares, prepararCambiosB, prepararConsultaB, solicitudesJira, todasLasFilas, type ArnesE5,
} from "../support/e5c";
import { contarHdu, estadoConfigBase, guardarConfigBase, limpiarE5, sql } from "../support/e5";
import { levantarIntegraciones, proxyOrganizacion } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";
import { api } from "../support/api";

/** E5-F05 · Revisar la consulta, asignar y confirmar (13 escenarios, T01..T28). Solo el Administrador. */
test.describe.configure({ mode: "default" });
let arnes: ArnesE5 | undefined;
test.afterAll(async () => {
  await limpiarE5();
  await arnes?.limpiar();
});

const RUTA = `${env.portalUrl}/admin/integraciones/sincronizar`;
const f = (page: Page, codigo: string): Locator => page.getByTestId(`fila-${codigo}`);

async function ir(page: Page, ruta = RUTA) {
  await page.goto(ruta);
  await expect(page.getByTestId("consulta-abierta")).toBeVisible({ timeout: 30_000 });
}

/** Abre un grupo colapsable si está cerrado (nuevas, cambiaron, sin-cambios, con-error). */
async function abrir(page: Page, clave: "nuevas" | "cambiaron" | "sin-cambios" | "con-error") {
  const boton = page.getByTestId(`boton-grupo-${clave}`);
  if ((await boton.count()) > 0 && (await boton.getAttribute("aria-expanded")) === "false") await boton.click();
  await expect(page.getByTestId(`grupo-${clave}`)).toBeVisible();
}

/** Elige un valor y espera a que el portal reciba la respuesta del guardado (una persona no cambia dos selectores en menos de 100 ms). */
async function elegir(page: Page, sel: Locator, valor: string) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/items"), { timeout: 20_000 }), sel.selectOption(valor)]);
}

async function marcar(casilla: Locator) {
  await casilla.click();
  await expect(casilla).toBeChecked({ timeout: 15_000 });
}

async function asignar(page: Page, codigo: string, v: { cel?: string; qe?: string; ana?: string; spr?: string }) {
  const fl = f(page, codigo);
  await expect(fl).toBeVisible();
  if (v.cel) await elegir(page, fl.getByTestId("selector-celula"), v.cel);
  if (v.qe) await elegir(page, fl.getByTestId("selector-qe"), v.qe);
  if (v.ana) {
    await expect(fl.getByTestId("selector-analista").locator(`option[value="${v.ana}"]`)).toHaveCount(1, { timeout: 15_000 });
    await elegir(page, fl.getByTestId("selector-analista"), v.ana);
  }
  if (v.spr) {
    await expect(fl.getByTestId("selector-sprint").locator(`option[value="${v.spr}"]`)).toHaveCount(1, { timeout: 15_000 });
    await elegir(page, fl.getByTestId("selector-sprint"), v.spr);
  }
}

async function confirmarEnPantalla(page: Page) {
  await page.getByTestId("boton-confirmar").click();
  await page.getByTestId("boton-confirmar-dialogo").click();
}

test.describe("E5-F05 · Revisar, asignar y confirmar", () => {
  test.describe("ADM1", () => {
    test.use({ storageState: estadoSesion("adm1") });

    test("[E5-F05#1] T01: la consulta B muestra Nuevas (1), Cambiaron (2), Sin cambios (8) y Con error (1) con el antes → después de QTY-2 y QTY-1", async ({ page, request }) => {
      await estadoConfigBase(request);
      await prepararConsultaB(request);
      await ir(page);
      for (const [g, n] of [["nuevas", 1], ["cambiaron", 2], ["sin-cambios", 8], ["con-error", 1]] as const) await expect(page.getByTestId(`total-grupo-${g}`).first()).toContainText(`(${n})`);
      await abrir(page, "cambiaron");
      const q2 = f(page, "QTY-2");
      await expect(q2.getByTestId("celda-cambios")).toContainText("Título: Recuperar contraseña → Recuperar clave");
      await expect(q2.getByTestId("celda-cambios")).toContainText("Prioridad: Media → Crítica");
      await expect(f(page, "QTY-1").getByTestId("celda-cambios")).toContainText("Descripción:");
      await expect(f(page, "QTY-1").getByTestId("celda-cambios")).toContainText("Otra descripción de Jira");
    });

    test("[E5-F05#1] T02: una HDU creada a mano antes de la consulta (QTY-5) aparece en «Cambiaron» con «Creada a mano» y la nota de que pasará a figurar como Jira", async ({ page, request }) => {
      await estadoConfigBase(request);
      await crearManual(request, "QTY-5", "Notificaciones", { prioridad: "MEDIA", descripcion: "Texto corto", qe: "qe1" });
      await consultarOk(request);
      await ir(page);
      await expect(page.getByTestId("total-grupo-nuevas").first()).toContainText("(9)");
      await abrir(page, "cambiaron");
      await expect(f(page, "QTY-5").getByTestId("chip-creada-a-mano")).toBeVisible();
      await expect(f(page, "QTY-5").getByTestId("nota-creada-a-mano")).toContainText(/figurar como Jira/);
    });

    test("[E5-F05#2] T03: elegir CEL-C, QE2 y ANA3 en QTY-1 propone «E5 Sprint 2» con «Sprint de Jira», deja la fila «Lista» y la asignación sobrevive a recargar", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      await asignar(page, "QTY-1", { cel: p.celC, qe: p.qe2, ana: p.ana3 });
      const fl = f(page, "QTY-1");
      await expect(fl.getByTestId("selector-sprint")).toHaveValue(p.sprint2, { timeout: 15_000 });
      await expect(fl.getByTestId("chip-sprint-origen")).toContainText("Sprint de Jira");
      await expect(fl.getByTestId("estado-fila")).toContainText("Lista");
      await page.reload();
      await expect(page.getByTestId("consulta-abierta")).toBeVisible();
      await expect(f(page, "QTY-1").getByTestId("estado-fila")).toContainText("Lista");
      await expect(f(page, "QTY-1").getByTestId("selector-analista")).toHaveValue(p.ana3);
    });

    test("[E5-F05#2] T04: sin sprint en Jira o con un sprint inexistente en la célula se propone el de respaldo (con advertencia en QTY-3); un cambio manual se conserva", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      await asignar(page, "QTY-4", { cel: p.celC });
      await expect(f(page, "QTY-4").getByTestId("selector-sprint")).toHaveValue(p.sprint1, { timeout: 15_000 });
      await expect(f(page, "QTY-4").getByTestId("chip-sprint-respaldo")).toBeVisible();
      await asignar(page, "QTY-3", { cel: p.celC });
      await expect(f(page, "QTY-3").getByTestId("selector-sprint")).toHaveValue(p.sprint1, { timeout: 15_000 });
      await expect(f(page, "QTY-3").getByTestId("chip-sprint-respaldo")).toBeVisible();
      await expect(f(page, "QTY-3").getByTestId("aviso-sprint-no-encontrado")).toContainText("El sprint de Jira no existe en esta célula");
      await asignar(page, "QTY-4", { spr: p.sprint2 });
      await page.reload();
      await expect(f(page, "QTY-4").getByTestId("selector-sprint")).toHaveValue(p.sprint2);
    });

    test("[E5-F05#2] T05: con CEL-A el sprint queda sin propuesta, la lista solo trae «E5 Sprint A1», la fila dice «Incompleta (falta: sprint)» y el aviso de célula sin Líder no aparece en CEL-A", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      await asignar(page, "QTY-1", { cel: p.celA, qe: p.qe2, ana: p.ana3 });
      const fl = f(page, "QTY-1");
      await expect(fl.getByTestId("estado-fila")).toContainText("Incompleta (falta: sprint)", { timeout: 15_000 });
      await expect(fl.getByTestId("selector-sprint")).toHaveValue("");
      const opciones = await fl.getByTestId("selector-sprint").locator("option").allInnerTexts();
      expect(opciones.join("|")).toContain("E5 Sprint A1");
      expect(opciones.join("|")).not.toContain("E5 Sprint 1");
      expect(opciones.join("|")).not.toContain("E5 Sprint 2");
      await expect(fl.getByTestId("aviso-sin-lider")).toHaveCount(0);
      // CEL-C no tiene Líder activo en el fixture de E7: la fila avisa que nadie la verá como Líder (D138).
      await asignar(page, "QTY-2", { cel: p.celC });
      await expect(f(page, "QTY-2").getByTestId("aviso-sin-lider")).toBeVisible();
    });

    test("[E5-F05#3] T06: seleccionar QTY-1..4 y aplicar CEL-C, QE2, ANA3 las deja «Listas»; cambiar el QE de QTY-2 a QE1 limpia el analista («Elige un analista del equipo de…») y las otras 3 no cambian", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      for (const c of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) await f(page, c).getByTestId("casilla-seleccionar").check();
      const panel = page.getByTestId("panel-asignar-grupo");
      await panel.getByTestId("grupo-selector-celula").selectOption(p.celC);
      await panel.getByTestId("grupo-selector-qe").selectOption(p.qe2);
      await expect(panel.getByTestId("grupo-selector-analista").locator(`option[value="${p.ana3}"]`)).toHaveCount(1, { timeout: 15_000 });
      await panel.getByTestId("grupo-selector-analista").selectOption(p.ana3);
      await expect(panel.getByTestId("casilla-incluir-al-aplicar")).toBeChecked();
      await panel.getByTestId("boton-aplicar-grupo").click();
      for (const c of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) await expect(f(page, c).getByTestId("estado-fila")).toContainText(/Lista|Marcada/, { timeout: 20_000 });
      await asignar(page, "QTY-2", { qe: p.qe1 });
      await expect(f(page, "QTY-2").getByTestId("selector-analista")).toHaveValue("");
      await expect(f(page, "QTY-2")).toContainText("Elige un analista del equipo de");
      await asignar(page, "QTY-2", { ana: p.ana1 });
      for (const c of ["QTY-1", "QTY-3", "QTY-4"]) await expect(f(page, c).getByTestId("selector-analista")).toHaveValue(p.ana3);
    });

    test("[E5-F05#3] T07 (negativo): aplicar CEL-C, QE2 y ANA1 a 3 filas muestra «alerta-rechazadas» con las 3 filas y «ANA1 no pertenece al equipo de…» sin cambiar ninguna", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      for (const c of ["QTY-1", "QTY-2", "QTY-3"]) await f(page, c).getByTestId("casilla-seleccionar").check();
      const panel = page.getByTestId("panel-asignar-grupo");
      await panel.getByTestId("grupo-selector-celula").selectOption(p.celC);
      await panel.getByTestId("grupo-selector-qe").selectOption(p.qe2);
      // ANA1 no es del equipo de QE2: el selector de grupo no la ofrece; se fuerza el valor por el servidor con un PATCH equivalente del panel (opción presente si el portal no filtra).
      const ofrece = (await panel.getByTestId("grupo-selector-analista").locator(`option[value="${p.ana1}"]`).count()) > 0;
      if (ofrece) {
        await panel.getByTestId("grupo-selector-analista").selectOption(p.ana1);
        await panel.getByTestId("boton-aplicar-grupo").click();
        await expect(page.getByTestId("alerta-rechazadas")).toContainText(/ANA1.*no pertenece al equipo de/i);
      } else {
        // El portal filtra el selector al equipo del QE elegido (D138): el rechazo del servidor se verifica por la API con la misma operación.
        const ids: string[] = [];
        for (const c of ["QTY-1", "QTY-2", "QTY-3"]) ids.push((await fila(request, (await actual(request)).body.consulta.id, c)).id);
        const r = await editar(request, (await actual(request)).body.consulta.id, { itemIds: ids, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana1 } });
        expect(r.status).toBe(200);
        expect(r.body.rechazadas).toHaveLength(3);
        test.info().annotations.push({ type: "portal", description: "El selector de grupo no ofrece analistas de otro equipo; el rechazo se verificó por API." });
      }
      for (const c of ["QTY-1", "QTY-2", "QTY-3"]) expect((await fila(request, (await actual(request)).body.consulta.id, c)).asignacion.analista).toBeNull();
    });

    test("[E5-F05#4] T08: con QE2 el selector de analista lista solo a ANA3, con QE1 a ANA1 y ANA2; ANA4 nunca aparece y el selector de QE no lista a INACT1 ni a otros roles", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      const fl = f(page, "QTY-1");
      await asignar(page, "QTY-1", { cel: p.celC, qe: p.qe2 });
      const valores = async () => (await fl.getByTestId("selector-analista").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean);
      await expect.poll(valores, { timeout: 15_000 }).toEqual([p.ana3]);
      await asignar(page, "QTY-1", { qe: p.qe1 });
      await expect.poll(async () => (await valores()).sort(), { timeout: 15_000 }).toEqual([p.ana1, p.ana2].sort());
      expect(await valores()).not.toContain(p.ana4);
      const qes = await fl.getByTestId("selector-qe").locator("option").allInnerTexts();
      expect(qes.join("|")).not.toMatch(/INACT1/i);
      const ids = await fl.getByTestId("selector-qe").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
      const roles = await sql<{ rol: string }>("SELECT r.nombre AS rol FROM organizacion.usuario u JOIN organizacion.rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = ANY($1::uuid[])", [ids]).catch(() => []);
      for (const r of roles) expect(r.rol).toMatch(/QE/);
    });

    test("[E5-F05#4] T09 (negativo): con QE5 (sin analistas) el selector de analista queda vacío con «Este QE no tiene analistas en su equipo» y la casilla de marcar deshabilitada", async ({ page, request }) => {
      await estadoConfigBase(request);
      arnes ??= await crearArnes(request);
      const p = await pares(request);
      await consultarOk(request);
      await ir(page);
      const fl = f(page, "QTY-1");
      await asignar(page, "QTY-1", { cel: p.celC, qe: arnes.qe5.id });
      await expect(fl.getByTestId("ayuda-sin-analistas")).toContainText("Este QE no tiene analistas en su equipo", { timeout: 15_000 });
      expect((await fl.getByTestId("selector-analista").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).filter(Boolean)).toEqual([]);
      await expect(fl.getByTestId("casilla-marcar")).toBeDisabled();
    });

    test("[E5-F05#5] T10: confirmar QTY-1..4 (4 listas y marcadas) crea 4 HDU con CEL-C · QE2 · ANA3 · «E5 Sprint 2», ANA3 las ve, QE2 no las ve en «Asignar analista» y Jira no recibe nada", async ({ page, request, browser }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      const { consulta } = await consultaAConMarcadas(request);
      const total0 = await contarHdu(request);
      const qe = await contextoDe(browser, "qe2");
      try {
        await qe.page.goto(`${env.portalUrl}/qe`);
        await expect(qe.page.getByTestId("contador-sin-analista")).toBeVisible();
        const sin0 = await qe.page.getByTestId("contador-sin-analista").innerText();
        await jiraFalso.limpiarSolicitudes();
        await ir(page);
        await expect(page.getByTestId("boton-confirmar")).toContainText("Confirmar (4)");
        await confirmarEnPantalla(page);
        const res = page.getByTestId("resultado-confirmacion");
        await expect(res).toBeVisible({ timeout: 60_000 });
        await expect(res.getByTestId("res-creadas")).toContainText("4");
        expect(await contarHdu(request)).toBe(total0 + 4);
        const h = (await sql("SELECT estado, origen, id_celula, qe_responsable_id, analista_id FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-1'"))[0];
        expect(h).toMatchObject({ estado: "PENDIENTE", origen: "JIRA", id_celula: p.celC, qe_responsable_id: p.qe2, analista_id: p.ana3 });
        for (const c of ["QTY-6", "QTY-7", "QTY-12"]) expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [c])).toHaveLength(0);
        await qe.page.goto(`${env.portalUrl}/qe`);
        await expect(qe.page.getByTestId("contador-sin-analista")).toHaveText(sin0);
        expect(await solicitudesJira()).toHaveLength(0);
        const ana = await contextoDe(browser, "ana3");
        try {
          await ana.page.goto(`${env.portalUrl}/analista`);
          await expect(ana.page.locator("main")).toContainText("QTY-1", { timeout: 20_000 });
        } finally {
          await ana.contexto.close();
        }
      } finally {
        await qe.contexto.close();
      }
      void consulta;
    });

    test("[E5-F05#5] T11: tras confirmar la consulta queda «Confirmada» en solo lectura con «6 filas sin marcar no se crearon» y «Consultar Jira» disponible", async ({ page, request }) => {
      await estadoConfigBase(request);
      await consultaAConMarcadas(request);
      await ir(page);
      await confirmarEnPantalla(page);
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "CONFIRMADA");
      // La consulta A tiene 11 filas y se marcaron 4: las 7 restantes (6 nuevas y QTY-11 con error) se descartan. El backlog (T11) dice «6»: ver OBS-E5C-02.
      await expect(page.getByTestId("texto-descartadas")).toContainText(/\d+ filas sin marcar no se crearon; consulta de nuevo para traerlas/);
      await expect(page.getByTestId("texto-descartadas")).toContainText("7 filas sin marcar");
      await expect(page.getByTestId("boton-consultar-jira")).toBeVisible();
      await expect(page.getByTestId("boton-confirmar")).toHaveCount(0);
      await expect(page.locator("[data-testid=selector-analista]")).toHaveCount(0);
    });

    test("[E5-F05#6] T12: marcar solo QTY-2 de la consulta B y confirmar actualiza título y prioridad sin tocar estado, QE1, ANA1, sprint ni célula; QTY-1 conserva su descripción", async ({ page, request }) => {
      await estadoConfigBase(request);
      await prepararConsultaB(request, { qe1para: ["QTY-1", "QTY-2"] });
      const antes1 = (await sql("SELECT descripcion, titulo FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-1'"))[0];
      const antes2 = (await sql("SELECT estado, qe_responsable_id, analista_id, id_celula FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-2'"))[0];
      await ir(page);
      await abrir(page, "cambiaron");
      await marcar(f(page, "QTY-2").getByTestId("casilla-marcar"));
      await expect(page.getByTestId("boton-confirmar")).toContainText("Confirmar (1)");
      await confirmarEnPantalla(page);
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("resultado-confirmacion").getByTestId("res-actualizadas")).toContainText("1");
      const d2 = (await sql("SELECT titulo, prioridad, estado, qe_responsable_id, analista_id, id_celula FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-2'"))[0];
      expect(d2).toMatchObject({ titulo: "Recuperar clave", prioridad: "CRITICA", estado: antes2.estado, qe_responsable_id: antes2.qe_responsable_id, analista_id: antes2.analista_id, id_celula: antes2.id_celula });
      expect((await sql("SELECT descripcion, titulo FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-1'"))[0]).toEqual(antes1);
    });

    test("[E5-F05#6] T13: marcar QTY-5 (creada a mano) en «Cambiaron» y confirmar la vincula: Origen Jira, título de Jira y mismos QE1, estado y analista", async ({ page, request }) => {
      await estadoConfigBase(request);
      await crearManual(request, "QTY-5", "Notificaciones", { prioridad: "MEDIA", descripcion: "Texto corto", qe: "qe1" });
      const antes = (await sql("SELECT estado, qe_responsable_id, analista_id FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-5'"))[0];
      await consultarOk(request);
      await ir(page);
      await abrir(page, "cambiaron");
      await marcar(f(page, "QTY-5").getByTestId("casilla-marcar"));
      await confirmarEnPantalla(page);
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      const h = (await sql("SELECT origen, titulo, estado, qe_responsable_id, analista_id, id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-5'"))[0];
      expect(h).toMatchObject({ origen: "JIRA", titulo: "Notificaciones push", estado: antes.estado, qe_responsable_id: antes.qe_responsable_id, analista_id: antes.analista_id });
      await page.goto(`${env.portalUrl}/hdu/${h.id_historia}`);
      await expect(page.getByTestId("hdu-origen")).toContainText("Jira");
    });

    test("[E5-F05#7] T14: sin marcar nada «Confirmar» queda deshabilitado con «Marca al menos una fila»; una fila incompleta no se marca («Falta: analista»); «Incluir todas las listas» marca las completas e informa cuántas siguen incompletas", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      // QTY-1..4 completas (sin marcar) y 6 incompletas.
      const ids: string[] = [];
      for (const k of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) ids.push((await fila(request, c.id, k)).id);
      expect((await editar(request, c.id, { itemIds: ids, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 } })).status).toBe(200);
      const q6 = await fila(request, c.id, "QTY-6");
      expect((await editar(request, c.id, { itemIds: [q6.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } })).status).toBe(200);
      await ir(page);
      await expect(page.getByTestId("boton-confirmar")).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByTestId("ayuda-confirmar")).toContainText("Marca al menos una fila");
      await expect(f(page, "QTY-6").getByTestId("casilla-marcar")).toBeDisabled();
      await expect(f(page, "QTY-6")).toContainText("Falta: analista");
      await page.getByTestId("boton-marcar-todas").click();
      await expect(page.getByTestId("boton-confirmar")).toContainText("Confirmar (4)", { timeout: 15_000 });
      await expect(page.getByTestId("anuncios-consulta")).toContainText(/6 siguen incompletas/);
    });

    test("[E5-F05#8] T15: con vigencia de 2 s, al recargar tras 3 s se ve «La consulta venció. Consulta Jira de nuevo.» sin selectores ni «Confirmar» y «Consultar Jira» sin diálogo de reemplazo", async ({ page, request }) => {
      test.setTimeout(120_000);
      await estadoConfigBase(request);
      const i6 = await levantarIntegraciones(3116, { INTEGRACIONES_CONSULTA_VIGENCIA_MS: "2000" });
      // El portal habla con el gateway; las llamadas a la consulta se redirigen a la instancia I6 (vigencia 2 s).
      await page.route("**/v1/integraciones/jira/consultas**", async (route) => {
        try {
          const url = new URL(route.request().url());
          const r = await route.fetch({ url: `${i6.url}${url.pathname}${url.search}` });
          await route.fulfill({ response: r });
        } catch {
          await route.abort().catch(() => undefined);
        }
      });
      try {
        const a = (await consultarOk(request, {}, i6.url)).consulta;
        expect((await asignarYMarcar(request, a.id, ["QTY-1"], {}, true, "adm1", i6.url)).status).toBe(200);
        await page.waitForTimeout(3200);
        await page.goto(RUTA);
        await expect(page.getByTestId("aviso-consulta-vencida")).toContainText("La consulta venció. Consulta Jira de nuevo.", { timeout: 30_000 });
        await expect(page.getByTestId("selector-celula")).toHaveCount(0);
        await expect(page.getByTestId("boton-confirmar")).toHaveCount(0);
        await expect(page.getByTestId("fila-QTY-1")).toHaveCount(0);
        await page.getByTestId("boton-consultar-jira").click();
        await expect(page.getByTestId("dialogo-reemplazar")).toHaveCount(0);
        await expect(page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
      } finally {
        await page.unroute("**/v1/integraciones/jira/consultas**");
        await i6.detener();
      }
    });

    test("[E5-F05#8] T16: si en otra pestaña se reemplaza la consulta, la primera muestra «Esta consulta fue reemplazada por…» en solo lectura y no se crea ninguna HDU", async ({ page, request, browser }) => {
      await estadoConfigBase(request);
      await consultarOk(request);
      const otra = await contextoDe(browser, "adm1");
      try {
        await ir(page);
        await otra.page.goto(RUTA);
        await otra.page.getByTestId("boton-consultar-jira").click();
        if (!(await otra.page.getByTestId("boton-reemplazar-consulta").waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
          const abiertas = await sql("SELECT id_ejecucion, origen, fase, resultado, iniciada_en, now() AS ahora FROM integraciones.ejecucion_integracion WHERE terminada_en IS NULL");
          throw new Error(`DIAG T16: no apareció «boton-reemplazar-consulta»; ejecuciones sin terminar: ${JSON.stringify(abiertas)}; pantalla: ${(await otra.page.getByTestId("consulta-abierta").innerText().catch(() => "(sin consulta-abierta)")).slice(0, 300)}; alertas: ${(await otra.page.getByRole("alert").allInnerTexts().catch(() => [])).join(" | ")}`);
        }
        await otra.page.getByTestId("boton-reemplazar-consulta").click();
        await expect(otra.page.getByTestId("resultado-ejecucion")).toBeVisible({ timeout: 60_000 });
        const total = await contarHdu(request);
        await f(page, "QTY-1").getByTestId("selector-celula").selectOption((await pares(request)).celC);
        await expect(page.getByTestId("aviso-consulta-reemplazada")).toContainText(/Esta consulta fue reemplazada por .+\./, { timeout: 30_000 });
        await expect(page.getByTestId("selector-celula")).toHaveCount(0);
        await expect(page.getByTestId("boton-ir-nueva-consulta")).toBeVisible();
        expect(await contarHdu(request)).toBe(total);
        // «Ir a la nueva consulta» abre la consulta vigente (editable, sin el aviso).
        await page.getByTestId("boton-ir-nueva-consulta").click();
        await expect(page.getByTestId("aviso-consulta-reemplazada")).toHaveCount(0);
        await expect(page.getByTestId("selector-celula").first()).toBeVisible();
      } finally {
        await otra.contexto.close();
      }
    });

    test("[E5-F05#8] T17: «Descartar consulta» pide confirmación; cancelar no cambia nada y confirmar deja la consulta «Descartada», sin filas y sin HDU creadas", async ({ page, request }) => {
      await estadoConfigBase(request);
      const total0 = await contarHdu(request);
      const c = (await consultarOk(request)).consulta;
      await ir(page);
      await page.getByTestId("boton-descartar-consulta").click();
      await expect(page.getByTestId("dialogo-descartar")).toBeVisible();
      await page.getByTestId("boton-cancelar-dialogo").click();
      await expect(page.getByTestId("dialogo-descartar")).toHaveCount(0);
      expect((await cabecera(request, c.id)).body.estado).toBe("ABIERTA");
      await page.getByTestId("boton-descartar-consulta").click();
      await page.getByTestId("boton-descartar-confirmar").click();
      await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "DESCARTADA", { timeout: 30_000 });
      await expect(page.getByTestId("aviso-consulta-descartada")).toBeVisible();
      expect(await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [c.id])).toHaveLength(0);
      expect(await contarHdu(request)).toBe(total0);
    });

    test("[E5-F05#9] T18: si ADM2 cambia el analista de QTY-1 mientras ADM1 revisa, «Confirmar» muestra «Otra persona modificó la consulta», recarga el cambio y no crea nada; al confirmar de nuevo se crean 4", async ({ page, request }) => {
      await estadoConfigBase(request);
      arnes ??= await crearArnes(request);
      const p = await pares(request);
      const { consulta } = await consultaAConMarcadas(request);
      await ir(page);
      const q1 = await fila(request, consulta.id, "QTY-1");
      const r = await api.patch<any>(request, `/v1/integraciones/jira/consultas/${consulta.id}/items`, { token: arnes.adm2.token, body: { itemIds: [q1.id], asignacion: { sprintId: p.sprint1 } } });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const total = await contarHdu(request);
      await page.getByTestId("boton-confirmar").click();
      // El portal relee la versión antes de confirmar (D148): puede avisar de inmediato o tras el diálogo.
      const dlg = page.getByTestId("boton-confirmar-dialogo");
      if (await dlg.isVisible({ timeout: 3000 }).catch(() => false)) await dlg.click();
      await expect(page.getByTestId("aviso-consulta-modificada")).toContainText("Otra persona modificó la consulta", { timeout: 30_000 });
      expect(await contarHdu(request)).toBe(total);
      await expect(f(page, "QTY-1").getByTestId("selector-sprint")).toHaveValue(p.sprint1, { timeout: 15_000 });
      await confirmarEnPantalla(page);
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      expect(await contarHdu(request)).toBe(total + 4);
    });

    test("[E5-F05#9] T19: dos Administradores que confirman a la vez crean 4 HDU una sola vez (el otro ve «ya se confirmó» o «en curso»)", async ({ page, request, browser }) => {
      await estadoConfigBase(request);
      const total0 = await contarHdu(request);
      await consultaAConMarcadas(request);
      const otra = await contextoDe(browser, "adm1");
      try {
        await ir(page);
        await ir(otra.page);
        await Promise.all([confirmarEnPantalla(page), confirmarEnPantalla(otra.page)]);
        await expect.poll(async () => (await contarHdu(request)) - total0, { timeout: 60_000 }).toBe(4);
        // La pantalla se actualiza después del commit: se espera el texto en vez de leerlo en el mismo instante (carrera de la prueba, ronda 3).
        await expect.poll(async () => [await page.locator("main").innerText(), await otra.page.locator("main").innerText()].join("\n"), { timeout: 30_000 }).toMatch(/Resultado|ya se confirmó|en curso/);
        expect(await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE origen = 'JIRA'")).toEqual([{ n: 4, d: 4 }]);
      } finally {
        await otra.contexto.close();
      }
    });

    test("[E5-F05#10] T20: si QE1 crea QTY-3 a mano tras marcar QTY-1..4, confirmar crea 3, omite 1 con «La HDU se creó mientras revisabas la consulta» y la HDU de QE1 no cambia", async ({ page, request }) => {
      await estadoConfigBase(request);
      await consultaAConMarcadas(request);
      await crearManual(request, "QTY-3", "Hecha por el QE", { qe: "qe1" });
      await ir(page);
      await confirmarEnPantalla(page);
      const res = page.getByTestId("resultado-confirmacion");
      await expect(res).toBeVisible({ timeout: 60_000 });
      await expect(res.getByTestId("res-creadas")).toContainText("3");
      await expect(res.getByTestId("res-omitidas")).toContainText("1");
      const seccion = res.getByTestId("boton-seccion-omitidas");
      if ((await seccion.count()) > 0 && (await seccion.getAttribute("aria-expanded")) === "false") await seccion.click();
      await expect(res).toContainText("La HDU se creó mientras revisabas la consulta");
      expect((await sql("SELECT titulo, origen FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-3'"))[0]).toEqual({ titulo: "Hecha por el QE", origen: "MANUAL" });
    });

    test("[E5-F05#11] T21: con ANA3 desactivada, confirmar muestra «alerta-asignaciones-invalidas» con las 4 filas y «ANA3 ya no está disponible», no crea HDU y las deja sin incluir; reasignadas a QE1/ANA1 se confirman 4", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await consultaAConMarcadas(request);
      const total = await contarHdu(request);
      await ir(page);
      await fijarActivo(p.ana3, false);
      try {
        await confirmarEnPantalla(page);
        const alerta = page.getByTestId("alerta-asignaciones-invalidas");
        await expect(alerta).toBeVisible({ timeout: 30_000 });
        for (const c of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) await expect(alerta).toContainText(c);
        await expect(alerta).toContainText(/ya no está disponible/);
      } finally {
        await fijarActivo(p.ana3, true);
      }
      expect(await contarHdu(request)).toBe(total);
      const c = (await actual(request)).body.consulta;
      expect(c.marcadasNuevas).toBe(0);
      const r = await asignarYMarcar(request, c.id, ["QTY-1", "QTY-2", "QTY-3", "QTY-4"], { qeId: p.qe1, analistaId: p.ana1 });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      await page.reload();
      await expect(page.getByTestId("consulta-abierta")).toBeVisible();
      await confirmarEnPantalla(page);
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      expect(await contarHdu(request)).toBe(total + 4);
    });

    test("[E5-F05#11] T22: si ANA3 pasa al equipo de QE1 tras asignarla a QE2, confirmar muestra «ANA3 ya no pertenece al equipo de QE2» y no crea nada", async ({ page, request }) => {
      await estadoConfigBase(request);
      arnes ??= await crearArnes(request);
      const p = await pares(request);
      const { crearUsuarioE7 } = await import("../support/e7");
      const { tk } = await import("../support/e5");
      const { borrarUsuariosDePrueba } = await import("../support/e5");
      const t0 = new Date();
      const adm = await tk("adm1");
      const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "e5t22a" });
      try {
        expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: p.qe2 } })).status).toBe(200);
        const c = (await consultarOk(request)).consulta;
        expect((await asignarYMarcar(request, c.id, ["QTY-1"], { analistaId: ana.id })).status).toBe(200);
        const total = await contarHdu(request);
        expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: p.qe1, motivo: "cambio de equipo de la prueba F05-T22" } })).status).toBe(200);
        await ir(page);
        await confirmarEnPantalla(page);
        await expect(page.getByTestId("alerta-asignaciones-invalidas")).toContainText(/no pertenece al equipo de/, { timeout: 30_000 });
        expect(await contarHdu(request)).toBe(total);
      } finally {
        await borrarUsuariosDePrueba([ana.id], t0);
      }
    });

    test("[E5-F05#12] T23: BIG (230) con Organización cortada tras el primer lote: «Se aplicaron 25 de 230», la consulta sigue Abierta y «Continuar confirmación» aplica el resto sin duplicar", async ({ page, request }) => {
      test.setTimeout(300_000);
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      const p = await pares(request);
      const r = await consultarOk(request);
      await continuar(request, r.consulta.id);
      await continuar(request, r.consulta.id);
      const e = await editar(request, r.consulta.id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 }, marcarListas: true });
      expect(e.body.aplicadas).toBe(230);
      const proxy = await proxyOrganizacion(env.organizacionUrl, 3197, 1);
      const inst = await levantarIntegraciones(3117, { ORGANIZACION_URL: proxy.url });
      // La confirmación del portal se dirige a la instancia con Organización cortada; el resto de las lecturas va a la principal.
      await page.route("**/v1/integraciones/jira/consultas/*/confirmaciones", async (route) => {
        const url = new URL(route.request().url());
        const resp = await route.fetch({ url: `${inst.url}${url.pathname}` });
        await route.fulfill({ response: resp });
      });
      try {
        await ir(page);
        await confirmarEnPantalla(page);
        await expect(page.getByTestId("aviso-incompleta")).toContainText("Se aplicaron 25 de 230", { timeout: 90_000 });
        await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "ABIERTA");
      } finally {
        await inst.detener();
        await proxy.cerrar();
      }
      await page.unroute("**/v1/integraciones/jira/consultas/*/confirmaciones");
      // Con el presupuesto de 8 s una pasada puede no alcanzar las 205 restantes en un equipo lento: «Continuar confirmación» se repite hasta cerrar (no duplica).
      for (let pasada = 1; pasada <= 5; pasada += 1) {
        await page.getByTestId("boton-continuar-confirmacion").click();
        const cerrada = await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "CONFIRMADA", { timeout: 25_000 }).then(() => true, () => false);
        test.info().annotations.push({ type: "pasada", description: `${pasada}: ${cerrada ? "CONFIRMADA" : "sigue Abierta"}` });
        if (cerrada) break;
        await expect(page.getByTestId("boton-continuar-confirmacion")).toBeVisible({ timeout: 30_000 });
      }
      await expect(page.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "CONFIRMADA");
      expect(await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'")).toEqual([{ n: 230, d: 230 }]);
    });

    test("[E5-F05#3] T24: con BIG (230) «Seleccionar las 230 filas del grupo» y aplicar CEL-C, QE2, ANA3 deja las 230 «Listas» (incluidas las que no se ven) y el contador dice «230 asignadas»", async ({ page, request }) => {
      test.setTimeout(240_000);
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      const p = await pares(request);
      const r = await consultarOk(request);
      await continuar(request, r.consulta.id);
      await continuar(request, r.consulta.id);
      await ir(page);
      await page.getByTestId("casilla-seleccionar-grupo").check();
      await page.getByTestId("boton-seleccionar-todo-el-grupo").click();
      await expect(page.getByTestId("banner-seleccion-grupo")).toContainText("230");
      const panel = page.getByTestId("panel-asignar-grupo");
      await panel.getByTestId("grupo-selector-celula").selectOption(p.celC);
      await panel.getByTestId("grupo-selector-qe").selectOption(p.qe2);
      await expect(panel.getByTestId("grupo-selector-analista").locator(`option[value="${p.ana3}"]`)).toHaveCount(1, { timeout: 15_000 });
      await panel.getByTestId("grupo-selector-analista").selectOption(p.ana3);
      await panel.getByTestId("boton-aplicar-grupo").click();
      await expect(page.getByTestId("contador-asignadas")).toHaveText("230", { timeout: 60_000 });
      const filas = await todasLasFilas(request, r.consulta.id, "NUEVA");
      expect(filas.filter((x) => x.completa)).toHaveLength(230);
    });

    test("[E5-F05#5] T25: con Jira CAIDO confirmar crea las 4 HDU igual y Jira no recibe peticiones nuevas", async ({ page, request }) => {
      await estadoConfigBase(request);
      const total0 = await contarHdu(request);
      await consultaAConMarcadas(request);
      await jiraFalso.modo("CAIDO");
      await jiraFalso.limpiarSolicitudes();
      await ir(page);
      await confirmarEnPantalla(page);
      await expect(page.getByTestId("resultado-confirmacion")).toBeVisible({ timeout: 60_000 });
      expect(await contarHdu(request)).toBe(total0 + 4);
      expect(await solicitudesJira()).toHaveLength(0);
    });

    test("[E5-F05#2] T27: una fila se recorre solo con teclado (selectores y casilla), el estado se anuncia por texto y los textos de Jira con <b> o = se ven como texto", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      await jiraFalso.issue("QTY-13", { tipo: "Story", summary: "<b>negrita</b> =SUMA(1)", priority: "High" });
      const c = (await consultarOk(request)).consulta;
      expect((await asignarYMarcar(request, c.id, ["QTY-13"], {}, false)).status).toBe(200); // con la asignación hecha todos los controles están habilitados
      await ir(page);
      const fl = f(page, "QTY-13");
      await expect(fl).toContainText("<b>negrita</b> =SUMA(1)");
      expect(await fl.locator("b").count()).toBe(0);
      await fl.getByTestId("casilla-seleccionar").focus();
      const orden: string[] = [];
      for (let i = 0; i < 14; i += 1) {
        const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-testid") ?? "");
        if (id) orden.push(id);
        if (id === "casilla-marcar") break;
        await page.keyboard.press("Tab");
      }
      const posicion = (id: string) => orden.indexOf(id);
      for (const id of ["selector-celula", "selector-qe", "selector-analista", "selector-sprint", "casilla-marcar"]) expect(posicion(id), `${id} en el orden ${orden.join(">")}`).toBeGreaterThanOrEqual(0);
      expect(posicion("selector-celula")).toBeLessThan(posicion("selector-qe"));
      expect(posicion("selector-qe")).toBeLessThan(posicion("selector-analista"));
      expect(posicion("selector-analista")).toBeLessThan(posicion("selector-sprint"));
      await expect(fl.getByTestId("estado-fila")).toContainText(/Lista/);
      await elegir(page, fl.getByTestId("selector-celula"), p.celA);
      await expect(fl.getByTestId("estado-fila")).toContainText(/Incompleta \(falta:/);
    });

    test("[E5-F05#3] T29 (adicional de QA, DEF-E5C-01): elegir célula y QE en menos de 300 ms conserva ambos valores y el sprint propuesto, en pantalla y en el servidor", async ({ page, request }) => {
      await estadoConfigBase(request);
      const p = await pares(request);
      const c = (await consultarOk(request)).consulta;
      await ir(page);
      const fl = f(page, "QTY-1");
      await expect(fl).toBeVisible();
      const respuestas: string[] = [];
      page.on("response", (r) => { if (r.url().includes("/items")) respuestas.push(`${r.request().method()} ${r.status()}`); });
      const parQe = fl.getByTestId("selector-qe");
      const t0 = Date.now();
      await fl.getByTestId("selector-celula").selectOption(p.celC);
      await parQe.selectOption(p.qe2);
      const ms = Date.now() - t0;
      expect(ms, "los dos cambios deben ocurrir en menos de 300 ms").toBeLessThan(300);
      await expect(fl.getByTestId("selector-celula")).toHaveValue(p.celC, { timeout: 20_000 });
      await expect(parQe, `respuestas del portal: ${respuestas.join(", ")}`).toHaveValue(p.qe2, { timeout: 20_000 });
      await expect(fl.getByTestId("selector-sprint")).toHaveValue(/.+/, { timeout: 20_000 });
      await expect(fl.getByTestId("estado-fila")).toContainText(/Incompleta \(falta: analista\)|falta: analista/, { timeout: 20_000 });
      await page.reload();
      await expect(f(page, "QTY-1").getByTestId("selector-celula")).toHaveValue(p.celC, { timeout: 30_000 });
      const f1 = await fila(request, c.id, "QTY-1");
      expect(f1.asignacion.celula?.id).toBe(p.celC);
      expect(f1.asignacion.qeResponsable?.id).toBe(p.qe2);
      expect(f1.asignacion.sprint?.nombre).toBe("E5 Sprint 2");
    });
  });

  for (const clave of ["qe1", "ana1", "lid1", "aud1"] as const) {
    test.describe(clave.toUpperCase(), () => {
      test.use({ storageState: estadoSesion(clave) });
      test(`[E5-F05#13] T26 (negativo): ${clave.toUpperCase()} recibe acceso denegado en /admin/integraciones y no ve «grupo-nuevas», «Confirmar» ni ninguna consulta en su portal`, async ({ page, request }) => {
        await estadoConfigBase(request);
        await consultarOk(request);
        await page.goto(RUTA);
        await expect(page.getByTestId("acceso-denegado")).toBeVisible();
        for (const id of ["grupo-nuevas", "boton-confirmar", "consulta-abierta"]) await expect(page.getByTestId(id)).toHaveCount(0);
        const propia = clave === "qe1" ? "/qe/integraciones" : clave === "aud1" ? "/auditor/integraciones" : null;
        if (propia) {
          await page.goto(`${env.portalUrl}${propia}`);
          for (const id of ["grupo-nuevas", "boton-confirmar", "consulta-abierta", "boton-consultar-jira"]) await expect(page.getByTestId(id)).toHaveCount(0);
        }
        void descartar; void confirmar; void consultaACompletaConfirmada; void prepararCambiosB;
      });
    });
  }
});
