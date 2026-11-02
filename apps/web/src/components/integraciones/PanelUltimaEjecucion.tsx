import { Link, useLocation } from "react-router-dom";
import { esIndisponible, useEstadoIntegracion } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { formatearFecha } from "@/lib/formato";
import { mensajeDeError } from "@/lib/mensajesIntegracion";
import { origenDe } from "@/lib/textosEjecucion";
import { ETIQUETAS_ROL, type Ejecucion } from "@/types/dominio";
import { InsigniaResultado } from "./Insignias";

function Tarjeta({ ejecucion, testId, titulo, enlaceDetalle }: { ejecucion: Ejecucion; testId: string; titulo: string; enlaceDetalle: (id: string) => string }) {
  return (
    <article className="panel" data-testid={testId} aria-label={titulo}>
      <h3>{titulo}</h3>
      {(
        <>
          <p>
            <time dateTime={ejecucion.iniciadaEn}>{formatearFecha(ejecucion.iniciadaEn)}</time> · <span className="celda-titulo-corta" title={origenDe(ejecucion)}>{origenDe(ejecucion)}</span>
          </p>
          <p>
            <InsigniaResultado resultado={ejecucion.resultado} /> · {ejecucion.actor.nombre} ({ETIQUETAS_ROL[ejecucion.actor.rol]})
          </p>
          <dl className="contadores-fila">
            <div>
              <dt>Leídas</dt>
              <dd>{ejecucion.leidas}</dd>
            </div>
            <div>
              <dt>Creadas</dt>
              <dd>{ejecucion.creadas}</dd>
            </div>
            <div>
              <dt>Actualizadas</dt>
              <dd>{ejecucion.actualizadas}</dd>
            </div>
            <div>
              <dt>Omitidas</dt>
              <dd>{ejecucion.omitidas}</dd>
            </div>
            <div>
              <dt>Con error</dt>
              <dd>{ejecucion.conError}</dd>
            </div>
          </dl>
          {ejecucion.codigoError ? <p>{mensajeDeError(ejecucion.codigoError, { conError: ejecucion.conError })}</p> : null}
          <Link className="boton boton--secundario" to={enlaceDetalle(ejecucion.id)}>
            Ver detalle
          </Link>
        </>
      )}
    </article>
  );
}

/** Una consulta exitosa sin ejecución es «vacío» (no es un error ni un cero). */
function estadoTarjeta(estado: EstadoDatos, ejecucion: Ejecucion | null | undefined): EstadoDatos {
  return estado === "ok" && !ejecucion ? "vacio" : estado;
}

/** «Última ejecución» y «Última completada» (D121): dos tarjetas con la misma fuente (`GET /estado`) y estado propio cada una. */
export function PanelUltimaEjecucion() {
  const consulta = useEstadoIntegracion();
  const ubicacion = useLocation();
  const enlaceDetalle = (id: string) => {
    const params = new URLSearchParams(ubicacion.search);
    params.set("ejecucion", id);
    return `${ubicacion.pathname}?${params.toString()}`;
  };
  const datos = consulta.data;
  let estado: EstadoDatos;
  if (consulta.isError) estado = esIndisponible(consulta.error) ? "indisponible" : "error";
  else if (consulta.isLoading || !datos) estado = "cargando";
  else estado = "ok";
  return (
    <div className="tarjetas-ultima-ejecucion" data-testid="ultima-ejecucion">
      <div>
        <BloqueDatos clave="ultima-ejecucion" estado={estadoTarjeta(estado, datos?.ultimaEjecucion)} mensajeVacio="Aún no se ha sincronizado ni importado nada" onReintentar={() => void consulta.refetch()}>
          {datos?.ultimaEjecucion ? <Tarjeta ejecucion={datos.ultimaEjecucion} testId="tarjeta-ultima-ejecucion" titulo="Última ejecución" enlaceDetalle={enlaceDetalle} /> : null}
        </BloqueDatos>
      </div>
      <div>
        <BloqueDatos clave="ultima-completada" estado={estadoTarjeta(estado, datos?.ultimaCompletada)} mensajeVacio="Aún no hay ejecuciones completadas" onReintentar={() => void consulta.refetch()}>
          {datos?.ultimaCompletada ? <Tarjeta ejecucion={datos.ultimaCompletada} testId="tarjeta-ultima-completada" titulo="Última completada" enlaceDetalle={enlaceDetalle} /> : null}
        </BloqueDatos>
      </div>
    </div>
  );
}
