import { expect, test } from "@playwright/test";
import { TEXTO, URL_LOGIN, camposLogin, capturar, registrarSolicitudes } from "../support/login";
import { USUARIOS_SEMILLA } from "../support/usuarios";

// Estas pruebas ejercitan el formulario de login en vivo: no reutilizan el
// storageState del proyecto `setup`.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

test.describe("E1-F01 · Login", () => {
  test("[E1-F01#1] muestra correo y contraseña, con el botón de ojo dentro del campo", async ({ page }) => {
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ojo, ingresar } = camposLogin(page);

    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    await expect(correo).toBeVisible();
    await expect(correo).toHaveAttribute("type", "email");
    await expect(contrasena).toBeVisible();
    await expect(contrasena).toHaveAttribute("type", "password");
    await expect(ingresar).toBeVisible();

    // El ojo está DENTRO del campo de contraseña: su caja queda contenida en la del contenedor del input.
    const contenedor = contrasena.locator("xpath=..");
    await expect(contenedor.getByRole("button", { name: "Mostrar contraseña" })).toHaveCount(1);
    const cajaContenedor = await contenedor.boundingBox();
    const cajaOjo = await ojo.boundingBox();
    expect(cajaContenedor).not.toBeNull();
    expect(cajaOjo).not.toBeNull();
    if (cajaContenedor && cajaOjo) {
      expect(cajaOjo.x).toBeGreaterThanOrEqual(cajaContenedor.x - 0.5);
      expect(cajaOjo.y).toBeGreaterThanOrEqual(cajaContenedor.y - 0.5);
      expect(cajaOjo.x + cajaOjo.width).toBeLessThanOrEqual(cajaContenedor.x + cajaContenedor.width + 0.5);
      expect(cajaOjo.y + cajaOjo.height).toBeLessThanOrEqual(cajaContenedor.y + cajaContenedor.height + 0.5);
    }
  });

  test("[E1-F01#1] el ojo alterna mostrar/ocultar la contraseña y su aria-label lo anuncia", async ({ page }) => {
    await page.goto(URL_LOGIN);
    const { contrasena, ojo } = camposLogin(page);
    await contrasena.fill("Texto-secreto-de-prueba");

    await expect(ojo).toHaveAttribute("aria-label", "Mostrar contraseña");
    await expect(ojo).toHaveAttribute("aria-pressed", "false");
    await expect(contrasena).toHaveAttribute("type", "password");

    await ojo.click();
    await expect(contrasena).toHaveAttribute("type", "text");
    await expect(ojo).toHaveAttribute("aria-label", "Ocultar contraseña");
    await expect(ojo).toHaveAttribute("aria-pressed", "true");
    await expect(contrasena).toHaveValue("Texto-secreto-de-prueba");

    await ojo.click();
    await expect(contrasena).toHaveAttribute("type", "password");
    await expect(ojo).toHaveAttribute("aria-label", "Mostrar contraseña");
    await expect(contrasena).toHaveValue("Texto-secreto-de-prueba");

    // Se opera con teclado (el ojo es un botón real, no un icono clicable).
    await ojo.focus();
    await page.keyboard.press("Enter");
    await expect(contrasena).toHaveAttribute("type", "text");
    await page.keyboard.press("Space");
    await expect(contrasena).toHaveAttribute("type", "password");
  });

  test("[E1-F01#1] ofrece «¿Olvidaste tu contraseña?» y el enlace para verificar un certificado", async ({ page }) => {
    await page.goto(URL_LOGIN);

    const recuperar = page.getByTestId("enlace-recuperar");
    await expect(recuperar).toBeVisible();
    await expect(recuperar).toHaveText("¿Olvidaste tu contraseña?");
    await expect(recuperar).toHaveAttribute("href", "/recuperar-contrasena");

    const verificar = page.getByRole("link", { name: /Verifícalo aquí/ });
    await expect(verificar).toBeVisible();
    await expect(verificar).toHaveAttribute("href", "/verificar");

    await capturar(page, "login-1280x800-formulario");

    await verificar.click();
    await expect(page).toHaveURL(/\/verificar$/);

    await page.goBack();
    await page.getByTestId("enlace-recuperar").click();
    await expect(page).toHaveURL(/\/recuperar-contrasena$/);
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();
  });

  test("[E1-F01#2] campos vacíos: marca ambos, no envía la solicitud y deja el foco en el correo", async ({ page }) => {
    const solicitudes = registrarSolicitudes(page, ["/auth/v1/", "/v1/me"]);
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar } = camposLogin(page);

    await ingresar.click();

    await expect(page.getByText(TEXTO.correoObligatorio)).toBeVisible();
    await expect(page.getByText(TEXTO.contrasenaObligatoria)).toBeVisible();
    await expect(correo).toHaveAttribute("aria-invalid", "true");
    await expect(contrasena).toHaveAttribute("aria-invalid", "true");
    await expect(correo).toBeFocused();
    // Cada error queda asociado a su campo para los lectores de pantalla.
    await expect(correo).toHaveAttribute("aria-describedby", "campo-correo-error");
    await expect(contrasena).toHaveAttribute("aria-describedby", /campo-contrasena-error/);
    await capturar(page, "login-1280x800-campos-vacios");
    // Sigue en el login y no hubo ninguna solicitud de autenticación ni de perfil.
    await expect(page).toHaveURL(/\/login$/);
    expect(solicitudes.map((s) => s.url())).toEqual([]);
    await expect(page.getByTestId("error-login")).toHaveCount(0);
  });

  test("[E1-F01#2] solo el correo vacío: marca el correo, conserva la contraseña y no envía", async ({ page }) => {
    const solicitudes = registrarSolicitudes(page, ["/auth/v1/token"]);
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar } = camposLogin(page);

    await contrasena.fill("alguna-contrasena-123");
    await ingresar.click();

    await expect(page.getByText(TEXTO.correoObligatorio)).toBeVisible();
    await expect(page.getByText(TEXTO.contrasenaObligatoria)).toHaveCount(0);
    await expect(correo).toBeFocused();
    await expect(contrasena).toHaveValue("alguna-contrasena-123");
    expect(solicitudes).toHaveLength(0);
  });

  test("[E1-F01#2] solo la contraseña vacía: marca la contraseña, deja el foco en ella y no envía", async ({ page }) => {
    const solicitudes = registrarSolicitudes(page, ["/auth/v1/token"]);
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar } = camposLogin(page);

    await correo.fill(USUARIOS_SEMILLA.carla.correo);
    await ingresar.click();

    await expect(page.getByText(TEXTO.contrasenaObligatoria)).toBeVisible();
    await expect(page.getByText(TEXTO.correoObligatorio)).toHaveCount(0);
    await expect(contrasena).toBeFocused();
    await expect(correo).toHaveValue(USUARIOS_SEMILLA.carla.correo);
    expect(solicitudes).toHaveLength(0);
  });

  for (const invalido of ["sin-arroba", "a@b", "dos@@quality360.local", "con espacio@quality360.local"]) {
    test(`[E1-F01#2] formato de correo inválido «${invalido}»: «${TEXTO.correoInvalido}», sin solicitud y con foco en el correo`, async ({ page }) => {
      const solicitudes = registrarSolicitudes(page, ["/auth/v1/token"]);
      await page.goto(URL_LOGIN);
      const { correo, contrasena, ingresar } = camposLogin(page);

      await correo.fill(invalido);
      await contrasena.fill("alguna-contrasena-123");
      await ingresar.click();

      await expect(page.getByText(TEXTO.correoInvalido)).toBeVisible();
      await expect(correo).toBeFocused();
      await expect(correo).toHaveAttribute("aria-invalid", "true");
      expect(solicitudes).toHaveLength(0);
      await expect(page.getByTestId("error-login")).toHaveCount(0);
    });
  }

  test("[E1-F01#2] un correo con solo espacios cuenta como vacío y el error se retira al escribir", async ({ page }) => {
    const solicitudes = registrarSolicitudes(page, ["/auth/v1/token"]);
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar } = camposLogin(page);

    await correo.fill("   ");
    await contrasena.fill("alguna-contrasena-123");
    await ingresar.click();
    await expect(page.getByText(TEXTO.correoObligatorio)).toBeVisible();

    await correo.fill("carla@quality360.local");
    await expect(page.getByText(TEXTO.correoObligatorio)).toHaveCount(0);
    await expect(correo).toHaveAttribute("aria-invalid", "false");
    expect(solicitudes).toHaveLength(0);

  });

  test("[E1-F01#3] credenciales incorrectas: «Ingresando…» y luego el mensaje genérico, con el correo conservado y la contraseña vacía", async ({
    page,
  }) => {
    // Se retrasa la respuesta del proveedor para observar el estado «Ingresando…»
    // antes del mensaje de error (evento intermedio del criterio).
    const solicitudesToken = registrarSolicitudes(page, ["/auth/v1/token"]);
    await page.route("**/auth/v1/token**", async (route) => {
      await new Promise((resolver) => setTimeout(resolver, 1200));
      await route.continue();
    });

    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar, ingresando } = camposLogin(page);
    await correo.fill(USUARIOS_SEMILLA.patricia.correo);
    await contrasena.fill("contrasena-incorrecta-de-prueba");
    await ingresar.click();

    // En proceso: botón «Ingresando…» deshabilitado y ocupado, indicador para lectores, campos de solo lectura.
    await expect(ingresando).toBeVisible();
    await expect(ingresando).toBeDisabled();
    await expect(ingresando).toHaveAttribute("aria-busy", "true");
    const indicador = page.getByTestId("indicador-ingresando");
    await expect(indicador).toBeVisible();
    await expect(indicador).toHaveAttribute("role", "status");
    await expect(correo).toHaveAttribute("readonly", "");
    await expect(contrasena).toHaveAttribute("readonly", "");
    await expect(page.getByTestId("error-login")).toHaveCount(0);
    await capturar(page, "login-1280x800-ingresando");

    // Un segundo envío mientras trabaja no genera otra solicitud.
    await ingresando.click({ force: true }).catch(() => undefined);
    await correo.press("Enter").catch(() => undefined);

    // Termina: mensaje genérico, sin revelar si el correo existe.
    const error = page.getByTestId("error-login");
    await expect(error).toBeVisible();
    await expect(error).toHaveText(TEXTO.credenciales);
    await expect(error).toHaveAttribute("data-tipo", "credenciales");
    await expect(error).toHaveAttribute("role", "alert");
    expect(solicitudesToken).toHaveLength(1);
    await expect(page.getByTestId("indicador-ingresando")).toHaveCount(0);
    await expect(ingresar).toBeEnabled();
    await expect(ingresar).not.toHaveAttribute("aria-busy", "true");

    // Correo conservado, contraseña vacía y foco en la contraseña para reintentar.
    await expect(correo).toHaveValue(USUARIOS_SEMILLA.patricia.correo);
    await expect(contrasena).toHaveValue("");
    await expect(contrasena).toBeFocused();
    await expect(correo).not.toHaveAttribute("readonly", "");
    await capturar(page, "login-1280x800-credenciales-incorrectas");
  });

  test("[E1-F01#3] el mensaje es idéntico para un correo existente y uno inexistente, y no revela cuentas", async ({ page }) => {
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar } = camposLogin(page);
    const error = page.getByTestId("error-login");

    await correo.fill(USUARIOS_SEMILLA.patricia.correo);
    await contrasena.fill("contrasena-incorrecta-de-prueba");
    await ingresar.click();
    await expect(error).toBeVisible();
    const paraExistente = await error.innerText();
    const htmlExistente = await error.evaluate((el) => el.outerHTML);

    // Un nuevo intento limpia la alerta anterior antes de mostrar la nueva.
    await correo.fill(`no-existe-de-verdad-${Date.now()}@quality360.local`);
    await contrasena.fill("cualquier-cosa-123");
    await ingresar.click();
    await expect(error).toBeVisible();
    const paraInexistente = await error.innerText();
    const htmlInexistente = await error.evaluate((el) => el.outerHTML);

    expect(paraInexistente).toBe(paraExistente);
    expect(htmlInexistente).toBe(htmlExistente);
    expect(paraExistente).toContain(TEXTO.credenciales);
    expect(paraExistente.toLowerCase()).not.toMatch(/no existe|no está registrad|no esta registrad|no se encontr|contraseña incorrecta\b(?!s)/);
  });

  test("[E1-F01#3] el error no deja la contraseña en la URL ni en el almacenamiento del navegador", async ({ page }) => {
    await page.goto(URL_LOGIN);
    const { correo, contrasena, ingresar } = camposLogin(page);
    const secreto = `Secreto-${Date.now()}-No-Debe-Filtrarse`;
    await correo.fill(USUARIOS_SEMILLA.patricia.correo);
    await contrasena.fill(secreto);
    await ingresar.click();
    await expect(page.getByTestId("error-login")).toBeVisible();

    expect(page.url()).not.toContain(secreto);
    expect(page.url()).not.toContain("password");
    const almacenado = await page.evaluate(() => JSON.stringify({ local: { ...window.localStorage }, sesion: { ...window.sessionStorage } }));
    expect(almacenado).not.toContain(secreto);
  });
});
