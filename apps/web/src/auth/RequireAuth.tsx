import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Guard de sesión: exige `estado === "autenticado"` antes de renderizar rutas protegidas. */
export function RequireAuth() {
  const { estado } = useAuth();
  const ubicacion = useLocation();

  if (estado === "cargando") {
    return (
      <div className="contenedor" role="status" aria-live="polite">
        <p>Cargando sesión…</p>
      </div>
    );
  }

  if (estado === "anonimo") {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }

  return <Outlet />;
}
