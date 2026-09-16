import { cleanup, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { iniciarSesionUi, renderApp } from "./renderApp";

describe("Expiración de sesión [401 SESION_EXPIRADA]", () => {
  it("limpia la sesión y vuelve al login con un aviso", async () => {
    renderApp("/login");
    await iniciarSesionUi("jose.seguel@quality360.local");
    await screen.findByText("Portal QE");
    cleanup();

    server.use(
      http.get(`${env.gatewayUrl}/v1/qe/analistas`, () =>
        HttpResponse.json(
          { codigo: "SESION_EXPIRADA", mensaje: "Tu sesión expiró. Inicia sesión nuevamente.", traceId: "t", detalles: [] },
          { status: 401 },
        ),
      ),
    );

    renderApp("/qe/equipo");

    expect(await screen.findByTestId("aviso-sesion")).toHaveTextContent("Tu sesión expiró. Inicia sesión nuevamente.");
    expect(screen.getByRole("heading", { name: "Inicia sesión" })).toBeInTheDocument();
  });
});
