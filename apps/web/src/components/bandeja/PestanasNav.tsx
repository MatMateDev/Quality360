import { Link } from "react-router-dom";

export interface PestanaNav {
  id: string;
  a: string;
  texto: string;
  testId: string;
}

interface Props {
  etiqueta: string;
  pestanas: readonly PestanaNav[];
  activa: string;
  /** Clase adicional (p. ej. `pestanas--vistas`). */
  clase?: string;
}

/**
 * Navegación por pestañas: cada una es una ruta (o una URL con filtros) y se marca con `aria-current`, no un
 * `tablist` (mismo patrón de `nav-portal`). La usan el Auditor, el QE (Impedimentos / Riesgo por HDU) y las
 * vistas de la pestaña de impedimentos del Auditor.
 */
export function PestanasNav({ etiqueta, pestanas, activa, clase }: Props) {
  return (
    <nav className={`pestanas${clase ? ` ${clase}` : ""}`} aria-label={etiqueta}>
      {pestanas.map((p) => (
        <Link key={p.id} to={p.a} className="pestana" data-testid={p.testId} aria-current={activa === p.id ? "page" : undefined}>
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
