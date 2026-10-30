import { VistaHistorial } from "@/components/integraciones/VistaHistorial";
import { AuditorLayout } from "./AuditorLayout";

/**
 * Sexta pestaña del Auditor (E5-F04): el mismo historial, en solo lectura y sin exportación. El aviso de solo lectura
 * certificado lo pone `AuditorLayout`; no se repite.
 */
export function AuditorIntegracionesPage() {
  return (
    <AuditorLayout>
      <div data-testid="panel-integraciones">
        <VistaHistorial soloLectura />
      </div>
    </AuditorLayout>
  );
}
