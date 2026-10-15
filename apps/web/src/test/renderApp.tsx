import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, type InitialEntry } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { AppRoutes } from "@/routes/router";
import { SondaEstado } from "./SondaEstado";

/** Renderiza la app completa (rutas + guardas + AuthProvider) en una ruta inicial dada, con un QueryClient propio por render. */
export function renderApp(ruta: string = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[ruta]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** Como `renderApp`, pero con una entrada inicial completa (ruta y `state`) y una sonda del `location.state`. */
export function renderAppConEstado(entrada: InitialEntry) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[entrada]}>
          <AppRoutes />
          <SondaEstado />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** Llena y envía el formulario de login (credenciales de demostración en `mocks/data.ts`). */
export async function iniciarSesionUi(correo: string, contrasena = "Quality360!") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/correo electrónico/i), correo);
  // Exacto: el botón del ojo («Mostrar contraseña») también contiene la palabra.
  await user.type(screen.getByLabelText("Contraseña"), contrasena);
  await user.click(screen.getByRole("button", { name: /^ingresar$/i }));
}
