import { Navigate, Outlet, useLocation } from "react-router-dom";
import { descartarRetornoOauth } from "@/lib/capturaRetornoOauth";
import { RUTA_RETORNO_OAUTH, RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
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
    // D210: volver de Atlassian sin sesión. El `code` no se guarda: se descarta y, tras iniciar sesión, se vuelve a
    // Conexión con el aviso de que hay que pulsar «Conectar con Jira» otra vez.
    const eraRetornoOauth = ubicacion.pathname.replace(/\/+$/, "") === RUTA_RETORNO_OAUTH;
    if (eraRetornoOauth) descartarRetornoOauth();
    return <Navigate to="/login" replace state={{ desde: eraRetornoOauth ? RUTAS_INTEGRACIONES.conexion : ubicacion.pathname }} />;
  }

  return <Outlet />;
}
