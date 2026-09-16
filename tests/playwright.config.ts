import { defineConfig, devices } from "@playwright/test";
import { env } from "./support/env";

/**
 * Certificación E1/E2 de Quality360 (dueño: q360-qa).
 *
 * - Proyecto `setup`: inicia sesión real por UI para cada rol sembrado y
 *   guarda el `storageState` en `tests/.auth/` (no versionado), reutilizado
 *   por el proyecto `e2e` para no repetir el login en cada escenario F.
 * - Proyecto `e2e`: escenarios F contra el portal real (`localhost:5173`).
 * - Proyecto `api`: escenarios B contra el gateway real (`localhost:3000`),
 *   con `request` puro (sin navegador).
 *
 * `workers: 1` porque las pruebas comparten un mismo stack con estado real
 * (límite de tasa del gateway, datos de la semilla) y deben correr en serie
 * para no interferirse entre sí.
 */
export default defineConfig({
  testDir: ".",
  // Generoso porque las pruebas de escritura comparten el límite de tasa
  // real del gateway (30 escrituras/min) con el resto de la suite: un
  // reintento tras 429 puede esperar casi un minuto (ver tests/support/api.ts).
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  projects: [
    {
      name: "setup",
      testDir: "./e2e",
      testMatch: /.*\.setup\.ts/,
      use: { baseURL: env.portalUrl },
    },
    {
      name: "e2e",
      testDir: "./e2e",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: env.portalUrl },
    },
    {
      name: "api",
      testDir: "./api",
      use: {},
    },
  ],
});
