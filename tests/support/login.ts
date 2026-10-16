import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type Request } from "@playwright/test";
import { RAIZ_REPO, env } from "./env";

/**
 * Soporte de las pruebas de la pantalla de acceso (login, E1-F13 y E1-B13).
 * Textos y testids según el contrato de la interfaz acordado con q360-frontend.
 */

export const TEXTO = {
  correoObligatorio: "El correo es obligatorio.",
  correoInvalido: "Ingresa un correo válido.",
  contrasenaObligatoria: "La contraseña es obligatoria.",
  credenciales: "Correo o contraseña incorrectos, o acceso no habilitado.",
  demasiadosIntentos: "Demasiados intentos de ingreso. Espera unos minutos antes de volver a intentarlo.",
  servicio: "No pudimos conectar con el servicio de autenticación. Revisa tu conexión e inténtalo de nuevo.",
  sesionExpirada: "Tu sesión expiró. Inicia sesión nuevamente.",
  recuperacionEnviada: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en unos minutos.",
  enlaceInvalido: "El enlace expiró o ya se usó. Solicita uno nuevo.",
  contrasenaActualizada: "Tu contraseña se actualizó. Ingresa con la nueva.",
  contrasenaCorta: "La contraseña debe tener al menos 8 caracteres.",
  contrasenaNoCoincide: "Las contraseñas no coinciden.",
} as const;

export const VIEWPORTS = [
  { nombre: "1280x800", ancho: 1280, alto: 800 },
  { nombre: "1024x768", ancho: 1024, alto: 768 },
  { nombre: "768x1024", ancho: 768, alto: 1024 },
  { nombre: "390x844", ancho: 390, alto: 844 },
  { nombre: "320x640", ancho: 320, alto: 640 },
] as const;

/** Campos del formulario de login (la pantalla tiene un ojo con aria-label «Mostrar contraseña», por eso `exact`). */
export function camposLogin(page: Page) {
  return {
    correo: page.getByLabel("Correo electrónico"),
    contrasena: page.getByLabel("Contraseña", { exact: true }),
    ojo: page.getByRole("button", { name: /^(Mostrar|Ocultar) contraseña$/ }),
    ingresar: page.getByRole("button", { name: "Ingresar", exact: true }),
    ingresando: page.getByRole("button", { name: "Ingresando…", exact: true }),
  };
}

/** Registra las solicitudes cuyo URL contiene alguno de los fragmentos (para probar «no se envía nada»). */
export function registrarSolicitudes(page: Page, fragmentos: string[]): Request[] {
  const vistas: Request[] = [];
  page.on("request", (solicitud) => {
    if (fragmentos.some((fragmento) => solicitud.url().includes(fragmento))) vistas.push(solicitud);
  });
  return vistas;
}

/** Cuerpo de error de Supabase Auth, con la forma real de GoTrue. */
export function errorAuth(status: number, errorCode: string, msg: string) {
  return { status, contentType: "application/json", body: JSON.stringify({ code: status, error_code: errorCode, msg }) };
}

const DIRECTORIO_EVIDENCIA = path.join(RAIZ_REPO, "docs", "validacion", "evidencia-login");

/** Guarda una captura de página completa como evidencia de la certificación del login. */
export async function capturar(page: Page, nombre: string): Promise<string> {
  mkdirSync(DIRECTORIO_EVIDENCIA, { recursive: true });
  const ruta = path.join(DIRECTORIO_EVIDENCIA, `${nombre}.png`);
  await page.screenshot({ path: ruta, fullPage: true });
  return ruta;
}

/** Ruta de login del portal bajo prueba. */
export const URL_LOGIN = `${env.portalUrl}/login`;

export interface MedidasControl {
  etiqueta: string;
  alto: number;
  ancho: number;
}

/** Alto y ancho de cada control interactivo visible (enlaces, botones y campos). */
export async function medirControles(page: Page): Promise<MedidasControl[]> {
  return page.evaluate(() => {
    const visibles = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")).filter((el) => {
      const caja = el.getBoundingClientRect();
      const estilo = getComputedStyle(el);
      return caja.width > 0 && caja.height > 0 && estilo.visibility !== "hidden" && estilo.display !== "none";
    });
    return visibles.map((el) => {
      const caja = el.getBoundingClientRect();
      const nombre = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 40) ?? el.tagName;
      return { etiqueta: `${el.tagName.toLowerCase()}[${nombre || el.getAttribute("id") || ""}]`, alto: caja.height, ancho: caja.width };
    });
  });
}

export async function desbordeHorizontal(page: Page) {
  return page.evaluate(() => ({
    documento: { scroll: document.documentElement.scrollWidth, cliente: document.documentElement.clientWidth },
    cuerpo: { scroll: document.body.scrollWidth, cliente: document.body.clientWidth },
    ventana: window.innerWidth,
  }));
}

export interface Viewport {
  nombre: string;
  ancho: number;
  alto: number;
}

/**
 * Comprobaciones de disposición de la pantalla de acceso que se repiten en todas las pantallas y anchos:
 * sin scroll horizontal, logo visible y cargado, un único h1 (el título del formulario) y el titular del panel solo con dos columnas (>= 1024 px), campos de
 * 16 px o más por debajo de 1024 px y controles interactivos de 44 px de alto o más.
 */
export async function verificarDisposicion(page: Page, viewport: Viewport): Promise<void> {
  const desborde = await desbordeHorizontal(page);
  expect(desborde.documento.scroll, `scrollWidth ${desborde.documento.scroll} > clientWidth ${desborde.documento.cliente}`).toBeLessThanOrEqual(
    desborde.documento.cliente,
  );
  expect(desborde.cuerpo.scroll).toBeLessThanOrEqual(desborde.cuerpo.cliente);

  const logo = page.getByRole("img", { name: /Quality360/ });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const cajaLogo = await logo.boundingBox();
  expect(cajaLogo).not.toBeNull();
  if (cajaLogo) {
    expect(cajaLogo.x).toBeGreaterThanOrEqual(0);
    expect(cajaLogo.x + cajaLogo.width).toBeLessThanOrEqual(viewport.ancho);
  }

  // D4: el título del formulario es el único h1 en todos los tamaños; el titular del panel de marca no es un
  // encabezado y solo se ve con dos columnas (>= 1024 px).
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toBeVisible();
  const titular = page.locator(".acceso-marca__titular");
  await expect(titular).toHaveText("De la historia de usuario al certificado, en un solo lugar.");
  if (viewport.ancho >= 1024) await expect(titular).toBeVisible();
  else await expect(titular).toBeHidden();

  if (viewport.ancho < 1024) {
    const tamanos = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>("input")).map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
    for (const tamano of tamanos) expect(tamano, `campo con fuente de ${tamano}px`).toBeGreaterThanOrEqual(16);
  }

  const controles = await medirControles(page);
  expect(controles.length).toBeGreaterThan(0);
  const pequenos = controles.filter((c) => c.alto < 43.5);
  expect(pequenos, `controles de menos de 44 px de alto: ${JSON.stringify(pequenos)}`).toEqual([]);
}
