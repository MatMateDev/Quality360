import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { env } from "./env";

/** Ayudas de portal para los escenarios E5-F06 y E5-F07 (dueño: q360-qa). */
export const RUTA_CONSULTA = `${env.portalUrl}/admin/integraciones/sincronizar`;
export const fila = (page: Page, codigo: string): Locator => page.getByTestId(`fila-${codigo}`);

export async function irAConsulta(page: Page, ruta = RUTA_CONSULTA): Promise<void> {
  await page.goto(ruta);
  await expect(page.getByTestId("consulta-abierta")).toBeVisible({ timeout: 30_000 });
}

/** Abre un grupo colapsable si está cerrado. */
export async function abrirGrupo(page: Page, clave: "nuevas" | "cambiaron" | "sin-cambios" | "con-error"): Promise<void> {
  const boton = page.getByTestId(`boton-grupo-${clave}`);
  if ((await boton.count()) > 0 && (await boton.getAttribute("aria-expanded")) === "false") await boton.click();
  await expect(page.getByTestId(`grupo-${clave}`)).toBeVisible();
}

/** Elige un valor de un selector y espera la respuesta del guardado (PATCH …/items). */
export async function elegir(page: Page, sel: Locator, valor: string): Promise<void> {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/items"), { timeout: 20_000 }), sel.selectOption(valor)]);
}

export async function abrirDetalle(page: Page, codigo: string): Promise<Locator> {
  await fila(page, codigo).getByTestId("boton-ver-detalle").click();
  const panel = page.getByTestId("panel-detalle-hdu");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-codigo", codigo);
  return panel;
}

/** axe con las etiquetas WCAG 2.1 AA: devuelve los hallazgos serious y critical como texto. */
export async function hallazgosAxe(page: Page, nombre: string, ancho: number, contexto?: string): Promise<string[]> {
  await page.waitForTimeout(500);
  const constructor = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (contexto) constructor.include(contexto);
  const r = await constructor.analyze();
  const salida = r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `[${ancho}] ${nombre}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  if (ancho <= 375) {
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cli: document.documentElement.clientWidth, cuerpo: document.body.scrollWidth }));
    if (m.doc > m.cli || m.cuerpo > m.cli) salida.push(`[${ancho}] ${nombre}: desborde horizontal (scrollWidth ${m.doc} > clientWidth ${m.cli})`);
  }
  return salida;
}

/** Cuenta (y devuelve) las peticiones POST de confirmación de una fila que hace la página. */
export function vigilarConfirmaciones(page: Page): { n: () => number; urls: string[] } {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/items\/[^/]+\/confirmaciones$/.test(new URL(r.url()).pathname)) urls.push(r.url());
  });
  return { n: () => urls.length, urls };
}
