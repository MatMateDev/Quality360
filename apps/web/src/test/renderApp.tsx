import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { AppRoutes } from "@/routes/router";

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

/** Llena y envía el formulario de login (credenciales de demostración en `mocks/data.ts`). */
export async function iniciarSesionUi(correo: string, contrasena = "Quality360!") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/correo electrónico/i), correo);
  await user.type(screen.getByLabelText(/contraseña/i), contrasena);
  await user.click(screen.getByRole("button", { name: /^ingresar$/i }));
}
