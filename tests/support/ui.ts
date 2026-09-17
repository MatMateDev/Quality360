import type { Locator, Page } from "@playwright/test";
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

/**
 * Hace clic en un botón de escritura (crear/asignar/desactivar/etc.) y, si
 * la respuesta del gateway a esa solicitud es 429 `DEMASIADAS_SOLICITUDES`
 * (límite de escritura compartido por toda la suite, no parte del
 * escenario bajo prueba: ver "Nota de método" del dictamen), espera y
 * reintenta el clic. Se detecta por la respuesta de red real (no por texto
 * en pantalla) porque no todas las pantallas muestran el mensaje del 429
 * literal. La interfaz reacciona correctamente ante un 429 (no aplica el
 * cambio); esto solo evita que ESA mecánica, esperable bajo carga, se
 * confunda con una falla del escenario certificado.
 */
/**
 * Garantiza que un usuario aparezca en la respuesta de `GET /v1/usuarios`
 * que alimenta un `<select>` sin paginación (defecto de `q360-frontend` en
 * `AdminSupervisionPage`, ver dictamen), interceptando esa solicitud e
 * insertando el registro si el backend lo dejó fuera de la página por
 * volumen de datos acumulado en el entorno compartido. No enmascara el
 * defecto (que ya está reportado con su propia reproducción real, sin
 * interceptar nada): solo evita que ESE límite, ajeno al criterio bajo
 * prueba, bloquee escenarios que no versan sobre paginación (E1-F10#1/#2
 * versan sobre el flujo de confirmación y el motivo, no sobre cuántos QE
 * caben en una página).
 */
export async function asegurarUsuarioVisibleEnSelector(
  page: Page,
  patronUrl: RegExp,
  usuario: { id: string; nombre: string; correo: string; rol: string },
): Promise<void> {
  await page.route(patronUrl, async (route) => {
    const respuesta = await route.fetch();
    const cuerpo = await respuesta.json();
    const yaEsta = Array.isArray(cuerpo.items) && cuerpo.items.some((item: { id: string }) => item.id === usuario.id);
    if (!yaEsta) {
      const ahora = new Date().toISOString();
      cuerpo.items = [
        {
          id: usuario.id,
          nombre: usuario.nombre,
          correo: usuario.correo,
          rol: usuario.rol,
          activo: true,
          supervisorVigente: null,
          analistasVigentes: 0,
          creadoEn: ahora,
          actualizadoEn: ahora,
        },
        ...cuerpo.items,
      ];
      cuerpo.total = (cuerpo.total ?? cuerpo.items.length - 1) + 1;
    }
    await route.fulfill({ response: respuesta, json: cuerpo });
  });
}

export async function clicConReintentoPorLimiteTasa(page: Page, boton: Locator, patronUrl: RegExp, intentos = 5): Promise<void> {
  for (let intento = 0; intento < intentos; intento += 1) {
    const [respuesta] = await Promise.all([
      page.waitForResponse((r) => patronUrl.test(r.url()), { timeout: 20_000 }).catch(() => null),
      boton.click(),
    ]);
    if (!respuesta || respuesta.status() !== 429) return;
    // El límite de tasa del gateway usa una ventana fija (no deslizante):
    // esperar el `Retry-After` real, no un tiempo fijo corto, para caer ya
    // en la siguiente ventana en vez de reintentar dentro de la misma.
    const cabeceras = respuesta.headers();
    const segundos = Number(cabeceras["retry-after"] ?? "5");
    await page.waitForTimeout((Number.isFinite(segundos) ? segundos : 5) * 1000 + 500);
  }
}

/**
 * El diálogo del checklist (E3: marcar/desmarcar/rechazar) puede encadenar
 * más de una escritura (p. ej. `evidencias` + `marcar` al subir un archivo).
 * En vez de esperar una URL de red puntual (que podría no llegar a ocurrir
 * si la primera escritura de la cadena choca con el límite de tasa), se
 * observa el resultado real en la interfaz: el diálogo se cierra (éxito) o
 * muestra `error-dialogo-checklist` (fallo). Si el error es el límite de
 * tasa del gateway (429, ajeno a los 24 escenarios de E3), se reintenta el
 * clic completo; cualquier otro error se relanza tal cual, sin enmascararlo.
 */
export async function confirmarDialogoChecklistConReintento(page: Page, dialogo: Locator, intentos = 6): Promise<void> {
  const boton = dialogo.locator(".dialogo-acciones button").last();
  const error = dialogo.getByTestId("error-dialogo-checklist");
  for (let intento = 0; intento < intentos; intento += 1) {
    await boton.click();
    const resultado = await Promise.race([
      dialogo
        .waitFor({ state: "detached", timeout: 30_000 })
        .then(() => "cerrado" as const)
        .catch(() => "timeout" as const),
      error
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "error" as const)
        .catch(() => "timeout" as const),
    ]);
    if (resultado === "cerrado") return;
    if (resultado === "error") {
      const texto = (await error.textContent()) ?? "";
      if (/demasiadas solicitudes/i.test(texto)) {
        await page.waitForTimeout(5_000);
        continue;
      }
      throw new Error(`El diálogo del checklist mostró un error inesperado: ${texto}`);
    }
    throw new Error("El diálogo del checklist no respondió a tiempo.");
  }
  throw new Error("El diálogo del checklist no se cerró tras varios reintentos por límite de tasa.");
}

/**
 * Clic de escritura del checklist sin diálogo (aprobar): reintenta si el
 * aviso mostrado es el límite de tasa (429); cualquier otro aviso, o que el
 * botón no llegue a desaparecer (la fila deja de renderizarlo una vez
 * aprobado), se relanza como error real del escenario bajo prueba.
 */
export async function clicChecklistConReintento(page: Page, boton: Locator, aviso: Locator, intentos = 6): Promise<void> {
  for (let intento = 0; intento < intentos; intento += 1) {
    await boton.click();
    const resultado = await Promise.race([
      boton
        .waitFor({ state: "detached", timeout: 30_000 })
        .then(() => "hecho" as const)
        .catch(() => "timeout" as const),
      aviso
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "aviso" as const)
        .catch(() => "timeout" as const),
    ]);
    if (resultado === "hecho") return;
    if (resultado === "aviso") {
      const texto = (await aviso.textContent()) ?? "";
      if (/demasiadas solicitudes/i.test(texto)) {
        await page.waitForTimeout(5_000);
        continue;
      }
      throw new Error(`La acción del checklist mostró un aviso inesperado: ${texto}`);
    }
    throw new Error("La acción del checklist no respondió a tiempo.");
  }
  throw new Error("La acción del checklist no tuvo éxito tras varios reintentos por límite de tasa.");
}

/**
 * Genera o vuelve a descargar el certificado (E3-F04): espera el evento real
 * de descarga del navegador, con el mismo reintento ante el límite de tasa
 * que las demás acciones del checklist.
 */
export async function descargaChecklistConReintento(
  page: Page,
  boton: Locator,
  aviso: Locator,
  intentos = 6,
): Promise<import("@playwright/test").Download> {
  for (let intento = 0; intento < intentos; intento += 1) {
    const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }).catch(() => null), boton.click()]);
    if (descarga) return descarga;
    const avisoVisible = await aviso.isVisible().catch(() => false);
    if (avisoVisible) {
      const texto = (await aviso.textContent()) ?? "";
      if (/demasiadas solicitudes/i.test(texto)) {
        await page.waitForTimeout(5_000);
        continue;
      }
      throw new Error(`La descarga del certificado mostró un aviso inesperado: ${texto}`);
    }
    throw new Error("La descarga del certificado no produjo un evento de descarga ni un aviso.");
  }
  throw new Error("La descarga del certificado no tuvo éxito tras varios reintentos por límite de tasa.");
}
