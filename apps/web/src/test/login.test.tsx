import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp";

describe("Login [E1-F01]", () => {
  it("marca los campos obligatorios sin enviar la solicitud", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^ingresar$/i }));

    expect(await screen.findByText("El correo es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña es obligatoria.")).toBeInTheDocument();
  });

  it("permite mostrar y ocultar la contraseña", async () => {
    renderApp("/login");
    const user = userEvent.setup();
    const campoContrasena = screen.getByLabelText(/contraseña/i);

    expect(campoContrasena).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /mostrar/i }));
    expect(campoContrasena).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /ocultar/i }));
    expect(campoContrasena).toHaveAttribute("type", "password");
  });

  it("muestra un único mensaje genérico ante credenciales incorrectas y permite reintentar", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/correo electrónico/i), "admin@quality360.local");
    await user.type(screen.getByLabelText(/contraseña/i), "clave-incorrecta");
    await user.click(screen.getByRole("button", { name: /^ingresar$/i }));

    expect(await screen.findByTestId("error-login")).toHaveTextContent(
      "Correo o contraseña incorrectos, o acceso no habilitado.",
    );

    // Reintentar con la contraseña correcta.
    await user.clear(screen.getByLabelText(/contraseña/i));
    await user.type(screen.getByLabelText(/contraseña/i), "Quality360!");
    await user.click(screen.getByRole("button", { name: /^ingresar$/i }));

    await waitFor(() => expect(screen.queryByTestId("error-login")).not.toBeInTheDocument());
    expect(await screen.findByText("Portal Administrador")).toBeInTheDocument();
  });
});
