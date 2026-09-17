import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ConfiguracionIncompleta } from "./components/ConfiguracionIncompleta";
import { variablesFaltantes } from "./lib/env";
import "./styles/global.css";

async function iniciar() {
  if (import.meta.env.VITE_USAR_MOCKS === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }

  const raiz = document.getElementById("root");
  if (!raiz) throw new Error("No se encontró el elemento #root.");

  // Sin configuración el cliente de Supabase no puede crearse: se explica en vez de dejar la pantalla en blanco.
  const faltantes = variablesFaltantes();

  createRoot(raiz).render(
    <StrictMode>{faltantes.length > 0 ? <ConfiguracionIncompleta faltantes={faltantes} /> : <App />}</StrictMode>,
  );
}

void iniciar();
