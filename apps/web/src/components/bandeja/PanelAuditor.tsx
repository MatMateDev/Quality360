import { useId } from "react";
import type { RecursoExportable } from "@/api/bandejas";
import { hayFiltrosActivos, type FiltrosUrl } from "@/lib/filtrosUrl";
import { ErrorApi } from "@/lib/httpClient";
import { BarraFiltros, type CampoFiltro } from "./BarraFiltros";
import { BotonExportarCsv } from "./BotonExportarCsv";
import { BloqueDatos, type EstadoDatos } from "./Estructura";
import { Paginacion } from "./Paginacion";
import { TablaBandeja, type Columna } from "./TablaBandeja";

interface Pagina<T> {
  items: T[];
  total: number;
  pagina: number;
  tamanoPagina: number;
}

interface Props<T> {
  /** `certificados`, `bitacora`, `auditoria-usuarios`: genera `panel-<clave>`, `lista-<clave>`, `total-<clave>`. */
  clave: RecursoExportable;
  titulo: string;
  consulta: { isLoading: boolean; isError: boolean; error: unknown; data: Pagina<T> | undefined; refetch: () => unknown };
  filtros: FiltrosUrl;
  campos: CampoFiltro[];
  columnas: Columna<T>[];
  caption: string;
  clavefila: (item: T) => string;
  /** Para quien reutiliza el panel con otra convención de testids (vistas de impedimentos del Auditor). */
  testIdPanel?: string;
  testIdTabla?: string;
}

/** Pestaña genérica del Auditor: filtros, exportación, tabla, paginación y los cuatro estados. */
export function PanelAuditor<T>({ clave, titulo, consulta, filtros, campos, columnas, caption, clavefila, testIdPanel, testIdTabla }: Props<T>) {
  const idTitulo = useId();
  const datos = consulta.data;
  // Fuente caída (503 `SERVICIO_NO_DISPONIBLE`): indisponible, no error (E7-F06-T08).
  const caida = consulta.isError && consulta.error instanceof ErrorApi && consulta.error.status === 503;
  let estado: EstadoDatos;
  if (caida) estado = "indisponible";
  else if (consulta.isError) estado = "error";
  else if (consulta.isLoading || !datos) estado = "cargando";
  else if (datos.total === 0) estado = "vacio";
  else estado = "ok";
  const conFiltros = hayFiltrosActivos(filtros, campos.map((c) => c.clave));

  return (
    <section className="panel" aria-labelledby={idTitulo} data-testid={testIdPanel ?? `panel-${clave}`} aria-busy={estado === "cargando"}>
      <div className="panel-cabecera">
        <h2 id={idTitulo}>{titulo}</h2>
        <BotonExportarCsv
          recurso={clave}
          filtros={filtros}
          total={datos?.total}
          motivoDeshabilitado={estado === "cargando" ? "Cargando…" : estado === "error" ? "No se pudo cargar la lista" : estado === "indisponible" ? "No disponible" : undefined}
        />
      </div>
      <BarraFiltros filtros={filtros} campos={campos} clave={clave} total={datos?.total} />
      <BloqueDatos
        clave={conFiltros && estado === "vacio" ? `filtros-${clave}` : clave}
        estado={estado}
        mensajeVacio={conFiltros ? "No hay registros con esos filtros" : "No hay registros"}
        onReintentar={() => consulta.refetch()}
      >
        {datos ? (
          <>
            <TablaBandeja testId={testIdTabla ?? `lista-${clave}`} caption={caption} columnas={columnas} items={datos.items} clave={clavefila} focoPagina={filtros.pagina} />
            <Paginacion
              clave={clave}
              etiqueta={titulo}
              total={datos.total}
              pagina={datos.pagina}
              tamano={datos.tamanoPagina}
              onPagina={(p) => filtros.set({ pagina: String(p) })}
              onTamano={(t) => filtros.set({ tamano: t === 25 ? undefined : String(t) })}
            />
          </>
        ) : null}
      </BloqueDatos>
    </section>
  );
}
