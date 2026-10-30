import { Link } from "react-router-dom";
import { AvisoSoloLectura, EncabezadoBandeja } from "@/components/bandeja/Estructura";
import { VistaHistorial } from "@/components/integraciones/VistaHistorial";

/** `/qe/integraciones` (E5-F04): historial de solo lectura. Sin formularios ni acciones de escritura (D39, D107). */
export function QeIntegracionesPage() {
  return (
    <div data-testid="pagina-qe-integraciones">
      <EncabezadoBandeja etiqueta="Portal QE" titulo="Integraciones" descripcion="Consulta lo que el Administrador sincronizó o importó desde Jira o desde archivos.">
        <AvisoSoloLectura texto="Vista de solo lectura. Aquí ves lo que se sincronizó o importó; no puedes configurar ni ejecutar nada." />
        <p className="campo-ayuda" data-testid="nota-integraciones-qe">
          Las HDU nuevas llegan sin analista: las verás en tu <Link to="/qe">bandeja</Link>, en «Asignar analista».
        </p>
      </EncabezadoBandeja>
      <VistaHistorial soloLectura />
    </div>
  );
}
