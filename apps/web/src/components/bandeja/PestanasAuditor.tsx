import { useLocation } from "react-router-dom";
import { PestanasNav } from "./PestanasNav";

const PESTANAS = [
  { id: "hdu", a: "/auditor/hdu", texto: "HDU", testId: "pestana-hdu" },
  { id: "certificados", a: "/auditor/certificados", texto: "Certificados", testId: "pestana-certificados" },
  { id: "bitacora", a: "/auditor/bitacora", texto: "Bitácora de checklist", testId: "pestana-bitacora" },
  { id: "auditoria-usuarios", a: "/auditor/auditoria-usuarios", texto: "Auditoría de usuarios", testId: "pestana-auditoria-usuarios" },
  // E4: quinta pestaña, a la derecha de las cuatro certificadas (no cambia su orden).
  { id: "impedimentos", a: "/auditor/impedimentos", texto: "Impedimentos", testId: "pestana-impedimentos" },
] as const;

/**
 * Pestañas del Auditor: cada una es una ruta con su URL y sus filtros (como `nav-portal`), no un `tablist`.
 * `/auditor` muestra la pestaña HDU sin redirigir.
 */
export function PestanasAuditor() {
  const { pathname } = useLocation();
  const activa = pathname === "/auditor" || pathname === "/auditor/" ? "hdu" : (pathname.split("/")[2] ?? "hdu");
  return <PestanasNav etiqueta="Secciones del Auditor" pestanas={PESTANAS} activa={activa} />;
}
