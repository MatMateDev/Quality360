import { Outlet } from "react-router-dom";
import { EncabezadoBandeja } from "@/components/bandeja/Estructura";
import { PestanasIntegraciones } from "@/components/integraciones/PestanasIntegraciones";

/** Contenedor del Administrador: encabezado, pestañas y la pestaña activa. Solo el Administrador entra (D41). */
export function PaginaIntegraciones() {
  return (
    <div data-testid="pagina-integraciones">
      <EncabezadoBandeja
        etiqueta="Portal Administrador"
        titulo="Integraciones"
        descripcion="Conecta Quality360 con Jira Cloud para traer historias de usuario, o impórtalas desde un archivo."
      />
      <PestanasIntegraciones />
      <Outlet />
    </div>
  );
}
