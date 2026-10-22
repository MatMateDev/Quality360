import { useId, useState } from "react";
import { rutaExportacion, type RecursoExportable } from "@/api/bandejas";
import { descargar, ErrorApi } from "@/lib/httpClient";
import type { FiltrosUrl } from "@/lib/filtrosUrl";

interface Props {
  recurso: RecursoExportable;
  filtros: FiltrosUrl;
  /** Filas que cumplen los filtros; con 0 el botón queda deshabilitado. */
  total: number | undefined;
  /** Motivo si la lista está cargando, en error o indisponible. */
  motivoDeshabilitado?: string;
}

type Estado =
  | { tipo: "inactivo" }
  | { tipo: "exportando" }
  | { tipo: "ok"; nombre: string; filas: number }
  | { tipo: "excede" }
  | { tipo: "error" };

function nombreArchivo(recurso: RecursoExportable): string {
  return `quality360-${recurso}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Exportación CSV del Auditor (D35, D48). Descarga autenticada con `Blob` (no un `<a href>` público) de lo
 * filtrado, no solo de la página visible. Es `type="button"`: las pantallas del Auditor no tienen submit.
 */
export function BotonExportarCsv({ recurso, filtros, total, motivoDeshabilitado }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const idMotivo = useId();

  const sinResultados = total === 0;
  const motivo = motivoDeshabilitado ?? (sinResultados ? "No hay registros con esos filtros" : undefined);
  const deshabilitado = Boolean(motivo) || total === undefined || estado.tipo === "exportando";

  async function exportar() {
    setEstado({ tipo: "exportando" });
    try {
      const archivo = await descargar(rutaExportacion(recurso, filtros));
      const nombre = archivo.nombre ?? nombreArchivo(recurso);
      const url = URL.createObjectURL(archivo.blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      setEstado({ tipo: "ok", nombre, filas: archivo.filas ?? total ?? 0 });
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 422 && error.codigo === "EXPORTACION_EXCEDE_LIMITE") {
        setEstado({ tipo: "excede" });
        // El foco va al primer filtro para que acote la consulta.
        document.querySelector<HTMLElement>('[role="group"][aria-label="Filtros"] select, [role="group"][aria-label="Filtros"] input')?.focus();
      } else {
        setEstado({ tipo: "error" });
      }
    }
  }

  return (
    <div>
      <button
        type="button"
        className="boton boton--secundario"
        data-testid="boton-exportar-csv"
        disabled={deshabilitado}
        aria-busy={estado.tipo === "exportando"}
        aria-describedby={motivo ? idMotivo : undefined}
        onClick={() => void exportar()}
      >
        {estado.tipo === "exportando" ? "Exportando…" : "⬇ Exportar CSV"}
      </button>
      {motivo ? (
        <p id={idMotivo} className="estado-exportacion">
          {motivo}
        </p>
      ) : total !== undefined ? (
        <p className="estado-exportacion" data-testid="ayuda-exportar">
          Se exportarán {total} {total === 1 ? "fila" : "filas"} con los filtros aplicados
        </p>
      ) : null}
      {estado.tipo === "ok" ? (
        <p className="estado-exportacion" role="status" data-testid="estado-exportacion-ok">
          Se descargó {estado.nombre} ({estado.filas} {estado.filas === 1 ? "fila" : "filas"})
        </p>
      ) : null}
      {estado.tipo === "excede" ? (
        <p className="mensaje-aviso" role="status" data-testid="estado-exportacion-excede">
          La exportación supera las 50.000 filas. Acota los filtros.
        </p>
      ) : null}
      {estado.tipo === "error" ? (
        <div>
          <p className="mensaje-error-global" role="alert" data-testid="estado-exportacion-error">
            No pudimos generar el archivo. Intenta de nuevo.
          </p>
          <button type="button" className="boton boton--secundario" onClick={() => void exportar()}>
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}
