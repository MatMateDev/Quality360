import { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { useListaImpedimentos } from "@/api/impedimentos";
import { useAnalistasAsignables } from "@/api/equipo";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { BarraFiltros, type CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BloqueDatos, EncabezadoBandeja, GrupoContadores, type EstadoDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { PestanasNav } from "@/components/bandeja/PestanasNav";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { useOpcionesCatalogo } from "@/components/bandeja/opciones";
import { PESTANAS_QE_IMPEDIMENTOS } from "@/components/impedimentos/pestanasQe";
import { RiesgoDeResumen } from "@/components/impedimentos/CeldaRiesgo";
import { DiasAbierto, InsigniaEstadoImpedimento, InsigniaNuevo } from "@/components/impedimentos/Insignias";
import { formatearFecha } from "@/lib/formato";
import { hayFiltrosActivos, useFiltrosUrl } from "@/lib/filtrosUrl";
import {
  ESTADOS_IMPEDIMENTO,
  ETIQUETAS_ESTADO_IMPEDIMENTO,
  ETIQUETAS_NIVEL_RIESGO,
  ETIQUETAS_TIPO_IMPEDIMENTO,
  NIVELES_RIESGO,
  TIPOS_IMPEDIMENTO,
  type ItemListaImpedimento,
} from "@/types/dominio";

/**
 * `/qe/impedimentos` (E4-F02): bloqueos de las HDU de su equipo, ordenados por riesgo y antigüedad (D74). Los filtros
 * viven en la URL (`?celula=` → `celulaId`, D49 y D92) y solo el QE entra (D41).
 */
export function QeImpedimentosPage() {
  const filtros = useFiltrosUrl();
  const consulta = useListaImpedimentos(filtros);
  const ubicacion = useLocation();
  const analistas = useAnalistasAsignables();
  const { opcionesCelula } = useOpcionesCatalogo();
  const idTitulo = useId();

  const campos: CampoFiltro[] = [
    { clave: "celula", id: "filtro-celula", etiqueta: "Célula", tipo: "select", opciones: opcionesCelula, vacio: "Todas" },
    { clave: "tipo", id: "filtro-tipo", etiqueta: "Tipo", tipo: "select", opciones: TIPOS_IMPEDIMENTO.map((t) => ({ valor: t, etiqueta: ETIQUETAS_TIPO_IMPEDIMENTO[t] })) },
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: ESTADOS_IMPEDIMENTO.map((e) => ({ valor: e, etiqueta: ETIQUETAS_ESTADO_IMPEDIMENTO[e] })) },
    { clave: "analista", id: "filtro-analista", etiqueta: "Analista", tipo: "select", opciones: analistas.data?.items.map((a) => ({ valor: a.id, etiqueta: a.nombre })) ?? [] },
    { clave: "riesgo", id: "filtro-riesgo", etiqueta: "Riesgo", tipo: "select", opciones: NIVELES_RIESGO.map((n) => ({ valor: n, etiqueta: ETIQUETAS_NIVEL_RIESGO[n] })) },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por código o título", tipo: "texto" },
    { clave: "resueltos", id: "filtro-incluir-resueltos", etiqueta: "Incluir resueltos", tipo: "casilla" },
  ];
  const conFiltros = hayFiltrosActivos(filtros, campos.map((c) => c.clave));

  const datos = consulta.data;
  let estado: EstadoDatos;
  if (consulta.isError) estado = "error";
  else if (consulta.isLoading || !datos) estado = "cargando";
  else if (datos.total === 0) estado = "vacio";
  else estado = "ok";

  // Orden de respaldo (D74): el riesgo depende de Certificaciones; si no respondió, el servidor ordena por días y lo informa.
  const pedido = filtros.orden?.columna ?? "riesgo";
  const ordenDeRespaldo = Boolean(datos?.orden.startsWith("diasAbierto")) && pedido !== "diasAbierto";
  const desde = `${ubicacion.pathname}${ubicacion.search}`;
  const destino = (i: ItemListaImpedimento) => `/hdu/${i.hduId}?impedimento=${i.id}#impedimentos`;

  const columnas: Columna<ItemListaImpedimento>[] = [
    { id: "riesgo", titulo: "Riesgo", ordenable: true, prioritaria: true, render: (i) => <RiesgoDeResumen riesgo={i.riesgo} /> },
    {
      id: "hdu",
      titulo: "HDU",
      render: (i) => (
        <span>
          <Link className="codigo" to={`/hdu/${i.hduId}`} state={{ desde }}>
            {i.hdu.codigo}
          </Link>
          <span className="celda-titulo"> {i.hdu.titulo}</span>
        </span>
      ),
    },
    { id: "celula", titulo: "Célula", render: (i) => i.celula.nombre },
    { id: "analista", titulo: "Analista", render: (i) => i.analista?.nombre ?? "Sin asignar" },
    { id: "tipo", titulo: "Tipo", render: (i) => ETIQUETAS_TIPO_IMPEDIMENTO[i.tipo] },
    { id: "titulo", titulo: "Impedimento", render: (i) => <span className="celda-titulo">{i.titulo}</span> },
    { id: "estado", titulo: "Estado", prioritaria: true, render: (i) => <InsigniaEstadoImpedimento estado={i.estado} /> },
    { id: "responsable", titulo: "Responsable", render: (i) => `${i.responsable.nombre}${i.responsable.externo ? " (externo)" : ""}` },
    { id: "diasAbierto", titulo: "Días abiertos", ordenable: true, render: (i) => <DiasAbierto dias={i.diasAbierto} resuelto={i.estado === "RESUELTO"} /> },
    {
      id: "fechaRegistro",
      titulo: "Registrado",
      ordenable: true,
      render: (i) => (
        <span>
          <time dateTime={i.fechaRegistro}>{formatearFecha(i.fechaRegistro)}</time> {i.esNuevo ? <InsigniaNuevo /> : null}
        </span>
      ),
    },
    {
      id: "accion",
      titulo: "Acción",
      render: (i) => (
        <span>
          <Link
            className="boton boton--secundario"
            to={destino(i)}
            state={{ desde }}
            data-testid={`boton-abrir-impedimento-${i.id}`}
            aria-label={`Abrir impedimento: ${i.titulo}`}
          >
            Abrir
          </Link>
          {i.soloLectura ? (
            <span className="texto-solo-lectura" data-testid="texto-solo-lectura">
              Solo lectura
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  const metrica = (id: string, titulo: string, valor: number | undefined, atencion = false) => (
    <TarjetaMetrica
      id={id}
      clave={id}
      titulo={titulo}
      estado={consulta.isError ? "error" : valor === undefined ? "cargando" : "ok"}
      valor={valor}
      atencion={atencion}
      onReintentar={() => consulta.refetch()}
    />
  );

  return (
    <div data-testid="pagina-qe-impedimentos">
      <EncabezadoBandeja etiqueta="Portal QE" titulo="Impedimentos" descripcion="Bloqueos de las HDU de tu equipo, ordenados por riesgo y antigüedad.">
        <PestanasNav etiqueta="Secciones de impedimentos" pestanas={PESTANAS_QE_IMPEDIMENTOS} activa="impedimentos" />
      </EncabezadoBandeja>

      <GrupoContadores compacto>
        {metrica("abiertos", "Abiertos", datos?.contadores.abiertos, true)}
        {metrica("escalados", "Escalados", datos?.contadores.escalados)}
        {metrica("nuevos", "Nuevos (24 h)", datos?.contadores.nuevos)}
      </GrupoContadores>

      <section className="panel" aria-labelledby={idTitulo} aria-busy={estado === "cargando"}>
        <div className="panel-cabecera">
          <h2 id={idTitulo}>Impedimentos de mi equipo</h2>
        </div>
        <BarraFiltros filtros={filtros} campos={campos} clave="impedimentos" total={datos?.total} />
        {ordenDeRespaldo ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-orden-por-dias">
            <span aria-hidden="true">ⓘ </span>Ordenamos solo por días abiertos porque el riesgo no está disponible.
          </p>
        ) : null}
        <BloqueDatos
          clave={conFiltros && estado === "vacio" ? "filtros-impedimentos" : "impedimentos"}
          estado={estado}
          mensajeVacio={conFiltros ? "No hay impedimentos con esos filtros" : "Tu equipo no tiene bloqueos"}
          tonoVacio={conFiltros ? undefined : "exito"}
          onReintentar={() => consulta.refetch()}
        >
          {datos ? (
            <>
              <TablaBandeja
                testId="lista-impedimentos"
                caption="Impedimentos de mi equipo, ordenados por riesgo y días abiertos"
                columnas={columnas}
                items={datos.items}
                clave={(i) => i.id}
                testIdFila={(i) => `fila-impedimento-${i.id}`}
                hrefFila={destino}
                orden={filtros.orden}
                onOrden={(columna, direccion) => filtros.set({ orden: `${columna}:${direccion}` })}
                focoPagina={filtros.pagina}
              />
              <Paginacion
                clave="impedimentos"
                etiqueta="Impedimentos"
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
