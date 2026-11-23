import { createContext, useContext, type ReactNode } from "react";
import { useConfiguracionJira } from "@/api/integraciones";
import type { MetodoConexionJira } from "@/types/dominio";

/**
 * Método de conexión activo, para los textos que dependen de él (`JIRA_SIN_PERMISO` y `JIRA_PROYECTO_NO_ENCONTRADO`,
 * diseño OAuth §9.3). Solo lo provee el contenedor del Administrador: QE y Auditor no pueden leer la configuración, y
 * sin proveedor los mensajes son los certificados del API token (E5-F01-T04).
 */
const MetodoJiraContext = createContext<MetodoConexionJira | null>(null);

export function ProveedorMetodoJira({ children }: { children: ReactNode }) {
  const configuracion = useConfiguracionJira();
  return <MetodoJiraContext.Provider value={configuracion.data?.metodo ?? null}>{children}</MetodoJiraContext.Provider>;
}

export function useMetodoJiraActivo(): MetodoConexionJira | null {
  return useContext(MetodoJiraContext);
}
