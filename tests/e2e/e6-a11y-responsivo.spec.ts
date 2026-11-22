import { expect, test, type Page } from "@playwright/test";
import { hdu } from "../support/e4";
import { env } from "../support/env";
import { abrir, paginaDe, violacionesAxe } from "../support/e6ui";
import { celulas, fotoE6, llevarAPendienteCierre, restaurarE6, serieTresDias, tkLocal, type FotoE6 } from "../support/e6run";

/**
 * Accesibilidad (axe WCAG 2.1 A/AA a 1280 y 375 px), responsivo (sin desborde horizontal), secretos fuera del DOM y estado en la URL
 * de las pantallas nuevas de E6. IDs `E6-A11Y`, `E6-RESP` y `E6-DOM` de esta certificación.
 */
let foto: FotoE6;
let celA = "";
test.beforeAll(async ({ request }) => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
  celA = (await celulas(request))["CEL-A"];
  await serieTresDias(request);
  await llevarAPendienteCierre(request, "H2");
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

interface Pantalla {
  id: string;
  local: string;
  ruta: (h: Record<string, { id: string }>) => string;
  listo: (p: Page) => Promise<void>;
  accion?: (p: Page) => Promise<void>;
}

const PANTALLAS: Pantalla[] = [
  { id: "QE cumplimiento", local: "qe1", ruta: () => "/qe/indicadores", listo: async (p) => void (await expect(p.getByTestId("indicador-totales")).toBeVisible()) },
  { id: "QE semáforo", local: "qe1", ruta: () => "/qe/indicadores/semaforo", listo: async (p) => void (await expect(p.locator('[data-testid^="tarjeta-celula-"]').first()).toBeVisible()) },
  {
    id: "QE semáforo con drill-down",
    local: "qe1",
    ruta: () => `/qe/indicadores/semaforo?detalle=${celA}`,
    listo: async (p) => void (await expect(p.getByTestId("lista-drilldown")).toBeVisible()),
  },
  { id: "QE carga", local: "qe1", ruta: () => "/qe/indicadores/carga", listo: async (p) => void (await expect(p.getByTestId("lista-carga")).toBeVisible()) },
  { id: "QE tendencia", local: "qe1", ruta: () => "/qe/indicadores/tendencia", listo: async (p) => void (await expect(p.getByTestId("grafica-tendencia")).toBeVisible()) },
  { id: "QE tendencia con escala ajustada", local: "qe1", ruta: () => "/qe/indicadores/tendencia?escala=1", listo: async (p) => void (await expect(p.getByTestId("grafica-tendencia")).toBeVisible()) },
  { id: "Líder cumplimiento", local: "lid1", ruta: () => "/lider/indicadores", listo: async (p) => void (await expect(p.getByTestId("indicador-totales")).toBeVisible()) },
  { id: "Auditor carga con historial", local: "aud1", ruta: () => "/auditor/indicadores/carga", listo: async (p) => void (await expect(p.getByTestId("lista-carga").first()).toBeVisible()) },
  { id: "Administrador snapshots", local: "adm1", ruta: () => "/admin/indicadores/snapshots", listo: async (p) => void (await expect(p.getByTestId("boton-generar-snapshot")).toBeVisible()) },
  {
    id: "Detalle H2 cerrada por excepción: cuadro de cierre abierto",
    local: "qe1",
    ruta: (h) => `/hdu/${h.H2.id}`,
    listo: async (p) => void (await expect(p.getByTestId("boton-cerrar-excepcion")).toBeVisible()),
    accion: async (p) => {
      await p.getByTestId("boton-cerrar-excepcion").click();
      await expect(p.getByTestId("dialogo-cierre-excepcion")).toBeVisible();
    },
  },
];

const VIEWPORTS = [
  { nombre: "1280", ancho: 1280, alto: 800 },
  { nombre: "375", ancho: 375, alto: 667 },
] as const;

test.describe("E6 · Accesibilidad y responsivo", () => {
  for (const vp of VIEWPORTS) {
    for (const [i, pantalla] of PANTALLAS.entries()) {
      test(`[E6-A11Y#${vp.nombre}] E6-A11Y-${vp.nombre}-T${String(i + 1).padStart(2, "0")}: axe sin violaciones y sin desborde horizontal en «${pantalla.id}» a ${vp.ancho} px`, async ({ browser, request }) => {
        const h = await hdu(request);
        const { contexto, page } = await paginaDe(browser, pantalla.local);
        await page.setViewportSize({ width: vp.ancho, height: vp.alto });
        await page.goto(`${env.portalUrl}${pantalla.ruta(h as any)}`);
        await pantalla.listo(page);
        if (pantalla.accion) await pantalla.accion(page);
        await page.waitForTimeout(400);
        expect(await violacionesAxe(page)).toEqual([]);
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(desborde, "desborde horizontal de la página").toBeLessThanOrEqual(1);
        await contexto.close();
      });
    }
  }

  test("[E6-DOM#1] E6-DOM-T01: CRON_SECRET, la credencial de servicio y el Authorization no aparecen en el DOM ni en el almacenamiento de las pantallas de E6", async ({ browser, request }) => {
    const h = await hdu(request);
    const secretos = [env.cronSecret, env.servicioToken, env.indicadoresServicioToken].filter((s) => s.length > 0);
    expect(secretos.length).toBeGreaterThanOrEqual(2);
    for (const [local, rutas] of [
      ["qe1", ["/qe/indicadores", "/qe/indicadores/semaforo", "/qe/indicadores/carga", "/qe/indicadores/tendencia", `/hdu/${h.H2.id}`]],
      ["adm1", ["/admin/indicadores/snapshots"]],
      ["aud1", ["/auditor/indicadores/carga"]],
    ] as const) {
      const { contexto, page } = await paginaDe(browser, local);
      const respuestas: string[] = [];
      page.on("response", async (r) => {
        if (new URL(r.url()).pathname.startsWith("/v1/")) respuestas.push(JSON.stringify(r.headers()), await r.text().catch(() => ""));
      });
      for (const ruta of rutas) {
        await page.goto(`${env.portalUrl}${ruta}`);
        await page.waitForLoadState("networkidle");
        const html = await page.content();
        const token = await tkLocal(local);
        for (const s of secretos) expect(html.includes(s), `${local} ${ruta}`).toBe(false);
        expect(html.includes(token), `${local} ${ruta}: el token aparece en el DOM`).toBe(false);
        expect(html).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/);
      }
      for (const s of secretos) expect(respuestas.join("\n").includes(s)).toBe(false);
      await contexto.close();
    }
  });

  test("[E6-DOM#2] E6-DOM-T02: el estado de la pestaña Tendencia vive en la URL: escala=1 ajusta la escala y «Atrás» vuelve al estado anterior", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/tendencia");
    await expect(page.getByTestId("grafica-tendencia")).toBeVisible();
    await expect(page.getByText(/Escala ajustada/)).toHaveCount(0);
    await page.goto(`${env.portalUrl}/qe/indicadores/tendencia?escala=1`);
    await expect(page.getByText(/Escala ajustada/)).toBeVisible();
    await page.goBack();
    await expect(page.getByText(/Escala ajustada/)).toHaveCount(0);
    await contexto.close();
  });

  test("[E6-A11Y#def01] E6-A11Y-DEF01: todo aria-controls de las pestañas y del semáforo apunta a un elemento que existe (DEF-E6-01)", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, `/qe/indicadores/semaforo?detalle=${celA}`);
    await expect(page.getByTestId("lista-drilldown")).toBeVisible();
    const rotos = await page.evaluate(() =>
      [...document.querySelectorAll("[aria-controls]")]
        // Un disparador colapsado (aria-expanded=false) puede referir a un panel que aún no está en el DOM (axe lo admite; se informa como OBS-E6-08).
        .filter((e) => e.getAttribute("aria-expanded") !== "false")
        .flatMap((e) => (e.getAttribute("aria-controls") ?? "").split(/\s+/).filter((id) => id && !document.getElementById(id)).map((id) => `${e.tagName}#${id}`)),
    );
    expect(rotos).toEqual([]);
    await expect(page.getByTestId(`boton-ver-detalle-${celA}`)).toHaveAttribute("aria-controls", "lista-drilldown-panel");
    await contexto.close();
  });

  test("[E6-A11Y#def02] E6-A11Y-DEF02: la tabla de datos de la tendencia es una región desplazable enfocable con el teclado (DEF-E6-02)", async ({ browser }) => {
    const { contexto, page } = await paginaDe(browser, "qe1");
    await abrir(page, "/qe/indicadores/tendencia");
    const region = page.getByRole("region", { name: /Tabla de cumplimiento por fecha/ });
    await expect(region).toHaveAttribute("tabindex", "0");
    await region.focus();
    await expect(region).toBeFocused();
    await contexto.close();
  });

  test("[E6-A11Y#def03] E6-A11Y-DEF03: el botón de peligro «Cerrar con excepción» mantiene contraste AA (4,5:1) en hover (DEF-E6-03)", async ({ browser, request }) => {
    const h = await hdu(request);
    const { contexto, page } = await paginaDe(browser, "qe1");
    await page.goto(`${env.portalUrl}/hdu/${h.H2.id}`);
    await page.getByTestId("boton-cerrar-excepcion").click();
    const boton = page.getByTestId("boton-confirmar-cierre-excepcion");
    await boton.hover();
    await page.waitForTimeout(400);
    const [fg, bg] = await boton.evaluate((el) => {
      const c = getComputedStyle(el);
      return [c.color, c.backgroundColor];
    });
    const rgb = (t: string) => (t.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [l1, l2] = [lum(rgb(fg)), lum(rgb(bg))];
    const contraste = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    expect(contraste, `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    await contexto.close();
  });
});
