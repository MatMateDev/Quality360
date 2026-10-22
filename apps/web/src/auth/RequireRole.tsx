import { Outlet } from "react-router-dom";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import type { Rol } from "@/types/dominio";
import { useAuth } from "./AuthContext";

interface Props {
  roles: Rol[];
}

/**
 * Guard de portal (E1-F02#2, E1-F05#3, E7-F01, D41): el rol viene siempre de `GET /v1/me` (nunca del
 * token ni de localStorage, D4). Quien entra a un portal ajeno ve «acceso denegado» en la URL pedida,
 * dentro del Layout y sin que se monte la página (no se hace ninguna petición de datos).
 */
export function RequireRole({ roles }: Props) {
  const { perfil, cambioRol } = useAuth();

  if (!perfil) return null;
  if (!roles.includes(perfil.rol)) {
    // D56: si ese portal era del usuario (su rol cambió), el Layout lo redirige con el aviso; no es un acceso ajeno.
    if (cambioRol && roles.includes(cambioRol.anterior)) return null;
    return <AccesoDenegado variante="seccion" />;
  }

  return <Outlet />;
}
