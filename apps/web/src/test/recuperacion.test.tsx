import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  cierresDeSesionMock,
  contrasenasActualizadasMock,
  simularAccesoMock,
  solicitudesRecuperacionMock,
} from "@/auth/mockAuthProvider";
import { obtenerSesion } from "@/auth/sessionStore";
import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { iniciarSesionUi, renderApp, renderAppConEstado } from "./renderApp";

/**
 * Recuperación de contraseña (E1-F13 y E1-B13): /recuperar-contrasena y /restablecer-contrasena.
 * Todo corre contra el proveedor mock, que imita a supabase-js (incluida la sesión real de recuperación).
 */

const CONFIRMACION =
  "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en unos minutos.";
const MENSAJE_DEMASIADOS = "Demasiados intentos de ingreso. Espera unos minutos antes de volver a intentarlo.";
const MENSAJE_SERVICIO =
  "No pudimos conectar con el servicio de autenticación. Revisa tu conexión e inténtalo de nuevo.";
const ENLACE_VENCIDO = "El enlace expiró o ya se usó. Solicita uno nuevo.";

const correo = () => screen.getByLabelText(/correo electrónico/i);
const botonEnviarEnlace = () => screen.getByRole("button", { name: "Enviar enlace" });
const nueva = () => screen.getByLabelText("Nueva contraseña");
const repetida = () => screen.getByLabelText("Repetir contraseña");
const botonGuardar = () => screen.getByRole("button", { name: "Guardar contraseña" });

/** Cuenta las llamadas a /v1/me: durante la recuperación no debe haber ninguna. */
function contarLlamadasAMe() {
  const contador = { llamadas: 0 };
  server.use(
    http.get(`${env.gatewayUrl}/v1/me`, () => {
      contador.llamadas += 1;
      return HttpResponse.json({ id: "a1", nombre: "Admin", correo: "admin@quality360.local", rol: "ADMINISTRADOR" });
    }),
  );
  return contador;
}

describe("[E1-F13#1] enlace «¿Olvidaste tu contraseña?» en el login", () => {
  it("lleva a /recuperar-contrasena", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Recupera tu contraseña" })).toBeInTheDocument();
  });
});

describe("[E1-F13#1] /recuperar-contrasena", () => {
  it("usa la pantalla dividida: formulario con correo, «Enviar enlace» y «Volver a iniciar sesión»", () => {
    renderApp("/recuperar-contrasena");

    expect(correo()).toHaveAttribute("type", "email");
    expect(botonEnviarEnlace()).toBeEnabled();
    expect(screen.getByRole("link", { name: /Volver a iniciar sesión/ })).toHaveAttribute("href", "/login");
    // Mismo panel de marca que el login.
    expect(screen.getByRole("img", { name: /Quality360/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Verifícalo aquí/ })).toHaveAttribute("href", "/verificar");
  });

  it("valida que el correo sea obligatorio y tenga formato, sin enviar la solicitud", async () => {
    renderApp("/recuperar-contrasena");
    const user = userEvent.setup();

    await user.click(botonEnviarEnlace());
    expect(await screen.findByText("El correo es obligatorio.")).toBeInTheDocument();
    expect(correo()).toHaveAttribute("aria-invalid", "true");
    expect(correo()).toHaveFocus();

    await user.type(correo(), "no-es-correo");
    expect(screen.queryByText("El correo es obligatorio.")).not.toBeInTheDocument();
    await user.click(botonEnviarEnlace());
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();

    expect(solicitudesRecuperacionMock()).toEqual([]);
    expect(screen.queryByTestId("confirmacion-recuperacion")).not.toBeInTheDocument();
  });

  it("responde SIEMPRE la misma confirmación (role=status), exista o no el correo", async () => {
    renderApp("/recuperar-contrasena");
    const user = userEvent.setup();

    await user.type(correo(), "admin@quality360.local");
    await user.click(botonEnviarEnlace());
    const primera = await screen.findByTestId("confirmacion-recuperacion");
    expect(primera).toHaveTextContent(CONFIRMACION);
    expect(primera).toHaveAttribute("role", "status");

    await user.clear(correo());
    await user.type(correo(), "no-existe-de-verdad@quality360.local");
    await user.click(botonEnviarEnlace());
    await waitFor(() => expect(solicitudesRecuperacionMock()).toHaveLength(2));
    expect(await screen.findByTestId("confirmacion-recuperacion")).toHaveTextContent(CONFIRMACION);

    expect(solicitudesRecuperacionMock()).toEqual(["admin@quality360.local", "no-existe-de-verdad@quality360.local"]);
    expect(screen.queryByTestId("error-recuperacion")).not.toBeInTheDocument();
  });

  it("muestra «Enviando…» dentro del botón mientras se solicita", async () => {
    let liberar!: () => void;
    simularAccesoMock({
      compuerta: new Promise<void>((resolver) => {
        liberar = resolver;
      }),
    });
    renderApp("/recuperar-contrasena");
    const user = userEvent.setup();

    await user.type(correo(), "admin@quality360.local");
    await user.click(botonEnviarEnlace());

    const boton = await screen.findByRole("button", { name: /enviando/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");

    liberar();
    expect(await screen.findByTestId("confirmacion-recuperacion")).toBeInTheDocument();
  });

  it("429 muestra la alerta de demasiados intentos y no la confirmación", async () => {
    simularAccesoMock({ errorSolicitudRecuperacion: "DEMASIADOS_INTENTOS" });
    renderApp("/recuperar-contrasena");
    const user = userEvent.setup();

    await user.type(correo(), "admin@quality360.local");
    await user.click(botonEnviarEnlace());

    const alerta = await screen.findByTestId("error-recuperacion");
    expect(alerta).toHaveTextContent(MENSAJE_DEMASIADOS);
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveAttribute("data-tipo", "demasiados-intentos");
    expect(screen.queryByTestId("confirmacion-recuperacion")).not.toBeInTheDocument();
  });

  it("red o 5xx muestran la alerta de servicio no disponible y se puede reintentar", async () => {
    simularAccesoMock({ errorSolicitudRecuperacion: "SERVICIO_NO_DISPONIBLE" });
    renderApp("/recuperar-contrasena");
    const user = userEvent.setup();

    await user.type(correo(), "admin@quality360.local");
    await user.click(botonEnviarEnlace());

    const alerta = await screen.findByTestId("error-recuperacion");
    expect(alerta).toHaveTextContent(MENSAJE_SERVICIO);
    expect(alerta).toHaveAttribute("data-tipo", "servicio");

    simularAccesoMock({ errorSolicitudRecuperacion: null });
    await user.click(botonEnviarEnlace());
    expect(await screen.findByTestId("confirmacion-recuperacion")).toHaveTextContent(CONFIRMACION);
    expect(screen.queryByTestId("error-recuperacion")).not.toBeInTheDocument();
  });
});

describe("[E1-F13#3] /restablecer-contrasena · enlace", () => {
  it("un enlace vencido o ya usado muestra el aviso con un enlace para solicitar uno nuevo", async () => {
    simularAccesoMock({ enlaceRecuperacion: "vencido" });
    renderApp("/restablecer-contrasena");

    const alerta = await screen.findByTestId("enlace-invalido");
    expect(alerta).toHaveTextContent(ENLACE_VENCIDO);
    expect(alerta).toHaveAttribute("role", "alert");
    expect(screen.getByRole("link", { name: "Solicitar un enlace nuevo" })).toHaveAttribute("href", "/recuperar-contrasena");
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });

  it("indica que verifica el enlace mientras llega la sesión de recuperación", async () => {
    let liberar!: () => void;
    simularAccesoMock({
      compuerta: new Promise<void>((resolver) => {
        liberar = resolver;
      }),
    });
    renderApp("/restablecer-contrasena");

    expect(screen.getByTestId("verificando-enlace")).toHaveAttribute("role", "status");
    liberar();
    expect(await screen.findByLabelText("Nueva contraseña")).toBeInTheDocument();
  });

  it("no llama a /v1/me ni lleva al portal mientras la sesión de recuperación está abierta", async () => {
    const me = contarLlamadasAMe();
    renderApp("/restablecer-contrasena");

    await screen.findByLabelText("Nueva contraseña");
    // La sesión de recuperación existe de verdad (como en supabase-js)...
    expect(obtenerSesion()).not.toBeNull();
    // ...pero no se usa como sesión de portal.
    await new Promise((resolver) => setTimeout(resolver, 100));
    expect(me.llamadas).toBe(0);
    expect(screen.queryByText("Portal Administrador")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Crea una nueva contraseña" })).toBeInTheDocument();
  });

  it("si la persona se va sin terminar, la sesión de recuperación se cierra y no entra al portal", async () => {
    const me = contarLlamadasAMe();
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();

    await screen.findByLabelText("Nueva contraseña");
    expect(obtenerSesion()).not.toBeNull();

    await user.click(screen.getByRole("link", { name: /Volver a iniciar sesión/ }));

    await waitFor(() => expect(obtenerSesion()).toBeNull());
    expect(await screen.findByRole("heading", { level: 1, name: "Inicia sesión" })).toBeInTheDocument();
    await new Promise((resolver) => setTimeout(resolver, 100));
    expect(me.llamadas).toBe(0);
    expect(screen.queryByText("Portal Administrador")).not.toBeInTheDocument();
    // Abandonar no cambió nada: el cierre es solo local y no revoca las sesiones de otros dispositivos.
    expect(cierresDeSesionMock()).toEqual({ globales: 0, locales: 1 });
  });
});

describe("[E1-F13#2] /restablecer-contrasena · formulario", () => {
  it("ofrece mostrar u ocultar cada una de las dos contraseñas", async () => {
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    expect(nueva()).toHaveAttribute("type", "password");
    expect(repetida()).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar nueva contraseña" }));
    expect(nueva()).toHaveAttribute("type", "text");
    expect(repetida()).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar contraseña repetida" }));
    expect(repetida()).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Ocultar nueva contraseña" }));
    expect(nueva()).toHaveAttribute("type", "password");
  });

  it("exige al menos 8 caracteres y que ambas coincidan, sin llamar a updateUser", async () => {
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    await user.type(nueva(), "corta");
    await user.type(repetida(), "corta");
    await user.click(botonGuardar());
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeInTheDocument();
    expect(nueva()).toHaveAttribute("aria-invalid", "true");
    expect(nueva()).toHaveFocus();

    await user.clear(nueva());
    await user.clear(repetida());
    await user.type(nueva(), "una-clave-larga-1");
    await user.type(repetida(), "otra-clave-larga-2");
    await user.click(botonGuardar());
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(repetida()).toHaveAttribute("aria-invalid", "true");
    expect(repetida()).toHaveFocus();

    expect(contrasenasActualizadasMock()).toEqual([]);
    // Sigue en la pantalla: no hubo redirección.
    expect(screen.getByRole("heading", { level: 1, name: "Crea una nueva contraseña" })).toBeInTheDocument();
  });

  it("al terminar actualiza la contraseña, cierra la sesión y vuelve al login con un aviso de éxito", async () => {
    const me = contarLlamadasAMe();
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    await user.type(nueva(), "NuevaClave-2026");
    await user.type(repetida(), "NuevaClave-2026");
    await user.click(botonGuardar());

    const aviso = await screen.findByTestId("aviso-contrasena-actualizada");
    expect(aviso).toHaveTextContent("Tu contraseña se actualizó. Ingresa con la nueva.");
    expect(aviso).toHaveAttribute("role", "status");
    expect(screen.getByRole("heading", { level: 1, name: "Inicia sesión" })).toBeInTheDocument();

    expect(contrasenasActualizadasMock()).toEqual(["NuevaClave-2026"]);
    // La sesión de recuperación se cerró y nunca se consultó el perfil. Al cambiar la contraseña el cierre es
    // global (se invalidan las sesiones de todos los dispositivos).
    expect(obtenerSesion()).toBeNull();
    expect(cierresDeSesionMock()).toEqual({ globales: 1, locales: 0 });
    await new Promise((resolver) => setTimeout(resolver, 100));
    expect(me.llamadas).toBe(0);
    expect(screen.queryByText("Portal Administrador")).not.toBeInTheDocument();
  });

  it("después de restablecer, el ingreso normal funciona y el aviso de éxito desaparece", async () => {
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");
    await user.type(nueva(), "NuevaClave-2026");
    await user.type(repetida(), "NuevaClave-2026");
    await user.click(botonGuardar());
    await screen.findByTestId("aviso-contrasena-actualizada");

    await iniciarSesionUi("admin@quality360.local");

    expect(await screen.findByText("Portal Administrador")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-contrasena-actualizada")).not.toBeInTheDocument();
  });

  it("same_password: pide una contraseña distinta de la anterior y no sale de la pantalla", async () => {
    simularAccesoMock({ errorActualizacion: "MISMA_CONTRASENA" });
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    await user.type(nueva(), "MismaClave-2026");
    await user.type(repetida(), "MismaClave-2026");
    await user.click(botonGuardar());

    const alerta = await screen.findByTestId("error-restablecer");
    expect(alerta).toHaveTextContent("La nueva contraseña debe ser distinta de la anterior.");
    expect(alerta).toHaveAttribute("data-tipo", "misma-contrasena");
    expect(nueva()).toHaveAttribute("aria-invalid", "true");
    expect(nueva()).toHaveAccessibleDescription(/La nueva contraseña debe ser distinta de la anterior\./);
    expect(screen.queryByTestId("aviso-contrasena-actualizada")).not.toBeInTheDocument();
    expect(botonGuardar()).toBeEnabled();
  });

  it("weak_password: informa que no cumple los requisitos de seguridad", async () => {
    simularAccesoMock({ errorActualizacion: "CONTRASENA_DEBIL" });
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    await user.type(nueva(), "12345678");
    await user.type(repetida(), "12345678");
    await user.click(botonGuardar());

    const alerta = await screen.findByTestId("error-restablecer");
    expect(alerta).toHaveTextContent("La contraseña no cumple los requisitos de seguridad.");
    expect(alerta).toHaveAttribute("data-tipo", "contrasena-debil");
  });

  it("red o 5xx al guardar muestran el servicio no disponible y conservan lo escrito", async () => {
    simularAccesoMock({ errorActualizacion: "SERVICIO_NO_DISPONIBLE" });
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    await user.type(nueva(), "NuevaClave-2026");
    await user.type(repetida(), "NuevaClave-2026");
    await user.click(botonGuardar());

    const alerta = await screen.findByTestId("error-restablecer");
    expect(alerta).toHaveTextContent(MENSAJE_SERVICIO);
    expect(alerta).toHaveAttribute("data-tipo", "servicio");
    expect(nueva()).toHaveValue("NuevaClave-2026");
  });

  it("si el enlace expira mientras se escribe, al guardar se muestra el aviso de enlace vencido", async () => {
    simularAccesoMock({ errorActualizacion: "ENLACE_INVALIDO" });
    renderApp("/restablecer-contrasena");
    const user = userEvent.setup();
    await screen.findByLabelText("Nueva contraseña");

    await user.type(nueva(), "NuevaClave-2026");
    await user.type(repetida(), "NuevaClave-2026");
    await user.click(botonGuardar());

    expect(await screen.findByTestId("enlace-invalido")).toHaveTextContent(ENLACE_VENCIDO);
    expect(screen.getByRole("link", { name: "Solicitar un enlace nuevo" })).toHaveAttribute("href", "/recuperar-contrasena");
  });
});

describe("[E1-F13 · D3] el aviso de éxito no reaparece al recargar /login", () => {
  const AVISO = "Tu contraseña se actualizó. Ingresa con la nueva.";

  it("lo muestra una vez y limpia el location.state después de leerlo", async () => {
    renderAppConEstado({ pathname: "/login", state: { avisoExito: AVISO } });

    expect(await screen.findByTestId("aviso-contrasena-actualizada")).toHaveTextContent(AVISO);
    // Con el state limpio, una recarga (que conserva history.state) ya no lo trae de vuelta.
    await waitFor(() => expect(screen.getByTestId("sonda-estado")).toHaveTextContent("null"));
    expect(screen.getByTestId("aviso-contrasena-actualizada")).toBeInTheDocument();
  });

  it("conserva la ruta de retorno («desde») al limpiar el aviso", async () => {
    renderAppConEstado({ pathname: "/login", state: { avisoExito: AVISO, desde: "/qe/equipo" } });

    await screen.findByTestId("aviso-contrasena-actualizada");
    await waitFor(() => expect(screen.getByTestId("sonda-estado")).toHaveTextContent('{"desde":"/qe/equipo"}'));
  });

  it("sin aviso en el state no toca la navegación", async () => {
    renderAppConEstado({ pathname: "/login", state: { desde: "/qe/equipo" } });

    await screen.findByRole("heading", { level: 1, name: "Inicia sesión" });
    expect(screen.queryByTestId("aviso-contrasena-actualizada")).not.toBeInTheDocument();
    expect(screen.getByTestId("sonda-estado")).toHaveTextContent('{"desde":"/qe/equipo"}');
  });
});
