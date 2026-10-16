import { expect, test, type Page } from "@playwright/test";
import { eliminarCuenta, fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { borrarCorreos, contarCorreos, enlaceDeVerificacion, esperarCorreoNuevo, idsRecibidos } from "../support/correoLocal";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { TEXTO, VIEWPORTS, camposLogin, capturar, errorAuth, registrarSolicitudes, verificarDisposicion } from "../support/login";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * E1-F13 (interfaz) y E1-B13 (restablecimiento seguro): «¿Olvidaste tu contraseña?» de punta a punta por la
 * interfaz, contra Supabase Auth local y su buzón Mailpit.
 *
 * Usa un Analista QA creado por la propia prueba. Cambiar la contraseña y el `signOut()` global revocan todas
 * las sesiones del usuario, así que hacerlo con alguien de la semilla invalidaría las sesiones que guarda
 * `auth.setup.ts`. Al terminar se desactiva la cuenta, se elimina de Supabase Auth y se borran sus correos.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

const CONTRASENA_INICIAL = "Quality360Inicial#1";
const CONTRASENA_NUEVA = `Nueva#${Date.now()}`;
const RESTABLECER = `${env.portalUrl}/restablecer-contrasena`;
/** Solo el gateway (no las rutas `/auth/v1/` de Supabase Auth). */
const GATEWAY = `${env.gatewayUrl}/v1/`;

const usuario = { id: "", correo: "", nombre: "" };
const correosInexistentes: string[] = [];
let enlaceUnico: URL | null = null;

interface RespuestaAuth {
  status: number;
  body: Record<string, unknown>;
}

/** `POST /auth/v1/recover` igual que `resetPasswordForEmail` (para pedir enlaces sin pasar por la pantalla). */
async function recuperarPorApi(correo: string): Promise<RespuestaAuth> {
  const respuesta = await fetch(`${env.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(RESTABLECER)}`, {
    method: "POST",
    headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo }),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, body: texto ? (JSON.parse(texto) as Record<string, unknown>) : {} };
}

/** Pide un enlace nuevo por API respetando `max_frequency` y lo lee de Mailpit. */
async function enlaceNuevo(): Promise<URL> {
  const previos = await idsRecibidos(usuario.correo);
  let respuesta = await recuperarPorApi(usuario.correo);
  if (respuesta.status === 429) {
    await new Promise((resolver) => setTimeout(resolver, 2200));
    respuesta = await recuperarPorApi(usuario.correo);
  }
  expect(respuesta.status).toBe(200);
  return enlaceDeVerificacion(await esperarCorreoNuevo(usuario.correo, previos));
}

async function clavesDeSesion(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).filter((clave) => clave.endsWith("-auth-token")));
}

/** Escribe el correo en /recuperar-contrasena y envía el formulario. */
async function solicitarPorUI(page: Page, correo: string) {
  await page.getByLabel("Correo electrónico").fill(correo);
  await page.getByRole("button", { name: "Enviar enlace", exact: true }).click();
}

const campos = (page: Page) => ({
  nueva: page.getByLabel("Nueva contraseña", { exact: true }),
  repetida: page.getByLabel("Repetir contraseña", { exact: true }),
  guardar: page.getByRole("button", { name: "Guardar contraseña", exact: true }),
});

test.describe("E1-F13 / E1-B13 · Recuperación de contraseña de punta a punta por la interfaz", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let tokenAdmin = "";

  test.beforeAll(async ({ request }) => {
    const admin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    tokenAdmin = admin.accessToken;
    const creado = await crearUsuario(request, tokenAdmin, {
      nombre: nombreUnico("Recupera Ui"),
      correo: correoUnico("recuperacion-ui"),
      rol: "ANALISTA_QA",
    });
    usuario.id = creado.id;
    usuario.correo = creado.correo;
    usuario.nombre = creado.nombre;
    await fijarContrasena(usuario.id, CONTRASENA_INICIAL);
    // El alta por invitación deja un correo de bienvenida: se descarta para que solo cuenten los de recuperación.
    await borrarCorreos(usuario.correo);
  });

  test.afterAll(async ({ request }) => {
    // Limpieza: la cuenta de prueba se desactiva en Organización, se elimina de Auth y se vacía su buzón.
    if (usuario.id) {
      await api.patch(request, `/v1/usuarios/${usuario.id}`, { token: tokenAdmin, body: { activo: false } }).catch(() => undefined);
      await eliminarCuenta(usuario.id).catch(() => undefined);
    }
    await borrarCorreos(usuario.correo);
    for (const correo of correosInexistentes) await borrarCorreos(correo);
  });

  test("[E1-F13#1] desde el login se pide el enlace por la interfaz y la confirmación es igual para un correo registrado y uno inexistente", async ({
    page,
  }) => {
    const solicitudes = registrarSolicitudes(page, ["/auth/v1/recover"]);
    await page.goto(`${env.portalUrl}/login`);
    await page.getByTestId("enlace-recuperar").click();
    await expect(page).toHaveURL(/\/recuperar-contrasena$/);
    await expect(page.getByRole("heading", { name: "Recupera tu contraseña" })).toBeVisible();

    // Validación de formato: sin solicitud y con el foco en el campo.
    const enviar = page.getByRole("button", { name: "Enviar enlace", exact: true });
    await enviar.click();
    await expect(page.getByText(TEXTO.correoObligatorio)).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeFocused();
    await page.getByLabel("Correo electrónico").fill("no-es-un-correo");
    await enviar.click();
    await expect(page.getByText(TEXTO.correoInvalido)).toBeVisible();
    expect(solicitudes).toHaveLength(0);

    // Correo registrado, con la respuesta retrasada para ver el estado «Enviando…».
    const previos = await idsRecibidos(usuario.correo);
    await page.route("**/auth/v1/recover**", async (route) => {
      await new Promise((resolver) => setTimeout(resolver, 900));
      await route.continue();
    });
    const respuestaRegistrado = page.waitForResponse((r) => r.url().includes("/auth/v1/recover"));
    await solicitarPorUI(page, usuario.correo);
    await expect(page.getByRole("button", { name: "Enviando…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enviando…", exact: true })).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("indicador-enviando")).toBeVisible();

    const confirmacion = page.getByTestId("confirmacion-recuperacion");
    await expect(confirmacion).toBeVisible();
    await expect(confirmacion).toHaveText(TEXTO.recuperacionEnviada);
    const htmlRegistrado = await confirmacion.evaluate((el) => el.outerHTML);
    const registrado = await respuestaRegistrado;
    expect(registrado.status()).toBe(200);
    // El portal pide el enlace hacia su propia pantalla de restablecimiento y no hacia otro origen.
    const solicitud = new URL(registrado.url());
    expect(solicitud.searchParams.get("redirect_to")).toBe(RESTABLECER);
    expect(JSON.parse(registrado.request().postData() ?? "{}")).toMatchObject({ email: usuario.correo });
    await capturar(page, "recuperar-1280x800-confirmacion");

    // Correo inexistente: misma confirmación, mismo bloque y misma respuesta del proveedor.
    const inexistente = `no-existe-recupera-${Date.now()}@quality360.local`;
    correosInexistentes.push(inexistente);
    const respuestaInexistente = page.waitForResponse((r) => r.url().includes("/auth/v1/recover"));
    await solicitarPorUI(page, inexistente);
    await expect(page.getByTestId("indicador-enviando")).toBeVisible();
    await expect(confirmacion).toBeVisible();
    await expect(confirmacion).toHaveText(TEXTO.recuperacionEnviada);
    expect(await confirmacion.evaluate((el) => el.outerHTML)).toBe(htmlRegistrado);
    const sinCuenta = await respuestaInexistente;
    expect(sinCuenta.status()).toBe(registrado.status());
    expect(await sinCuenta.text()).toBe(await registrado.text());
    await expect(page.getByTestId("error-recuperacion")).toHaveCount(0);

    // «Volver a iniciar sesión» regresa al login.
    await page.getByTestId("enlace-volver-login").click();
    await expect(page).toHaveURL(/\/login$/);

    // Guarda el correo recibido para las pruebas siguientes.
    const correo = await esperarCorreoNuevo(usuario.correo, previos);
    enlaceUnico = enlaceDeVerificacion(correo);
  });

  test("[E1-B13#1] el correo llega solo a la cuenta registrada, con un enlace de recuperación hacia el portal", async () => {
    expect(enlaceUnico).not.toBeNull();
    const enlace = enlaceUnico as URL;
    expect(enlace.pathname).toBe("/auth/v1/verify");
    expect(enlace.searchParams.get("type")).toBe("recovery");
    expect(enlace.searchParams.get("token")).toBeTruthy();
    expect(enlace.searchParams.get("redirect_to")).toBe(RESTABLECER);

    // El correo inexistente no generó ningún envío: no hay ni una pista en el buzón.
    for (const correo of correosInexistentes) expect(await contarCorreos(correo)).toBe(0);
    expect(await contarCorreos(usuario.correo)).toBe(1);
  });

  test("[E1-B13#2] al abrir el enlace se muestra el formulario de contraseña nueva y no se llama a /v1/me ni se entra al portal", async ({
    page,
  }) => {
    const gateway = registrarSolicitudes(page, [GATEWAY]);
    await page.goto((enlaceUnico as URL).toString());

    // supabase-js retira el hash con `location.hash = ""`, que deja un «#» final en la URL.
    await expect(page).toHaveURL(/\/restablecer-contrasena#?$/);
    await expect(page.getByRole("heading", { name: "Crea una nueva contraseña" })).toBeVisible();
    const { nueva, repetida, guardar } = campos(page);
    await expect(nueva).toBeVisible();
    await expect(repetida).toBeVisible();
    await expect(guardar).toBeVisible();
    await expect(page.getByText("Mínimo 8 caracteres.")).toBeVisible();

    // El portal no se abre con la sesión de recuperación: ni barra de navegación, ni /v1/me.
    await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    expect(gateway.map((s) => s.url()), "solicitudes al gateway mientras se está en /restablecer-contrasena").toEqual([]);

    // El token no queda en la URL ni en el historial del navegador.
    expect(page.url()).not.toContain("access_token");
    expect(page.url()).not.toContain("refresh_token");
    expect(await page.evaluate(() => window.location.hash)).toBe("");

    // Disposición de esta pantalla en los cinco anchos, sin recargar (el enlace es de un solo uso).
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.ancho, height: viewport.alto });
      await expect(nueva).toBeVisible();
      await verificarDisposicion(page, viewport);
      if (viewport.ancho === 1280 || viewport.ancho === 390) await capturar(page, `restablecer-${viewport.nombre}-formulario`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(gateway).toHaveLength(0);
  });

  test("[E1-F13#2] las validaciones de la contraseña nueva (mínimo 8 y coincidencia) no envían nada", async ({ page }) => {
    const enlace = await enlaceNuevo();
    const cambios = registrarSolicitudes(page, ["/auth/v1/user"]);
    const gateway = registrarSolicitudes(page, [GATEWAY]);
    await page.goto(enlace.toString());
    const { nueva, repetida, guardar } = campos(page);
    await expect(nueva).toBeVisible();

    // Vacío.
    await guardar.click();
    await expect(page.getByText(TEXTO.contrasenaCorta)).toBeVisible();
    await expect(nueva).toBeFocused();
    await expect(nueva).toHaveAttribute("aria-invalid", "true");

    // 7 caracteres.
    await nueva.fill("Abcde#1");
    await repetida.fill("Abcde#1");
    await guardar.click();
    await expect(page.getByText(TEXTO.contrasenaCorta)).toBeVisible();
    await expect(nueva).toBeFocused();

    // Largo suficiente pero distinta: el foco pasa al campo de repetir.
    await nueva.fill("Abcdef#12");
    await repetida.fill("Abcdef#13");
    await guardar.click();
    await expect(page.getByText(TEXTO.contrasenaNoCoincide)).toBeVisible();
    await expect(page.getByText(TEXTO.contrasenaCorta)).toHaveCount(0);
    await expect(repetida).toBeFocused();
    await expect(repetida).toHaveAttribute("aria-invalid", "true");
    await capturar(page, "restablecer-1280x800-no-coincide");

    // Cada campo tiene su propio ojo, con nombre propio.
    await expect(page.getByRole("button", { name: "Mostrar nueva contraseña" })).toBeVisible();
    await page.getByRole("button", { name: "Mostrar nueva contraseña" }).click();
    await expect(nueva).toHaveAttribute("type", "text");
    await expect(repetida).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostrar contraseña repetida" }).click();
    await expect(repetida).toHaveAttribute("type", "text");

    // supabase-js consulta GET /auth/v1/user al procesar el enlace; lo que no debe ocurrir es el PUT con la contraseña.
    expect(cambios.filter((s) => s.method() === "PUT"), "no debe haberse enviado ningún cambio de contraseña").toHaveLength(0);
    expect(gateway).toHaveLength(0);

    // Irse sin terminar cierra la sesión de recuperación: el enlace no equivale a haber ingresado.
    await page.getByTestId("enlace-volver-login").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => clavesDeSesion(page), { timeout: 10_000 }).toEqual([]);
    await page.goto(`${env.portalUrl}/qa`);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[E1-F13#2] con una contraseña válida termina en /login con el aviso; [E1-B13#2] la anterior deja de servir y la nueva entra", async ({
    page,
  }) => {
    const enlace = await enlaceNuevo();
    const gateway = registrarSolicitudes(page, [GATEWAY]);
    await page.goto(enlace.toString());
    const { nueva, repetida, guardar } = campos(page);
    await expect(nueva).toBeVisible();

    await nueva.fill(CONTRASENA_NUEVA);
    await repetida.fill(CONTRASENA_NUEVA);
    // Retrasa la respuesta del proveedor para ver «Guardando…».
    await page.route("**/auth/v1/user", async (route) => {
      await new Promise((resolver) => setTimeout(resolver, 900));
      await route.continue();
    });
    const respuestaCambio = page.waitForResponse((r) => r.url().includes("/auth/v1/user") && r.request().method() === "PUT");
    await guardar.click();
    await expect(page.getByRole("button", { name: "Guardando…", exact: true })).toBeDisabled();
    await expect(page.getByTestId("indicador-guardando")).toBeVisible();
    expect((await respuestaCambio).status()).toBe(200);

    // Termina en el login, con el aviso de éxito y sin sesión guardada.
    await expect(page).toHaveURL(/\/login$/);
    const aviso = page.getByTestId("aviso-contrasena-actualizada");
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveText(TEXTO.contrasenaActualizada);
    await expect(aviso).toHaveAttribute("role", "status");
    await expect(page.getByTestId("error-login")).toHaveCount(0);
    await expect.poll(() => clavesDeSesion(page), { timeout: 10_000 }).toEqual([]);
    await capturar(page, "login-1280x800-contrasena-actualizada");
    expect(gateway.map((s) => s.url()), "ninguna llamada al gateway durante todo el restablecimiento").toEqual([]);

    // D3: el aviso viaja en el estado del historial; se lee una vez y se limpia, así que una recarga no lo repite.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    await expect(page.getByTestId("aviso-contrasena-actualizada")).toHaveCount(0);
    await expect(page).toHaveURL(/\/login$/);

    // La contraseña anterior ya no sirve: mensaje genérico (y el aviso de éxito se retira).
    const login = camposLogin(page);
    await login.correo.fill(usuario.correo);
    await login.contrasena.fill(CONTRASENA_INICIAL);
    await login.ingresar.click();
    await expect(page.getByTestId("error-login")).toHaveText(TEXTO.credenciales);
    await expect(aviso).toHaveCount(0);

    // La nueva sí: llega al portal del Analista QA.
    await login.contrasena.fill(CONTRASENA_NUEVA);
    await login.ingresar.click();
    await expect(page).toHaveURL(/\/qa$/);
    await expect(page.getByText(usuario.nombre)).toBeVisible();

    // Cierra sesión por la interfaz: el refresh token queda revocado en el proveedor (E1-B11#2 por la UI).
    const refrescar = await page.evaluate(() => {
      const clave = Object.keys(window.localStorage).find((k) => k.endsWith("-auth-token"));
      return clave ? (JSON.parse(window.localStorage.getItem(clave) ?? "{}") as { refresh_token?: string }).refresh_token : undefined;
    });
    expect(refrescar).toBeTruthy();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const renovacion = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refrescar }),
    });
    expect(renovacion.status).toBe(400);
    expect(((await renovacion.json()) as { error_code?: string }).error_code).toBe("refresh_token_not_found");
    expect(await clavesDeSesion(page)).toEqual([]);
  });

  test("[E1-F13#3] un segundo uso del mismo enlace muestra «enlace expirado» y ofrece pedir uno nuevo", async ({ page }) => {
    const gateway = registrarSolicitudes(page, [GATEWAY]);
    // El enlace de #1 se consumió al abrirlo en #3: un segundo uso es el caso «ya se usó».
    await page.goto((enlaceUnico as URL).toString());

    await expect(page).toHaveURL(/\/restablecer-contrasena/);
    const invalido = page.getByTestId("enlace-invalido");
    await expect(invalido).toBeVisible();
    await expect(invalido).toHaveText(TEXTO.enlaceInvalido);
    await expect(invalido).toHaveAttribute("role", "alert");
    await expect(invalido).toHaveAttribute("data-tipo", "enlace-invalido");
    await expect(campos(page).nueva).toHaveCount(0);
    await expect(page.getByTestId("verificando-enlace")).toHaveCount(0);
    expect(gateway).toHaveLength(0);
    await capturar(page, "restablecer-1280x800-enlace-invalido");

    await page.getByTestId("enlace-solicitar-nuevo").click();
    await expect(page).toHaveURL(/\/recuperar-contrasena$/);
  });

  test("[E1-F13#3] el enlace caduca tras usarse una vez: la misma URL no sirve ni siquiera desde otro navegador", async ({ browser }) => {
    const enlace = await enlaceNuevo();
    const contextoA = await browser.newContext({ baseURL: env.portalUrl });
    const paginaA = await contextoA.newPage();
    await paginaA.goto(enlace.toString());
    await expect(campos(paginaA).nueva).toBeVisible();

    const contextoB = await browser.newContext({ baseURL: env.portalUrl });
    const paginaB = await contextoB.newPage();
    await paginaB.goto(enlace.toString());
    await expect(paginaB.getByTestId("enlace-invalido")).toBeVisible();
    await expect(campos(paginaB).nueva).toHaveCount(0);

    // Cierra la sesión de recuperación de A saliendo por «Volver a iniciar sesión».
    await paginaA.getByTestId("enlace-volver-login").click();
    await expect(paginaA).toHaveURL(/\/login$/);
    await contextoA.close();
    await contextoB.close();
  });

  test("[E1-B13#2] abandonar la recuperación cierra solo la sesión local: las demás sesiones del usuario siguen vivas (D6)", async ({ page }) => {
    // Otra sesión del usuario (otro dispositivo), con la contraseña que fijó `[E1-F13#2]`.
    const otraSesion = await iniciarSesion(usuario.correo, CONTRASENA_NUEVA);
    const enlace = await enlaceNuevo();
    await page.goto(enlace.toString());
    await expect(campos(page).nueva).toBeVisible();

    const cierre = page.waitForRequest((r) => r.url().includes("/auth/v1/logout"));
    await page.getByTestId("enlace-volver-login").click();
    expect(new URL((await cierre).url()).searchParams.get("scope")).toBe("local");
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => clavesDeSesion(page), { timeout: 10_000 }).toEqual([]);

    const renovacion = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: otraSesion.refreshToken }),
    });
    expect(renovacion.status).toBe(200);
  });

  test("[E1-B13#3] un reenvío inmediato real recibe 429 del proveedor y el portal igualmente confirma", async ({ page }) => {
    // Con el proveedor local (max_frequency = 1 s) el segundo envío seguido a una cuenta registrada se rechaza.
    const cuenta = usuario.correo;
    await borrarCorreos(cuenta);
    await page.goto(`${env.portalUrl}/recuperar-contrasena`);
    const confirmacion = page.getByTestId("confirmacion-recuperacion");
    const estados: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/auth/v1/recover")) estados.push(r.status());
    });

    await solicitarPorUI(page, cuenta);
    await expect(confirmacion).toBeVisible();
    await solicitarPorUI(page, cuenta);
    await expect(page.getByTestId("indicador-enviando").or(confirmacion).first()).toBeVisible();
    await expect.poll(() => estados.length, { timeout: 10_000 }).toBe(2);
    await expect(confirmacion).toBeVisible();
    await expect(confirmacion).toHaveText(TEXTO.recuperacionEnviada);
    await expect(page.getByTestId("error-recuperacion")).toHaveCount(0);
    expect(estados[0]).toBe(200);
    expect(estados[1], "el segundo envío seguido debería ser rechazado por el proveedor (max_frequency)").toBe(429);
    await borrarCorreos(cuenta);
  });

  test("[E1-B13#2] el token del enlace no queda en una entrada del historial del navegador", async ({ page }) => {
    // El flujo implícito entrega la sesión en el fragmento de la URL (#access_token=… y refresh_token=…). Si el
    // cliente solo vacía el hash, la entrada anterior del historial conserva el token: quien use ese navegador
    // después puede volver atrás y recuperarlo mientras la sesión siga viva.
    const enlace = await enlaceNuevo();
    await page.goto("about:blank");
    await page.goto(enlace.toString());
    await expect(campos(page).nueva).toBeVisible();

    const visitadas: string[] = [];
    for (let paso = 0; paso < 4; paso += 1) {
      const url = await page.evaluate(() => window.location.href);
      visitadas.push(url);
      const anterior = await page.goBack({ waitUntil: "commit" }).catch(() => null);
      if (!anterior && paso > 0) break;
      await page.waitForTimeout(150);
      if (page.url() === "about:blank") break;
    }
    visitadas.push(page.url());
    const conToken = visitadas.filter((url) => /access_token=|refresh_token=/.test(url));
    expect(conToken.map((url) => url.slice(0, 90) + "…"), "entradas del historial con el token en la URL").toEqual([]);
  });

  test("[E1-B13#2] una sesión de recuperación abandonada (recarga completa hacia el portal) no da acceso al portal", async ({ page }) => {
    // Sin cerrar la pantalla de restablecimiento ni su sesión por la interfaz: se escribe otra dirección del
    // portal en el navegador (carga completa), como al cerrar la pestaña y volver más tarde.
    const enlace = await enlaceNuevo();
    await page.goto(enlace.toString());
    await expect(campos(page).nueva).toBeVisible();

    await page.goto(`${env.portalUrl}/qa`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const destino = new URL(page.url()).pathname;
    await capturar(page, "recuperacion-sesion-abandonada-qa");
    // Cómo llegó la sesión: el JWT de un enlace de recuperación lleva `amr: [{ method: "otp" }]`, no «password».
    const metodos = await page.evaluate(() => {
      const clave = Object.keys(window.localStorage).find((k) => k.endsWith("-auth-token"));
      const token = clave ? (JSON.parse(window.localStorage.getItem(clave) ?? "{}") as { access_token?: string }).access_token : undefined;
      if (!token) return "sin sesión";
      const carga = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { amr?: Array<{ method: string }> };
      return (carga.amr ?? []).map((a) => a.method).join(",");
    });
    expect(
      destino,
      `una sesión de recuperación abandonada abrió el portal en ${destino} sin escribir la contraseña (amr del token: ${metodos})`,
    ).toBe("/login");
  });
});

test.describe("E1-F13 / E1-B13 · Enlaces manipulados y respuestas del proveedor", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

  test("[E1-F13#3] sin enlace, con un token falso o con un código falso no se muestra el formulario", async ({ page }) => {
    const gateway = registrarSolicitudes(page, [GATEWAY]);
    const urls = [
      `${RESTABLECER}`,
      `${RESTABLECER}#access_token=token.falso.firmado&refresh_token=falso&expires_in=3600&token_type=bearer&type=recovery`,
      `${RESTABLECER}?code=codigo-falso-1234`,
      `${RESTABLECER}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    ];
    for (const url of urls) {
      // about:blank evita que un cambio solo del hash se tome como navegación dentro de la misma carga.
      await page.goto("about:blank");
      await page.goto(url);
      await expect(page.getByTestId("enlace-invalido"), `URL: ${url.slice(0, 80)}`).toBeVisible();
      await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
    }
    expect(gateway).toHaveLength(0);
  });

  test("[E1-F13#1] el 429 por reenvío (over_email_send_rate_limit) se muestra igual que el éxito: no revela que la cuenta existe", async ({
    page,
  }) => {
    await page.route("**/auth/v1/recover**", (route) =>
      route.fulfill(errorAuth(429, "over_email_send_rate_limit", "For security purposes, you can only request this after 60 seconds.")),
    );
    await page.goto(`${env.portalUrl}/recuperar-contrasena`);
    await solicitarPorUI(page, USUARIOS_SEMILLA.gabriela.correo);

    const confirmacion = page.getByTestId("confirmacion-recuperacion");
    await expect(confirmacion).toBeVisible();
    await expect(confirmacion).toHaveText(TEXTO.recuperacionEnviada);
    await expect(page.getByTestId("error-recuperacion")).toHaveCount(0);
  });

  test("[E1-B13#3] el límite por IP (over_request_rate_limit) y la caída del servicio sí se informan", async ({ page }) => {
    await page.goto(`${env.portalUrl}/recuperar-contrasena`);

    await page.route("**/auth/v1/recover**", (route) => route.fulfill(errorAuth(429, "over_request_rate_limit", "Request rate limit reached")));
    await solicitarPorUI(page, "cualquiera@quality360.local");
    const limite = page.getByTestId("error-recuperacion");
    await expect(limite).toBeVisible();
    await expect(limite).toHaveAttribute("data-tipo", "demasiados-intentos");
    await expect(limite).toHaveText(TEXTO.demasiadosIntentos);
    await expect(page.getByTestId("confirmacion-recuperacion")).toHaveCount(0);

    await page.unroute("**/auth/v1/recover**");
    await page.route("**/auth/v1/recover**", (route) => route.abort("failed"));
    await solicitarPorUI(page, "cualquiera@quality360.local");
    await expect(page.getByTestId("error-recuperacion")).toHaveAttribute("data-tipo", "servicio");
    await expect(page.getByTestId("error-recuperacion")).toHaveText(TEXTO.servicio);
    await expect(page.getByTestId("confirmacion-recuperacion")).toHaveCount(0);
    await capturar(page, "recuperar-1280x800-error-servicio");
  });

  test("[E1-B13#1] limitación conocida: un 500 del proveedor se informa como «servicio no disponible» (en la nube sin SMTP propio solo lo da un correo registrado)", async ({
    page,
  }) => {
    // GoTrue responde 500 `unexpected_failure` solo cuando existe la cuenta y el SMTP falla; para un correo
    // inexistente responde 200. Informar el 500 permite distinguir cuentas en ese escenario. Se documenta el
    // comportamiento actual: el portal lo trata como caída de servicio.
    await page.route("**/auth/v1/recover**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: 500, error_code: "unexpected_failure", msg: "Error sending recovery email" }),
      }),
    );
    await page.goto(`${env.portalUrl}/recuperar-contrasena`);
    await solicitarPorUI(page, USUARIOS_SEMILLA.carla.correo);
    await expect(page.getByTestId("error-recuperacion")).toHaveAttribute("data-tipo", "servicio");
  });
});

test.describe("LOGIN · seguridad de la navegación", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 800 } });

  test("[LOGIN-SEG] ningún parámetro de la URL puede redirigir tras el ingreso a otro origen", async ({ page }) => {
    const destinosExternos = ["https://sitio-ajeno.example/", "//sitio-ajeno.example", "javascript:alert(1)"];
    for (const destino of destinosExternos) {
      await page.goto(`${env.portalUrl}/login?redirect=${encodeURIComponent(destino)}&next=${encodeURIComponent(destino)}&returnTo=${encodeURIComponent(destino)}&desde=${encodeURIComponent(destino)}`);
      await camposLogin(page).correo.fill(USUARIOS_SEMILLA.marcos.correo);
      await camposLogin(page).contrasena.fill(env.contrasenaDemo);
      await camposLogin(page).ingresar.click();
      await expect(page).toHaveURL(/\/qe$/);
      expect(new URL(page.url()).origin).toBe(env.portalUrl);
      await page.evaluate(() => window.localStorage.clear());
    }
  });
});
