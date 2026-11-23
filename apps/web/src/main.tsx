// D210: PRIMER import. Captura `code`/`state`/`error` del retorno de Atlassian y limpia la dirección antes de que
// exista el cliente de Supabase (que cerraría la sesión ante un `?error=…`). No mover.
import "./lib/capturaRetornoOauth";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ConfiguracionIncompleta } from "./components/ConfiguracionIncompleta";
import { variablesFaltantes } from "./lib/env";
// D209: IBM Plex Sans es la tipografía de todo el portal (antes solo la usaba la pantalla de acceso).
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "./styles/global.css";
import "./styles/bandejas.css";
import "./styles/impedimentos.css";
import "./styles/integraciones.css";
import "./styles/integraciones-oauth.css";
import "./styles/consulta.css";
import "./styles/detalle.css";

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
