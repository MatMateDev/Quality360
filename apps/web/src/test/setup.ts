import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { reiniciarSimulacionMock } from "@/auth/mockAuthProvider";
import { reiniciarCapturaRetornoOauth } from "@/lib/capturaRetornoOauth";
import { limpiarSesion } from "@/auth/sessionStore";
import { reiniciarE5 } from "@/mocks/dataE5";
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
  sessionStorage.clear();
  reiniciarSimulacionMock();
  reiniciarFuentes();
  reiniciarE5();
  reiniciarCapturaRetornoOauth();
  vi.restoreAllMocks();
});

afterAll(() => server.close());
