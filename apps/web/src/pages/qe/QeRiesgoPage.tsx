import { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { useListaRiesgo } from "@/api/riesgo";
import { useAnalistasAsignables } from "@/api/equipo";
import { InsigniaEstadoHdu } from "@/components/Etiquetas";
import { BarraFiltros, type CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { CeldaNoDisponible } from "@/components/bandeja/Celdas";
import { BloqueDatos, EncabezadoBandeja, type EstadoDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { PestanasNav } from "@/components/bandeja/PestanasNav";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { useOpcionesCatalogo } from "@/components/bandeja/opciones";
import { RiesgoDeResumen } from "@/components/impedimentos/CeldaRiesgo";
import { InsigniaBloqueo } from "@/components/impedimentos/Insignias";
import { PESTANAS_QE_IMPEDIMENTOS } from "@/components/impedimentos/pestanasQe";
import { ErrorApi } from "@/lib/httpClient";
import { hayFiltrosActivos, useFiltrosUrl } from "@/lib/filtrosUrl";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_NIVEL_RIESGO, NIVELES_RIESGO, type ItemRiesgoHdu } from "@/types/dominio";

/**
 * `/qe/impedimentos/riesgo` (E4-F04#3): nivel de riesgo vigente de las HDU de su ámbito. Con Certificaciones caída,
 * las HDU con nivel fijado lo muestran y las demás dicen «No disponible»; un filtro por nivel deja la lista
 * indisponible (D46), nunca sin filtrar.
 */
export function QeRiesgoPage() {
  const filtros = useFiltrosUrl();
  const consulta = useListaRiesgo(filtros);
  const ubicacion = useLocation();
  const analistas = useAnalistasAsignables();
  const { opcionesCelula, opcionesSprint, opcionesEstado } = useOpcionesCatalogo();
  const idTitulo = useId();

  const campos: CampoFiltro[] = [
    { clave: "nivel", id: "filtro-nivel", etiqueta: "Nivel", tipo: "select", opciones: NIVELES_RIESGO.map((n) => ({ valor: n, etiqueta: ETIQUETAS_NIVEL_RIESGO[n] })) },
    { clave: "celula", id: "filtro-celula", etiqueta: "Célula", tipo: "select", opciones: opcionesCelula, vacio: "Todas" },
    { clave: "sprint", id: "filtro-sprint", etiqueta: "Sprint", tipo: "select", opciones: opcionesSprint },
    { clave: "analista", id: "filtro-analista", etiqueta: "Analista", tipo: "select", opciones: analistas.data?.items.map((a) => ({ valor: a.id, etiqueta: a.nombre })) ?? [] },
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: opcionesEstado, vacio: "No cerradas" },
    { clave: "solo-bloq", id: "filtro-solo-bloqueadas", etiqueta: "Solo bloqueadas", tipo: "casilla" },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por código o título", tipo: "texto" },
  ];
  const conFiltros = hayFiltrosActivos(filtros, campos.map((c) => c.clave));

  const datos = consulta.data;
  let estado: EstadoDatos;
  if (consulta.isError) estado = consulta.error instanceof ErrorApi && consulta.error.status === 503 ? "indisponible" : "error";
  else if (consulta.isLoading || !datos) estado = "cargando";
  else if (datos.total === 0) estado = "vacio";
  else estado = "ok";

  const hayRiesgoCaido = Boolean(datos?.items.some((i) => i.riesgo.estado === "indisponible"));
  const desde = `${ubicacion.pathname}${ubicacion.search}`;

  const columnas: Columna<ItemRiesgoHdu>[] = [
    {
      id: "riesgo",
      titulo: "Nivel",
      ordenable: true,
      prioritaria: true,
      render: (i) => (
        <span data-testid={`celda-riesgo-${i.hdu.id}`}>
          <RiesgoDeResumen riesgo={i.riesgo} />
        </span>
      ),
    },
    {
      id: "codigo",
      titulo: "HDU",
      ordenable: true,
      render: (i) => (
        <Link className="codigo" to={`/hdu/${i.hdu.id}`} state={{ desde }}>
          {i.hdu.codigo}
        </Link>
      ),
    },
    { id: "titulo", titulo: "Título", render: (i) => <span className="celda-titulo">{i.hdu.titulo}</span> },
    { id: "celula", titulo: "Célula", render: (i) => i.celula.nombre },
    { id: "sprint", titulo: "Sprint", render: (i) => i.sprint.nombre },
    { id: "analista", titulo: "Analista", render: (i) => i.analista?.nombre ?? "Sin asignar" },
    { id: "estado", titulo: "Estado", render: (i) => <InsigniaEstadoHdu estado={i.hdu.estado} /> },
    {
      id: "avance",
      titulo: "Avance",
      render: (i) =>
        i.avance === null ? (
          <CeldaNoDisponible clave="avance" />
        ) : (
          <span data-testid={`celda-avance-${i.hdu.id}`}>
            {Math.round(i.avance / 10)}/10 · {i.avance} %
          </span>
        ),
    },
    {
      id: "impedimentosAbiertos",
      titulo: "Impedimentos abiertos",
      ordenable: true,
      render: (i) => (
        <span>
          {i.impedimentosAbiertos} {i.bloqueada ? <InsigniaBloqueo /> : null}
        </span>
      ),
    },
    { id: "origen", titulo: "Origen", render: (i) => (i.riesgo.origen === "MANUAL" ? "Fijado" : i.riesgo.origen === "SUGERIDO" ? "Sugerido" : "—") },
    { id: "actualizado", titulo: "Actualizado", render: (i) => (i.actualizadoEn ? <time dateTime={i.actualizadoEn}>{formatearFecha(i.actualizadoEn)}</time> : "—") },
  ];

  return (
    <div data-testid="pagina-qe-riesgo">
      <EncabezadoBandeja etiqueta="Portal QE" titulo="Riesgo por HDU" descripcion="Nivel de riesgo vigente de las HDU de tu equipo.">
        <PestanasNav etiqueta="Secciones de impedimentos" pestanas={PESTANAS_QE_IMPEDIMENTOS} activa="riesgo" />
      </EncabezadoBandeja>

      <section className="panel" aria-labelledby={idTitulo} aria-busy={estado === "cargando"}>
        <div className="panel-cabecera">
          <h2 id={idTitulo}>Riesgo por HDU</h2>
        </div>
        <BarraFiltros filtros={filtros} campos={campos} clave="riesgo" total={datos?.total} />
        {hayRiesgoCaido ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-orden-por-dias">
            <span aria-hidden="true">ⓘ </span>El riesgo de algunas HDU no está disponible; las listamos por impedimentos abiertos y código.
          </p>
        ) : null}
        <BloqueDatos
          clave={conFiltros && estado === "vacio" ? "filtros-riesgo" : "riesgo"}
          estado={estado}
          mensajeVacio={conFiltros ? "No hay HDU con ese nivel de riesgo" : "No tienes HDU en tu ámbito"}
          mensajeIndisponible="No disponible"
          onReintentar={() => consulta.refetch()}
        >
          {datos ? (
            <>
              <TablaBandeja
                testId="lista-riesgo"
                caption="Riesgo por HDU, de mayor a menor nivel"
                columnas={columnas}
                items={datos.items}
                clave={(i) => i.hdu.id}
                testIdFila={(i) => `fila-riesgo-${i.hdu.id}`}
                hrefFila={(i) => `/hdu/${i.hdu.id}#riesgo`}
                orden={filtros.orden}
                onOrden={(columna, direccion) => filtros.set({ orden: `${columna}:${direccion}` })}
                focoPagina={filtros.pagina}
              />
              <Paginacion
                clave="riesgo"
                etiqueta="Riesgo por HDU"
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
    </div>
  );
}
