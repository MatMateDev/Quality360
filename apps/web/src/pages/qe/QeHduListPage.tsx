import { Link } from "react-router-dom";
import { HduListado } from "@/components/HduListado";

/** "Historias supervisadas" del QE, con los mismos filtros del listado de HDU. */
export function QeHduListPage() {
  return (
    <HduListado
      titulo="Historias supervisadas"
      descripcion="HDU donde eres responsable o cuyo analista supervisas hoy."
      idBloque="hdu-supervisadas"
      mostrarColumnaAnalista
      accionesCabecera={
        <Link className="boton boton--primario" to="/qe/hdu/nueva">
          + Nueva HDU
        </Link>
      }
    />
  );
}
