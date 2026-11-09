import { Link } from "react-router-dom";
import { AvisoSoloLectura, EncabezadoBandeja } from "@/components/bandeja/Estructura";
import { VistaHistorial } from "@/components/integraciones/VistaHistorial";

/** `/qe/integraciones` (E5-F04): historial de solo lectura. Sin formularios ni acciones de escritura (D39, D107). */
export function QeIntegracionesPage() {
  return (
    <div data-testid="pagina-qe-integraciones">
      <EncabezadoBandeja etiqueta="Portal QE" titulo="Integraciones" descripcion="Consulta lo que el Administrador consultó, confirmó o importó desde Jira o desde archivos.">
        <AvisoSoloLectura texto="Vista de solo lectura. Aquí ves lo que se sincronizó o importó; no puedes configurar ni ejecutar nada." />
        <p className="campo-ayuda" data-testid="nota-integraciones-qe">
          Las HDU que el Administrador crea desde Jira llegan asignadas. Las importadas desde un archivo llegan sin analista: las verás en <Link to="/qe">«Asignar analista»</Link>.
        </p>
      </EncabezadoBandeja>
      <VistaHistorial soloLectura />
    </div>
  );
}
