import { useLocation } from "react-router-dom";
import { PestanasNav } from "@/components/bandeja/PestanasNav";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";

const PESTANAS = [
  { id: "conexion", a: RUTAS_INTEGRACIONES.conexion, texto: "Conexión", testId: "pestana-conexion" },
  { id: "sincronizar", a: RUTAS_INTEGRACIONES.sincronizar, texto: "Sincronizar", testId: "pestana-sincronizar" },
  { id: "importar", a: RUTAS_INTEGRACIONES.importar, texto: "Importar archivo", testId: "pestana-importar" },
  { id: "historial", a: RUTAS_INTEGRACIONES.historial, texto: "Historial", testId: "pestana-historial" },
] as const;

/** Pestañas del Administrador: cada una es una ruta (`aria-current`), no un `tablist`. «Conexión» es el índice, sin redirección. */
export function PestanasIntegraciones() {
  const { pathname } = useLocation();
  const segmento = pathname.replace(/\/+$/, "").split("/")[3];
  const activa = segmento ?? "conexion";
  return <PestanasNav etiqueta="Secciones de integraciones" pestanas={PESTANAS} activa={activa} />;
}
