import path from "node:path";
import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

const ROLES = ["ANALISTA_QA", "QE", "LIDER_QA", "ADMINISTRADOR", "AUDITOR"] as const;
const ESTADOS = ["PENDIENTE", "DISENO_PRUEBAS", "EN_EJECUCION", "PENDIENTE_CIERRE", "CERRADA"] as const;

type Contador = { estado: "ok"; datos: { valor: number } } | { estado: "indisponible" };
interface BandejaAdmin {
  contadores: {
    usuariosActivos: { estado: "ok"; datos: { valor: number; porRol: Record<(typeof ROLES)[number], number> } } | { estado: "indisponible" };
    analistasSinQe: Contador;
    qeSinAnalistas: Contador;
    lideresSinCelulas: Contador;
    celulasSinLider: Contador;
    hduTotal: Contador;
  };
}
interface InicioAdmin {
  usuarios: { estado: "ok"; datos: { total: number; activos: number } };
  supervision: { estado: "ok"; datos: { relacionesVigentes: number } };
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const valor = (c: Contador) => (c.estado === "ok" ? c.datos.valor : Number.NaN);

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

test.describe("E6 · Dashboard Administrador", () => {
  test("[Dashboard Admin] muestra las cifras reales de usuarios, supervisión, organización y HDU de la plataforma", async ({ page, request }) => {
    const { accessToken: token } = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const inicio = (await api.get<InicioAdmin>(request, "/v1/inicio/admin", { token })).body;
    const bandeja = (await api.get<BandejaAdmin>(request, "/v1/bandeja/admin", { token })).body;
    const porEstado: Record<string, number> = {};
    for (const estado of ESTADOS) {
      porEstado[estado] = (await api.get<{ total: number }>(request, `/v1/hdu?estado=${estado}&tamanoPagina=1`, { token })).body.total;
    }

    await page.goto(`${env.portalUrl}/admin/dashboard`);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard Administrador" })).toBeVisible();

    await expect(page.getByTestId("tarjeta-dash-admin-usuarios")).toContainText(String(inicio.usuarios.datos.activos));
    await expect(page.getByTestId("tarjeta-dash-admin-supervision")).toContainText(String(inicio.supervision.datos.relacionesVigentes));
    await expect(page.getByTestId("contador-dash-admin-hdu")).toHaveText(String(valor(bandeja.contadores.hduTotal)));

    const activos = bandeja.contadores.usuariosActivos;
    if (activos.estado !== "ok") throw new Error("La bandeja del Administrador no trajo los usuarios activos");
    for (const rol of ROLES) {
      const n = activos.datos.porRol[rol];
      await expect(page.getByTestId(`dash-admin-rol-${rol}`)).toHaveText(`${n} (${pct(n, activos.datos.valor)}%)`);
    }
    const analistas = activos.datos.porRol.ANALISTA_QA;
    const cobertura = pct(analistas - valor(bandeja.contadores.analistasSinQe), analistas);
    await expect(page.getByTestId("tarjeta-dash-admin-cobertura")).toContainText(`${cobertura}%`);

    for (const [clave, contador] of [
      ["analistas-sin-qe", bandeja.contadores.analistasSinQe],
      ["qe-sin-analistas", bandeja.contadores.qeSinAnalistas],
      ["lideres-sin-celulas", bandeja.contadores.lideresSinCelulas],
      ["celulas-sin-lider", bandeja.contadores.celulasSinLider],
    ] as const) {
      await expect(page.getByTestId(`contador-dash-admin-${clave}`)).toHaveText(String(valor(contador)));
    }

    const totalHdu = ESTADOS.reduce((suma, estado) => suma + porEstado[estado]!, 0);
    for (const estado of ESTADOS) {
      await expect(page.getByTestId(`dash-admin-estado-${estado}`)).toHaveText(`${porEstado[estado]} (${pct(porEstado[estado]!, totalHdu)}%)`);
    }
    await expect(page.getByTestId("dash-admin-anillo-cierre-valor")).toHaveText(`${pct(porEstado.CERRADA!, totalHdu)}%`);
  });

  test("[Dashboard Admin] se abre desde el menú, cambia a modo oscuro y no tiene desborde horizontal", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin`);
    await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    const tema = page.getByRole("button", { name: /Modo oscuro/ });
    await tema.click();
    await expect(page.getByTestId("dashboard-admin")).toHaveClass(/qe-dashboard--oscuro/);
    await expect(page.getByRole("button", { name: /Modo claro/ })).toHaveAttribute("aria-pressed", "true");

    await page.setViewportSize({ width: 375, height: 812 });
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde).toBeLessThanOrEqual(0);
  });

  test("[Dashboard Admin] otro rol que abre /admin/dashboard ve acceso denegado", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });
    const page = await ctx.newPage();
    await page.goto(`${env.portalUrl}/admin/dashboard`);
    await expect(page.getByTestId("acceso-denegado")).toContainText("No tienes acceso a esta sección");
    await expect(page.getByRole("heading", { name: "Dashboard Administrador" })).toHaveCount(0);
    await ctx.close();
  });
});
