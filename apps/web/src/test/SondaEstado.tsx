import { useLocation } from "react-router-dom";

/** Muestra el `location.state` vigente, para comprobar que una pantalla lo limpia después de leerlo. */
export function SondaEstado() {
  const ubicacion = useLocation();
  return <output data-testid="sonda-estado">{JSON.stringify(ubicacion.state)}</output>;
}
