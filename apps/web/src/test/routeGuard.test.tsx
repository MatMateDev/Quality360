import { cleanup, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { iniciarSesionUi, renderApp } from "./renderApp";

describe("Guard de rutas por rol [E1-F02, E1-F05, E1-F07]", () => {
  it("dirige a cada rol a su propio portal tras iniciar sesión", async () => {
    renderApp("/login");
    await iniciarSesionUi("jonathan.choque@quality360.local");
    expect(await screen.findByText("Portal Analista QA")).toBeInTheDocument();
  });

  it("un QE que abre una ruta administrativa vuelve a su propio portal", async () => {
    renderApp("/login");
    await iniciarSesionUi("jose.seguel@quality360.local");
    await screen.findByText("Portal QE");
    cleanup();

    // Sesión ya vigente (sessionStore es un singleton): entra directo a una ruta de administrador.
    renderApp("/admin/usuarios");
    expect(await screen.findByText("Portal QE")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("un Analista QA que abre una ruta de QE vuelve a su propio portal", async () => {
    renderApp("/login");
    await iniciarSesionUi("jonathan.choque@quality360.local");
    await screen.findByText("Portal Analista QA");
    cleanup();

    renderApp("/qe/equipo");
    expect(await screen.findByText("Portal Analista QA")).toBeInTheDocument();
  });

  it("sin sesión, una ruta protegida redirige al login", async () => {
    renderApp("/admin");
    expect(await screen.findByRole("heading", { name: "Inicia sesión" })).toBeInTheDocument();
  });
});
