import { VistaHistorial } from "@/components/integraciones/VistaHistorial";

/** Pestaña «Historial» del Administrador: el historial en sí no tiene botones de escritura. */
export function PaginaHistorial() {
  return <VistaHistorial soloLectura={false} />;
}
