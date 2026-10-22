import type { BloqueIndisponible } from "./tiposBloque";
import type { SeguimientoHdu } from "@/types/dominio";

/** Celda «No disponible» (fuente caída): nunca `0`, `—` ni vacía (D34). */
export function CeldaNoDisponible({ clave }: { clave: string }) {
  return (
    <span data-testid={`estado-indisponible-${clave}`} className="tarjeta-resumen__valor--indisponible">
      No disponible
    </span>
  );
}

type Bloque = { estado: "ok"; datos: SeguimientoHdu } | BloqueIndisponible;

/** `n/10 · %` obligatorio (D16) + barra decorativa, o «No disponible». */
export function CeldaAvance({ hduId, seguimiento }: { hduId: string; seguimiento: Bloque }) {
  if (seguimiento.estado !== "ok") return <CeldaNoDisponible clave="avance" />;
  const { aprobados, porcentaje } = seguimiento.datos;
  return (
    <div data-testid={`celda-avance-${hduId}`}>
      {aprobados}/10 · {porcentaje} %
      <div className="barra-progreso" aria-hidden="true">
        <div style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}

/** Insignia «N observación(es)» con ícono y texto (nunca solo color). */
export function InsigniaObservaciones({ hduId, cantidad }: { hduId: string; cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <span className="badge badge-observacion" data-testid={`insignia-observaciones-${hduId}`}>
      <span aria-hidden="true">▲ </span>
      {cantidad} {cantidad === 1 ? "observación" : "observaciones"}
    </span>
  );
}

export function ChipCelula({ id, nombre }: { id: string; nombre: string }) {
  return (
    <li className="chip" data-testid={`chip-celula-${id}`}>
      {nombre}
    </li>
  );
}
