import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { reiniciarSimulacionMock } from "@/auth/mockAuthProvider";
import { limpiarSesion } from "@/auth/sessionStore";
import { reiniciarFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(async () => {
  server.resetHandlers();
  cleanup();
  // /restablecer-contrasena cierra su sesión de recuperación en un setTimeout(0) al desmontarse: se espera ese
  // turno para que no alcance a la sesión de la prueba siguiente.
  await new Promise((resolver) => setTimeout(resolver, 0));
  limpiarSesion();
  reiniciarSimulacionMock();
  reiniciarFuentes();
});

afterAll(() => server.close());
