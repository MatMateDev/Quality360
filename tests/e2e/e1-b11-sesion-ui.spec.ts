import { expect, test } from "@playwright/test";
import { iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { TEXTO, camposLogin, capturar, registrarSolicitudes } from "../support/login";
import { tokenExpirado } from "../support/tokenForjado";
import { iniciarSesionUI } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

test.describe("E1-B11 · Sesión expirada por la interfaz", () => {
  test("[E1-B11#1] con una sesión vencida el gateway responde 401 SESION_EXPIRADA y el portal vuelve al login con el aviso ámbar", async ({
    page,
  }) => {
    const patricia = USUARIOS_SEMILLA.patricia;
    await iniciarSesionUI(page, patricia.correo, env.contrasenaDemo);
    await expect(page).toHaveURL(/\/admin$/);

    // El gateway recibe, en la siguiente operación protegida, un token vencido pero bien firmado (el mismo
    // que usa E1-B11#1 por API): la respuesta 401 SESION_EXPIRADA es la real del gateway, no una simulada.
    const sesion = await iniciarSesion(patricia.correo, env.contrasenaDemo);
    const vencido = tokenExpirado(sesion.userId, patricia.correo);
    let estadoGateway = 0;
    let codigoGateway = "";
    await page.route("**/v1/usuarios**", async (route) => {
      const respuesta = await route.fetch({ headers: { ...route.request().headers(), authorization: `Bearer ${vencido}` } });
      estadoGateway = respuesta.status();
      codigoGateway = ((await respuesta.json()) as { codigo?: string }).codigo ?? "";
      await route.fulfill({ response: respuesta });
    });

    // Navegación dentro de la app (sin recargar): el cliente HTTP reacciona al 401.
    await page.getByRole("navigation", { name: "Portal" }).getByRole("link", { name: "Usuarios" }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(estadoGateway).toBe(401);
    expect(codigoGateway).toBe("SESION_EXPIRADA");

    const aviso = page.getByTestId("aviso-sesion");
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveText(TEXTO.sesionExpirada);
    await expect(aviso).toHaveAttribute("role", "status");
    // Es un aviso (ámbar), no un error de credenciales.
    await expect(aviso).toHaveCSS("background-color", "rgb(255, 243, 214)");
    await expect(page.getByTestId("error-login")).toHaveCount(0);
    await capturar(page, "login-1280x800-sesion-expirada");

    // Volver a ingresar retira el aviso y devuelve a la pantalla desde la que se había salido.
    await page.unroute("**/v1/usuarios**");
    await camposLogin(page).correo.fill(patricia.correo);
    await camposLogin(page).contrasena.fill(env.contrasenaDemo);
    await camposLogin(page).ingresar.click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
    await expect(page.getByTestId("aviso-sesion")).toHaveCount(0);
  });

  test("[E1-B11#1] el aviso de sesión expirada no aparece en un login limpio ni tras un error de credenciales", async ({ page }) => {
    await page.goto(`${env.portalUrl}/login`);
    await expect(page.getByTestId("aviso-sesion")).toHaveCount(0);

    await camposLogin(page).correo.fill(USUARIOS_SEMILLA.carla.correo);
    await camposLogin(page).contrasena.fill("contrasena-incorrecta-de-prueba");
    await camposLogin(page).ingresar.click();
    await expect(page.getByTestId("error-login")).toBeVisible();
    await expect(page.getByTestId("aviso-sesion")).toHaveCount(0);
  });

  test("[E1-B11#1] una sesión inexistente al abrir una ruta protegida lleva al login sin avisos ni solicitudes al gateway", async ({ page }) => {
    const gateway = registrarSolicitudes(page, [`${env.gatewayUrl}/v1/`]);
    await page.goto(`${env.portalUrl}/admin/usuarios`);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    await expect(page.getByTestId("aviso-sesion")).toHaveCount(0);
    await expect(page.getByTestId("error-login")).toHaveCount(0);
    expect(gateway.map((s) => s.url())).toEqual([]);
  });
});
