import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { api } from "../support/api";
import { tokenE7, type ClaveE7 } from "../support/e7";
import { hdu, imps, reiniciarFixtureE4, texto, uid, type ImpedimentoApi } from "../support/e4";
import { contextoDe, entrarEnPortal } from "../support/e4ui";
import { certificacionesCaidaEnImpedimentos, impedimentosCaido, impedimentosCaidoEnOrganizacion, type PilaE4 } from "../support/entornoE4";
import { env } from "../support/env";

/**
 * E4 · Accesibilidad (D84): axe a 1280 y 375 px, sin violaciones serious ni critical, y sin desborde horizontal a 375 px,
 * contra el stack real, sobre las pantallas y estados de la decisión D84. Cada prueba acumula los hallazgos de todas sus
 * pantallas y los informa juntos.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

const ANCHOS = [1280, 375] as const;
const problemas: string[] = [];

async function revisar(page: Page, nombre: string, ancho: number, listo?: string) {
  if (listo) await expect(page.locator(listo).first(), `${nombre} (${ancho}): señal de carga ${listo}`).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of graves) problemas.push(`[${ancho}] ${nombre}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  if (ancho <= 375) {
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, cli: document.documentElement.clientWidth, cuerpo: document.body.scrollWidth }));
    if (m.doc > m.cli || m.cuerpo > m.cli) problemas.push(`[${ancho}] ${nombre}: desborde horizontal (scrollWidth ${m.doc} > clientWidth ${m.cli})`);
  }
}

/** Abre un contexto del usuario con el ancho pedido. */
async function con(browser: Browser, clave: ClaveE7, ancho: number): Promise<{ contexto: BrowserContext; page: Page }> {
  const { contexto, page } = await contextoDe(browser, clave);
  await page.setViewportSize({ width: ancho, height: ancho > 700 ? 900 : 800 });
  return { contexto, page };
}

test.afterEach(() => {
  expect(problemas, problemas.join("\n")).toEqual([]);
});

test.beforeAll(async () => {
  await reiniciarFixtureE4();
});

test.describe("E4 · accesibilidad y responsividad", () => {
  test("[E4-A11Y] detalle de HDU como Analista asignado, QE responsable, Líder, Administrador y Auditor (con «HDU bloqueada») y como QE supervisor no responsable", async ({ browser, request }) => {
    const h = await hdu(request);
    const vistas: Array<[ClaveE7, string]> = [
      ["ana1", "detalle · Analista asignado"],
      ["qe1", "detalle · QE responsable"],
      ["lid1", "detalle · Líder"],
      ["adm1", "detalle · Administrador"],
      ["aud1", "detalle · Auditor"],
    ];
    for (const ancho of ANCHOS) {
      for (const [clave, nombre] of vistas) {
        const { contexto, page } = await con(browser, clave, ancho);
        try {
          await page.goto(`${env.portalUrl}/hdu/${h.H1.id}`);
          await expect(page.getByTestId("hdu-bloqueada")).toBeVisible();
          await revisar(page, nombre, ancho, '[data-testid="lista-impedimentos-hdu"] li');
        } finally {
          await contexto.close();
        }
      }
    }
    // QE supervisor que no es el responsable: H2 reasignada a QE2, la mira QE1 (supervisa a ANA2).
    const adm = await tokenE7("adm1");
    const [qe1, qe2] = [await uid(request, "qe1"), await uid(request, "qe2")];
    expect((await api.put(request, `/v1/hdu/${h.H2.id}/qe-responsable`, { token: adm, body: { qeResponsableId: qe2, motivo: "Prueba de accesibilidad E4" } })).status).toBe(200);
    try {
      for (const ancho of ANCHOS) {
        const { contexto, page } = await con(browser, "qe1", ancho);
        try {
          await page.goto(`${env.portalUrl}/hdu/${h.H2.id}`);
          await expect(page.getByTestId("nota-impedimentos-solo-lectura")).toBeVisible();
          await revisar(page, "detalle · QE supervisor (no responsable)", ancho, '[data-testid="lista-impedimentos-hdu"] li');
        } finally {
          await contexto.close();
        }
      }
    } finally {
      await api.put(request, `/v1/hdu/${h.H2.id}/qe-responsable`, { token: adm, body: { qeResponsableId: qe1, motivo: "Se restablece el fixture de accesibilidad E4" } });
    }
  });

  test("[E4-A11Y] diálogos: registrar impedimento, resolver, escalar, seguimiento, reabrir y fijar riesgo, abiertos y con errores de validación", async ({ browser, request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    for (const ancho of ANCHOS) {
      // Registrar (ANA3 en H4), abierto y con errores.
      const ana = await con(browser, "ana3", ancho);
      try {
        await ana.page.goto(`${env.portalUrl}/hdu/${h.H4.id}`);
        await ana.page.getByTestId("boton-registrar-impedimento").click();
        await revisar(ana.page, "registrar impedimento (abierto)", ancho, '[data-testid="form-impedimento"]');
        await ana.page.getByTestId("boton-guardar-impedimento").click();
        await revisar(ana.page, "registrar impedimento (con errores)", ancho, '[data-testid="error-tipo-impedimento"]');
      } finally {
        await ana.contexto.close();
      }
      // QE1: resolver, escalar y seguimiento sobre I2; reabrir sobre I4; fijar riesgo en H1.
      const qe = await con(browser, "qe1", ancho);
      try {
        await qe.page.goto(`${env.portalUrl}/hdu/${h.H1.id}`);
        await expect(qe.page.getByTestId(`boton-resolver-${i.I2.id}`)).toBeVisible();
        for (const [boton, dialogo, confirmar, nombre] of [
          [`boton-resolver-${i.I2.id}`, "dialogo-resolver", "Confirmar resolución", "resolver"],
          [`boton-escalar-${i.I2.id}`, "dialogo-escalar", "Confirmar escalamiento", "escalar"],
          [`boton-seguimiento-${i.I2.id}`, "dialogo-seguimiento", "Guardar seguimiento", "seguimiento"],
        ] as const) {
          await qe.page.getByTestId(boton).click();
          await revisar(qe.page, `diálogo ${nombre} (abierto)`, ancho, `[data-testid="${dialogo}"]`);
          await qe.page.getByTestId(dialogo).getByRole("button", { name: confirmar }).click();
          await revisar(qe.page, `diálogo ${nombre} (con errores)`, ancho, `[data-testid="${dialogo}"] .campo-error`);
          await qe.page.keyboard.press("Escape");
          await expect(qe.page.getByTestId(dialogo)).toHaveCount(0);
        }
        await qe.page.getByTestId("boton-fijar-riesgo").click();
        await revisar(qe.page, "diálogo fijar riesgo (abierto)", ancho, '[data-testid="form-riesgo"]');
        await qe.page.getByTestId("form-riesgo").getByRole("button", { name: "Guardar nivel" }).click();
        await revisar(qe.page, "diálogo fijar riesgo (con errores)", ancho, '[data-testid="form-riesgo"] .campo-error');
        await qe.page.keyboard.press("Escape");
        await qe.page.goto(`${env.portalUrl}/hdu/${h.H2.id}`);
        await qe.page.getByTestId(`boton-reabrir-${i.I4.id}`).click();
        await revisar(qe.page, "diálogo reabrir (abierto)", ancho, '[data-testid="dialogo-reabrir"]');
        await qe.page.getByTestId("dialogo-reabrir").getByRole("button", { name: "Confirmar reapertura" }).click();
        await revisar(qe.page, "diálogo reabrir (con errores)", ancho, '[data-testid="dialogo-reabrir"] .campo-error');
      } finally {
        await qe.contexto.close();
      }
    }
  });

  test("[E4-A11Y] detalle de H8 con el error de cierre bloqueado (error-hdu-bloqueada)", async ({ browser, request }) => {
    const h = await hdu(request);
    const token = await tokenE7("qe1");
    const reg = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H8.id}/impedimentos`, {
      token,
      body: { tipo: "DEPENDENCIA", titulo: "Entrega pendiente del equipo de Pagos", descripcion: texto(30, "descripcion "), responsableId: await uid(request, "qe1") },
    });
    expect(reg.status).toBe(201);
    try {
      for (const ancho of ANCHOS) {
        const { contexto, page } = await con(browser, "qe1", ancho);
        try {
          await page.goto(`${env.portalUrl}/hdu/${h.H8.id}`);
          await page.getByRole("button", { name: "Pasar a Cerrada" }).click();
          await revisar(page, "detalle con error-hdu-bloqueada", ancho, '[data-testid="error-hdu-bloqueada"]');
        } finally {
          await contexto.close();
        }
      }
    } finally {
      await api.post(request, `/v1/impedimentos/${reg.body.id}/resolver`, { token, body: { comentario: "Se restablece el fixture de accesibilidad" } });
    }
  });

  test("[E4-A11Y] /qe/impedimentos y /qe/impedimentos/riesgo con datos y en vacío (QE2 sin bloqueos)", async ({ browser, request }) => {
    const i = await imps(request);
    for (const ancho of ANCHOS) {
      const qe = await con(browser, "qe1", ancho);
      try {
        await qe.page.goto(`${env.portalUrl}/qe/impedimentos`);
        await revisar(qe.page, "/qe/impedimentos con datos", ancho, '[data-testid="lista-impedimentos"]');
        await qe.page.goto(`${env.portalUrl}/qe/impedimentos/riesgo`);
        await revisar(qe.page, "/qe/impedimentos/riesgo con datos", ancho, '[data-testid="lista-riesgo"]');
        await qe.page.goto(`${env.portalUrl}/qe/impedimentos?celula=00000000-0000-4000-8000-000000000000&tipo=OTRO`);
        await revisar(qe.page, "/qe/impedimentos con filtros sin coincidencias", ancho, '[data-testid="estado-vacio-filtros-impedimentos"]');
      } finally {
        await qe.contexto.close();
      }
    }
    const token = await tokenE7("qe2");
    expect((await api.post(request, `/v1/impedimentos/${i.I1.id}/resolver`, { token, body: { comentario: "Ambiente restablecido" } })).status).toBe(200);
    try {
      for (const ancho of ANCHOS) {
        const qe = await con(browser, "qe2", ancho);
        try {
          await qe.page.goto(`${env.portalUrl}/qe/impedimentos`);
          await revisar(qe.page, "/qe/impedimentos vacío", ancho, '[data-testid="estado-vacio-impedimentos"]');
          await qe.page.goto(`${env.portalUrl}/qe/impedimentos/riesgo?nivel=ALTO`);
          await revisar(qe.page, "/qe/impedimentos/riesgo vacío", ancho, '[data-testid="estado-vacio-filtros-riesgo"]');
        } finally {
          await qe.contexto.close();
        }
      }
    } finally {
      await api.post(request, `/v1/impedimentos/${i.I1.id}/reabrir`, { token, body: { motivo: "Se restablece el fixture de accesibilidad" } });
    }
  });

  test("[E4-A11Y] las 5 bandejas con sus bloques de E4 y las dos vistas de la pestaña Impedimentos del Auditor", async ({ browser }) => {
    const pantallas: Array<[ClaveE7, string, string, string]> = [
      ["ana1", "/qa", "bandeja del Analista con bloqueo", '[data-testid="contador-impedimentos-abiertos"]'],
      ["qe1", "/qe", "bandeja del QE con impedimentos", '[data-testid="lista-impedimentos"]'],
      ["lid1", "/lider", "bandeja del Líder con impedimentos", '[data-testid="lista-impedimentos"]'],
      ["adm1", "/admin", "bandeja del Administrador con impedimentos", '[data-testid="contador-impedimentos-abiertos"]'],
      ["aud1", "/auditor", "bandeja del Auditor con impedimentos", '[data-testid="contador-impedimentos-abiertos"]'],
      ["aud1", "/auditor/impedimentos", "Auditor · vista Impedimentos", '[data-testid="lista-auditor-impedimentos"]'],
      ["aud1", "/auditor/impedimentos?vista=gestion", "Auditor · vista Gestión", '[data-testid="lista-auditor-gestion"]'],
    ];
    for (const ancho of ANCHOS) {
      for (const [clave, ruta, nombre, listo] of pantallas) {
        const { contexto, page } = await con(browser, clave, ancho);
        try {
          await page.goto(`${env.portalUrl}${ruta}`);
          await revisar(page, nombre, ancho, listo);
        } finally {
          await contexto.close();
        }
      }
    }
  });

  test.describe("con fuentes caídas", () => {
    async function entrar(browser: Browser, clave: ClaveE7, ancho: number, portal: string) {
      const contexto = await browser.newContext({ viewport: { width: ancho, height: ancho > 700 ? 900 : 800 } });
      const page = await contexto.newPage();
      await entrarEnPortal(page, clave, portal);
      return { contexto, page };
    }

    // Cada pila usa los mismos puertos (gateway :3100, portal :5180): se levantan de una en una.
    test("[E4-A11Y] Impedimentos caído: detalle («No disponible»)", async ({ browser, request }) => {
      const h = await hdu(request);
      const pila: PilaE4 = await impedimentosCaido(true);
      try {
        for (const ancho of ANCHOS) {
          const a = await entrar(browser, "ana1", ancho, pila.portalUrl!);
          try {
            await a.page.goto(`${pila.portalUrl}/hdu/${h.H1.id}`);
            await revisar(a.page, "detalle con Impedimentos indisponible", ancho, '[data-testid="estado-indisponible-impedimentos-hdu"]');
          } finally {
            await a.contexto.close();
          }
        }
      } finally {
        await pila.detener();
      }
    });

    test("[E4-A11Y] Impedimentos caído en Organización: /qe/impedimentos (error) y bandejas del QE y del Administrador con bloques indisponibles", async ({ browser }) => {
      const pila: PilaE4 = await impedimentosCaidoEnOrganizacion(true);
      try {
        for (const ancho of ANCHOS) {
          const q = await entrar(browser, "qe1", ancho, pila.portalUrl!);
          try {
            await q.page.goto(`${pila.portalUrl}/qe/impedimentos`);
            await revisar(q.page, "/qe/impedimentos con Impedimentos caído", ancho, '[data-testid="estado-error-impedimentos"], [data-testid="estado-indisponible-impedimentos"]');
            await q.page.goto(`${pila.portalUrl}/qe`);
            await revisar(q.page, "bandeja del QE con Impedimentos caído", ancho, '[data-testid="estado-indisponible-impedimentos-abiertos"]');
          } finally {
            await q.contexto.close();
          }
          const ad = await entrar(browser, "adm1", ancho, pila.portalUrl!);
          try {
            await ad.page.goto(`${pila.portalUrl}/admin`);
            await revisar(ad.page, "bandeja del Administrador con Impedimentos caído", ancho, '[data-testid="estado-indisponible-impedimentos-abiertos"]');
          } finally {
            await ad.contexto.close();
          }
        }
      } finally {
        await pila.detener();
      }
    });

    test("[E4-A11Y] Certificaciones caída: /qe/impedimentos, /qe/impedimentos/riesgo y el panel de riesgo (parcial y «No disponible»)", async ({ browser, request }) => {
      const h = await hdu(request);
      const pila: PilaE4 = await certificacionesCaidaEnImpedimentos(true);
      try {
        for (const ancho of ANCHOS) {
          const q = await entrar(browser, "qe1", ancho, pila.portalUrl!);
          try {
            await q.page.goto(`${pila.portalUrl}/qe/impedimentos`);
            await revisar(q.page, "/qe/impedimentos con Certificaciones caída", ancho, '[data-testid="lista-impedimentos"]');
            await q.page.goto(`${pila.portalUrl}/qe/impedimentos/riesgo`);
            await revisar(q.page, "/qe/impedimentos/riesgo con Certificaciones caída", ancho, '[data-testid="lista-riesgo"]');
            await q.page.goto(`${pila.portalUrl}/hdu/${h.H1.id}`);
            await revisar(q.page, "panel de riesgo con cálculo parcial", ancho, '[data-testid="aviso-calculo-parcial"]');
            await q.page.goto(`${pila.portalUrl}/hdu/${h.H8.id}`);
            await revisar(q.page, "panel de riesgo «No disponible»", ancho, '[data-testid="estado-indisponible-riesgo"]');
          } finally {
            await q.contexto.close();
          }
        }
      } finally {
        await pila.detener();
      }
    });
  });
});
