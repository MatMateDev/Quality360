import { useEffect, useRef } from "react";
import { useEstadoIntegracion } from "@/api/integraciones";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { DetalleEjecucion } from "./DetalleEjecucion";
import { PanelUltimaEjecucion } from "./PanelUltimaEjecucion";
import { TablaEjecuciones } from "./TablaEjecuciones";

interface Props {
  /** QE y Auditor: el historial no tiene ningún control de escritura, enlace a otra pestaña ni `<form>` (D39, D107). */
  soloLectura: boolean;
}

/**
 * Historial de ejecuciones y detalle (`?ejecucion=<id>`), compartido por el Administrador, el QE y el Auditor. Lo único
 * que cambia entre anfitriones es `soloLectura`; el filtro, el orden, la página y la ejecución abierta viven en la URL.
 */
export function VistaHistorial({ soloLectura }: Props) {
  const filtros = useFiltrosUrl();
  const abierta = filtros.get("ejecucion");
  const estado = useEstadoIntegracion({ habilitado: !soloLectura });
  const anterior = useRef<string>("");

  // Al volver de un detalle, el foco regresa al «Ver detalle» de la fila de origen.
  useEffect(() => {
    if (!abierta && anterior.current) {
      const id = anterior.current;
      setTimeout(() => document.querySelector<HTMLElement>(`[data-testid="boton-ver-detalle-${id}"]`)?.focus(), 0);
    }
    anterior.current = abierta;
  }, [abierta]);

  if (abierta) {
    return <DetalleEjecucion id={abierta} filtros={filtros} soloLectura={soloLectura} continuarId={estado.data?.continuar?.ejecucionId} />;
  }
  return (
    <div data-testid="vista-historial">
      <PanelUltimaEjecucion />
      <TablaEjecuciones filtros={filtros} />
    </div>
  );
}
