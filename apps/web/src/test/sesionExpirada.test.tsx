import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { iniciarSesionUi, renderApp } from "./renderApp";

const cuerpoSesionExpirada = {
  codigo: "SESION_EXPIRADA",
  mensaje: "Tu sesión expiró. Inicia sesión nuevamente.",
  traceId: "t",
  detalles: [],
};

describe("Expiración de sesión [401 SESION_EXPIRADA · E1-B11#1]", () => {
  it("limpia la sesión y vuelve al login con un aviso", async () => {
    renderApp("/login");
    await iniciarSesionUi("jose.seguel@quality360.local");
    await screen.findByText("Portal QE");
    cleanup();

    server.use(http.get(`${env.gatewayUrl}/v1/qe/analistas`, () => HttpResponse.json(cuerpoSesionExpirada, { status: 401 })));

    renderApp("/qe/equipo");

    const aviso = await screen.findByTestId("aviso-sesion");
    expect(aviso).toHaveTextContent("Tu sesión expiró. Inicia sesión nuevamente.");
    // Aviso informativo (ámbar), no un error: role=status.
    expect(aviso).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("error-login")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inicia sesión" })).toBeInTheDocument();
  });

  it("el aviso desaparece al volver a ingresar y el login funciona con normalidad", async () => {
    renderApp("/login");
    await iniciarSesionUi("jose.seguel@quality360.local");
    await screen.findByText("Portal QE");
    cleanup();

    server.use(http.get(`${env.gatewayUrl}/v1/qe/analistas`, () => HttpResponse.json(cuerpoSesionExpirada, { status: 401 })));
    renderApp("/qe/equipo");
    await screen.findByTestId("aviso-sesion");

    server.resetHandlers();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/correo electrónico/i), "jose.seguel@quality360.local");
    await user.type(screen.getByLabelText("Contraseña"), "Quality360!");
    await user.click(screen.getByRole("button", { name: /^ingresar$/i }));

    // Vuelve a la ruta donde estaba.
    expect(await screen.findByRole("heading", { name: "Mi equipo" })).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-sesion")).not.toBeInTheDocument();
  });

  it("si /v1/me responde SESION_EXPIRADA se muestra solo el aviso ámbar y el botón no queda en «Ingresando…»", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/me`, () => HttpResponse.json(cuerpoSesionExpirada, { status: 401 })));
    renderApp("/login");
    await iniciarSesionUi("jose.seguel@quality360.local");

    expect(await screen.findByTestId("aviso-sesion")).toHaveAttribute("role", "status");
    expect(screen.queryByTestId("error-login")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^ingresar$/i })).toBeEnabled());
  });
});
