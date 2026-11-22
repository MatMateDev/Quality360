import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { CONTRASENA } from "./e7";
import { env } from "./env";
import { iniciarSesionUI } from "./ui";

/** Usuarios del fixture de E7 con sesión guardada por `e7-setup` (QE3 y LID3 de `seed:e6` entran por el formulario). */
const CON_SESION = new Set(["adm1", "qe1", "qe2", "ana1", "ana2", "ana3", "ana4", "lid1", "lid2", "aud1"]);

const PORTAL: Record<string, string> = { adm: "/admin", qe: "/qe", "qe": "/qe", ana: "/qa", lid: "/lider", aud: "/auditor" };

export const estadoSesionLocal = (local: string) => path.join(import.meta.dirname, "..", ".auth", `e7-${local}.json`);

/**
 * Contexto y página del usuario `local` (`qe1`, `lid3`…). Los de E7 reutilizan la sesión guardada; los demás inician sesión
 * por el formulario real. `portalUrl` permite el portal alterno de las fuentes caídas (la sesión guardada no sirve entre orígenes).
 */
export async function paginaDe(browser: Browser, local: string, portalUrl = env.portalUrl): Promise<{ contexto: BrowserContext; page: Page }> {
  if (CON_SESION.has(local) && portalUrl === env.portalUrl) {
    const contexto = await browser.newContext({ storageState: estadoSesionLocal(local), baseURL: portalUrl });
    return { contexto, page: await contexto.newPage() };
  }
  const contexto = await browser.newContext({ baseURL: portalUrl });
  const page = await contexto.newPage();
  await iniciarSesionUI(page, `${local}@quality360.local`, CONTRASENA, portalUrl);
  await page.waitForURL(new RegExp(`${PORTAL[local.replace(/[0-9]+$/, "").slice(0, 3)]}$`), { timeout: 30_000 });
  return { contexto, page };
}

/** Abre una ruta de indicadores y espera a que cargue la página (o el acceso denegado). */
export async function abrir(page: Page, ruta: string, portalUrl = env.portalUrl): Promise<void> {
  await page.goto(`${portalUrl}${ruta}`);
  await expect(page.getByTestId("pagina-indicadores").or(page.getByTestId("acceso-denegado")).or(page.getByTestId("pagina-snapshots"))).toBeVisible();
}

/** Peticiones de datos de indicadores con su estado (para los negativos de acceso). */
export function vigilarIndicadores(page: Page): Array<{ url: string; status: number }> {
  const salida: Array<{ url: string; status: number }> = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/v1/indicadores")) salida.push({ url: `${u.pathname}${u.search}`, status: r.status() });
  });
  return salida;
}

/** Valor visible de una cifra del dashboard. */
export const cifraUi = (page: Page, clave: string) => page.getByTestId(`indicador-${clave}`);

/** Lee las siete cifras visibles (número o texto) del dashboard de cumplimiento. */
export async function leerCifras(page: Page): Promise<Record<string, string>> {
  await expect(page.getByTestId("indicador-totales")).toBeVisible();
  const claves = ["totales", "certificadas", "cerradas-excepcion", "en-curso", "sin-iniciar", "bloqueadas", "cumplimiento"];
  const salida: Record<string, string> = {};
  for (const c of claves) salida[c] = ((await page.getByTestId(`indicador-${c}`).textContent()) ?? "").trim();
  return salida;
}

/** Elige una opción de un select del filtro por el inicio de su texto visible. */
export async function elegirFiltro(page: Page, id: "filtro-celula" | "filtro-sprint", prefijo: string): Promise<void> {
  const select = page.getByTestId(id);
  await expect.poll(async () => select.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
  const etiqueta = await select.locator("option").evaluateAll((os, p) => (os as HTMLOptionElement[]).find((o) => (o.textContent ?? "").trim().startsWith(p as string))?.value, prefijo);
  if (!etiqueta) throw new Error(`No hay opción «${prefijo}» en ${id}.`);
  await select.selectOption(etiqueta);
}

/** axe sobre la página actual con las etiquetas WCAG 2.1 A/AA; devuelve las violaciones. */
export async function violacionesAxe(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.length} nodo(s) · ${v.nodes[0]?.target.join(" ")}`);
}
