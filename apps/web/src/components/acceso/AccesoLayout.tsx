import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import logo from "@/assets/quality360-logo.png";
import "@/styles/acceso.css";
import { IconoEscudo, IconoVisto } from "./Iconos";

/** Ciclo de vida de una HDU, de la creación al certificado (E2 y E3). */
const CICLO_HDU = ["Pendiente", "Diseño de pruebas", "En ejecución", "Pendiente de cierre"] as const;

/**
 * Pantalla dividida «Acceso A» compartida por el login y las pantallas de RECUPERACION: panel de marca
 * a la izquierda y la columna del formulario a la derecha. Con menos de 1024 px el panel se reduce a
 * una franja con el logo y el formulario ocupa todo el ancho.
 *
 * La clase raíz `pantalla-acceso` es la única que usa IBM Plex Sans: el resto de la app conserva sus tokens.
 */
export function AccesoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pantalla-acceso">
      <section className="acceso-marca" aria-label="Quality360">
        <img
          className="acceso-marca__logo"
          src={logo}
          width={367}
          height={296}
          alt="Quality360 — Calidad. Visibilidad. Análisis. Impacto."
        />
        <div className="acceso-marca__detalle">
          <p className="acceso-marca__lema">Calidad de software con trazabilidad</p>
          {/* No es un encabezado: el h1 de cada pantalla es el título del formulario, visible en todos los tamaños. */}
          <p className="acceso-marca__titular">De la historia de usuario al certificado, en un solo lugar.</p>
          <p className="acceso-marca__texto">Diseña, ejecuta y certifica las pruebas de cada HDU.</p>
          <ol className="acceso-ciclo" aria-label="Ciclo de una HDU">
            {CICLO_HDU.map((etapa) => (
              <li key={etapa} className="acceso-ciclo__etapa">
                {etapa}
              </li>
            ))}
            <li className="acceso-ciclo__etapa acceso-ciclo__etapa--final">
              <IconoVisto />
              Certificada
            </li>
          </ol>
        </div>
      </section>

      <main className="acceso-columna">
        <div className="acceso-formulario">{children}</div>
      </main>

      <footer className="acceso-pie">
        <Link className="acceso-enlace-verificar" to="/verificar">
          <IconoEscudo tamano={20} />
          ¿Recibiste un certificado? Verifícalo aquí →
        </Link>
      </footer>
    </div>
  );
}
