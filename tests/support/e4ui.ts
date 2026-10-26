import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { env } from "./env";
import { USUARIOS_E7, CONTRASENA, type ClaveE7 } from "./e7";
import { iniciarSesionUI } from "./ui";

/** Sesión guardada por `e7-setup` para cada usuario del fixture (tests/.auth/e7-<clave>.json). */
export const estadoSesion = (clave: ClaveE7) => path.join(import.meta.dirname, "..", ".auth", `e7-${clave}.json`);

/** Contexto de navegador ya autenticado como el usuario indicado, para pruebas que involucran a dos personas. */
export async function contextoDe(browser: Browser, clave: ClaveE7): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext({ storageState: estadoSesion(clave), baseURL: env.portalUrl });
  const page = await contexto.newPage();
  return { contexto, page };
}

/** Sesión real por la interfaz en un portal alterno (fuente caída): el `storageState` no sirve entre orígenes. */
export async function entrarEnPortal(page: Page, clave: ClaveE7, portalUrl: string): Promise<void> {
  await iniciarSesionUI(page, USUARIOS_E7[clave].correo, CONTRASENA, portalUrl);
  await page.waitForURL(new RegExp(`${USUARIOS_E7[clave].portal}$`), { timeout: 20_000 });
}

/** Cuenta las peticiones de datos de E4 que respondieron 200 mientras se carga una ruta (para los negativos de acceso). */
export function vigilarPeticionesE4(page: Page): { exitosas: string[] } {
  const exitosas: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() === 200 && /\/v1\/(impedimentos|riesgo\/hdu|hdu\/[^/]+\/(impedimentos|riesgo|gestion-impedimentos))/.test(u)) exitosas.push(u);
  });
  return { exitosas };
}
