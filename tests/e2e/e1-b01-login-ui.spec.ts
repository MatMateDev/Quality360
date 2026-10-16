import { expect, test, type Page } from "@playwright/test";
import { crearCuentaSoloEnProveedor, eliminarCuenta } from "../support/adminIdentidad";
import { iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { TEXTO, URL_LOGIN, camposLogin, capturar, errorAuth, registrarSolicitudes } from "../support/login";
import { USUARIOS_SEMILLA } from "../support/usuarios";

// Login real por el formulario: no reutiliza el storageState del proyecto `setup`.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

/** Claves de la sesión de Supabase en `localStorage` (`sb-*-auth-token`). */
async function clavesDeSesion(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).filter((clave) => clave.endsWith("-auth-token")));
}

async function intentarIngreso(page: Page, correo: string, contrasena: string) {
  await page.goto(URL_LOGIN);
  const { correo: campoCorreo, contrasena: campoContrasena, ingresar } = camposLogin(page);
  await campoCorreo.fill(correo);
  await campoContrasena.fill(contrasena);
  await ingresar.click();
}

test.describe("E1-B01 · Acceso por la interfaz", () => {
  test("[E1-B01#2] un usuario desactivado ve el mensaje genérico; al recargar no reaparece y queda en el login sin sesión", async ({ page }) => {
    const gabriela = USUARIOS_SEMILLA.gabriela;
    expect(gabriela.activo).toBe(false);

    // Qué ocurre en la red: el proveedor la autentica (200) y el gateway la rechaza (403).
    const respuestaToken = page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST");
    const respuestaPerfil = page.waitForResponse((r) => r.url().includes("/v1/me"));
    await intentarIngreso(page, gabriela.correo, env.contrasenaDemo);
    expect((await respuestaToken).status()).toBe(200);
    expect((await respuestaPerfil).status()).toBe(403);

    const error = page.getByTestId("error-login");
    await expect(error).toBeVisible();
    await expect(error).toHaveText(TEXTO.credenciales);
    await expect(error).toHaveAttribute("data-tipo", "credenciales");
    await expect(page).toHaveURL(/\/login$/);
    // El correo se conserva y la contraseña se vacía, como en cualquier error de acceso.
    await expect(camposLogin(page).correo).toHaveValue(gabriela.correo);
    await expect(camposLogin(page).contrasena).toHaveValue("");
    await capturar(page, "login-1280x800-usuario-desactivado");

    // La sesión del proveedor se cierra: no queda nada en el almacenamiento del navegador.
    await expect.poll(() => clavesDeSesion(page), { timeout: 10_000 }).toEqual([]);

    // Al recargar: login limpio, sin el error y sin intentar restaurar una sesión (ninguna llamada a /v1/me).
    const perfilTrasRecarga = registrarSolicitudes(page, ["/v1/me"]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("error-login")).toHaveCount(0);
    await expect(page).toHaveURL(/\/login$/);
    expect(perfilTrasRecarga).toHaveLength(0);
    expect(await clavesDeSesion(page)).toEqual([]);

    // Y una ruta protegida sigue mandando al login.
    await page.goto(`${env.portalUrl}/qa`);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[E1-B01#2] el rechazo de Organización cierra solo la sesión de este navegador y no revoca las demás sesiones del usuario (D6)", async ({
    page,
  }) => {
    const gabriela = USUARIOS_SEMILLA.gabriela;
    // Otra sesión del mismo usuario (otro dispositivo), obtenida directamente en el proveedor.
    const otraSesion = await iniciarSesion(gabriela.correo, env.contrasenaDemo);

    const cierre = page.waitForRequest((r) => r.url().includes("/auth/v1/logout"));
    await intentarIngreso(page, gabriela.correo, env.contrasenaDemo);
    await expect(page.getByTestId("error-login")).toHaveText(TEXTO.credenciales);

    // El portal cierra con alcance local, no global.
    expect(new URL((await cierre).url()).searchParams.get("scope")).toBe("local");
    await expect.poll(() => clavesDeSesion(page), { timeout: 10_000 }).toEqual([]);

    // La sesión del otro dispositivo sigue pudiendo renovarse.
    const renovacion = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: otraSesion.refreshToken }),
    });
    expect(renovacion.status).toBe(200);
  });

  test("[E1-B01#2] una cuenta sin registro en Organización recibe exactamente el mismo aviso que una desactivada", async ({ page }) => {
    const correo = `solo-proveedor-ui-${Date.now()}@quality360.local`;
    const contrasena = "SoloProveedorUI#B01";
    const id = await crearCuentaSoloEnProveedor(correo, contrasena);
    try {
      await intentarIngreso(page, correo, contrasena);
      const error = page.getByTestId("error-login");
      await expect(error).toBeVisible();
      const sinRegistro = await error.evaluate((el) => el.outerHTML);
      await expect.poll(() => clavesDeSesion(page), { timeout: 10_000 }).toEqual([]);

      await intentarIngreso(page, USUARIOS_SEMILLA.gabriela.correo, env.contrasenaDemo);
      await expect(page.getByTestId("error-login")).toBeVisible();
      const desactivada = await page.getByTestId("error-login").evaluate((el) => el.outerHTML);

      expect(sinRegistro).toBe(desactivada);
      expect(sinRegistro).toContain(TEXTO.credenciales);
    } finally {
      await eliminarCuenta(id);
    }
  });

  test("[E1-B01#2] un usuario desactivado con la contraseña equivocada ve lo mismo que un correo inexistente", async ({ page }) => {
    await intentarIngreso(page, USUARIOS_SEMILLA.gabriela.correo, "contrasena-incorrecta-de-prueba");
    const error = page.getByTestId("error-login");
    await expect(error).toBeVisible();
    const desactivada = await error.evaluate((el) => el.outerHTML);

    await intentarIngreso(page, `no-existe-${Date.now()}@quality360.local`, "contrasena-incorrecta-de-prueba");
    await expect(page.getByTestId("error-login")).toBeVisible();
    expect(await page.getByTestId("error-login").evaluate((el) => el.outerHTML)).toBe(desactivada);
  });

  test("[E1-B01#3] límite de intentos (respuesta 429 simulada): aviso «demasiados intentos», sin revelar cuentas", async ({ page }) => {
    // Supabase local no aplica el límite por IP (ver el dictamen), así que se simula la respuesta real
    // de GoTrue (`429 over_request_rate_limit`) para comprobar lo que el portal muestra. No certifica
    // el límite del proveedor, solo la reacción de la interfaz.
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill(errorAuth(429, "over_request_rate_limit", "Request rate limit reached")),
    );

    for (const correo of [USUARIOS_SEMILLA.patricia.correo, `no-existe-${Date.now()}@quality360.local`]) {
      await intentarIngreso(page, correo, "contrasena-de-prueba-123");
      const alerta = page.getByTestId("error-login");
      await expect(alerta).toBeVisible();
      await expect(alerta).toHaveAttribute("data-tipo", "demasiados-intentos");
      await expect(alerta).toHaveText(TEXTO.demasiadosIntentos);
      await expect(alerta).toHaveAttribute("role", "alert");
      await expect(camposLogin(page).correo).toHaveValue(correo);
      await expect(camposLogin(page).contrasena).toHaveValue("");
      await expect(camposLogin(page).ingresar).toBeEnabled();
    }
    await capturar(page, "login-1280x800-demasiados-intentos");
  });

  test("[E1-B01#3] la red caída o el proveedor con 503 en el login muestran «servicio no disponible», no credenciales", async ({ page }) => {
    await page.route("**/auth/v1/token**", (route) => route.abort("failed"));
    await intentarIngreso(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    let alerta = page.getByTestId("error-login");
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveAttribute("data-tipo", "servicio");
    await expect(alerta).toHaveText(TEXTO.servicio);
    await capturar(page, "login-1280x800-servicio-no-disponible");

    await page.unroute("**/auth/v1/token**");
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ msg: "Service Unavailable" }) }),
    );
    await intentarIngreso(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    alerta = page.getByTestId("error-login");
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveAttribute("data-tipo", "servicio");
    await expect(alerta).toHaveText(TEXTO.servicio);
    expect(await clavesDeSesion(page)).toEqual([]);
  });

  test("[E1-B01#1] tras un fallo de servicio se puede reintentar con las mismas credenciales y entrar", async ({ page }) => {
    let intentos = 0;
    await page.route("**/auth/v1/token**", (route) => {
      intentos += 1;
      return intentos === 1 ? route.abort("failed") : route.continue();
    });
    await intentarIngreso(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    await expect(page.getByTestId("error-login")).toHaveAttribute("data-tipo", "servicio");

    // La contraseña se vació: se vuelve a escribir y el ingreso termina en el portal del QE.
    await camposLogin(page).contrasena.fill(env.contrasenaDemo);
    await camposLogin(page).ingresar.click();
    await expect(page).toHaveURL(/\/qe$/);
    await expect(page.getByText(USUARIOS_SEMILLA.carla.nombre)).toBeVisible();
    expect(await clavesDeSesion(page)).toHaveLength(1);
  });

  test("[E1-B01#3] si el perfil (/v1/me) responde 503 tras autenticar, se avisa «servicio no disponible»", async ({ page }) => {
    await page.route("**/v1/me", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "No disponible", traceId: "t-prueba", detalles: [] }),
      }),
    );
    await intentarIngreso(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);

    const alerta = page.getByTestId("error-login");
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveAttribute("data-tipo", "servicio");
    await expect(alerta).toHaveText(TEXTO.servicio);
    await expect(page).toHaveURL(/\/login$/);
    await expect(camposLogin(page).ingresar).toBeEnabled();
  });

  test("[E1-B01#3] si el perfil (/v1/me) no responde (red caída), también se avisa «servicio no disponible»", async ({ page }) => {
    await page.route("**/v1/me", (route) => route.abort("failed"));
    await intentarIngreso(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);

    const alerta = page.getByTestId("error-login");
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveAttribute("data-tipo", "servicio");
    await expect(alerta).toHaveText(TEXTO.servicio);
  });

  test("[E1-B01#3] si el gateway limita el perfil con 429, se avisa «demasiados intentos»", async ({ page }) => {
    await page.route("**/v1/me", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "retry-after": "1" },
        body: JSON.stringify({ codigo: "DEMASIADAS_SOLICITUDES", mensaje: "Demasiadas solicitudes", traceId: "t-prueba", detalles: [] }),
      }),
    );
    await intentarIngreso(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);

    const alerta = page.getByTestId("error-login");
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveAttribute("data-tipo", "demasiados-intentos");
    await expect(alerta).toHaveText(TEXTO.demasiadosIntentos);
  });
});
