import { useId, type ReactNode } from "react";
import { hayFiltrosActivos, type FiltrosUrl } from "@/lib/filtrosUrl";
import type { BloqueListaHdu, ItemBandejaHdu } from "@/types/dominio";
import { BarraFiltros, type CampoFiltro } from "./BarraFiltros";
import { BloqueDatos, type EstadoDatos } from "./Estructura";
import { Paginacion } from "./Paginacion";
import { TablaBandeja, type Columna } from "./TablaBandeja";

interface Props {
  /** Clave de la lista: `mis-hdu`, `hdu-lider`, `auditor-hdu`… */
  clave: string;
  titulo: string;
  descripcion?: string;
  consulta: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  bloque: BloqueListaHdu | undefined;
  filtros: FiltrosUrl;
  campos: CampoFiltro[];
  columnas: Columna<ItemBandejaHdu>[];
  caption: string;
  vacioSinFiltros: string;
  vacioConFiltros?: string;
  /** Contenido a la derecha de la cabecera (p. ej. «Exportar CSV»). */
  acciones?: ReactNode;
  /** Se notifica el total filtrado (para habilitar la exportación). */
  children?: ReactNode;
  /** `data-testid` de la tabla. */
  testIdTabla: string;
  etiquetaPlural?: string;
}

/** Panel de lista de HDU con filtros en la URL, orden, paginación y los cuatro estados (D34). */
export function PanelListaHdu(props: Props) {
  const { clave, titulo, descripcion, consulta, bloque, filtros, campos, columnas, caption, vacioSinFiltros, vacioConFiltros, acciones, children, testIdTabla, etiquetaPlural } = props;
  const idTitulo = useId();
  const conFiltros = hayFiltrosActivos(filtros, campos.map((c) => c.clave));

  const datos = bloque?.estado === "ok" ? bloque.datos : undefined;
  let estado: EstadoDatos;
  if (consulta.isError) estado = "error";
  else if (consulta.isLoading || !bloque) estado = "cargando";
  else if (bloque.estado !== "ok") estado = "indisponible";
  else if (bloque.datos.total === 0) estado = "vacio";
  else estado = "ok";

  return (
    <section className="panel" aria-labelledby={idTitulo} aria-busy={estado === "cargando"}>
      <div className="panel-cabecera">
        <div>
          <h2 id={idTitulo}>{titulo}</h2>
          {descripcion ? <p>{descripcion}</p> : null}
        </div>
        {acciones}
      </div>

      <BarraFiltros filtros={filtros} campos={campos} clave={clave} total={datos?.total} etiquetaPlural={etiquetaPlural} />
      {children}

      <BloqueDatos
        clave={conFiltros && estado === "vacio" ? `filtros-${clave}` : clave}
        estado={estado}
        mensajeVacio={conFiltros ? (vacioConFiltros ?? "No hay HDU con esos filtros") : vacioSinFiltros}
        onReintentar={() => consulta.refetch()}
      >
        {datos ? (
          <>
            <TablaBandeja
              testId={testIdTabla}
              caption={caption}
              columnas={columnas}
              items={datos.items}
              clave={(h) => h.id}
              testIdFila={(h) => `fila-hdu-${h.id}`}
              hrefFila={(h) => `/hdu/${h.id}`}
              orden={filtros.orden}
              onOrden={(columna, direccion) => filtros.set({ orden: `${columna}:${direccion}` })}
              focoPagina={filtros.pagina}
            />
            <Paginacion
              clave={clave}
              etiqueta={titulo}
              total={datos.total}
              pagina={datos.pagina}
              tamano={datos.tamanoPagina}
              onPagina={(pagina) => filtros.set({ pagina: String(pagina) })}
              onTamano={(tamano) => filtros.set({ tamano: tamano === 25 ? undefined : String(tamano) })}
            />
          </>
        ) : null}
      </BloqueDatos>
    </section>
  );
}
