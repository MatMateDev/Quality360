import { Navigate, Outlet } from "react-router-dom";
import type { Rol } from "@/types/dominio";
import { rutaPortal } from "@/types/dominio";
import { useAuth } from "./AuthContext";

interface Props {
  roles: Rol[];
}

/**
 * Guard de portal (E1-F02#2, E1-F05#3): el rol viene siempre de `GET /v1/me`
 * (nunca del token ni de localStorage, D4). Quien entra a un portal ajeno
 * vuelve al suyo.
 */
export function RequireRole({ roles }: Props) {
  const { perfil } = useAuth();

  if (!perfil) return null;
  if (!roles.includes(perfil.rol)) {
    return <Navigate to={rutaPortal(perfil.rol)} replace />;
  }

  return <Outlet />;
}
