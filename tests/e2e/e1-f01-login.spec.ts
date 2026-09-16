import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

// Estas pruebas ejercitan el formulario de login en vivo: no reutilizan el
// storageState del proyecto `setup`.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("E1-F01 · Login", () => {
  test("[E1-F01#1] muestra correo, contraseña y el botón de mostrar/ocultar contraseña", async ({ page }) => {
    await page.goto(`${env.portalUrl}/login`);

    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    const campoContrasena = page.getByLabel("Contraseña");
    await expect(campoContrasena).toBeVisible();
    await expect(campoContrasena).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Mostrar" }).click();
    await expect(campoContrasena).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ocultar" }).click();
    await expect(campoContrasena).toHaveAttribute("type", "password");
  });

  test("[E1-F01#2] valida campos obligatorios sin enviar la solicitud", async ({ page }) => {
    let solicitudEnviada = false;
    await page.route("**/auth/v1/token**", async (route) => {
      solicitudEnviada = true;
      await route.continue();
    });

    await page.goto(`${env.portalUrl}/login`);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page.getByText("El correo es obligatorio.")).toBeVisible();
    await expect(page.getByText("La contraseña es obligatoria.")).toBeVisible();
    expect(solicitudEnviada).toBe(false);
  });

  test("[E1-F01#3] credenciales incorrectas muestran indicador de progreso y luego un error genérico", async ({ page }) => {
    // Se retrasa la respuesta del proveedor para poder observar el estado
    // "Ingresando…" antes del mensaje de error (evento intermedio del criterio).
    await page.route("**/auth/v1/token**", async (route) => {
      await new Promise((resolver) => setTimeout(resolver, 600));
      await route.continue();
    });

    await page.goto(`${env.portalUrl}/login`);
    await page.getByLabel("Correo electrónico").fill(USUARIOS_SEMILLA.patricia.correo);
    await page.getByLabel("Contraseña").fill("contrasena-incorrecta-de-prueba");
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page.getByTestId("indicador-ingresando")).toBeVisible();

    const error = page.getByTestId("error-login");
    await expect(error).toBeVisible();
    await expect(error).toHaveText("Correo o contraseña incorrectos, o acceso no habilitado.");
    // Nunca revela si el correo existe: mismo mensaje para un correo inexistente.
    await page.getByLabel("Correo electrónico").fill("no-existe-de-verdad@quality360.local");
    await page.getByLabel("Contraseña").fill("cualquier-cosa-123");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByTestId("error-login")).toHaveText("Correo o contraseña incorrectos, o acceso no habilitado.");
  });
});
