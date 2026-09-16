import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { InsigniaRol } from "./Etiquetas";

interface EnlaceNav {
  a: string;
  etiqueta: string;
  fin?: boolean;
}

const ENLACES_POR_ROL: Record<string, EnlaceNav[]> = {
  ADMINISTRADOR: [
    { a: "/admin", etiqueta: "Inicio", fin: true },
    { a: "/admin/usuarios", etiqueta: "Usuarios" },
    { a: "/admin/supervision", etiqueta: "Supervisión" },
  ],
  QE: [
    { a: "/qe", etiqueta: "Inicio", fin: true },
    { a: "/qe/equipo", etiqueta: "Equipo" },
    { a: "/qe/hdu", etiqueta: "Historias supervisadas" },
  ],
  ANALISTA_QA: [
    { a: "/qa", etiqueta: "Inicio", fin: true },
    { a: "/qa/hdu", etiqueta: "Mis HDU" },
  ],
};

/** Barra superior y navegación por portal (E1-F02#3: el menú del QE solo trae equipo, historias supervisadas, perfil y cerrar sesión). */
export function Layout() {
  const { perfil, cerrarSesion } = useAuth();
  const navigate = useNavigate();

  if (!perfil) return null;

  const enlaces = ENLACES_POR_ROL[perfil.rol] ?? [];

  async function manejarCerrarSesion() {
    await cerrarSesion();
    navigate("/login", { replace: true });
  }

  return (
    <div className="capa-app">
      <header className="barra-superior">
        <a className="marca" href="/">
          Quality360
        </a>

        <nav className="nav-portal" aria-label="Portal">
          {enlaces.map((enlace) => (
            <NavLink key={enlace.a} to={enlace.a} end={enlace.fin}>
              {enlace.etiqueta}
            </NavLink>
          ))}
          <NavLink to="/perfil">Perfil</NavLink>
        </nav>

        <div className="sesion-usuario">
          <span className="sesion-usuario-nombre">
            <strong>{perfil.nombre}</strong>
            <InsigniaRol rol={perfil.rol} />
          </span>
          <button type="button" className="boton boton--secundario" onClick={manejarCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="contenedor">
        <Outlet />
      </main>
    </div>
  );
}
