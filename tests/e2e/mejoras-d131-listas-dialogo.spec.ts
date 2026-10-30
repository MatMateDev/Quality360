import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { crearUsuarioE7, desactivarUsuario } from "../support/e7";
import { env } from "../support/env";
import { crearHdu, obtenerCatalogos } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * D131: los selectores de «Asignar analista» y «Reasignar QE responsable» son listas visibles
 * (select con size, hasta 6 filas, con desplazamiento propio). Con más de 6 opciones todas deben
 * poder elegirse sin que el diálogo ni la lista se salgan de la ventana, a 1280 y 375 px.
 */
test.setTimeout(240_000);

const VIEWPORTS = [
  { ancho: 1280, alto: 800 },
  { ancho: 375, alto: 800 },
] as const;

async function verificarLista(page: Page, dialogo: Locator, lista: Locator, nombre: string, ancho: number, alto: number) {
  await expect(dialogo).toBeVisible();
  const cuadroDialogo = (await dialogo.boundingBox())!;
  const cuadroLista = (await lista.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(vp.width).toBe(ancho);
  // El diálogo está dentro de la ventana.
  expect(cuadroDialogo.x, `${nombre} ${ancho}: x del diálogo`).toBeGreaterThanOrEqual(-0.5);
  expect(cuadroDialogo.y, `${nombre} ${ancho}: y del diálogo`).toBeGreaterThanOrEqual(-0.5);
  expect(cuadroDialogo.x + cuadroDialogo.width, `${nombre} ${ancho}: borde derecho`).toBeLessThanOrEqual(ancho + 0.5);
  expect(cuadroDialogo.y + cuadroDialogo.height, `${nombre} ${ancho}: borde inferior`).toBeLessThanOrEqual(alto + 0.5);
  // La lista queda dentro del diálogo, sin desbordar horizontalmente la página.
  expect(cuadroLista.x, `${nombre} ${ancho}: lista dentro (izq)`).toBeGreaterThanOrEqual(cuadroDialogo.x - 0.5);
  expect(cuadroLista.x + cuadroLista.width, `${nombre} ${ancho}: lista dentro (der)`).toBeLessThanOrEqual(cuadroDialogo.x + cuadroDialogo.width + 0.5);
  const medidas = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cli: document.documentElement.clientWidth }));
  expect(medidas.doc, `${nombre} ${ancho}: sin desborde horizontal`).toBeLessThanOrEqual(medidas.cli);

  // Lista visible (no desplegable): size = 6 con más de 6 opciones y desplazamiento propio.
  const info = await lista.evaluate((el) => {
    const s = el as HTMLSelectElement;
    return { size: s.size, opciones: s.options.length, desplaza: s.scrollHeight > s.clientHeight, vacias: Array.from(s.options).filter((o) => o.value === "").length };
  });
  expect(info.opciones, `${nombre}: opciones`).toBeGreaterThan(6);
  expect(info.size, `${nombre}: filas visibles`).toBe(6);
  expect(info.desplaza, `${nombre}: la lista se desplaza dentro del diálogo`).toBe(true);
  expect(info.vacias, `${nombre}: sin opción de relleno «Selecciona…»`).toBe(0);

  // Todas las opciones se pueden elegir, incluidas las que están bajo el desplazamiento.
  const valores = await lista.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  for (const [i, valor] of valores.entries()) {
    await lista.selectOption({ index: i });
    expect(await lista.inputValue(), `${nombre} ${ancho}: opción ${i + 1} de ${valores.length}`).toBe(valor);
  }
  await lista.selectOption({ index: valores.length - 1 });
  // La última opción queda dentro del cuadro de la lista tras desplazar.
  const ultima = await lista.locator("option").last().boundingBox();
  const cuadroListaFinal = (await lista.boundingBox())!;
  if (ultima) {
    expect(ultima.y + ultima.height, `${nombre} ${ancho}: última opción dentro de la lista`).toBeLessThanOrEqual(cuadroListaFinal.y + cuadroListaFinal.height + 1);
    expect(ultima.y, `${nombre} ${ancho}: última opción visible`).toBeGreaterThanOrEqual(cuadroListaFinal.y - 1);
  }

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const graves = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), `${nombre} ${ancho}: axe serious/critical`).toEqual([]);
}

test.describe("D131 · Asignar analista con más de 6 opciones", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

  test("[D131#1] el selector «Analista QA» se desplaza dentro del diálogo, todas las opciones son elegibles y axe queda limpio", async ({ page, request }) => {
    const admin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const carla = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const creados: string[] = [];
    try {
      // Ana y Beatriz ya son del equipo de Carla; se suman 6 analistas propios para superar las 6 filas.
      for (let i = 0; i < 6; i++) {
        const analista = await crearUsuarioE7(request, admin.accessToken, "ANALISTA_QA", { prefijo: `d131-ana${i}` });
        creados.push(analista.id);
        const rel = await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: admin.accessToken, body: { qeId: carla.userId } });
        expect(rel.status, JSON.stringify(rel.body)).toBe(200);
      }
      const { celula, sprint } = await obtenerCatalogos(request, carla.accessToken);
      const hdu = await crearHdu(request, carla.accessToken, { codigo: codigoHduUnico("D131A"), celulaId: celula.id, sprintId: sprint.id });

      for (const { ancho, alto } of VIEWPORTS) {
        await page.setViewportSize({ width: ancho, height: alto });
        await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
        await page.getByRole("button", { name: "Asignar analista" }).click();
        const dialogo = page.getByRole("dialog", { name: "Asignar analista" });
        await verificarLista(page, dialogo, dialogo.locator("#select-analista-hdu"), "Asignar analista", ancho, alto);
        await dialogo.getByRole("button", { name: "Cancelar" }).click();
        await expect(dialogo).toHaveCount(0);
      }
    } finally {
      for (const id of creados) await desactivarUsuario(request, admin.accessToken, id);
    }
  });
});

test.describe("D131 · Reasignar QE responsable con más de 6 opciones", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

  test("[D131#2] el selector de QE destino se desplaza dentro del diálogo, todas las opciones son elegibles y axe queda limpio", async ({ page, request }) => {
    const admin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const carla = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const creados: string[] = [];
    try {
      for (let i = 0; i < 6; i++) creados.push((await crearUsuarioE7(request, admin.accessToken, "QE", { prefijo: `d131-qe${i}` })).id);
      const { celula, sprint } = await obtenerCatalogos(request, carla.accessToken);
      const hdu = await crearHdu(request, carla.accessToken, { codigo: codigoHduUnico("D131Q"), celulaId: celula.id, sprintId: sprint.id });

      for (const { ancho, alto } of VIEWPORTS) {
        await page.setViewportSize({ width: ancho, height: alto });
        await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
        await page.getByTestId("boton-reasignar-qe").click();
        const dialogo = page.getByTestId("dialogo-reasignar-qe");
        await verificarLista(page, dialogo, dialogo.getByTestId("selector-qe-destino"), "Reasignar QE", ancho, alto);
        await dialogo.getByRole("button", { name: "Cancelar" }).click();
        await expect(dialogo).toHaveCount(0);
      }
    } finally {
      for (const id of creados) await desactivarUsuario(request, admin.accessToken, id);
    }
  });
});
