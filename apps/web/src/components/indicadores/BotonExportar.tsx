import { useEffect, useId, useRef, useState } from "react";
import { exportarIndicadores, type FiltrosIndicadores } from "@/api/indicadores";
import { filtrosDeUrl } from "@/components/indicadores/contexto";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { ErrorApi } from "@/lib/httpClient";
import { SIN_SPRINT, type FormatoExportacionIndicadores, type OpcionesFiltroIndicadores, type VistaIndicadores } from "@/types/dominio";

interface Props {
  vista: VistaIndicadores;
  filtros: FiltrosUrl;
  opciones: OpcionesFiltroIndicadores | undefined;
  /** La pestaña está cargando: solo entonces se deshabilita (el servidor decide si hay datos, E6 §7). */
  cargando: boolean;
}

type Resultado =
  | { tipo: "ninguno" }
  | { tipo: "generando" }
  | { tipo: "ok"; nombre: string; filas: number | null }
  | { tipo: "error"; mensaje: string; excede: boolean };

const NOMBRE_VISTA: Record<VistaIndicadores, string> = { cumplimiento: "Cumplimiento", semaforo: "Semáforo", carga: "Carga", tendencia: "Tendencia" };

/** Cada vista exporta con los filtros que ella usa: el Semáforo no filtra por sprint (3.4). */
function filtrosDeVista(vista: VistaIndicadores, f: FiltrosIndicadores): FiltrosIndicadores {
  if (vista === "semaforo") return { celulaId: f.celulaId };
  if (vista === "tendencia") return f;
  return { celulaId: f.celulaId, sprintId: f.sprintId };
}

function mensajeDe(error: unknown, formato: FormatoExportacionIndicadores): { mensaje: string; excede: boolean } {
  if (error instanceof ErrorApi) {
    if (error.status === 503 && error.codigo === "INDICADORES_NO_DISPONIBLES") return { mensaje: "No se pudo generar el reporte: hay datos no disponibles", excede: false };
    if (error.status === 422 && error.codigo === "EXPORTACION_EXCEDE_LIMITE") {
      return { mensaje: formato === "pdf" ? "El reporte tiene demasiadas filas para un PDF. Usa CSV." : "El reporte tiene demasiadas filas. Acota los filtros.", excede: formato === "csv" };
    }
    if (error.status === 403) return { mensaje: "Ya no tienes permiso para esta acción", excede: false };
  }
  return { mensaje: "No fue posible generar el reporte. Intenta nuevamente.", excede: false };
}

/**
 * Exportar la pestaña activa en CSV o PDF (E6-F04#2, §7): descarga autenticada con `Blob` y el nombre que entrega
 * `Content-Disposition`. No hay patrón ARIA `menu`: son dos botones simples y tabulables.
 */
export function BotonExportar({ vista, filtros, opciones, cargando }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<Resultado>({ tipo: "ninguno" });
  const raiz = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const idPanel = useId();
  const idAyuda = useId();

  const f = filtrosDeVista(vista, filtrosDeUrl(filtros));
  const clave = JSON.stringify([vista, f]);
  // El mensaje se borra al cambiar de pestaña o de filtro.
  useEffect(() => setResultado({ tipo: "ninguno" }), [clave]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const partes: string[] = [];
  if (f.celulaId) partes.push(`Célula: ${opciones?.celulas.find((c) => c.id === f.celulaId)?.nombre ?? f.celulaId}`);
  if (f.sprintId) partes.push(`Sprint: ${f.sprintId === SIN_SPRINT ? "Sin sprint" : (opciones?.sprints.find((s) => s.id === f.sprintId)?.nombre ?? f.sprintId)}`);
  if (f.desde) partes.push(`Desde: ${f.desde}`);
  if (f.hasta) partes.push(`Hasta: ${f.hasta}`);
  const ayuda = `Se exportará la pestaña ${NOMBRE_VISTA[vista]} ${partes.length ? `con los filtros aplicados (${partes.join(" · ")})` : "sin filtros"}.`;

  const generando = resultado.tipo === "generando";

  async function exportar(formato: FormatoExportacionIndicadores) {
    setAbierto(false);
    setResultado({ tipo: "generando" });
    disparador.current?.focus();
    try {
      const archivo = await exportarIndicadores(vista, formato, f);
      const nombre = archivo.nombre ?? `quality360-indicadores-${vista}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.${formato}`;
      const url = URL.createObjectURL(archivo.blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      setResultado({ tipo: "ok", nombre, filas: archivo.filas });
    } catch (error) {
      const { mensaje, excede } = mensajeDe(error, formato);
      setResultado({ tipo: "error", mensaje, excede });
      if (excede) document.querySelector<HTMLElement>('[role="group"][aria-label="Filtros"] select, [role="group"][aria-label="Filtros"] input')?.focus();
    }
  }

  return (
    <div
      className="exportar"
      ref={raiz}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          e.stopPropagation();
          setAbierto(false);
          disparador.current?.focus();
        }
      }}
    >
      <button
        ref={disparador}
        type="button"
        className="boton boton--secundario"
        data-testid="boton-exportar"
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={idPanel}
        aria-describedby={idAyuda}
        aria-busy={generando}
        disabled={cargando || generando}
        onClick={() => setAbierto((v) => !v)}
      >
        {generando ? "Generando…" : "⬇ Exportar ▾"}
      </button>
      {abierto ? (
        <div className="panel-exportar" id={idPanel}>
          <button type="button" className="boton boton--secundario" data-testid="boton-exportar-csv" onClick={() => void exportar("csv")}>
            Descargar CSV
          </button>
          <button type="button" className="boton boton--secundario" data-testid="boton-exportar-pdf" onClick={() => void exportar("pdf")}>
            Descargar PDF
          </button>
        </div>
      ) : null}
      <p id={idAyuda} className="campo-ayuda" data-testid="ayuda-exportar">
        {ayuda}
      </p>
      <div data-testid="estado-exportacion">
        {generando ? (
          <p role="status">Generando el reporte…</p>
        ) : resultado.tipo === "ok" ? (
          <p role="status" data-testid="estado-exportacion-ok">
            Se descargó {resultado.nombre}
            {resultado.filas === 0 ? ". El archivo indica que no hay datos para los filtros aplicados" : ""}
          </p>
        ) : resultado.tipo === "error" ? (
          <p className="mensaje-error-global" role="alert" data-testid="estado-exportacion-error">
            {resultado.mensaje}
          </p>
        ) : null}
      </div>
    </div>
  );
}
