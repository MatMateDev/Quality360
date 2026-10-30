import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { rutaPortal, type Rol } from "@/types/dominio";
import { InsigniaRol } from "./Etiquetas";

interface EnlaceNav {
  a: string;
  etiqueta: string;
  fin?: boolean;
}

/** Menú por rol (diseño E7 §4.1). «Bandeja» va primero; «Perfil» se agrega al final para todos. */
const ENLACES_POR_ROL: Record<Rol, EnlaceNav[]> = {
  ADMINISTRADOR: [
    { a: "/admin", etiqueta: "Bandeja", fin: true },
    { a: "/admin/usuarios", etiqueta: "Usuarios" },
    { a: "/admin/supervision", etiqueta: "Supervisión" },
    // E5: sin `fin`, queda activo en las cuatro pestañas de /admin/integraciones.
    { a: "/admin/integraciones", etiqueta: "Integraciones" },
  ],
  QE: [
    { a: "/qe", etiqueta: "Bandeja", fin: true },
    { a: "/qe/equipo", etiqueta: "Equipo" },
    { a: "/qe/hdu", etiqueta: "Historias supervisadas" },
    // E4: sin `fin`, queda activo también en /qe/impedimentos/riesgo.
    { a: "/qe/impedimentos", etiqueta: "Impedimentos" },
    { a: "/qe/integraciones", etiqueta: "Integraciones" },
  ],
  ANALISTA_QA: [
    { a: "/qa", etiqueta: "Bandeja", fin: true },
    { a: "/qa/hdu", etiqueta: "Mis HDU" },
  ],
  // Sin `fin`: queda activo en las cuatro pestañas del Auditor.
  LIDER_QA: [{ a: "/lider", etiqueta: "Bandeja" }],
  AUDITOR: [{ a: "/auditor", etiqueta: "Bandeja" }],
};

/** Barra superior y navegación por portal (E1-F02#3: el menú del QE solo trae equipo, historias supervisadas, perfil y cerrar sesión). */
export function Layout() {
  const { perfil, cerrarSesion, cambioRol, reconocerCambioRol } = useAuth();
  const navigate = useNavigate();
  const [avisoRol, setAvisoRol] = useState(false);

  const rol = perfil?.rol ?? null;
  useEffect(() => {
    // E7-F01-T07 y D56: si `/v1/me` devuelve un rol distinto al último conocido (con la sesión abierta o al
    // recargar), se lleva al usuario a su nueva bandeja con el aviso.
    if (rol && cambioRol) {
      setAvisoRol(true);
      navigate(rutaPortal(rol), { replace: true });
      reconocerCambioRol();
    }
  }, [rol, cambioRol, navigate, reconocerCambioRol]);

  if (!perfil) return null;

  const enlaces = ENLACES_POR_ROL[perfil.rol] ?? [];

  async function manejarCerrarSesion() {
    await cerrarSesion();
    navigate("/login", { replace: true });
  }

  return (
    <div className="capa-app">
      <a className="saltar-contenido" href="#contenido">
        Saltar al contenido
      </a>
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

      <main className="contenedor" id="contenido" tabIndex={-1}>
        {avisoRol ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-rol-cambio">
            Tu rol cambió. Te llevamos a tu nueva bandeja.
          </p>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
