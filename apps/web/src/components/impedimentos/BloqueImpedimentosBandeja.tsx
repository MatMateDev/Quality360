import { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ROL, ETIQUETAS_TIPO_IMPEDIMENTO, type BloqueListaImpedimentos, type ItemImpedimentoBandeja } from "@/types/dominio";
import { BloqueDatos, type EstadoDatos } from "../bandeja/Estructura";
import { TablaBandeja, type Columna } from "../bandeja/TablaBandeja";
import { RiesgoDeResumen } from "./CeldaRiesgo";
import { DiasAbierto, InsigniaEstadoImpedimento, InsigniaNuevo } from "./Insignias";

export type VarianteBloque = "qe" | "lider" | "admin";

interface Props {
  variante: VarianteBloque;
  titulo: string;
  descripcion?: string;
  /** Clave de los estados: `impedimentos` o `impedimentos-escalados`. */
  clave: string;
  testIdTabla: string;
  consulta: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  bloque: BloqueListaImpedimentos | undefined;
  vacio: string;
  tonoVacio?: "exito";
  /** QE: enlace «Ver todos» a `/qe/impedimentos`. */
  verTodos?: boolean;
}

/**
 * Lista compacta de impedimentos de una bandeja (diseño E4 §7): QE (10 más recientes y «Ver todos»), Líder (todos los
 * abiertos de sus células, los escalados a él primero, solo lectura) y Administrador (solo los escalados a él).
 * Nunca hay botones de gestión: gestiona el QE responsable en el detalle (D57, D83).
 */
export function BloqueImpedimentosBandeja({ variante, titulo, descripcion, clave, testIdTabla, consulta, bloque, vacio, tonoVacio, verTodos = false }: Props) {
  const idTitulo = useId();
  const ubicacion = useLocation();
  const desde = `${ubicacion.pathname}${ubicacion.search}`;

  let estado: EstadoDatos;
  if (consulta.isError) estado = "error";
  else if (consulta.isLoading) estado = "cargando";
  else if (!bloque) estado = "indisponible";
  else if (bloque.estado !== "ok") estado = "indisponible";
  else if (bloque.datos.items.length === 0) estado = "vacio";
  else estado = "ok";
  const datos = bloque?.estado === "ok" ? bloque.datos : undefined;

  const destino = (i: ItemImpedimentoBandeja) => (variante === "qe" ? `/hdu/${i.hdu.id}?impedimento=${i.id}#impedimentos` : `/hdu/${i.hdu.id}`);
  type Col = Columna<ItemImpedimentoBandeja>;
  const riesgo: Col = { id: "riesgo", titulo: "Riesgo", prioritaria: true, render: (i) => <RiesgoDeResumen riesgo={i.riesgo} /> };
  const hdu: Col = {
    id: "hdu",
    titulo: "HDU",
    render: (i) => (
      <Link className="codigo" to={`/hdu/${i.hdu.id}`} state={{ desde }}>
        {i.hdu.codigo}
      </Link>
    ),
  };
  const celula: Col = { id: "celula", titulo: "Célula", render: (i) => i.celula.nombre };
  const analista: Col = { id: "analista", titulo: "Analista", render: (i) => i.analista?.nombre ?? "Sin asignar" };
  const tipo: Col = { id: "tipo", titulo: "Tipo", render: (i) => ETIQUETAS_TIPO_IMPEDIMENTO[i.tipo] };
  const impedimento: Col = { id: "titulo", titulo: "Impedimento", render: (i) => <span className="celda-titulo">{i.titulo}</span> };
  const estadoCol: Col = { id: "estado", titulo: "Estado", prioritaria: variante !== "admin", render: (i) => <InsigniaEstadoImpedimento estado={i.estado} /> };
  const dias: Col = {
    id: "dias",
    titulo: "Días",
    render: (i) => (
      <span>
        <DiasAbierto dias={i.diasAbierto} /> {variante === "qe" && i.esNuevo ? <InsigniaNuevo /> : null}
      </span>
    ),
  };
  const responsable: Col = {
    id: "responsable",
    titulo: "Responsable",
    render: (i) => (
      <span>
        {i.responsable.nombre}
        {i.escaladoAMi ? (
          <>
            {" "}
            <span className="badge badge-imp-escalado" data-testid="insignia-escalado-a-mi">
              Escalado a ti
            </span>
          </>
        ) : null}
      </span>
    ),
  };
  const registradoPor: Col = {
    id: "registrado",
    titulo: "Registrado por",
    render: (i) => (i.creadoPor ? `${i.creadoPor.nombre} · ${ETIQUETAS_ROL[i.creadoPor.rol]}` : "—"),
  };
  const fecha: Col = { id: "fecha", titulo: "Registrado", render: (i) => <time dateTime={i.fechaRegistro}>{formatearFecha(i.fechaRegistro)}</time> };

  const columnas: Col[] =
    variante === "qe"
      ? [riesgo, hdu, analista, tipo, impedimento, estadoCol, dias]
      : variante === "lider"
        ? [riesgo, hdu, celula, analista, tipo, impedimento, estadoCol, responsable, dias]
        : [hdu, celula, impedimento, estadoCol, registradoPor, dias, fecha];

  return (
    <section className="panel" aria-labelledby={idTitulo} aria-busy={estado === "cargando"}>
      <div className="panel-cabecera">
        <div>
          <h3 id={idTitulo} style={{ margin: 0, fontSize: 18 }}>
            {titulo}
          </h3>
          {descripcion ? <p>{descripcion}</p> : null}
        </div>
        {verTodos && estado === "ok" ? (
          <Link className="boton boton--secundario" to="/qe/impedimentos" data-testid="enlace-ver-todos-impedimentos">
            Ver todos →
          </Link>
        ) : null}
      </div>
      <BloqueDatos clave={clave} estado={estado} mensajeVacio={vacio} tonoVacio={tonoVacio} mensajeIndisponible="No disponible" onReintentar={() => consulta.refetch()}>
        {datos ? (
          <>
            <TablaBandeja
              testId={testIdTabla}
              caption={titulo}
              columnas={columnas}
              items={datos.items}
              clave={(i) => i.id}
              testIdFila={(i) => `fila-impedimento-${i.id}`}
              hrefFila={destino}
            />
            {datos.total > datos.items.length ? (
              <p className="campo-ayuda" data-testid={`total-${clave}`}>
                Mostrando {datos.items.length} de {datos.total}.
              </p>
            ) : null}
          </>
        ) : null}
      </BloqueDatos>
    </section>
  );
}
