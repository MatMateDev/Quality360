import { cleanup, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { iniciarSesionUi, renderApp } from "./renderApp";

describe("Bloques de estado: vacío frente a indisponible", () => {
  it("un QE sin equipo ve el estado vacío, no un error ni un indisponible", async () => {
    renderApp("/login");
    await iniciarSesionUi("constanza.diaz@quality360.local");
    await screen.findByText("Portal QE");
    cleanup();

    renderApp("/qe/equipo");
    expect(await screen.findByTestId("bloque-equipo-lista-vacio")).toHaveTextContent("No tienes analistas asignados.");
    expect(screen.queryByTestId("bloque-equipo-lista-indisponible")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bloque-equipo-lista-error")).not.toBeInTheDocument();
  });

  it("un Analista QA con la fuente de HDU caída ve indisponible, nunca 0", async () => {
    renderApp("/login");
    await iniciarSesionUi("camila.rojas@quality360.local");

    expect(await screen.findByTestId("bloque-hdu-qa-indisponible")).toBeInTheDocument();
    expect(screen.queryByTestId("tarjeta-hdu-qa")).not.toHaveTextContent("0");
  });
});
