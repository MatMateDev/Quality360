import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrirComo } from "./renderApp";

const QE = "jose.seguel@quality360.local";
const ANALISTA = "jonathan.choque@quality360.local";

describe("Dashboard QE [E6]", () => {
  it("permite al QE acceder al dashboard", async () => {
    await abrirComo(QE, "/qe/dashboard");

    expect(
      await screen.findByRole("heading", {
        name: "Dashboard QE",
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByTestId("tarjeta-e6-hdu"),
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("tarjeta-e6-equipo"),
    ).toBeInTheDocument();

    expect(
      screen.getByTestId("tarjeta-e6-porcentaje"),
    ).toBeInTheDocument();
  });

  it("impide el acceso al perfil Analista QA", async () => {
    await abrirComo(ANALISTA, "/qe/dashboard");

    expect(
      await screen.findByTestId("acceso-denegado"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Dashboard QE",
      }),
    ).not.toBeInTheDocument();
  });
});
it("muestra la distribución de HDU en los cinco estados", async () => {
  await abrirComo(QE, "/qe/dashboard");

  expect(
    await screen.findByRole("heading", {
      name: "Distribución de HDU por estado",
    }),
  ).toBeInTheDocument();

  const estados = [
    "PENDIENTE",
    "DISENO_PRUEBAS",
    "EN_EJECUCION",
    "PENDIENTE_CIERRE",
    "CERRADA",
  ];

  for (const estado of estados) {
    expect(
      await screen.findByTestId(`e6-estado-${estado}`),
    ).toHaveTextContent(/^\d+ \(\d+%\)$/);
  }

  expect(
    screen.getAllByRole("progressbar"),
  ).toHaveLength(5);
});
 
