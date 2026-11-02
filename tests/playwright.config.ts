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
  // Jira simulado de E5 (puerto 4010); lo arranca la corrida y lo cierra al terminar.
  globalSetup: "./support/jira-falso/globalSetup.ts",
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
      testIgnore: [/.*\.setup\.ts/, /e7-.*\.spec\.ts/, /e4-.*.spec.ts/, /e5-.*.spec.ts/],
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: env.portalUrl },
    },
    {
      name: "api",
      testDir: "./api",
      testIgnore: [/e7-.*\.spec\.ts/, /e4-.*.spec.ts/, /e5-.*.spec.ts/],
      use: {},
    },
    // Certificación de E7 · Bandejas por rol (fixture `npm run seed:e7`; usuarios adm1, qe1... @quality360.local).
    // `e7-setup` guarda la sesión de cada usuario del fixture en tests/.auth/e7-<clave>.json.
    {
      name: "e7-setup",
      testDir: "./e2e",
      testMatch: /e7-sesiones\.ts/,
      use: { baseURL: env.portalUrl },
    },
    {
      name: "e7-api",
      testDir: "./api",
      testMatch: /e7-.*\.spec\.ts/,
      dependencies: ["e7-setup"],
      timeout: 180_000,
      use: {},
    },
    {
      name: "e7-e2e",
      testDir: "./e2e",
      testMatch: /e7-.*\.spec\.ts/,
      dependencies: ["e7-setup"],
      timeout: 180_000,
      use: { ...devices["Desktop Chrome"], baseURL: env.portalUrl, actionTimeout: 15_000, navigationTimeout: 30_000 },
    },
    // Certificación de E4 · Impedimentos y riesgos (fixture `npm run seed:e7` + `npm run seed:e4`, reutiliza las sesiones de e7-setup).
    {
      name: "e4-api",
      // El gateway limita la tasa (429) y una corrida larga puede toparse con él en una lectura sin reintento propio: un reintento por prueba,
      // y la corrida lo informa como «flaky» (no se oculta).
      retries: 1,
      testDir: "./api",
      testMatch: /e4-.*.spec.ts/,
      dependencies: ["e7-setup"],
      timeout: 240_000,
      use: {},
    },
    {
      name: "e4-e2e",
      retries: 1,
      testDir: "./e2e",
      testMatch: /e4-.*.spec.ts/,
      dependencies: ["e7-setup"],
      timeout: 240_000,
      use: { ...devices["Desktop Chrome"], baseURL: env.portalUrl, actionTimeout: 15_000, navigationTimeout: 30_000 },
    },
    // Certificación de E5 · Integración con Jira (fixture seed:e7 + seed:e4 + seed:e5; Jira falso en :4010; reutiliza las sesiones de e7-setup).
    {
      name: "e5-api",
      testDir: "./api",
      testMatch: /e5-.*.spec.ts/,
      dependencies: ["e7-setup"],
      timeout: 240_000,
      use: {},
    },
    {
      name: "e5-e2e",
      // El portal escribe por el gateway real (:3000), que limita a 30 escrituras/min: un reintento por prueba y la corrida lo informa como «flaky».
      retries: 1,
      testDir: "./e2e",
      testMatch: /e5-.*.spec.ts/,
      dependencies: ["e7-setup"],
      timeout: 240_000,
      use: { ...devices["Desktop Chrome"], baseURL: env.portalUrl, actionTimeout: 15_000, navigationTimeout: 30_000 },
    },
  ],
});
