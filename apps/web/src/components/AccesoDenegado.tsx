import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { rutaPortal } from "@/types/dominio";

interface Props {
  /**
   * `seccion`: ruta de un portal ajeno (D41). `recurso`: HDU fuera de ámbito o inexistente (E2-F04#2).
   * Ninguna variante revela nombre, id ni rol requerido.
   */
  variante?: "seccion" | "recurso";
}

/** Pantalla ante un 403 `ACCESO_DENEGADO` (D12, D41). El foco va al `h1`. */
export function AccesoDenegado({ variante = "recurso" }: Props) {
  const { perfil } = useAuth();
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  return (
    <div className="acceso-denegado" data-testid="acceso-denegado" role="alert">
      <h1 ref={titulo} tabIndex={-1}>
        Acceso denegado
      </h1>
      <p>{variante === "seccion" ? "No tienes acceso a esta sección." : "No tienes acceso a este recurso."}</p>
      {perfil ? (
        <div className="acceso-denegado__acciones">
          <Link className="boton boton--primario" to={rutaPortal(perfil.rol)} data-testid="boton-ir-a-mi-bandeja">
            Ir a mi bandeja
          </Link>
        </div>
      ) : null}
    </div>
  );
}
