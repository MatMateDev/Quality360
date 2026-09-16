/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@contracts": fileURLToPath(new URL("../../contracts/dist/types", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // Las pruebas deben ser autosuficientes: no dependen de apps/web/.env.local
    // (gitignored). Fuerzan el modo mock y valores de Supabase de relleno, para
    // que `npm run test -w apps/web` sea verde en una clonación limpia y en CI
    // sin ningún archivo .env* presente. El modo real de la app en sí sigue sin
    // tocarse: fuera de las pruebas, VITE_USAR_MOCKS solo lo define .env.local.
    env: {
      VITE_USAR_MOCKS: "true",
      VITE_GATEWAY_URL: "http://localhost:3000",
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_pruebas",
    },
  },
});
