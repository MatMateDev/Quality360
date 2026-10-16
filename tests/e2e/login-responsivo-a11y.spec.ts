import { expect, test, type Page } from "@playwright/test";
import { env } from "../support/env";
import { TEXTO, VIEWPORTS, camposLogin, capturar, desbordeHorizontal, verificarDisposicion } from "../support/login";

/**
 * Responsivo y accesibilidad de la pantalla de acceso (login, /recuperar-contrasena y
 * /restablecer-contrasena). `@axe-core/playwright` no está en el repositorio y no se instaló, así que la
 * accesibilidad se verifica con comprobaciones directas: nombres accesibles, landmarks, foco visible,
 * orden de tabulación y contraste calculado desde los estilos reales.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PANTALLAS = [
  { nombre: "login", ruta: "/login", titulo: "Inicia sesión" },
  { nombre: "recuperar", ruta: "/recuperar-contrasena", titulo: "Recupera tu contraseña" },
  // Sin enlace del correo la pantalla muestra «enlace expirado»: es el estado accesible sin crear cuentas.
  { nombre: "restablecer-enlace-invalido", ruta: "/restablecer-contrasena", titulo: "Crea una nueva contraseña" },
] as const;

test.describe("[LOGIN-RESP] Responsivo de la pantalla de acceso", () => {
  for (const viewport of VIEWPORTS) {
    for (const pantalla of PANTALLAS) {
      test(`[LOGIN-RESP] ${pantalla.nombre} a ${viewport.nombre}: sin scroll horizontal, logo visible, un solo h1 y titular del panel según el ancho, campos de 16 px en móvil y controles de 44 px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.ancho, height: viewport.alto });
        await page.goto(`${env.portalUrl}${pantalla.ruta}`);
        await expect(page.getByRole("heading", { level: 1, name: pantalla.titulo })).toBeVisible();
        if (pantalla.nombre === "restablecer-enlace-invalido") {
          await expect(page.getByTestId("enlace-invalido")).toBeVisible();
        }

        await verificarDisposicion(page, viewport);

        if (pantalla.nombre === "login") await capturar(page, `login-${viewport.nombre}`);
        if (pantalla.nombre === "recuperar" && (viewport.ancho === 1280 || viewport.ancho === 390)) {
          await capturar(page, `recuperar-${viewport.nombre}`);
        }
        if (pantalla.nombre === "restablecer-enlace-invalido" && viewport.ancho === 390) {
          await capturar(page, `restablecer-enlace-invalido-${viewport.nombre}`);
        }
      });
    }
  }

  for (const viewport of VIEWPORTS.filter((v) => v.ancho <= 390)) {
    test(`[LOGIN-RESP] login a ${viewport.nombre} con errores visibles: los mensajes largos se ajustan sin desbordar y el botón sigue accesible`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.ancho, height: viewport.alto });
      // El mensaje más largo del login: servicio no disponible.
      await page.route("**/auth/v1/token**", (route) => route.abort("failed"));
      await page.goto(`${env.portalUrl}/login`);
      const { correo, contrasena, ingresar } = camposLogin(page);

      await ingresar.click();
      await expect(page.getByText(TEXTO.correoObligatorio)).toBeVisible();
      await expect(page.getByText(TEXTO.contrasenaObligatoria)).toBeVisible();
      let desborde = await desbordeHorizontal(page);
      expect(desborde.documento.scroll).toBeLessThanOrEqual(desborde.documento.cliente);
      await capturar(page, `login-${viewport.nombre}-campos-vacios`);

      await correo.fill("persona.con.un.correo.bastante.largo.para.probar.el.ajuste@quality360.local");
      await contrasena.fill("alguna-contrasena-123");
      await ingresar.click();
      const alerta = page.getByTestId("error-login");
      await expect(alerta).toHaveText(TEXTO.servicio);
      desborde = await desbordeHorizontal(page);
      expect(desborde.documento.scroll).toBeLessThanOrEqual(desborde.documento.cliente);
      const cajaAlerta = await alerta.boundingBox();
      expect(cajaAlerta).not.toBeNull();
      if (cajaAlerta) {
        expect(cajaAlerta.x).toBeGreaterThanOrEqual(0);
        expect(cajaAlerta.x + cajaAlerta.width).toBeLessThanOrEqual(viewport.ancho);
      }
      await ingresar.scrollIntoViewIfNeeded();
      await expect(ingresar).toBeInViewport();
      await capturar(page, `login-${viewport.nombre}-error-servicio`);
    });
  }
});

test.describe("[LOGIN-A11Y] Accesibilidad de la pantalla de acceso", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("[LOGIN-A11Y] estructura: idioma, un solo main, campos con nombre accesible, imágenes con alternativa", async ({ page }) => {
    for (const pantalla of PANTALLAS) {
      await page.goto(`${env.portalUrl}${pantalla.ruta}`);
      await expect(page.getByRole("heading", { level: 1, name: pantalla.titulo })).toBeVisible();

      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      expect(await page.title()).toMatch(/Quality360/);

      // Cada campo y botón tiene un nombre accesible no vacío; las imágenes traen alt.
      const sinNombre = await page.evaluate(() => {
        const problemas: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("input, button, a[href]"))) {
          const caja = el.getBoundingClientRect();
          if (caja.width === 0 || caja.height === 0) continue;
          const etiquetas = (el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels ?? []) : [];
          const nombre = (el.getAttribute("aria-label") ?? etiquetas.map((l) => l.textContent ?? "").join(" ") ?? el.textContent ?? "").trim();
          const conTexto = (el.textContent ?? "").trim();
          if (!nombre && !conTexto) problemas.push(el.outerHTML.slice(0, 100));
        }
        for (const img of Array.from(document.images)) if (!img.alt) problemas.push(`img sin alt: ${img.src}`);
        return problemas;
      });
      expect(sinNombre).toEqual([]);
    }
  });

  test("[LOGIN-A11Y] los errores de campo se anuncian: aria-invalid, aria-describedby y alertas con role", async ({ page }) => {
    await page.goto(`${env.portalUrl}/login`);
    await camposLogin(page).ingresar.click();
    const { correo, contrasena } = camposLogin(page);

    for (const campo of [correo, contrasena]) {
      await expect(campo).toHaveAttribute("aria-invalid", "true");
      const describedby = (await campo.getAttribute("aria-describedby")) ?? "";
      expect(describedby).not.toBe("");
      const texto = await page.evaluate((ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" "), describedby);
      expect(texto).toMatch(/obligatori/);
    }

    // Alerta global: `alert` para errores y `status` para avisos de progreso.
    await correo.fill("carla.fuentes@quality360.local");
    await contrasena.fill("contrasena-incorrecta-de-prueba");
    await camposLogin(page).ingresar.click();
    await expect(page.getByTestId("error-login")).toHaveAttribute("role", "alert");
  });

  test("[LOGIN-A11Y] se puede completar el login solo con teclado y cada control muestra un foco visible", async ({ page }) => {
    await page.goto(`${env.portalUrl}/login`);
    // El formulario se pinta al ejecutarse el JS: sin esperarlo, el primer Tab cae en el documento y no en el correo.
    await expect(camposLogin(page).correo).toBeVisible();
    const orden: string[] = [];
    const focos: Array<{ elemento: string; ancho: number; estilo: string }> = [];

    for (let paso = 0; paso < 6; paso += 1) {
      await page.keyboard.press("Tab");
      const actual = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        // El campo de contraseña dibuja su foco en el contenedor (`:has(:focus-visible)`).
        const portador = el.matches("input[type=password], input[name='campo-contrasena']") && el.parentElement ? el.parentElement : el;
        const estilo = getComputedStyle(portador);
        return {
          etiqueta: el.getAttribute("aria-label") ?? el.getAttribute("id") ?? (el.textContent ?? "").trim().slice(0, 30),
          ancho: parseFloat(estilo.outlineWidth),
          estilo: estilo.outlineStyle,
        };
      });
      if (!actual) break;
      orden.push(actual.etiqueta);
      focos.push({ elemento: actual.etiqueta, ancho: actual.ancho, estilo: actual.estilo });
    }

    // Orden de lectura: correo, «¿Olvidaste?», contraseña, ojo, Ingresar y el enlace del certificado.
    expect(orden[0]).toBe("campo-correo");
    expect(orden).toContain("¿Olvidaste tu contraseña?");
    expect(orden).toContain("campo-contrasena");
    expect(orden).toContain("Mostrar contraseña");
    expect(orden).toContain("Ingresar");
    for (const foco of focos) {
      expect(foco.estilo, `sin contorno de foco en ${foco.elemento}`).not.toBe("none");
      expect(foco.ancho, `contorno de foco de ${foco.ancho}px en ${foco.elemento}`).toBeGreaterThanOrEqual(2);
    }

    // Completar el formulario con teclado: Tab, escribir, Tab, escribir y Enter envía.
    await page.goto(`${env.portalUrl}/login`);
    await camposLogin(page).correo.focus();
    await page.keyboard.type("carla.fuentes@quality360.local");
    await camposLogin(page).contrasena.focus();
    await page.keyboard.type("contrasena-incorrecta-de-prueba");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("error-login")).toBeVisible();
  });

  test("[LOGIN-A11Y] contraste de color: texto >= 4.5:1, bordes de campo >= 3:1 (calculado desde los estilos reales)", async ({ page }) => {
    await page.goto(`${env.portalUrl}/login`);
    // Para ver los mensajes de campo y el de error se envía vacío y luego un intento fallido.
    await camposLogin(page).ingresar.click();
    await expect(page.getByText(TEXTO.correoObligatorio)).toBeVisible();

    const medir = (selector: string, propiedadFondo?: string) =>
      page.evaluate(
        ({ selector, propiedadFondo }) => {
          const analizar = (valor: string): [number, number, number, number] => {
            const m = valor.match(/rgba?\(([^)]+)\)/);
            if (!m) return [0, 0, 0, 0];
            const partes = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
            return [partes[0] ?? 0, partes[1] ?? 0, partes[2] ?? 0, partes[3] ?? 1];
          };
          const sobre = (frente: [number, number, number, number], fondo: [number, number, number]) =>
            [0, 1, 2].map((i) => frente[i]! * frente[3] + fondo[i]! * (1 - frente[3])) as [number, number, number];
          const luminancia = ([r, g, b]: [number, number, number]) => {
            const c = [r, g, b].map((v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
          };
          const fondoEfectivo = (el: Element): [number, number, number] => {
            const capas: Array<[number, number, number, number]> = [];
            for (let nodo: Element | null = el; nodo; nodo = nodo.parentElement) {
              capas.push(analizar(getComputedStyle(nodo).backgroundColor));
            }
            let base: [number, number, number] = [255, 255, 255];
            for (const capa of capas.reverse()) base = sobre(capa, base);
            return base;
          };
          const el = document.querySelector(selector);
          if (!el) return { selector, ratio: -1 };
          const estilo = getComputedStyle(el);
          const fondo = fondoEfectivo(el);
          const frente = propiedadFondo ? analizar((estilo as unknown as Record<string, string>)[propiedadFondo] ?? "") : analizar(estilo.color);
          const colorFrente = sobre(frente, fondo);
          const [l1, l2] = [luminancia(colorFrente), luminancia(fondo)];
          return { selector, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
        },
        { selector, propiedadFondo },
      );

    const texto: Record<string, string> = {
      etiqueta: ".acceso-etiqueta",
      subtitulo: ".acceso-cabecera p",
      titulo: ".acceso-cabecera h1",
      "error de campo": ".acceso-error",
      boton: ".acceso-boton",
      "enlace olvidaste": ".acceso-enlace-secundario",
      nota: ".acceso-nota",
      "enlace verificar": ".acceso-enlace-verificar",
      "panel: lema": ".acceso-marca__lema",
      "panel: titular": ".acceso-marca__titular",
      "panel: texto": ".acceso-marca__texto",
      "panel: etapa": ".acceso-ciclo__etapa",
      "panel: etapa final": ".acceso-ciclo__etapa--final",
    };
    for (const [nombre, selector] of Object.entries(texto)) {
      const { ratio } = await medir(selector);
      expect(ratio, `${nombre} (${selector}) no existe`).toBeGreaterThan(0);
      expect(ratio, `contraste de ${nombre}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }

    // Borde del campo (componente de interfaz): al menos 3:1 contra el fondo.
    const borde = await medir(".acceso-entrada", "borderTopColor");
    expect(borde.ratio, `contraste del borde del campo: ${borde.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);

    // Mensajes de alerta de los tres tipos (aviso y éxito se ven en sus pantallas; aquí el de error global).
    await camposLogin(page).correo.fill("carla.fuentes@quality360.local");
    await camposLogin(page).contrasena.fill("contrasena-incorrecta-de-prueba");
    await camposLogin(page).ingresar.click();
    await expect(page.getByTestId("error-login")).toBeVisible();
    const alerta = await medir('[data-testid="error-login"]');
    expect(alerta.ratio, `contraste de la alerta de error: ${alerta.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  test("[LOGIN-A11Y] la animación del spinner se atenúa con prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/auth/v1/token**", async (route) => {
      await new Promise((resolver) => setTimeout(resolver, 1500));
      await route.continue();
    });
    await page.goto(`${env.portalUrl}/login`);
    await camposLogin(page).correo.fill("carla.fuentes@quality360.local");
    await camposLogin(page).contrasena.fill("contrasena-incorrecta-de-prueba");
    await camposLogin(page).ingresar.click();
    const spinner = page.locator(".acceso-spinner");
    await expect(spinner).toBeVisible();
    const duracion = await spinner.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duracion)).toBeGreaterThan(0.8);
  });
});
