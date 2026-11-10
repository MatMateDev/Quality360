import { useState } from "react";
import type { OrdenUrl } from "@/lib/filtrosUrl";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { formatearPorcentaje } from "@/lib/formato";
import { ESTADOS_HDU, ETIQUETAS_ESTADO_HDU, type CargaIndicadores, type EstadoHdu, type FilaCargaAnalista } from "@/types/dominio";

type Fila = { tipo: "analista"; fila: FilaCargaAnalista } | { tipo: "sin-analista"; datos: NonNullable<CargaIndicadores["sinAnalista"]> };

interface Props {
  caption: string;
  umbral: number;
  filas: FilaCargaAnalista[];
  sinAnalista?: CargaIndicadores["sinAnalista"];
  /** Etiqueta del analista que no tiene QE supervisor (Líder y Auditor, D160). */
  grupoSinQe?: boolean;
  /** QE: marca «No supervisado por ti». */
  esQe: boolean;
}

/** Tabla de carga por analista (E6-F03). Cero no es error: un analista sin HDU muestra ceros, sin estilo especial. */
export function TablaCarga({ caption, umbral, filas, sinAnalista, grupoSinQe = false, esQe }: Props) {
  const [orden, setOrden] = useState<OrdenUrl | null>(null);
  const valorOrden = (f: FilaCargaAnalista) => (orden?.columna === "analista" ? f.analista.nombre.toLowerCase() : orden?.columna === "activas" ? f.activas : f.cumplimiento.valor ?? -1);
  const ordenadas = orden ? [...filas].sort((a, b) => { const x = valorOrden(a); const y = valorOrden(b); const c = x < y ? -1 : x > y ? 1 : 0; return orden.direccion === "asc" ? c : -c; }) : filas;
  const items: Fila[] = ordenadas.map((fila) => ({ tipo: "analista" as const, fila }));
  if (sinAnalista) items.push({ tipo: "sin-analista", datos: sinAnalista });

  const columnas: Columna<Fila>[] = [
    {
      id: "analista",
      ordenable: true,
      titulo: "Analista",
      prioritaria: true,
      render: (f) =>
        f.tipo === "sin-analista" ? (
          "Sin analista asignado"
        ) : (
          <>
            {f.fila.analista.nombre}
            {!f.fila.analista.activo ? <span className="etiqueta-analista" data-testid="etiqueta-inactivo">Inactivo</span> : null}
            {esQe && f.fila.supervisadoPorMi === false ? <span className="etiqueta-analista" data-testid="etiqueta-no-supervisado">No supervisado por ti</span> : null}
            {grupoSinQe ? <span className="etiqueta-analista" data-testid="etiqueta-sin-qe">Sin QE supervisor</span> : null}
          </>
        ),
    },
    ...ESTADOS_HDU.map(
      (e: EstadoHdu): Columna<Fila> => ({
        id: e,
        titulo: ETIQUETAS_ESTADO_HDU[e],
        render: (f) => (f.tipo === "analista" ? f.fila.porEstado[e] : f.datos.porEstado[e]),
      }),
    ),
    {
      id: "activas",
      ordenable: true,
      titulo: "Activas",
      render: (f) => <strong>{f.tipo === "analista" ? f.fila.activas : f.datos.activas}</strong>,
    },
    {
      id: "cumplimiento",
      ordenable: true,
      titulo: "Cumplimiento",
      render: (f) => {
        if (f.tipo === "sin-analista") return "—";
        const c = f.fila.cumplimiento;
        if (c.estado !== "ok") return <span data-testid="estado-indisponible-cumplimiento">⛔ No disponible</span>;
        return c.valor === null ? "—" : formatearPorcentaje(c.valor);
      },
    },
    {
      id: "carga",
      titulo: "Carga",
      prioritaria: true,
      render: (f) => {
        if (f.tipo === "sin-analista") return "No se evalúa";
        if (f.fila.sinHdu) return "Sin HDU asignadas";
        return f.fila.sobrecargado ? (
          <>
            <span className="badge-sobrecarga" data-testid="insignia-sobrecarga">
              <span aria-hidden="true">▲ </span>Sobrecargado
            </span>{" "}
            {f.fila.activas} de {umbral}
          </>
        ) : (
          `${f.fila.activas} de ${umbral}`
        );
      },
    },
  ];

  return (
    <TablaBandeja
      testId="lista-carga"
      caption={caption}
      columnas={columnas}
      items={items}
      orden={orden}
      onOrden={(columna, direccion) => setOrden({ columna, direccion })}
      clave={(f) => (f.tipo === "analista" ? f.fila.analista.id : "sin-asignar")}
      testIdFila={(f) => (f.tipo === "analista" ? `fila-analista-${f.fila.analista.id}` : "fila-analista-sin-asignar")}
      claseFila={(f) => (f.tipo === "analista" && f.fila.sobrecargado ? "fila-sobrecarga" : undefined)}
      atributosFila={(f): Record<string, string> => (f.tipo === "analista" ? { "data-sobrecarga": String(f.fila.sobrecargado) } : {})}
    />
  );
}
