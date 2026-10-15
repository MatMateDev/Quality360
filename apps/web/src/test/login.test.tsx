import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { cierresDeSesionMock, simularAccesoMock } from "@/auth/mockAuthProvider";
import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { renderApp } from "./renderApp";

const MENSAJE_GENERICO = "Correo o contraseña incorrectos, o acceso no habilitado.";
const MENSAJE_DEMASIADOS = "Demasiados intentos de ingreso. Espera unos minutos antes de volver a intentarlo.";
const MENSAJE_SERVICIO =
  "No pudimos conectar con el servicio de autenticación. Revisa tu conexión e inténtalo de nuevo.";

const campoCorreo = () => screen.getByLabelText(/correo electrónico/i);
// Exacto: el botón del ojo («Mostrar contraseña») también contiene la palabra «contraseña».
const campoContrasena = () => screen.getByLabelText("Contraseña");
const botonIngresar = () => screen.getByRole("button", { name: /^ingresar$/i });

async function enviarCredenciales(correo: string, contrasena: string) {
  const user = userEvent.setup();
  await user.type(campoCorreo(), correo);
  await user.type(campoContrasena(), contrasena);
  await user.click(botonIngresar());
  return user;
}

describe("Login [E1-F01#1] pantalla dividida", () => {
  it("muestra el formulario con correo, contraseña y el ojo dentro del campo", () => {
    renderApp("/login");

    expect(screen.getByRole("heading", { level: 1, name: "Inicia sesión" })).toBeInTheDocument();
    expect(screen.getByText("Usa el correo con el que te habilitó tu administrador.")).toBeInTheDocument();
    expect(campoCorreo()).toHaveAttribute("placeholder", "nombre@empresa.cl");
    expect(campoCorreo()).toHaveAttribute("type", "email");
    expect(campoContrasena()).toHaveAttribute("type", "password");
    // El botón de ojo vive dentro del mismo contenedor que el campo.
    expect(within(campoContrasena().parentElement!).getByRole("button", { name: "Mostrar contraseña" })).toBeInTheDocument();
    expect(
      screen.getByText("¿Aún no tienes acceso? Las cuentas las crea el administrador de tu organización."),
    ).toBeInTheDocument();
  });

  it("incluye el panel de marca: logo, titular, ciclo de la HDU y el enlace al verificador", () => {
    renderApp("/login");

    const logo = screen.getByRole("img", { name: "Quality360 — Calidad. Visibilidad. Análisis. Impacto." });
    // Atributos del tamaño real del archivo (367×296): evitan el salto de maquetación al cargar.
    expect(logo).toHaveAttribute("width", "367");
    expect(logo).toHaveAttribute("height", "296");
    // El detalle del panel se oculta con CSS por debajo de 1024 px: se consulta aunque jsdom no evalúe media queries.
    // El titular de marca NO es un encabezado: el único h1 es el título del formulario, visible en todos los tamaños.
    const titular = screen.getByText("De la historia de usuario al certificado, en un solo lugar.");
    expect(titular.tagName).toBe("P");
    expect(titular).toHaveClass("acceso-marca__titular");
    const encabezados = screen.getAllByRole("heading", { hidden: true });
    expect(encabezados.map((encabezado) => [encabezado.tagName, encabezado.textContent])).toEqual([["H1", "Inicia sesión"]]);
    expect(screen.getByText("Calidad de software con trazabilidad")).toBeInTheDocument();
    expect(screen.getByText("Diseña, ejecuta y certifica las pruebas de cada HDU.")).toBeInTheDocument();

    const ciclo = screen.getByRole("list", { name: "Ciclo de una HDU", hidden: true });
    const etapas = within(ciclo)
      .getAllByRole("listitem", { hidden: true })
      .map((item) => item.textContent);
    expect(etapas).toEqual(["Pendiente", "Diseño de pruebas", "En ejecución", "Pendiente de cierre", "Certificada"]);

    const enlace = screen.getByRole("link", { name: /¿Recibiste un certificado\? Verifícalo aquí/ });
    expect(enlace).toHaveAttribute("href", "/verificar");
  });

  it("[E1-F13#1] muestra «¿Olvidaste tu contraseña?» junto a la etiqueta y apunta a /recuperar-contrasena", () => {
    renderApp("/login");

    const enlace = screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" });
    expect(enlace).toHaveAttribute("href", "/recuperar-contrasena");
    // En la misma fila que la etiqueta «Contraseña».
    const fila = screen.getByText("Contraseña", { selector: "label" }).parentElement!;
    expect(fila).toContainElement(enlace);
  });

  it("permite mostrar y ocultar la contraseña con un botón que alterna su nombre y aria-pressed", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    expect(campoContrasena()).toHaveAttribute("type", "password");
    const mostrar = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(mostrar).toHaveAttribute("aria-pressed", "false");

    await user.click(mostrar);
    expect(campoContrasena()).toHaveAttribute("type", "text");
    const ocultar = screen.getByRole("button", { name: "Ocultar contraseña" });
    expect(ocultar).toHaveAttribute("aria-pressed", "true");

    await user.click(ocultar);
    expect(campoContrasena()).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Login [E1-F01#2] validación en cliente", () => {
  it("marca los campos obligatorios sin enviar la solicitud y enfoca el primero con error", async () => {
    // Si se enviara la solicitud, esta simulación mostraría el error genérico y el estado «ingresando».
    simularAccesoMock({ errorAcceso: "CREDENCIALES" });
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(botonIngresar());

    expect(await screen.findByText("El correo es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña es obligatoria.")).toBeInTheDocument();

    expect(campoCorreo()).toHaveAttribute("aria-invalid", "true");
    expect(campoCorreo()).toHaveAccessibleDescription("El correo es obligatorio.");
    expect(campoContrasena()).toHaveAttribute("aria-invalid", "true");
    expect(campoContrasena()).toHaveAccessibleDescription("La contraseña es obligatoria.");
    expect(campoCorreo()).toHaveFocus();

    expect(screen.queryByTestId("error-login")).not.toBeInTheDocument();
    expect(screen.queryByTestId("indicador-ingresando")).not.toBeInTheDocument();
    expect(botonIngresar()).toBeEnabled();
  });

  it("enfoca la contraseña cuando solo ella falta", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    await user.type(campoCorreo(), "admin@quality360.local");
    await user.click(botonIngresar());

    expect(await screen.findByText("La contraseña es obligatoria.")).toBeInTheDocument();
    expect(screen.queryByText("El correo es obligatorio.")).not.toBeInTheDocument();
    expect(campoContrasena()).toHaveFocus();
  });

  it("rechaza un correo con formato inválido sin enviar la solicitud", async () => {
    simularAccesoMock({ errorAcceso: "CREDENCIALES" });
    renderApp("/login");
    const user = userEvent.setup();

    await user.type(campoCorreo(), "esto-no-es-un-correo");
    await user.type(campoContrasena(), "cualquiera");
    await user.click(botonIngresar());

    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(campoCorreo()).toHaveAttribute("aria-invalid", "true");
    expect(campoCorreo()).toHaveFocus();
    expect(screen.queryByTestId("error-login")).not.toBeInTheDocument();
  });

  it("limpia el error de un campo al escribir en él", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(botonIngresar());
    expect(await screen.findByText("El correo es obligatorio.")).toBeInTheDocument();

    await user.type(campoCorreo(), "a");
    expect(screen.queryByText("El correo es obligatorio.")).not.toBeInTheDocument();
    expect(campoCorreo()).toHaveAttribute("aria-invalid", "false");
    // El otro campo conserva su error.
    expect(screen.getByText("La contraseña es obligatoria.")).toBeInTheDocument();
  });
});

describe("Login [E1-F01#3] ingresando y mensaje genérico", () => {
  it("muestra «Ingresando…» dentro del botón mientras se valida y luego el mensaje genérico", async () => {
    let liberar!: () => void;
    simularAccesoMock({
      errorAcceso: "CREDENCIALES",
      compuerta: new Promise<void>((resolver) => {
        liberar = resolver;
      }),
    });
    renderApp("/login");

    await enviarCredenciales("patricia.salas@quality360.local", "clave-incorrecta");

    const boton = await screen.findByRole("button", { name: /ingresando/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");
    expect(boton).toHaveTextContent("Ingresando…");
    expect(screen.getByTestId("indicador-ingresando")).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("error-login")).not.toBeInTheDocument();

    liberar();

    expect(await screen.findByTestId("error-login")).toHaveTextContent(MENSAJE_GENERICO);
    expect(screen.queryByTestId("indicador-ingresando")).not.toBeInTheDocument();
    expect(botonIngresar()).toBeEnabled();
  });

  it("muestra un único mensaje genérico, vacía solo la contraseña, devuelve el foco a ella y permite reintentar", async () => {
    renderApp("/login");
    const user = await enviarCredenciales("admin@quality360.local", "clave-incorrecta");

    const alerta = await screen.findByTestId("error-login");
    expect(alerta).toHaveTextContent(MENSAJE_GENERICO);
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveAttribute("data-tipo", "credenciales");

    expect(campoCorreo()).toHaveValue("admin@quality360.local");
    await waitFor(() => expect(campoContrasena()).toHaveValue(""));
    await waitFor(() => expect(campoContrasena()).toHaveFocus());

    // Reintentar con la contraseña correcta.
    await user.type(campoContrasena(), "Quality360!");
    await user.click(botonIngresar());

    await waitFor(() => expect(screen.queryByTestId("error-login")).not.toBeInTheDocument());
    expect(await screen.findByText("Portal Administrador")).toBeInTheDocument();
  });

  it("da el mismo mensaje para un correo inexistente (no revela si existe)", async () => {
    renderApp("/login");
    await enviarCredenciales("no-existe@quality360.local", "cualquier-cosa-123");

    expect(await screen.findByTestId("error-login")).toHaveTextContent(MENSAJE_GENERICO);
  });

  it("[E1-B01#2] un usuario inactivo recibe el mismo mensaje genérico (/v1/me responde 403)", async () => {
    renderApp("/login");
    await enviarCredenciales("diego.soto@quality360.local", "Quality360!");

    const alerta = await screen.findByTestId("error-login");
    expect(alerta).toHaveTextContent(MENSAJE_GENERICO);
    expect(alerta).toHaveAttribute("data-tipo", "credenciales");
    // No es el aviso ámbar de sesión expirada ni un portal.
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
    expect(campoCorreo()).toHaveValue("diego.soto@quality360.local");
    await waitFor(() => expect(campoContrasena()).toHaveValue(""));
    expect(botonIngresar()).toBeEnabled();
    // [D6] El rechazo de Organización cierra solo la sesión de este navegador, no las de otros dispositivos.
    await waitFor(() => expect(cierresDeSesionMock()).toEqual({ globales: 0, locales: 1 }));
  });

  it("un usuario sin registro en Organización (/v1/me 401) también recibe el mensaje genérico", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/me`, () =>
        HttpResponse.json({ codigo: "NO_AUTENTICADO", mensaje: "Debes iniciar sesión.", traceId: "t", detalles: [] }, { status: 401 }),
      ),
    );
    renderApp("/login");
    await enviarCredenciales("admin@quality360.local", "Quality360!");

    expect(await screen.findByTestId("error-login")).toHaveAttribute("data-tipo", "credenciales");
  });
});

describe("Login [E1-B01#3] demasiados intentos", () => {
  it("muestra el aviso de demasiados intentos (429 de Supabase) sin el mensaje genérico", async () => {
    simularAccesoMock({ errorAcceso: "DEMASIADOS_INTENTOS" });
    renderApp("/login");
    await enviarCredenciales("admin@quality360.local", "Quality360!");

    const alerta = await screen.findByTestId("error-login");
    expect(alerta).toHaveTextContent(MENSAJE_DEMASIADOS);
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveAttribute("data-tipo", "demasiados-intentos");
    expect(alerta).not.toHaveTextContent("incorrectos");
    await waitFor(() => expect(campoContrasena()).toHaveValue(""));
    expect(campoCorreo()).toHaveValue("admin@quality360.local");
  });

  it("también lo muestra si el gateway responde 429 a /v1/me", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/me`, () =>
        HttpResponse.json({ codigo: "DEMASIADAS_SOLICITUDES", mensaje: "Demasiadas solicitudes.", traceId: "t", detalles: [] }, { status: 429 }),
      ),
    );
    renderApp("/login");
    await enviarCredenciales("admin@quality360.local", "Quality360!");

    expect(await screen.findByTestId("error-login")).toHaveAttribute("data-tipo", "demasiados-intentos");
  });
});

describe("Login servicio de autenticación no disponible", () => {
  it("muestra el aviso de servicio no disponible cuando falla la red o Supabase responde 5xx", async () => {
    simularAccesoMock({ errorAcceso: "SERVICIO_NO_DISPONIBLE" });
    renderApp("/login");
    const user = await enviarCredenciales("admin@quality360.local", "Quality360!");

    const alerta = await screen.findByTestId("error-login");
    expect(alerta).toHaveTextContent(MENSAJE_SERVICIO);
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveAttribute("data-tipo", "servicio");
    expect(alerta).not.toHaveTextContent("incorrectos");

    // Se puede reintentar cuando el servicio vuelve.
    simularAccesoMock({ errorAcceso: null });
    await user.type(campoContrasena(), "Quality360!");
    await user.click(botonIngresar());
    expect(await screen.findByText("Portal Administrador")).toBeInTheDocument();
  });

  it("si /v1/me falla por red no se muestra «credenciales incorrectas» sino el servicio no disponible", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/me`, () => HttpResponse.error()));
    renderApp("/login");
    await enviarCredenciales("admin@quality360.local", "Quality360!");

    const alerta = await screen.findByTestId("error-login");
    expect(alerta).toHaveAttribute("data-tipo", "servicio");
    expect(alerta).toHaveTextContent(MENSAJE_SERVICIO);
  });

  it("si /v1/me responde 5xx se muestra el servicio no disponible", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/me`, () =>
        HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "Error.", traceId: "t", detalles: [] }, { status: 503 }),
      ),
    );
    renderApp("/login");
    await enviarCredenciales("admin@quality360.local", "Quality360!");

    expect(await screen.findByTestId("error-login")).toHaveAttribute("data-tipo", "servicio");
  });
});
