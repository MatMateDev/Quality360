import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

async function iniciar() {
  if (import.meta.env.VITE_USAR_MOCKS === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }

  const raiz = document.getElementById("root");
  if (!raiz) throw new Error("No se encontró el elemento #root.");

  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void iniciar();
