import { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { esIndisponible, useEjecuciones } from "@/api/integraciones";
import { BarraFiltros, type CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { hayFiltrosActivos, type FiltrosUrl } from "@/lib/filtrosUrl";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ORIGEN_EJECUCION, INFO_RESULTADO_EJECUCION, RESULTADOS_EJECUCION } from "@/lib/mensajesIntegracion";
import { origenDe } from "@/lib/textosEjecucion";
import { ETIQUETAS_ROL, type Ejecucion } from "@/types/dominio";
import { InsigniaResultado } from "./Insignias";

const CAMPOS: CampoFiltro[] = [
  { clave: "origen", id: "filtro-origen", etiqueta: "Origen", tipo: "select", opciones: Object.entries(ETIQUETAS_ORIGEN_EJECUCION).map(([valor, etiqueta]) => ({ valor, etiqueta })) },
  { clave: "resultado", id: "filtro-resultado", etiqueta: "Resultado", tipo: "select", opciones: RESULTADOS_EJECUCION.map((r) => ({ valor: r, etiqueta: INFO_RESULTADO_EJECUCION[r].etiqueta })) },
  { clave: "desde", id: "filtro-desde", etiqueta: "Desde", tipo: "fecha" },
  { clave: "hasta", id: "filtro-hasta", etiqueta: "Hasta", tipo: "fecha" },
];

const CLAVES_FILTROS = CAMPOS.map((c) => c.clave);

/** Un contador de una ejecución en curso es «—», no 0 (todavía no cerró). */
const cifra = (e: Ejecucion, valor: number) => (e.resultado === "EN_CURSO" ? "—" : String(valor));

/** `lista-ejecuciones` (E5-F04): filtros en la URL, orden por fecha y paginación del servidor, con estados propios. */
export function TablaEjecuciones({ filtros }: { filtros: FiltrosUrl }) {
  const consulta = useEjecuciones(filtros);
  const ubicacion = useLocation();
  const idTitulo = useId();
  const datos = consulta.data;
  const conFiltros = hayFiltrosActivos(filtros, CLAVES_FILTROS);

  let estado: EstadoDatos;
  if (consulta.isError) estado = esIndisponible(consulta.error) ? "indisponible" : "error";
  else if (consulta.isLoading || !datos) estado = "cargando";
  else if (datos.total === 0) estado = "vacio";
  else estado = "ok";

  const enlaceDetalle = (id: string) => {
    const params = new URLSearchParams(ubicacion.search);
    params.set("ejecucion", id);
    return `${ubicacion.pathname}?${params.toString()}`;
  };

  const numero = (clave: keyof Pick<Ejecucion, "leidas" | "creadas" | "actualizadas" | "omitidas" | "conError">, titulo: string): Columna<Ejecucion> => ({
    id: clave,
    titulo,
    render: (e) => (
      <span className="celda-numero" style={clave === "conError" && e.conError > 0 ? { fontWeight: 700 } : undefined}>
        {cifra(e, e[clave])}
      </span>
    ),
  });

  const columnas: Columna<Ejecucion>[] = [
    { id: "resultado", titulo: "Resultado", prioritaria: true, render: (e) => <span data-testid={`celda-resultado-${e.id}`}><InsigniaResultado resultado={e.resultado} /></span> },
    { id: "fecha", titulo: "Fecha", ordenable: true, prioritaria: true, render: (e) => <time dateTime={e.iniciadaEn}>{formatearFecha(e.iniciadaEn)}</time> },
    {
      id: "origen",
      titulo: "Origen",
      render: (e) => (
        <span className="celda-titulo-corta" title={origenDe(e)}>
          {origenDe(e)}
        </span>
      ),
    },
    { id: "actor", titulo: "Actor", render: (e) => `${e.actor.nombre} (${ETIQUETAS_ROL[e.actor.rol]})` },
    numero("leidas", "Leídas"),
    numero("creadas", "Creadas"),
    numero("actualizadas", "Actualizadas"),
    numero("omitidas", "Omitidas"),
    numero("conError", "Con error"),
    {
      id: "accion",
      titulo: "Acción",
      render: (e) => (
        <Link className="boton boton--secundario" to={enlaceDetalle(e.id)} data-testid={`boton-ver-detalle-${e.id}`} aria-label={`Ver detalle de la ejecución del ${formatearFecha(e.iniciadaEn)}`}>
          Ver detalle
        </Link>
      ),
    },
  ];

  return (
    <section className="panel" aria-labelledby={idTitulo} aria-busy={estado === "cargando"}>
      <div className="panel-cabecera">
        <h2 id={idTitulo}>Ejecuciones</h2>
      </div>
      <BarraFiltros filtros={filtros} campos={CAMPOS} clave="historial" total={datos?.total} />
      <BloqueDatos
        clave={conFiltros && estado === "vacio" ? "filtros-historial" : "historial"}
        estado={estado}
        mensajeVacio={conFiltros ? "No hay ejecuciones con esos filtros" : "Aún no se ha sincronizado ni importado nada"}
        onReintentar={() => void consulta.refetch()}
      >
        {datos ? (
          <>
            <TablaBandeja
              testId="lista-ejecuciones"
              caption="Ejecuciones de integración, de la más reciente a la más antigua"
              columnas={columnas}
              items={datos.items}
              clave={(e) => e.id}
              testIdFila={(e) => `fila-ejecucion-${e.id}`}
              hrefFila={(e) => enlaceDetalle(e.id)}
              orden={filtros.orden ?? { columna: "fecha", direccion: "desc" }}
              onOrden={(columna, direccion) => filtros.set({ orden: `${columna}:${direccion}` })}
              focoPagina={filtros.pagina}
            />
            <Paginacion
              clave="historial"
              etiqueta="ejecuciones"
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
