import { Link, useLocation } from "react-router-dom";

const PESTANAS = [
  { id: "hdu", a: "/auditor/hdu", texto: "HDU", testId: "pestana-hdu" },
  { id: "certificados", a: "/auditor/certificados", texto: "Certificados", testId: "pestana-certificados" },
  { id: "bitacora", a: "/auditor/bitacora", texto: "Bitácora de checklist", testId: "pestana-bitacora" },
  { id: "auditoria-usuarios", a: "/auditor/auditoria-usuarios", texto: "Auditoría de usuarios", testId: "pestana-auditoria-usuarios" },
] as const;

/**
 * Pestañas del Auditor: cada una es una ruta con su URL y sus filtros (como `nav-portal`), no un `tablist`.
 * `/auditor` muestra la pestaña HDU sin redirigir.
 */
export function PestanasAuditor() {
  const { pathname } = useLocation();
  const activa = pathname === "/auditor" || pathname === "/auditor/" ? "hdu" : (pathname.split("/")[2] ?? "hdu");
  return (
    <nav className="pestanas" aria-label="Secciones del Auditor">
      {PESTANAS.map((p) => (
        <Link key={p.id} to={p.a} className="pestana" data-testid={p.testId} aria-current={activa === p.id ? "page" : undefined}>
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
