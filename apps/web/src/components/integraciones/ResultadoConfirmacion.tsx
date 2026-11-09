import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatearFecha } from "@/lib/formato";
import { textoDescartadas, textoLoteYaCreadas, titularConfirmacion } from "@/lib/mensajesAsignacion";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import { formatearDuracion } from "@/lib/textosEjecucion";
import type { Ejecucion } from "@/types/dominio";
import { InsigniaResultado } from "./Insignias";
import { ListasFilasEjecucion } from "./ListasFilasEjecucion";
import { ResumenEjecucion } from "./ResumenEjecucion";

interface Props {
  ejecucion: Ejecucion;
  /** Filas sin marcar que la consulta descartó al confirmar (0 mientras sigue abierta). */
  descartadas: number;
  /** Cómo se repartían al confirmar, si se sabe (solo la sesión que confirmó). */
  tipoDescartadas: { nuevas: number; cambios: number; yaCreadas?: number } | null;
}

/** Resultado de una confirmación (diseño §6.3): cifras de la ejecución de fase `CONFIRMACION` y las cuatro listas con su asignación. */
export function ResultadoConfirmacion({ ejecucion, descartadas, tipoDescartadas }: Props) {
  const encabezado = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    encabezado.current?.focus();
  }, [ejecucion.id]);
  const titular = titularConfirmacion(ejecucion);
  return (
    <section className="panel" data-testid="resultado-confirmacion" data-resultado={ejecucion.resultado} aria-labelledby="resultado-confirmacion-titulo">
      <div className="panel-resultado__cabecera">
        <h3 id="resultado-confirmacion-titulo" ref={encabezado} tabIndex={-1}>
          Resultado
        </h3>
        <InsigniaResultado resultado={ejecucion.resultado} testId="resultado-ejecucion" />
        <span>
          <time dateTime={ejecucion.iniciadaEn}>{formatearFecha(ejecucion.iniciadaEn)}</time> · duración {formatearDuracion(ejecucion.duracionMs)}
        </span>
        <Link to={`${RUTAS_INTEGRACIONES.historial}?ejecucion=${ejecucion.id}`} data-testid="enlace-ver-detalle-ejecucion">
          Ver detalle en el Historial
        </Link>
      </div>
      {titular ? <p role="status">{titular}</p> : null}
      {tipoDescartadas?.yaCreadas ? (
        <p className="campo-ayuda" data-testid="texto-ya-creadas">
          {textoLoteYaCreadas(tipoDescartadas.yaCreadas)}
        </p>
      ) : null}
      <ResumenEjecucion ejecucion={ejecucion} />
      {descartadas > 0 ? (
        <p className="campo-ayuda" data-testid="texto-descartadas">
          {textoDescartadas(descartadas, tipoDescartadas)}
        </p>
      ) : null}
      <ListasFilasEjecucion ejecucionId={ejecucion.id} creadas={ejecucion.creadas} actualizadas={ejecucion.actualizadas} omitidas={ejecucion.omitidas} conError={ejecucion.conError} />
    </section>
  );
}
