import path from "node:path";
import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { URL_LOGIN, camposLogin } from "../support/login";
import { esperarPortal, iniciarSesionUI } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * Regresión del rediseño del login: el ingreso por el formulario nuevo sigue llevando a cada rol a su portal
 * (E1-F02#1, E1-F05#1, E1-F07#1). Cada prueba hace un login real y NO cierra la sesión (un cierre global
 * revocaría las sesiones que guarda el proyecto `setup`).
 */
test.describe("Login · redirección por rol con el formulario nuevo", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

  test("[E1-F07#1] Administrador: tras ingresar llega a /admin con su identidad y accesos", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    await esperarPortal(page, "ADMINISTRADOR");
    await expect(page.getByRole("banner").getByText(USUARIOS_SEMILLA.patricia.nombre)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Usuarios" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Supervisión" })).toBeVisible();
    await expect(page.getByTestId("error-login")).toHaveCount(0);
  });

  test("[E1-F02#1] QE: tras ingresar llega a /qe con su identidad y la navegación de supervisión", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    await esperarPortal(page, "QE");
    await expect(page.getByRole("banner").getByText(USUARIOS_SEMILLA.carla.nombre)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Equipo" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Historias supervisadas" })).toBeVisible();
  });

  test("[E1-F05#1] Analista QA: tras ingresar llega a /qa con su identidad y su navegación", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo);
    await esperarPortal(page, "ANALISTA_QA");
    await expect(page.getByRole("banner").getByText(USUARIOS_SEMILLA.ana.nombre)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link", { name: "Mis HDU" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  });

  test("[LOGIN-UI] el ingreso con Enter desde el campo de contraseña funciona igual que el botón", async ({ page }) => {
    await page.goto(URL_LOGIN);
    await camposLogin(page).correo.fill(USUARIOS_SEMILLA.marcos.correo);
    await camposLogin(page).contrasena.fill(env.contrasenaDemo);
    await camposLogin(page).contrasena.press("Enter");
    await esperarPortal(page, "QE");
    await expect(page.getByRole("banner").getByText(USUARIOS_SEMILLA.marcos.nombre)).toBeVisible();
  });

  test("[LOGIN-UI] al abrir una ruta protegida sin sesión se pide el login y, tras ingresar, se vuelve a ella", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin/supervision`);
    await expect(page).toHaveURL(/\/login$/);

    await camposLogin(page).correo.fill(USUARIOS_SEMILLA.patricia.correo);
    await camposLogin(page).contrasena.fill(env.contrasenaDemo);
    await camposLogin(page).ingresar.click();
    await expect(page).toHaveURL(/\/admin\/supervision$/);
  });

  test("[LOGIN-UI] un QE con sesión que abre /login es llevado a su portal, no ve el formulario", async ({ browser }) => {
    const contexto = await browser.newContext({
      storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json"),
      baseURL: env.portalUrl,
    });
    const page = await contexto.newPage();
    await page.goto(`${env.portalUrl}/login`);
    await expect(page).toHaveURL(/\/qe$/);
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toHaveCount(0);
    await contexto.close();
  });

  test("[LOGIN-UI] el enlace «Volver a iniciar sesión» no deja a un usuario con sesión atrapado fuera del portal", async ({ browser }) => {
    // /recuperar-contrasena es pública: abrirla con sesión no debe romper la sesión ni llamar al portal por error.
    const contexto = await browser.newContext({
      storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json"),
      baseURL: env.portalUrl,
    });
    const page = await contexto.newPage();
    await page.goto(`${env.portalUrl}/recuperar-contrasena`);
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();
    await page.getByTestId("enlace-volver-login").click();
    await expect(page).toHaveURL(/\/qe$/);
    await contexto.close();
  });
});
