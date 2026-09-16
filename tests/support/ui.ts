import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { env } from "./env";

/** Login real por el formulario del portal (E1-F01). */
export async function iniciarSesionUI(page: Page, correo: string, contrasena: string, baseURL = env.portalUrl) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Correo electrónico").fill(correo);
  await page.getByLabel("Contraseña").fill(contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

const RUTA_POR_ROL: Record<string, string> = {
  ADMINISTRADOR: "/admin",
  QE: "/qe",
  ANALISTA_QA: "/qa",
};

/** Espera a que el login real termine y redirija al portal del rol indicado. */
export async function esperarPortal(page: Page, rol: keyof typeof RUTA_POR_ROL) {
  await expect(page).toHaveURL(new RegExp(`${RUTA_POR_ROL[rol]}$`), { timeout: 15_000 });
}

/**
 * Sustituye el access token guardado por Supabase en `localStorage` (clave
 * `sb-*-auth-token`) por uno vencido y con el refresh token invalidado, para
 * simular una sesión expirada sin esperar el vencimiento real (E1-F07#3).
 */
export async function corromperSesionAlmacenada(page: Page, tokenVencido: string) {
  await page.evaluate((token) => {
    const clave = Object.keys(window.localStorage).find((clave) => clave.endsWith("-auth-token"));
    if (!clave) throw new Error("No se encontró la sesión de Supabase en localStorage.");
    const crudo = window.localStorage.getItem(clave);
    const datos = crudo ? JSON.parse(crudo) : {};
    datos.access_token = token;
    datos.expires_at = Math.floor(Date.now() / 1000) - 3600;
    datos.refresh_token = "refresh-token-invalido-de-prueba";
    window.localStorage.setItem(clave, JSON.stringify(datos));
  }, tokenVencido);
}
