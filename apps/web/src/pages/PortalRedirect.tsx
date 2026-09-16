import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { rutaPortal } from "@/types/dominio";

/** Ruta índice ("/"): envía a cada usuario a su portal según el rol de `GET /v1/me`. */
export function PortalRedirect() {
  const { perfil } = useAuth();
  if (!perfil) return null;
  return <Navigate to={rutaPortal(perfil.rol)} replace />;
}
